/**
 * 知识库切片引擎 — 按文件类型自动选择切片策略
 */
import type {
  ChunkStrategy,
  ChunkMetadata,
} from "@shared/types/knowledge";
import type { ExtractionResult } from "./extractors";
import { isNoise, isGarbled, classifyDocument } from "./normalizers";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeChunker");

export interface RawChunk {
  text: string;
  metadata: Partial<ChunkMetadata>;
}

// ── 策略选择 ──────────────────────────────────────────

export function selectChunkStrategy(
  fileName: string,
  mediaType: "text" | "table" | "image"
): ChunkStrategy {
  if (mediaType === "table") return "table-row";
  if (mediaType === "image") return "image-ocr";

  const lower = fileName.toLowerCase();
  // 审查指南：按章节切
  if (lower.includes("审查指南") || lower.includes("examination")) return "section";
  // 法律/实施细则/司法解释：按条文切
  if (
    lower.includes("专利法") ||
    lower.includes("细则") ||
    lower.includes("司法解释") ||
    lower.includes("规定")
  ) return "article";
  // 典型案例：按要点切
  if (lower.includes("案例") || lower.includes("决定要点")) return "case-point";
  // JSON：按 key/数组切
  if (lower.endsWith(".json")) return "json-key";
  // MD/网页：按标题切
  if (lower.endsWith(".md") || lower.endsWith(".html") || lower.endsWith(".htm")) return "heading";

  // 默认：按段落切
  return "heading";
}

// ── 切片入口 ──────────────────────────────────────────

export function chunkContent(
  extraction: ExtractionResult,
  fileName: string,
  strategy: ChunkStrategy = "auto"
): RawChunk[] {
  if (strategy === "auto") {
    strategy = selectChunkStrategy(fileName, extraction.mediaType);
  }

  log(`Chunking ${fileName} with strategy=${strategy}`);

  let chunks: RawChunk[];
  switch (strategy) {
    case "section":
      chunks = chunkBySection(extraction.text, fileName);
      break;
    case "article":
      chunks = chunkByArticle(extraction.text, fileName);
      break;
    case "case-point":
      chunks = chunkByCasePoint(extraction.text, fileName);
      break;
    case "heading":
      chunks = chunkByHeading(extraction.text, fileName);
      break;
    case "json-key":
      chunks = chunkByJsonKey(extraction.text, fileName);
      break;
    case "table-row":
      chunks = chunkByTableRow(extraction, fileName);
      break;
    case "image-ocr":
      chunks = chunkImageOcr(extraction.text, fileName);
      break;
    default:
      chunks = chunkByHeading(extraction.text, fileName);
      break;
  }

  // 后处理：噪声过滤 + 上下文补充 + 重叠窗口
  chunks = filterNoise(chunks);
  chunks = enrichContext(chunks, fileName, extraction.text);
  chunks = addOverlap(chunks, 80);

  // 添加文档类型标注
  const docCategory = classifyDocument(fileName, extraction.text);
  for (const chunk of chunks) {
    if (!chunk.metadata.documentCategory) {
      chunk.metadata.documentCategory = docCategory;
    }
  }

  return chunks;
}

// ── 按章节切片（审查指南） ──────────────────────────────
// 匹配 "第一部分" "第二章" "3.2.1" 等章节编号

const SECTION_PATTERN =
  /^(第[一二三四五六七八九十百千]+部分|第[一二三四五六七八九十百千]+章|第[一二三四五六七八九十百千]+节|(?:\d+\.)+\d+|(?:\d+)\.(?=\s))(.*)$/m;

function chunkBySection(text: string, fileName: string): RawChunk[] {
  const lines = text.split("\n");
  const chunks: RawChunk[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(SECTION_PATTERN);
    if (match && currentLines.length > 0) {
      // 保存上一个 section
      const chunkText = currentLines.join("\n").trim();
      if (chunkText.length >= 20) {
        chunks.push({
          text: chunkText,
          metadata: {
            fileName,
            mediaType: "text",
            sectionId: currentTitle,
          },
        });
      }
      currentTitle = match[0].trim();
      currentLines = [line];
    } else {
      if (!currentTitle && line.trim()) {
        currentTitle = line.trim().slice(0, 50);
      }
      currentLines.push(line);
    }
  }

  // 保存最后一个 section
  if (currentLines.length > 0) {
    const chunkText = currentLines.join("\n").trim();
    if (chunkText.length >= 20) {
      chunks.push({
        text: chunkText,
        metadata: {
          fileName,
          mediaType: "text",
          sectionId: currentTitle,
        },
      });
    }
  }

  return mergeSmallChunks(chunks, 200, 2000);
}

// ── 按条文切片（法律/实施细则/司法解释） ──────────────────
// 匹配 "第一条" "第二十二条" 等

const ARTICLE_PATTERN = /^第[一二三四五六七八九十百千零\d]+条[\s.．]/;

function chunkByArticle(text: string, fileName: string): RawChunk[] {
  const lines = text.split("\n");
  const chunks: RawChunk[] = [];
  let currentArticle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (ARTICLE_PATTERN.test(line)) {
      if (currentLines.length > 0) {
        const chunkText = currentLines.join("\n").trim();
        if (chunkText.length >= 10) {
          chunks.push({
            text: chunkText,
            metadata: {
              fileName,
              mediaType: "text",
              articleId: currentArticle,
            },
          });
        }
      }
      currentArticle = line.match(/^第[一二三四五六七八九十百千零\d]+条/)?.[0] ?? "";
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // 保存最后一条
  if (currentLines.length > 0) {
    const chunkText = currentLines.join("\n").trim();
    if (chunkText.length >= 10) {
      chunks.push({
        text: chunkText,
        metadata: {
          fileName,
          mediaType: "text",
          articleId: currentArticle,
        },
      });
    }
  }

  return chunks;
}

// ── 按案件要点切片（典型案例汇编） ──────────────────────
// 匹配 "1." "2." 等数字编号开头的段落

function chunkByCasePoint(text: string, fileName: string): RawChunk[] {
  const lines = text.split("\n");
  const chunks: RawChunk[] = [];
  let currentLines: string[] = [];
  let pointIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配数字编号开头（如 "1." "22." "13."）
    if (/^\d+[.．、]\s/.test(trimmed) && currentLines.length > 0) {
      const chunkText = currentLines.join("\n").trim();
      if (chunkText.length >= 20) {
        chunks.push({
          text: chunkText,
          metadata: {
            fileName,
            mediaType: "text",
            sectionId: `要点${pointIndex + 1}`,
          },
        });
      }
      pointIndex++;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const chunkText = currentLines.join("\n").trim();
    if (chunkText.length >= 20) {
      chunks.push({
        text: chunkText,
        metadata: {
          fileName,
          mediaType: "text",
          sectionId: `要点${pointIndex + 1}`,
        },
      });
    }
  }

  return chunks;
}

// ── 按标题层级切片（MD/DOCX/网页） ──────────────────────
// 匹配 # ## ### 等 Markdown 标题

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

function chunkByHeading(text: string, fileName: string): RawChunk[] {
  const lines = text.split("\n");
  const chunks: RawChunk[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(HEADING_PATTERN);
    if (match && currentLines.length > 0) {
      const chunkText = currentLines.join("\n").trim();
      if (chunkText.length >= 20) {
        chunks.push({
          text: chunkText,
          metadata: {
            fileName,
            mediaType: "text",
            sectionId: currentTitle,
          },
        });
      }
      currentTitle = match[2]!.trim();
      currentLines = [line];
    } else {
      if (!currentTitle && line.trim()) {
        currentTitle = line.trim().slice(0, 50);
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const chunkText = currentLines.join("\n").trim();
    if (chunkText.length >= 20) {
      chunks.push({
        text: chunkText,
        metadata: {
          fileName,
          mediaType: "text",
          sectionId: currentTitle,
        },
      });
    }
  }

  return mergeSmallChunks(chunks, 200, 2000);
}

// ── 按 JSON key/数组切片 ──────────────────────────────

function chunkByJsonKey(text: string, fileName: string): RawChunk[] {
  try {
    const data = JSON.parse(text);
    const chunks: RawChunk[] = [];

    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        const chunkText = typeof item === "string" ? item : JSON.stringify(item, null, 2);
        if (chunkText.length >= 10) {
          chunks.push({
            text: chunkText,
            metadata: {
              fileName,
              mediaType: "text",
              sectionId: `[${i}]`,
            },
          });
        }
      });
    } else if (typeof data === "object" && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        const chunkText = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        if (chunkText.length >= 10) {
          chunks.push({
            text: `${key}:\n${chunkText}`,
            metadata: {
              fileName,
              mediaType: "text",
              sectionId: key,
            },
          });
        }
      }
    }

    return chunks.length > 0 ? chunks : [{ text, metadata: { fileName, mediaType: "text" } }];
  } catch {
    // JSON 解析失败，按段落切
    return chunkByHeading(text, fileName);
  }
}

// ── 按表格行切片 ──────────────────────────────────────

function chunkByTableRow(extraction: ExtractionResult, fileName: string): RawChunk[] {
  const { rows, columnNames, sheetName } = extraction;
  if (!rows || rows.length <= 1) {
    return [{ text: extraction.text, metadata: { fileName, mediaType: "table" } }];
  }

  const headerRow = columnNames ?? rows[0] ?? [];
  const dataRows = columnNames ? rows : rows.slice(1); // 跳过表头行

  return dataRows.map((row, i) => {
    const cellTexts = row.map((cell, colIdx) => {
      const colName = headerRow[colIdx] ?? `列${colIdx + 1}`;
      return `${colName}: ${cell}`;
    });
    const text = cellTexts.join(" | ");

    const metadata: Partial<ChunkMetadata> = {
      fileName,
      mediaType: "table",
      rowIndex: i + 1,
      columnNames: headerRow,
    };
    if (sheetName !== undefined) metadata.sheetName = sheetName;

    return { text, metadata };
  });
}

// ── 图片 OCR 切片 ──────────────────────────────────────

function chunkImageOcr(text: string, fileName: string): RawChunk[] {
  if (!text || text.length < 10) {
    return [];
  }
  return [
    {
      text,
      metadata: {
        fileName,
        mediaType: "image" as const,
        imageSource: "ocr" as const,
      },
    },
  ];
}

// ── 工具函数 ──────────────────────────────────────────

// ── 后处理函数 ────────────────────────────────────────

/** 过滤噪声 chunk */
function filterNoise(chunks: RawChunk[]): RawChunk[] {
  return chunks.filter((chunk) => {
    if (isNoise(chunk.text)) return false;
    if (isGarbled(chunk.text)) return false;
    return true;
  });
}

/** 上下文补充：chunk 前 prepend 章节/条文标识 */
function enrichContext(chunks: RawChunk[], _fileName: string, _fullText: string): RawChunk[] {
  return chunks.map((chunk) => {
    const { sectionId, articleId } = chunk.metadata;
    let prefix = "";

    if (sectionId && !chunk.text.startsWith(sectionId)) {
      prefix = `【${sectionId}】\n`;
    } else if (articleId && !chunk.text.startsWith(articleId)) {
      prefix = `【${articleId}】\n`;
    }

    if (prefix) {
      return { ...chunk, text: prefix + chunk.text };
    }
    return chunk;
  });
}

/** 添加重叠窗口：相邻 chunk 之间保留 overlapSize 字符的重叠 */
function addOverlap(chunks: RawChunk[], overlapSize: number): RawChunk[] {
  if (chunks.length <= 1 || overlapSize <= 0) return chunks;

  const result: RawChunk[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prevText = chunks[i - 1].text;
    const overlap = prevText.slice(-overlapSize);
    const newText = overlap + chunks[i].text;
    result.push({ ...chunks[i], text: newText });
  }
  return result;
}

/** 合并过小的 chunk，拆分过大的 chunk */
function mergeSmallChunks(
  chunks: RawChunk[],
  minSize: number,
  maxSize: number
): RawChunk[] {
  const result: RawChunk[] = [];
  let pending: RawChunk | null = null;

  for (const chunk of chunks) {
    if (pending === null) {
      pending = { ...chunk };
    } else if (pending.text.length < minSize) {
      // 合并到前一个
      pending.text += "\n\n" + chunk.text;
    } else {
      result.push(pending);
      pending = { ...chunk };
    }
  }

  if (pending !== null) {
    result.push(pending);
  }

  // 拆分过大的 chunk
  const final: RawChunk[] = [];
  for (const chunk of result) {
    if (chunk.text.length <= maxSize) {
      final.push(chunk);
    } else {
      // 按段落拆分
      const paragraphs = chunk.text.split("\n\n");
      let current = "";
      for (const para of paragraphs) {
        if (current.length + para.length > maxSize && current.length > 0) {
          final.push({
            text: current.trim(),
            metadata: chunk.metadata,
          });
          current = para;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }
      if (current.trim()) {
        final.push({
          text: current.trim(),
          metadata: chunk.metadata,
        });
      }
    }
  }

  return final;
}

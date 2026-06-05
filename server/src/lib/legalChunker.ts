/**
 * 法律文本专用切分器
 *
 * 按"第X条"为基本单位切分法律文本，保留章/节/条/款层级元数据。
 * 支持多种文档类型的切分策略。
 */

// ── 类型定义 ──────────────────────────────────────────

export interface LegalChunkMetadata {
  fileName: string;
  mediaType: "text" | "table" | "image";
  documentCategory: string;
  chapter: string;
  section: string;
  article: string;
  paragraph: string;
  articleRefs: string[];
  chunkVersion: number;
}

export interface LegalChunk {
  text: string;
  metadata: LegalChunkMetadata;
  /** Parent chunk ID（用于 Parent-Child 模式，child chunk 指向 parent） */
  parentId?: string;
}

// ── 文档结构解析 ──────────────────────────────────────

interface DocumentStructure {
  chapters: Array<{ title: string; startLine: number }>;
  sections: Array<{ title: string; startLine: number }>;
  articles: Array<{ title: string; startLine: number; endLine: number }>;
}

/** 解析文档结构：识别章、节、条的位置 */
function parseDocumentStructure(lines: string[]): DocumentStructure {
  const chapters: Array<{ title: string; startLine: number }> = [];
  const sections: Array<{ title: string; startLine: number }> = [];
  const articles: Array<{ title: string; startLine: number; endLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    // 章标题：第X章
    if (/^第[一二三四五六七八九十百千零\d]+章/.test(line)) {
      chapters.push({ title: line, startLine: i });
    }
    // 节标题：第X节
    else if (/^第[一二三四五六七八九十百千零\d]+节/.test(line)) {
      sections.push({ title: line, startLine: i });
    }
    // 条：第X条
    else if (/^第[一二三四五六七八九十百千零\d]+条/.test(line)) {
      articles.push({ title: line, startLine: i, endLine: i });
    }
  }

  // 计算每条的结束行
  for (let i = 0; i < articles.length; i++) {
    const nextArticle = articles[i + 1];
    const currentArticle = articles[i];
    if (!currentArticle) continue;
    const nextChapter = chapters.find((ch) => ch.startLine > currentArticle.startLine);
    const nextSection = sections.find((s) => s.startLine > currentArticle.startLine);

    let endLine = lines.length - 1;
    if (nextArticle) endLine = Math.min(endLine, nextArticle.startLine - 1);
    if (nextChapter) endLine = Math.min(endLine, nextChapter.startLine - 1);
    if (nextSection) endLine = Math.min(endLine, nextSection.startLine - 1);

    currentArticle.endLine = endLine;
  }

  return { chapters, sections, articles };
}

/** 获取某行所在的章标题 */
function getChapterForLine(
  lineIndex: number,
  chapters: Array<{ title: string; startLine: number }>
): string {
  let result = "";
  for (const ch of chapters) {
    if (ch.startLine <= lineIndex) {
      result = ch.title;
    } else {
      break;
    }
  }
  return result;
}

/** 获取某行所在的节标题 */
function getSectionForLine(
  lineIndex: number,
  sections: Array<{ title: string; startLine: number }>
): string {
  let result = "";
  for (const s of sections) {
    if (s.startLine <= lineIndex) {
      result = s.title;
    } else {
      break;
    }
  }
  return result;
}

// ── 法条引用提取 ──────────────────────────────────────

/** 从文本中提取法条引用 */
function extractArticleRefs(text: string): string[] {
  const refs = text.match(/第[一二三四五六七八九十百千零\d]+条(?:第[一二三四五六七八九十百千零\d]+款)?/g);
  return [...new Set(refs ?? [])];
}

// ── 法律文本切分器 ──────────────────────────────────────

/** 提取条号文本（如"第六十五条"） */
function extractArticleNumber(text: string): string {
  const match = text.match(/第[一二三四五六七八九十百千零\d]+条/);
  return match?.[0] ?? "";
}

/** 提取款号文本（如"第一款"） */
function extractParagraphNumber(text: string): string {
  const match = text.match(/第[一二三四五六七八九十百千零\d]+款/);
  return match?.[0] ?? "";
}

/** 按"款"拆分长条文 */
function splitByParagraphs(
  articleText: string,
  articleTitle: string,
  baseMetadata: Omit<LegalChunkMetadata, "article" | "paragraph" | "articleRefs" | "chapter" | "section">
): LegalChunk[] {
  const lines = articleText.split("\n");
  const paragraphs: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const paraMatch = line.match(/^(第[一二三四五六七八九十百千零\d]+款)\s*[、.:：]?/);
    if (paraMatch && current && current.lines.length > 0) {
      paragraphs.push(current);
      current = { title: paraMatch[1]!, lines: [line] };
    } else if (paraMatch) {
      current = { title: paraMatch[1]!, lines: [line] };
    } else {
      if (!current) {
        current = { title: "", lines: [] };
      }
      current.lines.push(line);
    }
  }
  if (current && current.lines.length > 0) {
    paragraphs.push(current);
  }

  // 如果没有识别到款，用数字编号作为备选
  if (paragraphs.length <= 1) {
    const numLines: Array<{ title: string; lines: string[] }> = [];
    let numCurrent: { title: string; lines: string[] } | null = null;
    for (const line of lines) {
      const numMatch = line.match(/^(\d+)[、.）)]\s*/);
      if (numMatch && numCurrent && numCurrent.lines.length > 0) {
        numLines.push(numCurrent);
        numCurrent = { title: `${numMatch[1]}`, lines: [line] };
      } else if (numMatch) {
        numCurrent = { title: `${numMatch[1]}`, lines: [line] };
      } else {
        if (!numCurrent) {
          numCurrent = { title: "", lines: [] };
        }
        numCurrent.lines.push(line);
      }
    }
    if (numCurrent && numCurrent.lines.length > 0) {
      numLines.push(numCurrent);
    }
    if (numLines.length > 1) {
      return numLines.map((p) => ({
        text: p.lines.join("\n").trim(),
        metadata: {
          ...baseMetadata,
          chapter: "",
          section: "",
          article: articleTitle,
          paragraph: p.title ? `第${p.title}款` : "",
          articleRefs: extractArticleRefs(p.lines.join("\n")),
        },
      }));
    }
  }

  return paragraphs.map((p) => ({
    text: p.lines.join("\n").trim(),
    metadata: {
      ...baseMetadata,
      chapter: "",
      section: "",
      article: articleTitle,
      paragraph: p.title,
      articleRefs: extractArticleRefs(p.lines.join("\n")),
    },
  }));
}

// ── 表格检测 ──────────────────────────────────────────

/** 检测文本是否包含表格结构 */
function containsTable(text: string): boolean {
  const lines = text.split("\n");
  let pipeLines = 0;
  let tabLines = 0;
  for (const line of lines) {
    if (line.includes("|") && line.split("|").length >= 3) pipeLines++;
    if (line.includes("\t") && line.split("\t").length >= 3) tabLines++;
  }
  return pipeLines >= 2 || tabLines >= 2;
}

/** 表格整体保留，不拆分 */
function chunkTable(
  text: string,
  fileName: string,
  documentCategory: string
): LegalChunk {
  return {
    text,
    metadata: {
      fileName,
      mediaType: "table" as const,
      documentCategory,
      chapter: "",
      section: "",
      article: "",
      paragraph: "",
      articleRefs: [],
      chunkVersion: 1,
    },
  };
}

// ── 主切分函数 ──────────────────────────────────────────

const DEFAULT_MIN_CHUNK = 100;
const DEFAULT_MAX_CHUNK = 1500;

/** 生成 parent chunk ID */
function generateParentId(fileName: string, article: string): string {
  return `parent-${fileName}-${article}`;
}

export interface ChunkerOptions {
  minChunkSize?: number;
  maxChunkSize?: number;
  fileName: string;
  documentCategory?: string;
}

/**
 * 法律文本切分主函数
 *
 * 策略：
 * 1. 解析文档结构（章/节/条）
 * 2. 按"第X条"为基本单位切分
 * 3. 短条合并（< minChunkSize）
 * 4. 长条按"款"拆分（> maxChunkSize）
 * 5. Prepend 章节标题作为上下文
 */
export function chunkLegalText(
  text: string,
  options: ChunkerOptions
): LegalChunk[] {
  const {
    minChunkSize = DEFAULT_MIN_CHUNK,
    maxChunkSize = DEFAULT_MAX_CHUNK,
    fileName,
    documentCategory = "其他",
  } = options;

  const lines = text.split("\n");

  // 表格检测：包含表格的文本整体保留
  if (containsTable(text)) {
    return [chunkTable(text, fileName, documentCategory)];
  }

  // 解析文档结构
  const structure = parseDocumentStructure(lines);

  // 如果没有识别到任何条，回退到按段落切分
  if (structure.articles.length === 0) {
    return chunkByParagraphs(text, fileName, documentCategory);
  }

  const baseMetadata = {
    fileName,
    mediaType: "text" as const,
    documentCategory,
    chunkVersion: 1,
  };

  const chunks: LegalChunk[] = [];

  // 按条切分
  for (const article of structure.articles) {
    const articleLines = lines.slice(article.startLine, article.endLine + 1);
    const articleText = articleLines.join("\n").trim();

    if (articleText.length < 5) continue; // 跳过极短行

    const chapter = getChapterForLine(article.startLine, structure.chapters);
    const section = getSectionForLine(article.startLine, structure.sections);
    const articleTitle = extractArticleNumber(article.title);

    // 长条按款拆分（Parent-Child 模式）
    if (articleText.length > maxChunkSize) {
      const parentId = generateParentId(fileName, articleTitle);
      const subChunks = splitByParagraphs(articleText, articleTitle, baseMetadata);
      for (const sub of subChunks) {
        sub.metadata.chapter = chapter;
        sub.metadata.section = section;
        sub.metadata.articleRefs = extractArticleRefs(sub.text);
        sub.parentId = parentId;
      }
      chunks.push(...subChunks);
    } else {
      chunks.push({
        text: articleText,
        metadata: {
          ...baseMetadata,
          chapter,
          section,
          article: articleTitle,
          paragraph: extractParagraphNumber(articleText),
          articleRefs: extractArticleRefs(articleText),
        },
      });
    }
  }

  // 合并短条
  return mergeShortChunks(chunks, minChunkSize);
}

/** 按段落切分（非法律文本的回退策略） */
function chunkByParagraphs(
  text: string,
  fileName: string,
  documentCategory: string
): LegalChunk[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length >= 20);
  const chunks: LegalChunk[] = [];

  for (const para of paragraphs) {
    chunks.push({
      text: para.trim(),
      metadata: {
        fileName,
        mediaType: "text",
        documentCategory,
        chapter: "",
        section: "",
        article: "",
        paragraph: "",
        articleRefs: extractArticleRefs(para),
        chunkVersion: 1,
      },
    });
  }

  return chunks;
}

/** 合并短 chunk */
function mergeShortChunks(chunks: LegalChunk[], minSize: number): LegalChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: LegalChunk[] = [];
  let pending: LegalChunk | null = null;

  for (const chunk of chunks) {
    if (!pending) {
      pending = { ...chunk };
    } else if (pending.text.length < minSize) {
      // 合并：保留 pending 的元数据，合并文本
      pending.text += "\n\n" + chunk.text;
      // 更新引用
      const newRefs = new Set([
        ...pending.metadata.articleRefs,
        ...chunk.metadata.articleRefs,
      ]);
      pending.metadata.articleRefs = [...newRefs];
    } else {
      merged.push(pending);
      pending = { ...chunk };
    }
  }
  if (pending) merged.push(pending);

  return merged;
}

// ── 审查指南专用切分器 ──────────────────────────────────

/**
 * 审查指南切分：按"第X节" + 子标题切分
 * 审查指南有复杂的层级结构：部分 > 章 > 节
 */
export function chunkExaminationGuide(
  text: string,
  options: ChunkerOptions
): LegalChunk[] {
  const { fileName, documentCategory = "审查指南" } = options;
  const lines = text.split("\n");
  const chunks: LegalChunk[] = [];

  // 审查指南的节标题模式：第X节 或 X.X.X 格式
  const sectionPattern = /^(第[一二三四五六七八九十百千零\d]+节|\d+\.\d+(?:\.\d+)?(?:\.\d+)?)\s*/;

  let currentSection = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (sectionPattern.test(line.trim()) && currentLines.length > 0 && currentLines.join("\n").trim().length >= 50) {
      chunks.push({
        text: currentLines.join("\n").trim(),
        metadata: {
          fileName,
          mediaType: "text",
          documentCategory,
          chapter: "",
          section: currentSection,
          article: "",
          paragraph: "",
          articleRefs: extractArticleRefs(currentLines.join("\n")),
          chunkVersion: 1,
        },
      });
      currentLines = [];
      currentSection = line.trim().slice(0, 50);
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0 && currentLines.join("\n").trim().length >= 20) {
    chunks.push({
      text: currentLines.join("\n").trim(),
      metadata: {
        fileName,
        mediaType: "text",
        documentCategory,
        chapter: "",
        section: currentSection,
        article: "",
        paragraph: "",
        articleRefs: extractArticleRefs(currentLines.join("\n")),
        chunkVersion: 1,
      },
    });
  }

  return chunks;
}

// ── 案例切分器 ──────────────────────────────────────────

/**
 * 案例切分：按段落 + 决定要点切分
 * 案例是叙述性的，按段落切分
 */
export function chunkCase(
  text: string,
  options: ChunkerOptions
): LegalChunk[] {
  return chunkByParagraphs(text, options.fileName, options.documentCategory ?? "案例");
}

// ── 多策略切分入口 ──────────────────────────────────────

/**
 * 根据文档类型选择切分策略
 */
export function chunkByDocumentType(
  text: string,
  documentCategory: string,
  options: ChunkerOptions
): LegalChunk[] {
  switch (documentCategory) {
    case "法律":
    case "行政法规":
    case "司法解释":
      return chunkLegalText(text, options);
    case "审查指南":
      return chunkExaminationGuide(text, options);
    case "案例":
      return chunkCase(text, options);
    default:
      return chunkLegalText(text, options);
  }
}

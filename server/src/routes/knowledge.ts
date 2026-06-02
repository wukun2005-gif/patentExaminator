/**
 * 知识库 API 路由 — 服务端处理提取/切片/向量化
 */
import { Router } from "express";
import express from "express";
import multer from "multer";
import crypto from "crypto";
import {
  addSource,
  getAllSources,
  deleteSource,
  addChunks,
  addVectors,
  getUnembeddedChunks,
  markChunkEmbedded,
  getAllVectors,
  getAllChunks,
  getStats,
  clearAll,
  findDuplicateByHash,
  computeTextHash,
  findChunksByHashes,
} from "../lib/knowledgeDb.js";
import { extractText, extractFromUrl } from "../lib/knowledgeExtract.js";
import { logger } from "../lib/logger.js";
import { localRerank, crossEncoderRerank } from "../lib/reranker.js";
import { invalidateBM25Index } from "../lib/hybridSearch.js";
import { expandQueryFull } from "../lib/queryExpand.js";

export const knowledgeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Embedding（纯远程 API，cr-1: 移除本地模型） ──────────────

// 远程 embedding 配置缓存
let remoteEmbedderConfig: { baseUrl: string; apiKey: string; modelId: string } | null = null;
let remoteEmbedder: { embed: (texts: string[]) => Promise<number[][]>; modelId: string } | null = null;

/** 创建远程 embedding 函数 */
function createRemoteEmbedder(config: { baseUrl: string; apiKey: string; modelId: string }) {
  return {
    modelId: config.modelId,
    embed: async (texts: string[]): Promise<number[][]> => {
      const baseUrl = config.baseUrl.endsWith("/v1") ? config.baseUrl : `${config.baseUrl}/v1`;
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          input: texts.map((t) => t.length > 500 ? t.slice(0, 500) : t),
        }),
      });

      if (!response.ok) {
        throw new Error(`Remote embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map((d) => d.embedding);
    },
  };
}

/** 设置远程 embedding 配置 */
export function setRemoteEmbedder(config: { baseUrl: string; apiKey: string; modelId: string } | null) {
  remoteEmbedderConfig = config;
  remoteEmbedder = config ? createRemoteEmbedder(config) : null;
  logger.info(`Remote embedding ${config ? `configured: ${config.modelId}` : "disabled"}`);
}

/** 获取 embedder（仅远程，无配置时返回 null） */
export async function getEmbedder() {
  if (remoteEmbedder) {
    return remoteEmbedder;
  }
  return null;
}

// ── 文本预处理 ────────────────────────────────────────

/** 清洗：去页眉页脚、水印、多余空白 */
function cleanText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/^第\s*\d+\s*页.*$/gm, "");
  cleaned = cleaned.replace(/^-\s*\d+\s*-$/gm, "");
  cleaned = cleaned.replace(/^\d+\s*\/\s*\d+$/gm, "");
  cleaned = cleaned.replace(/^(仅供|内部|草稿|DRAFT|CONFIDENTIAL).{0,20}$/gim, "");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/^\s+$/gm, "");
  return cleaned.trim();
}

/** 法条引用规范化 */
function normalizeLegalReference(text: string): string {
  let n = text;
  n = n.replace(/§(\d+)\.(\d+)/g, "第$1条第$2款");
  n = n.replace(/§(\d+)/g, "第$1条");
  n = n.replace(/Article\s+(\d+)/gi, "第$1条");
  return n;
}

/** 日期规范化 */
function normalizeDate(text: string): string {
  let n = text;
  n = n.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  n = n.replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})/g, (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  return n;
}

/** 全角转半角 */
function normalizeWidth(text: string): string {
  return text.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 文档类型推断 */
function classifyDocument(fileName: string, text: string): string {
  const lower = fileName.toLowerCase();
  const head = text.slice(0, 500);
  if (lower.includes("审查指南") || head.includes("专利审查指南")) return "审查指南";
  if (lower.includes("司法解释") || head.includes("最高人民法院")) return "司法解释";
  if (lower.includes("专利法实施细则") || head.includes("国务院令")) return "行政法规";
  if (lower.includes("专利法") || head.includes("全国人民代表大会")) return "法律";
  if (lower.includes("案例") || lower.includes("决定要点")) return "案例";
  return "其他";
}

/** 法条引用提取 */
function extractArticleRefs(text: string): string[] {
  const refs = text.match(/第[一二三四五六七八九十百千零\d]+条(?:第[一二三四五六七八九十百千零\d]+款)?/g);
  return [...new Set(refs ?? [])];
}

/** 噪声检测 */
function isNoise(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (/^[\d\s]+$/.test(t)) return true;
  if (/^[^\w一-鿿]+$/.test(t)) return true;
  if (t.length < 5 && !/[一-鿿]/.test(t)) return true;
  return false;
}

/** 乱码检测：有意义字符占比低于 30% 视为乱码 */
function isGarbled(text: string): boolean {
  const meaningful = text.match(/[\w一-鿿]/g);
  const ratio = meaningful ? meaningful.length / text.length : 0;
  return ratio < 0.3;
}

/** 繁简转换（常用字映射，覆盖专利法律领域常见字） */
const TRADITIONAL_MAP: Record<string, string> = {
  "專": "专", "權": "权", "請": "请", "發": "发", "審": "审",
  "標": "标", "準": "准", "術": "术", "證": "证", "據": "据",
  "議": "议", "論": "论", "題": "题", "實": "实", "義": "义", "務": "务",
  "處": "处", "報": "报", "關": "关", "開": "开", "問": "问", "間": "间",
  "書": "书", "記": "记", "設": "设", "計": "计", "資": "资", "運": "运",
  "過": "过", "達": "达", "進": "进", "選": "选", "還": "还", "適": "适",
  "類": "类", "點": "点", "號": "号", "統": "统", "續": "续", "維": "维",
  "組": "组", "結": "结", "絕": "绝", "總": "总", "經": "经", "網": "网",
  "規": "规", "認": "认", "護": "护", "質": "质", "輸": "输", "轉": "转",
  "載": "载", "銷": "销", "鏈": "链", "閱": "阅", "雲": "云",
  "電": "电", "響": "响", "預": "预", "驗": "验", "體": "体", "優": "优",
};

function normalizeTraditional(text: string): string {
  return text.replace(/[一-鿿]/g, (ch) => TRADITIONAL_MAP[ch] ?? ch);
}

/** 完整预处理流水线 */
function preprocessText(text: string, _fileName: string): string {
  let result = text;
  result = cleanText(result);            // 去页眉页脚水印
  result = normalizeLegalReference(result); // 法条引用规范化
  result = normalizeDate(result);        // 日期规范化
  result = normalizeWidth(result);       // 全角转半角
  result = normalizeTraditional(result); // 繁简转换
  return result;
}

// ── 切片引擎（含合并/拆分/重叠/上下文补充） ──────────

function simpleChunk(text: string, fileName: string): Array<{ text: string; metadata: Record<string, unknown> }> {
  const rawChunks: Array<{ text: string; metadata: Record<string, unknown> }> = [];
  const lines = text.split("\n");
  let current: string[] = [];
  let sectionId = "";

  for (const line of lines) {
    const sectionMatch = line.match(/^(第[一二三四五六七八九十百千\d]+[部分章节条款]|[一二三四五六七八九十]+\s*[、.])/);
    const articleMatch = line.match(/^第[一二三四五六七八九十百千零\d]+条/);

    if ((sectionMatch || articleMatch) && current.length > 0 && current.join("\n").trim().length >= 20) {
      rawChunks.push({
        text: current.join("\n").trim(),
        metadata: { fileName, mediaType: "text", sectionId },
      });
      current = [];
      sectionId = line.trim().slice(0, 50);
    }
    current.push(line);
  }

  if (current.length > 0 && current.join("\n").trim().length >= 20) {
    rawChunks.push({
      text: current.join("\n").trim(),
      metadata: { fileName, mediaType: "text", sectionId },
    });
  }

  // 合并过小 chunk + 拆分过大 chunk
  const merged = mergeAndSplitChunks(rawChunks, 200, 2000);

  // 上下文补充：prepend 章节标题
  const enriched = merged.map((chunk) => {
    const sid = chunk.metadata.sectionId as string;
    if (sid && !chunk.text.startsWith(sid)) {
      return { ...chunk, text: `【${sid}】\n${chunk.text}` };
    }
    return chunk;
  });

  // 重叠窗口：相邻 chunk 保留 80 字重叠
  return addOverlap(enriched, 80);
}

/** 合并过小 chunk，拆分过大 chunk */
function mergeAndSplitChunks(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
  minSize: number,
  maxSize: number
): Array<{ text: string; metadata: Record<string, unknown> }> {
  // 合并过小
  const merged: Array<{ text: string; metadata: Record<string, unknown> }> = [];
  let pending: { text: string; metadata: Record<string, unknown> } | null = null;

  for (const chunk of chunks) {
    if (!pending) {
      pending = { ...chunk };
    } else if (pending.text.length < minSize) {
      pending.text += "\n\n" + chunk.text;
    } else {
      merged.push(pending);
      pending = { ...chunk };
    }
  }
  if (pending) merged.push(pending);

  // 拆分过大
  const result: Array<{ text: string; metadata: Record<string, unknown> }> = [];
  for (const chunk of merged) {
    if (chunk.text.length <= maxSize) {
      result.push(chunk);
    } else {
      const paragraphs = chunk.text.split("\n\n");
      let current = "";
      for (const para of paragraphs) {
        if (current.length + para.length > maxSize && current.length > 0) {
          result.push({ text: current.trim(), metadata: chunk.metadata });
          current = para;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }
      if (current.trim()) {
        result.push({ text: current.trim(), metadata: chunk.metadata });
      }
    }
  }
  return result;
}

/** 重叠窗口：相邻 chunk 保留 overlapSize 字符的重叠 */
function addOverlap(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
  overlapSize: number
): Array<{ text: string; metadata: Record<string, unknown> }> {
  if (chunks.length <= 1 || overlapSize <= 0) return chunks;

  const result = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prevText = chunks[i - 1].text;
    const overlap = prevText.slice(-overlapSize);
    result.push({ ...chunks[i], text: overlap + chunks[i].text });
  }
  return result;
}

// ── API 端点 ─────────────────────────────────────────

/** POST /api/knowledge/upload — 上传文件并处理（SSE 进度推送） */
knowledgeRouter.post("/knowledge/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const file = req.file;
    const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // bg-41: 读取 embedding 配置
    const embeddingConfigStr = req.body?.embeddingConfig;
    if (embeddingConfigStr) {
      try {
        const embeddingConfig = JSON.parse(embeddingConfigStr) as { baseUrl: string; apiKey: string; modelId: string };
        setRemoteEmbedder(embeddingConfig);
      } catch (e) {
        logger.warn(`Failed to parse embeddingConfig: ${e}`);
      }
    }

    // 文件级去重
    const existing = findDuplicateByHash(fileHash);
    if (existing) {
      sendEvent({ step: "done", skipped: true, message: `已存在: ${existing.name}` });
      res.end();
      return;
    }

    const sourceId = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // 修复 multer 中文文件名编码问题
    const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");

    const TOTAL_STEPS = 5;

    // Step 1/5: 提取文本
    sendEvent({ step: "extracting", stepNum: 1, totalSteps: TOTAL_STEPS, message: `提取 ${fileName} 文本...` });
    const extraction = await extractText(file.buffer, fileName);
    sendEvent({ step: "extracting", stepNum: 1, totalSteps: TOTAL_STEPS, done: true, chars: extraction.text.length });

    // Step 2/5: 预处理（清洗 + 规范化）
    sendEvent({ step: "preprocessing", stepNum: 2, totalSteps: TOTAL_STEPS, message: "文本清洗与规范化..." });
    const cleanedText = preprocessText(extraction.text, fileName);
    sendEvent({ step: "preprocessing", stepNum: 2, totalSteps: TOTAL_STEPS, done: true });

    // Step 3/5: 切片
    sendEvent({ step: "chunking", stepNum: 3, totalSteps: TOTAL_STEPS, message: "切片处理中..." });
    const rawChunks = simpleChunk(cleanedText, fileName);

    // Step 4/5: 噪声过滤 + 乱码过滤 + Chunk 级去重 + 元数据增强
    const docCategory = classifyDocument(fileName, cleanedText);
    const dedupHashes = new Set<string>();
    const filteredChunks: typeof rawChunks = [];
    for (const rc of rawChunks) {
      if (isNoise(rc.text) || isGarbled(rc.text)) continue;
      const hash = crypto.createHash("sha256").update(rc.text.replace(/[\s　]/g, "").toLowerCase()).digest("hex");
      if (dedupHashes.has(hash)) continue;
      dedupHashes.add(hash);
      filteredChunks.push(rc);
    }
    for (const chunk of filteredChunks) {
      chunk.metadata.documentCategory = docCategory;
      chunk.metadata.articleRefs = extractArticleRefs(chunk.text);
    }
    sendEvent({ step: "chunking", stepNum: 3, totalSteps: TOTAL_STEPS, done: true, total: filteredChunks.length });

    // Step 4/5: 存储
    sendEvent({ step: "storing", stepNum: 4, totalSteps: TOTAL_STEPS, message: `存储 ${filteredChunks.length} 条知识...` });
    addSource({
      id: sourceId,
      name: fileName,
      type: "file",
      format: fileName.split(".").pop() ?? "txt",
      mediaType: extraction.mediaType,
      size: file.size,
      fileHash,
      chunkCount: filteredChunks.length,
      embedStatus: "processing",
    });

    const chunks = filteredChunks.map((rc, i) => ({
      id: `${sourceId}-c${i}`,
      sourceId,
      index: i,
      text: rc.text,
      strategy: "auto",
      metadata: rc.metadata,
    }));
    addChunks(chunks);

    // Step 5/5: 向量化（全局队列 + 断点续传 + 批处理优化）
    // cr-1: 仅在配置了远程 embedding API 时进行向量化
    const emb = await getEmbedder();
    if (chunks.length > 0 && emb) {
      sendEvent({ step: "embedding", stepNum: 5, totalSteps: TOTAL_STEPS, message: `向量化 ${chunks.length} 条知识...`, total: chunks.length });

      // B-033 优化：断点续传 — 跳过已有 embedding 的 chunk
      const chunkHashes = chunks.map((c) => computeTextHash(c.text));
      const existingEmbeddings = findChunksByHashes(chunkHashes);

      const chunksToEmbed: typeof chunks = [];
      let skippedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const hash = chunkHashes[i]!;
        const existing = existingEmbeddings.get(hash);
        if (existing) {
          // 断点续传：复用已有 embedding
          addVectors([{ chunkId: chunks[i]!.id, vector: existing.vector, modelId: emb.modelId }]);
          markChunkEmbedded(chunks[i]!.id);
          skippedCount++;
        } else {
          chunksToEmbed.push(chunks[i]!);
        }
      }

      if (skippedCount > 0) {
        logger.info(`[Embedding] 断点续传：跳过 ${skippedCount} 个已有 embedding 的 chunk`);
        sendEvent({ step: "embedding", stepNum: 5, totalSteps: TOTAL_STEPS, message: `断点续传跳过 ${skippedCount} 条，剩余 ${chunksToEmbed.length} 条需向量化`, total: chunks.length, skipped: skippedCount });
      }

      // B-033 优化：过滤过短 chunk（<50 字）减少无效计算
      const MIN_CHUNK_LENGTH = 50;
      const validChunks = chunksToEmbed.filter((c) => c.text.length >= MIN_CHUNK_LENGTH);
      const shortChunkCount = chunksToEmbed.length - validChunks.length;

      if (shortChunkCount > 0) {
        logger.info(`[Embedding] 过滤 ${shortChunkCount} 个过短 chunk（<${MIN_CHUNK_LENGTH} 字）`);
        // 过短 chunk 标记为已嵌入（避免下次重复处理）
        for (const chunk of chunksToEmbed) {
          if (chunk.text.length < MIN_CHUNK_LENGTH) {
            markChunkEmbedded(chunk.id);
          }
        }
      }

      // B-033 优化：全局队列 + 大 batch + 长度排序
      const BATCH_SIZE = 100; // 从 20 增大到 100，减少推理批次 5x

      // 按文本长度排序（短文本优先填满 batch，减少 padding 浪费 10-20%）
      const sortedChunks = [...validChunks].sort((a, b) => a.text.length - b.text.length);

      for (let i = 0; i < sortedChunks.length; i += BATCH_SIZE) {
        const batch = sortedChunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map((c) => c.text);
        const vectors = await emb.embed(texts);
        const vectorRecords = batch.map((c, j) => ({
          chunkId: c.id,
          vector: vectors[j]!,
          modelId: emb.modelId,
        }));
        addVectors(vectorRecords);
        for (const chunk of batch) {
          markChunkEmbedded(chunk.id);
        }
        sendEvent({
          step: "embedding",
          stepNum: 5,
          totalSteps: TOTAL_STEPS,
          progress: Math.min(i + BATCH_SIZE, sortedChunks.length),
          total: sortedChunks.length,
          skipped: skippedCount,
          filtered: shortChunkCount,
        });
      }
    } else if (chunks.length > 0 && !emb) {
      // cr-1: 未配置远程 embedding API，跳过向量化，仅存储 chunk
      logger.info(`[Embedding] 未配置远程 embedding API，跳过向量化，仅存储 ${chunks.length} 条知识`);
      sendEvent({ step: "embedding", stepNum: 5, totalSteps: TOTAL_STEPS, message: `未配置 Embedding API，仅存储文本（可通过 BM25 关键词检索）`, total: chunks.length, skipped: chunks.length });
      // 标记所有 chunk 为已嵌入（避免下次重复处理）
      for (const chunk of chunks) {
        markChunkEmbedded(chunk.id);
      }
    }

    // 完成
    logger.info(`Uploaded ${fileName}: ${chunks.length} chunks${emb ? " embedded" : " (no embedding, BM25 only)"}`);

    // 清除 BM25 索引缓存，强制下次检索时重建
    invalidateBM25Index();

    sendEvent({
      step: "done",
      ok: true,
      sourceId,
      fileName,
      chunkCount: chunks.length,
      message: `✅ ${fileName} — ${chunks.length} 条知识已入库`,
    });
    res.end();
  } catch (err) {
    logger.error("Knowledge upload error: " + errMsg(err));
    // 如果 headers 已发送，用 SSE 发送错误
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ step: "error", error: errMsg(err) })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ ok: false, error: errMsg(err) });
    }
  }
});

/** POST /api/knowledge/import-url — 从 URL 导入 */
knowledgeRouter.post("/knowledge/import-url", express.json(), async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) {
      res.status(400).json({ ok: false, error: "Missing url" });
      return;
    }

    const sourceId = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const extraction = await extractFromUrl(url);
    const cleanedText = preprocessText(extraction.text, url);
    const rawChunks = simpleChunk(cleanedText, url);
    const docCategory = classifyDocument(url, cleanedText);
    const filteredChunks = rawChunks.filter((rc) => !isNoise(rc.text));
    for (const chunk of filteredChunks) {
      chunk.metadata.documentCategory = docCategory;
      chunk.metadata.articleRefs = extractArticleRefs(chunk.text);
    }

    addSource({
      id: sourceId,
      name: url,
      type: "url",
      format: "html",
      mediaType: "text",
      size: extraction.text.length,
      sourceUrl: url,
      chunkCount: filteredChunks.length,
      embedStatus: "processing",
    });

    const chunks = filteredChunks.map((rc, i) => ({
      id: `${sourceId}-c${i}`,
      sourceId,
      index: i,
      text: rc.text,
      strategy: "auto",
      metadata: rc.metadata,
    }));
    addChunks(chunks);

    // B-033 优化：断点续传 + 批处理优化
    // bg-73: 无 embedding 配置时跳过向量化，纯 BM25 存储
    const emb = await getEmbedder();
    if (chunks.length > 0 && emb) {

      // 断点续传：跳过已有 embedding 的 chunk
      const chunkHashes = chunks.map((c) => computeTextHash(c.text));
      const existingEmbeddings = findChunksByHashes(chunkHashes);

      const chunksToEmbed: typeof chunks = [];
      let skippedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const hash = chunkHashes[i]!;
        const existing = existingEmbeddings.get(hash);
        if (existing) {
          addVectors([{ chunkId: chunks[i]!.id, vector: existing.vector, modelId: emb.modelId }]);
          markChunkEmbedded(chunks[i]!.id);
          skippedCount++;
        } else {
          chunksToEmbed.push(chunks[i]!);
        }
      }

      if (skippedCount > 0) {
        logger.info(`[Embedding] URL 断点续传：跳过 ${skippedCount} 个已有 embedding 的 chunk`);
      }

      // 过滤过短 chunk（<50 字）
      const MIN_CHUNK_LENGTH = 50;
      const validChunks = chunksToEmbed.filter((c) => c.text.length >= MIN_CHUNK_LENGTH);
      const shortChunkCount = chunksToEmbed.length - validChunks.length;

      if (shortChunkCount > 0) {
        logger.info(`[Embedding] URL 过滤 ${shortChunkCount} 个过短 chunk（<${MIN_CHUNK_LENGTH} 字）`);
        for (const chunk of chunksToEmbed) {
          if (chunk.text.length < MIN_CHUNK_LENGTH) {
            markChunkEmbedded(chunk.id);
          }
        }
      }

      // 大 batch + 长度排序
      const BATCH_SIZE = 100;
      const sortedChunks = [...validChunks].sort((a, b) => a.text.length - b.text.length);

      for (let i = 0; i < sortedChunks.length; i += BATCH_SIZE) {
        const batch = sortedChunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map((c) => c.text);
        const vectors = await emb.embed(texts);
        const vectorRecords = batch.map((c, j) => ({
          chunkId: c.id,
          vector: vectors[j]!,
          modelId: emb.modelId,
        }));
        addVectors(vectorRecords);
        for (const chunk of batch) {
          markChunkEmbedded(chunk.id);
        }
      }
    } else if (chunks.length > 0 && !emb) {
      logger.info("No embedding provider configured, URL import stored as BM25-only");
    }

    // 清除 BM25 索引缓存，强制下次检索时重建
    invalidateBM25Index();

    res.json({ ok: true, sourceId, chunkCount: chunks.length, message: `✅ ${url} — ${chunks.length} 条知识已入库` });
  } catch (err) {
    logger.error("Knowledge URL import error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/knowledge/sources — 列出所有来源 */
knowledgeRouter.get("/knowledge/sources", (_req, res) => {
  try {
    res.json({ ok: true, sources: getAllSources() });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/knowledge/sources/:id — 删除来源 */
knowledgeRouter.delete("/knowledge/sources/:id", (req, res) => {
  try {
    deleteSource(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/knowledge/stats — 统计信息 */
knowledgeRouter.get("/knowledge/stats", (_req, res) => {
  try {
    res.json({ ok: true, ...getStats() });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/knowledge/search — 检索（支持 Re-ranker + 远程 Embedding） */
knowledgeRouter.post("/knowledge/search", express.json(), async (req, res) => {
  try {
    const { query, topK = 5, reranker, embedding } = req.body as {
      query: string;
      topK?: number;
      reranker?: { baseUrl: string; apiKey: string; modelId: string };
      embedding?: { baseUrl: string; apiKey: string; modelId: string };
    };
    if (!query) {
      res.status(400).json({ ok: false, error: "Missing query" });
      return;
    }

    // bg-71: 服务端查询扩展（跨语言 + 法律同义词 + 法条图谱）
    const expandedQuery = expandQueryFull(query);

    // bg-41: 设置远程 embedding 配置（如果有）
    if (embedding?.baseUrl && embedding?.apiKey && embedding?.modelId) {
      setRemoteEmbedder(embedding);
    } else {
      setRemoteEmbedder(null);
    }

    const allChunks = getAllChunks();
    const allVectors = getAllVectors();

    // 构建 chunkId → chunk 映射
    const chunkMap = new Map(allChunks.map((c) => [c.id, c]));
    const vectorMap = new Map(allVectors.map((v) => [v.chunkId, v]));

    // bg-70: 向量相似度计算 — embedding 失败时降级到纯 BM25
    let scores: Array<{ chunkId: string; score: number }> = [];
    const emb = await getEmbedder();

    if (emb) {
      try {
        const queryVector = (await emb.embed([expandedQuery]))[0]!;
        for (const [chunkId, vec] of vectorMap) {
          const chunk = chunkMap.get(chunkId);
          if (!chunk) continue;

          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < queryVector.length; i++) {
            dot += queryVector[i]! * vec.vector[i]!;
            normA += queryVector[i]! * queryVector[i]!;
            normB += vec.vector[i]! * vec.vector[i]!;
          }
          const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
          if (score >= 0.3) {
            scores.push({ chunkId, score });
          }
        }
        scores.sort((a, b) => b.score - a.score);
      } catch (embedErr) {
        // bg-70: Embedding 失败时降级到纯 BM25，不返回 500
        logger.warn(`Embedding failed, falling back to pure BM25: ${embedErr}`);
        scores = []; // 传空 scores 给 hybridSearch，让 BM25 独立返回结果
      }
    } else {
      logger.info("No embedding provider configured, using pure BM25 search");
    }

    // bg-41: 混合检索 — 向量相似度 + BM25，RRF 融合
    const { hybridSearch } = await import("../lib/hybridSearch.js");
    const hybridScores = hybridSearch(expandedQuery, scores, topK * 3);

    // bg-41: Re-ranker 集成 — 有远程用远程，没有用本地启发式算法
    // 过滤掉 chunkMap 中不存在的 chunkId（BM25 可能返回已删除的 chunk）
    const validHybridScores = hybridScores.filter((s) => chunkMap.has(s.chunkId));
    let rerankedScores = validHybridScores;
    const topCandidates = validHybridScores.slice(0, topK * 3);
    // 构建 localRerank 需要的格式
    const candidatesForRerank = topCandidates.map((s) => {
      const chunk = chunkMap.get(s.chunkId)!;
      return {
        chunkId: s.chunkId,
        text: chunk.text,
        metadata: (() => { try { return JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { return {}; } })(),
        score: s.score,
      };
    });

    if (reranker?.baseUrl && reranker?.apiKey && reranker?.modelId) {
      // 远程 Re-ranker
      try {
        const rerankUrl = reranker.baseUrl.endsWith("/v1")
          ? `${reranker.baseUrl}/rerank`
          : `${reranker.baseUrl}/v1/rerank`;

        const documents = topCandidates.map((s) => {
          const chunk = chunkMap.get(s.chunkId);
          return chunk?.text ?? "";
        });

        const rerankRes = await fetch(rerankUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${reranker.apiKey}`,
          },
          body: JSON.stringify({
            model: reranker.modelId,
            query,
            documents,
            top_n: topK,
          }),
        });

        if (rerankRes.ok) {
          const rerankData = await rerankRes.json() as {
            results: Array<{ index: number; relevance_score: number }>;
          };

          rerankedScores = rerankData.results.map((r) => ({
            chunkId: topCandidates[r.index]!.chunkId,
            score: r.relevance_score,
          }));

          logger.info(`Remote re-ranker applied: ${rerankedScores.length} results`);
        } else {
          const errorText = await rerankRes.text();
          logger.warn(`Remote re-ranker failed (${rerankRes.status}), falling back to cross-encoder: ${errorText}`);
          // 远程失败，回退到 Cross-Encoder 本地重排序
          const crossResults = await crossEncoderRerank(candidatesForRerank, query);
          rerankedScores = crossResults.map((r) => ({ chunkId: r.chunkId, score: r.score }));
          logger.info(`Cross-encoder re-ranker applied as fallback: ${rerankedScores.length} results`);
        }
      } catch (rerankErr) {
        logger.warn(`Remote re-ranker error, falling back to cross-encoder: ${rerankErr}`);
        const crossResults = await crossEncoderRerank(candidatesForRerank, query);
        rerankedScores = crossResults.map((r) => ({ chunkId: r.chunkId, score: r.score }));
        logger.info(`Cross-encoder re-ranker applied as fallback: ${rerankedScores.length} results`);
      }
    } else {
      // cr-2: 没有远程 Re-ranker 时，使用 Cross-Encoder 本地重排序（模型不可用时降级为启发式）
      const crossResults = await crossEncoderRerank(candidatesForRerank, query);
      rerankedScores = crossResults.map((r) => ({ chunkId: r.chunkId, score: r.score }));
      logger.info(`Cross-encoder re-ranker applied: ${rerankedScores.length} results`);
    }

    const topResults = rerankedScores.slice(0, topK).map((s) => {
      const chunk = chunkMap.get(s.chunkId)!;
      return {
        chunkId: s.chunkId,
        text: chunk.text,
        metadata: (() => { try { return JSON.parse(chunk.metadata); } catch { return {}; } })(),
        score: s.score,
      };
    });

    res.json({ ok: true, results: topResults });
  } catch (err) {
    logger.error("Knowledge search error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/knowledge/clear — 清空全部 */
knowledgeRouter.delete("/knowledge/clear", (_req, res) => {
  try {
    clearAll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// ── nf-9: 知识库 Provider API ──────────────────────────

/** POST /api/knowledge/providers/test — 测试知识库 Provider 连接 */
knowledgeRouter.post("/knowledge/providers/test", express.json(), async (req, res) => {
  try {
    const { providerType, baseUrl, apiKey, modelId } = req.body as {
      providerType: string;
      baseUrl: string;
      apiKey: string;
      modelId: string;
    };

    if (!baseUrl || !apiKey) {
      res.status(400).json({ ok: false, error: "Missing baseUrl or apiKey" });
      return;
    }

    if (providerType === "embedding") {
      // 测试 Embedding API（baseUrl 可能已包含 /v1）
      const embeddingsUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/embeddings` : `${baseUrl}/v1/embeddings`;
      const response = await fetch(embeddingsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          input: ["test"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.json({ ok: false, error: `HTTP ${response.status}: ${errorText}` });
        return;
      }

      res.json({ ok: true });
    } else if (providerType === "reranker") {
      // 测试 Re-ranker API（baseUrl 可能已包含 /v1）
      const rerankUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/rerank` : `${baseUrl}/v1/rerank`;
      const response = await fetch(rerankUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          query: "test",
          documents: ["test document"],
          top_n: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        res.json({ ok: false, error: `HTTP ${response.status}: ${errorText}` });
        return;
      }

      res.json({ ok: true });
    } else {
      res.status(400).json({ ok: false, error: `Unknown provider type: ${providerType}` });
    }
  } catch (err) {
    logger.error("Knowledge provider test error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

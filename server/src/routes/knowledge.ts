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
  markChunkEmbedded,
  getAllVectors,
  getAllChunks,
  getStats,
  clearAll,
  findDuplicateByHash,
  computeTextHash,
  findChunksByHashes,
  getChunksBySourceId,
} from "../lib/knowledgeDb.js";
import { extractText, extractFromUrl } from "../lib/knowledgeExtract.js";
import { logger } from "../lib/logger.js";
import { crossEncoderRerank } from "../lib/reranker.js";
import { invalidateBM25Index } from "../lib/hybridSearch.js";
import { expandQueryFull } from "../lib/queryExpand.js";
import { chunkByDocumentType } from "../lib/legalChunker.js";
import { validateExternalUrl, BlockedUrlError } from "../lib/urlValidation.js";
import { knowledgeSearchInputSchema, knowledgeProviderTestInputSchema, knowledgeImportUrlInputSchema, embeddingConfigSchema, recordIdSchema, chunksLimitSchema } from "../../../shared/src/schemas/api-input.schema.js";

const FETCH_TIMEOUT_MS = 30_000;

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
let _remoteEmbedderConfig: { baseUrl: string; apiKey: string; modelId: string } | null = null;
let remoteEmbedder: { embed: (texts: string[]) => Promise<number[][]>; modelId: string } | null = null;

/** 创建远程 embedding 函数 */
export function createRemoteEmbedder(config: { baseUrl: string; apiKey: string; modelId: string }) {
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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
function setRemoteEmbedder(config: { baseUrl: string; apiKey: string; modelId: string } | null) {
  _remoteEmbedderConfig = config;
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
        const raw = JSON.parse(embeddingConfigStr) as Record<string, unknown>;
        const configParsed = embeddingConfigSchema.safeParse(raw);
        if (configParsed.success) {
          setRemoteEmbedder(configParsed.data);
        } else {
          logger.warn(`embeddingConfig validation failed: ${configParsed.error.issues.map(i => i.message).join("; ")}`);
        }
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
    logger.info(`[${fileName}] 预处理: ${extraction.text.length} → ${cleanedText.length} 字符`);
    sendEvent({ step: "preprocessing", stepNum: 2, totalSteps: TOTAL_STEPS, done: true });

    // Step 3/5: 切片（法律文本按条切分，保留层级元数据）
    sendEvent({ step: "chunking", stepNum: 3, totalSteps: TOTAL_STEPS, message: "切片处理中..." });
    const docCategory = classifyDocument(fileName, cleanedText);
    const legalChunks = chunkByDocumentType(cleanedText, docCategory, {
      fileName,
      documentCategory: docCategory,
    });

    // Step 4/5: 噪声过滤 + 乱码过滤 + Chunk 级去重
    const dedupHashes = new Set<string>();
    const filteredChunks: Array<{ text: string; metadata: Record<string, unknown>; parentId?: string | undefined }> = [];
    for (const rc of legalChunks) {
      if (isNoise(rc.text) || isGarbled(rc.text)) continue;
      const hash = crypto.createHash("sha256").update(rc.text.replace(/[\s　]/g, "").toLowerCase()).digest("hex"); // eslint-disable-line no-irregular-whitespace
      if (dedupHashes.has(hash)) continue;
      dedupHashes.add(hash);
      const entry: { text: string; metadata: Record<string, unknown>; parentId?: string | undefined } = {
        text: rc.text,
        metadata: rc.metadata as unknown as Record<string, unknown>,
      };
      if (rc.parentId) entry.parentId = rc.parentId;
      filteredChunks.push(entry);
    }
    const noiseCount = legalChunks.length - filteredChunks.length;
    logger.info(`[${fileName}] 文档分类: ${docCategory} | 切片: ${legalChunks.length} → ${filteredChunks.length} 条（去噪/去重 ${noiseCount}）`);
    if (filteredChunks[0]) {
      logger.info(`[${fileName}] 首条 chunk 预览: ${filteredChunks[0].text.slice(0, 100)}...`);
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

    const chunks = filteredChunks.map((rc, i) => {
      const chunk: {
        id: string; sourceId: string; index: number; text: string;
        strategy: string; metadata: Record<string, unknown>; parentId?: string;
      } = {
        id: `${sourceId}-c${i}`,
        sourceId,
        index: i,
        text: rc.text,
        strategy: "auto",
        metadata: rc.metadata,
      };
      if (rc.parentId) chunk.parentId = `${sourceId}-${rc.parentId}`;
      return chunk;
    });
    addChunks(chunks);
    sendEvent({ step: "storing", stepNum: 4, totalSteps: TOTAL_STEPS, done: true });

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
        const hash = chunkHashes[i];
        const chunk = chunks[i];
        if (!hash || !chunk) continue;
        const existing = existingEmbeddings.get(hash);
        if (existing) {
          // 断点续传：复用已有 embedding
          addVectors([{ chunkId: chunk.id, vector: existing.vector, modelId: emb.modelId }]);
          markChunkEmbedded(chunk.id);
          skippedCount++;
        } else {
          chunksToEmbed.push(chunk);
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
        const vectorRecords = batch.map((c, j) => {
          const vec = vectors[j];
          if (!vec) throw new Error(`Missing vector for chunk ${c.id} at index ${j}`);
          return { chunkId: c.id, vector: vec, modelId: emb.modelId };
        });
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
    const parsed = knowledgeImportUrlInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { url } = parsed.data;

    try {
      validateExternalUrl(url);
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        res.status(400).json({ ok: false, error: err.message });
        return;
      }
      throw err;
    }

    const sourceId = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const extraction = await extractFromUrl(url);
    const cleanedText = preprocessText(extraction.text, url);
    logger.info(`[URL:${url}] 预处理: ${extraction.text.length} → ${cleanedText.length} 字符`);
    const docCategory = classifyDocument(url, cleanedText);
    const legalChunks = chunkByDocumentType(cleanedText, docCategory, {
      fileName: url,
      documentCategory: docCategory,
    });
    const filteredChunks = legalChunks
      .filter((rc) => !isNoise(rc.text))
      .map((rc) => ({ text: rc.text, metadata: rc.metadata as unknown as Record<string, unknown> }));
    logger.info(`[URL:${url}] 文档分类: ${docCategory} | 切片: ${legalChunks.length} → ${filteredChunks.length} 条`);

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
        const hash = chunkHashes[i];
        const chunk = chunks[i];
        if (!hash || !chunk) continue;
        const existing = existingEmbeddings.get(hash);
        if (existing) {
          addVectors([{ chunkId: chunk.id, vector: existing.vector, modelId: emb.modelId }]);
          markChunkEmbedded(chunk.id);
          skippedCount++;
        } else {
          chunksToEmbed.push(chunk);
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
        const vectorRecords = batch.map((c, j) => {
          const vec = vectors[j];
          if (!vec) throw new Error(`Missing vector for chunk ${c.id} at index ${j}`);
          return { chunkId: c.id, vector: vec, modelId: emb.modelId };
        });
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

/** GET /api/knowledge/sources/:id/chunks — 获取来源的 chunk 预览 */
knowledgeRouter.get("/knowledge/sources/:id/chunks", (req, res) => {
  try {
    const idParsed = recordIdSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ ok: false, error: idParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const limitParsed = chunksLimitSchema.safeParse(req.query.limit);
    if (!limitParsed.success) {
      res.status(400).json({ ok: false, error: limitParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const chunks = getChunksBySourceId(idParsed.data, limitParsed.data).map((c) => ({
      ...c,
      metadata: JSON.parse(c.metadata) as Record<string, unknown>,
    }));
    res.json({ ok: true, chunks });
  } catch (err) {
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/knowledge/sources/:id — 删除来源 */
knowledgeRouter.delete("/knowledge/sources/:id", (req, res) => {
  try {
    const idParsed = recordIdSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ ok: false, error: idParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    deleteSource(idParsed.data);
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
    const parsed = knowledgeSearchInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { query, topK, reranker, embedding } = parsed.data;

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
        logger.info(`[Search] [Step 1] Embedding query: "${expandedQuery.slice(0, 50)}..." model=${emb.modelId}`);
        const qVec = (await emb.embed([expandedQuery]))[0];
        if (!qVec) throw new Error("Failed to embed query");
        const queryVector = qVec;
        logger.info(`[Search] [Step 1] Embedding 完成: vector dim=${queryVector.length}`);
        const allScores: Array<{ chunkId: string; score: number }> = [];
        for (const [chunkId, vec] of vectorMap) {
          const chunk = chunkMap.get(chunkId);
          if (!chunk) continue;

          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < queryVector.length; i++) {
            dot += (queryVector[i] ?? 0) * (vec.vector[i] ?? 0);
            normA += (queryVector[i] ?? 0) * (queryVector[i] ?? 0);
            normB += (vec.vector[i] ?? 0) * (vec.vector[i] ?? 0);
          }
          const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
          allScores.push({ chunkId, score });
        }
        allScores.sort((a, b) => b.score - a.score);

        // 动态 threshold：top-K + 相对 threshold
        const TOP_K = 15;
        const RELATIVE_THRESHOLD = 0.7;
        const topScore = allScores[0]?.score ?? 0;
        const minScore = topScore * RELATIVE_THRESHOLD;
        scores = allScores
          .filter((s) => s.score >= minScore && s.score >= 0.1)
          .slice(0, TOP_K);
        logger.info(`[Search] [Step 1] Vector search: ${allScores.length} 全部 → ${scores.length} 结果 (dynamic threshold, top=${topScore.toFixed(4)}, min=${minScore.toFixed(4)})`);
      } catch (embedErr) {
        // bg-70: Embedding 失败时降级到纯 BM25，不返回 500
        logger.warn(`[Search] Embedding failed, falling back to pure BM25: ${embedErr}`);
        scores = []; // 传空 scores 给 hybridSearch，让 BM25 独立返回结果
      }
    } else {
      logger.info("[Search] 未配置 embedding，纯 BM25 搜索");
    }

    // bg-41: 混合检索 — 向量相似度 + BM25，RRF 融合
    const { hybridSearch } = await import("../lib/hybridSearch.js");
    const hybridScores = hybridSearch(expandedQuery, scores, topK * 3);

    // bg-41: Re-ranker 集成 — 有远程用远程，没有用本地启发式算法
    // 过滤掉 chunkMap 中不存在的 chunkId（BM25 可能返回已删除的 chunk）
    const validHybridScores = hybridScores.filter((s) => chunkMap.has(s.chunkId));
    let rerankedScores = validHybridScores;
    const topCandidates = validHybridScores.slice(0, topK * 3);
    logger.info(`[Search] [Step 3] Rerank 候选: ${topCandidates.length} 条 (来自 ${validHybridScores.length} 有效结果)`);
    // 构建 localRerank 需要的格式
    const candidatesForRerank = topCandidates.map((s) => {
      const chunk = chunkMap.get(s.chunkId);
      if (!chunk) return null;
      return {
        chunkId: s.chunkId,
        text: chunk.text,
        metadata: (() => { try { return JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { return {}; } })(),
        score: s.score,
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

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
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (rerankRes.ok) {
          const rerankData = await rerankRes.json() as {
            results: Array<{ index: number; relevance_score: number }>;
          };

          rerankedScores = rerankData.results
            .filter((r) => r.index >= 0 && r.index < topCandidates.length)
            .map((r) => {
              const candidate = topCandidates[r.index];
              return {
                chunkId: candidate?.chunkId ?? "",
                score: r.relevance_score,
              };
            })
            .filter((r) => r.chunkId !== "");

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
      // cr-2: 没有远程 Re-ranker 时，直接使用 localRerank（避免 cross-encoder 10 秒加载延迟）
      const { localRerank } = await import("../lib/reranker.js");
      rerankedScores = localRerank(candidatesForRerank, query);
      logger.info(`[Search] Local rerank applied: ${rerankedScores.length} results`);
    }

    logger.info(`[Search] [Step 4] Rerank 完成: ${rerankedScores.length} 结果, top=${rerankedScores[0]?.score?.toFixed(4) ?? "N/A"}`);
    const topResults = rerankedScores.slice(0, topK).map((s) => {
      const chunk = chunkMap.get(s.chunkId);
      if (!chunk) return null;
      return {
        chunkId: s.chunkId,
        text: chunk.text,
        metadata: (() => { try { return JSON.parse(chunk.metadata); } catch { return {}; } })(),
        score: s.score,
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

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
    const parsed = knowledgeProviderTestInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { providerType, baseUrl, apiKey, modelId } = parsed.data;

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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const body = await response.text();
      if (!response.ok) {
        res.json({ ok: false, error: `HTTP ${response.status}: ${body}` });
        return;
      }

      // 验证响应是合法 JSON 且包含 embedding 数据
      try {
        const data = JSON.parse(body);
        if (!data.data?.[0]?.embedding) {
          res.json({ ok: false, error: `响应格式异常: 缺少 embedding 数据` });
          return;
        }
      } catch {
        res.json({ ok: false, error: `响应不是合法 JSON: ${body.slice(0, 200)}` });
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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const body = await response.text();
      if (!response.ok) {
        res.json({ ok: false, error: `HTTP ${response.status}: ${body}` });
        return;
      }

      // 验证响应是合法 JSON 且包含 rerank 结果
      try {
        const data = JSON.parse(body);
        if (!data.results?.length) {
          res.json({ ok: false, error: `响应格式异常: 缺少 rerank 结果` });
          return;
        }
      } catch {
        res.json({ ok: false, error: `响应不是合法 JSON: ${body.slice(0, 200)}` });
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

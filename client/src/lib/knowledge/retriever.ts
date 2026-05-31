/**
 * 知识库检索器 — 将用户 query 向量化后检索相关 chunk
 */
import type { KnowledgeSearchResult, KnowledgeConfig } from "@shared/types/knowledge";
import type { EmbedderConfig } from "./embedder";
import { embedSingle } from "./embedder";
import { searchKnowledge } from "./vectorStore";
import { getKnowledgeStats } from "./knowledgeRepo";
import { expandQuery, expandCrossLanguage } from "./normalizers";
import { expandQueryWithGraph } from "./knowledgeGraph";
import { hybridSearch } from "./hybridSearch";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeRetriever");

// 检索日志
interface RetrievalLog {
  timestamp: string;
  query: string;
  topK: number;
  resultCount: number;
  scores: number[];
  chunkIds: string[];
}

const retrievalLogs: RetrievalLog[] = [];
const MAX_RETRIEVAL_LOGS = 200;

function recordRetrievalLog(query: string, topK: number, results: KnowledgeSearchResult[]) {
  retrievalLogs.push({
    timestamp: new Date().toISOString(),
    query: query.slice(0, 200),
    topK,
    resultCount: results.length,
    scores: results.map((r) => r.score),
    chunkIds: results.map((r) => r.chunk.id),
  });
  if (retrievalLogs.length > MAX_RETRIEVAL_LOGS) retrievalLogs.shift();
}

/** 获取检索日志 */
export function getRetrievalLogs(): RetrievalLog[] {
  return [...retrievalLogs];
}

export interface RetrieveOptions {
  query: string;
  topK?: number;
  scoreThreshold?: number;
}

// 检索结果缓存：query hash → results
const searchCache = new Map<string, { results: KnowledgeSearchResult[]; timestamp: number }>();

// 反馈数据：chunkId → { positive, negative }
const chunkFeedback = new Map<string, { positive: number; negative: number }>();

/** 记录 chunk 的反馈 */
export function recordChunkFeedback(chunkId: string, isPositive: boolean): void {
  const current = chunkFeedback.get(chunkId) ?? { positive: 0, negative: 0 };
  if (isPositive) current.positive++;
  else current.negative++;
  chunkFeedback.set(chunkId, current);
}

/** 获取 chunk 反馈统计 */
export function getChunkFeedbackStats(): Map<string, { positive: number; negative: number }> {
  return new Map(chunkFeedback);
}
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

function getCacheKey(query: string, topK: number, scoreThreshold: number): string {
  return `${query.trim().toLowerCase()}|${topK}|${scoreThreshold}`;
}

/**
 * 检索与 query 最相关的知识库 chunk
 */
export async function retrieve(
  options: RetrieveOptions,
  config: KnowledgeConfig,
  embedConfig: EmbedderConfig
): Promise<KnowledgeSearchResult[]> {
  const { query, topK = config.topK, scoreThreshold = config.scoreThreshold } = options;

  // 检查知识库是否启用且有内容
  const stats = await getKnowledgeStats();
  if (!config.enabled || stats.chunkCount === 0 || stats.embeddedCount === 0) {
    log("Knowledge base disabled or empty, skipping retrieval");
    return [];
  }

  // 检查缓存
  const cacheKey = getCacheKey(query, topK, scoreThreshold);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Retrieved ${cached.results.length} chunks from cache`);
    return cached.results;
  }

  // 多语言扩展 + 法条图谱扩展
  const expandedQuery = expandCrossLanguage(expandQueryWithGraph(query));

  // 使用混合检索（语义 + BM25 RRF 融合）
  const results = await hybridSearch(expandedQuery, config, embedConfig, topK);

  // 父文档检索：为每个命中 chunk 补充相邻上下文
  const enrichedResults = await enrichWithParentContext(results);

  // 缓存结果
  searchCache.set(cacheKey, { results: enrichedResults, timestamp: Date.now() });

  recordRetrievalLog(query, topK, enrichedResults);
  log(`Retrieved ${enrichedResults.length} chunks via hybrid search`);

  return enrichedResults;
}

/** 父文档检索：为命中 chunk 补充相邻上下文 */
async function enrichWithParentContext(
  results: KnowledgeSearchResult[]
): Promise<KnowledgeSearchResult[]> {
  const { getChunksBySource } = await import("./knowledgeRepo");
  const enriched: KnowledgeSearchResult[] = [];

  for (const result of results) {
    enriched.push(result);

    // 获取同源的相邻 chunk
    const sourceChunks = await getChunksBySource(result.chunk.sourceId);
    const currentIndex = result.chunk.index;

    // 添加前一个 chunk（如果存在且未在结果中）
    if (currentIndex > 0) {
      const prevChunk = sourceChunks.find((c) => c.index === currentIndex - 1);
      if (prevChunk && !results.some((r) => r.chunk.id === prevChunk.id)) {
        enriched.push({ chunk: prevChunk, score: result.score * 0.8 });
      }
    }

    // 添加后一个 chunk（如果存在且未在结果中）
    const nextChunk = sourceChunks.find((c) => c.index === currentIndex + 1);
    if (nextChunk && !results.some((r) => r.chunk.id === nextChunk.id)) {
      enriched.push({ chunk: nextChunk, score: result.score * 0.8 });
    }
  }

  return enriched;
}

/**
 * 将检索结果格式化为 Prompt 注入文本
 * @param maxTokens 最大 token 预算（约 1 token ≈ 1.5 中文字符），超出时截断
 */
export function formatRetrievedChunks(results: KnowledgeSearchResult[], maxTokens?: number): string {
  if (results.length === 0) return "";

  const parts = [
    `## 参考法规（由知识库检索，仅供参考）`,
    `以下段落与当前分析内容相关，请在回答时参考但不仅限于此：`,
    ``,
  ];

  let totalChars = 0;
  const charLimit = maxTokens ? Math.floor(maxTokens * 1.5) : Infinity;

  for (const result of results) {
    const { chunk, score } = result;
    const { metadata } = chunk;

    // 构造此 chunk 的注入文本
    const sourceLabel = metadata.sectionId
      ? `${metadata.fileName} ${metadata.sectionId}`
      : metadata.articleId
        ? `${metadata.fileName} ${metadata.articleId}`
        : metadata.sheetName
          ? `${metadata.fileName} - ${metadata.sheetName} 行${metadata.rowIndex}`
          : metadata.fileName;

    const chunkLines: string[] = [];
    chunkLines.push(`> 【来源：${sourceLabel} · 相似度: ${score.toFixed(2)}】`);

    if (metadata.mediaType === "table") {
      for (const line of chunk.text.split(" | ")) {
        chunkLines.push(`> ${line}`);
      }
    } else {
      for (const line of chunk.text.split("\n")) {
        chunkLines.push(`> ${line}`);
      }
    }
    chunkLines.push(``);

    const chunkText = chunkLines.join("\n");

    // 检查是否超出 token 预算
    if (totalChars + chunkText.length > charLimit) {
      log(`Token budget reached: ${totalChars}/${charLimit} chars, skipping remaining chunks`);
      break;
    }

    parts.push(chunkText);
    totalChars += chunkText.length;
  }

  return parts.join("\n");
}

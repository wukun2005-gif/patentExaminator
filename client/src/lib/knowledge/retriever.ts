/**
 * 知识库检索器 — 将用户 query 向量化后检索相关 chunk
 * MIGRATE-004: 检索已迁移到后端，客户端只做缓存和扩展
 */
import type { KnowledgeSearchResult, KnowledgeConfig } from "@shared/types/knowledge";
import type { EmbedderConfig } from "./embedder";
import { expandCrossLanguage } from "./normalizers";
import { expandQueryWithGraph } from "./knowledgeGraph";
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
 * 检索与 query 最相关的知识库 chunk（调用 server API）
 */
export async function retrieve(
  options: RetrieveOptions,
  config: KnowledgeConfig,
  _embedConfig: EmbedderConfig
): Promise<KnowledgeSearchResult[]> {
  const { query, topK = config.topK } = options;

  if (!config.enabled) {
    log("Knowledge base disabled, skipping retrieval");
    return [];
  }

  // 检查缓存
  const cacheKey = getCacheKey(query, topK, 0);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Retrieved ${cached.results.length} chunks from cache`);
    return cached.results;
  }

  // 多语言扩展 + 法条图谱扩展
  const expandedQuery = expandCrossLanguage(expandQueryWithGraph(query));

  // 调用 server 端检索 API
  try {
    // nf-9: 传递 Re-ranker + Embedding 配置
    const { readSettings } = await import("../repositories/settingsRepo");
    const settings = await readSettings();
    const rerankerProvider = settings.knowledgeProviders?.find(
      (p) => p.providerType === "reranker" && p.enabled && p.apiKeyRef
    );
    const embeddingProvider = settings.knowledgeProviders?.find(
      (p) => p.providerType === "embedding" && p.enabled && p.apiKeyRef
    );

    const res = await fetch("/api/knowledge/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: expandedQuery,
        topK,
        reranker: rerankerProvider ? {
          baseUrl: rerankerProvider.baseUrl,
          apiKey: rerankerProvider.apiKeyRef,
          modelId: rerankerProvider.modelId,
        } : undefined,
        // bg-41: 传递远程 Embedding 配置
        embedding: embeddingProvider ? {
          baseUrl: embeddingProvider.baseUrl,
          apiKey: embeddingProvider.apiKeyRef,
          modelId: embeddingProvider.modelId,
        } : undefined,
      }),
    });
    const data = await res.json() as {
      ok: boolean;
      results?: Array<{ chunkId: string; text: string; metadata: Record<string, unknown>; score: number }>;
    };

    if (!data.ok || !data.results) {
      log("Server search returned no results");
      return [];
    }

    const results: KnowledgeSearchResult[] = data.results.map((r) => ({
      chunk: {
        id: r.chunkId,
        sourceId: (r.metadata?.sourceId as string) ?? "",
        index: (r.metadata?.index as number) ?? 0,
        text: r.text,
        strategy: "auto" as const,
        metadata: r.metadata,
        embedded: true,
        createdAt: new Date().toISOString(),
      },
      score: r.score,
    }));

    // 缓存结果
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    recordRetrievalLog(query, topK, results);
    log(`Retrieved ${results.length} chunks via server API`);

    return results;
  } catch (err) {
    log(`Server search failed: ${err}`);
    return [];
  }
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

/**
 * 高亮检索结果中的匹配关键词（用于 UI 显示）
 * @param text 原始文本
 * @param query 检索 query
 * @returns 带高亮标记的文本（使用 **keyword** 标记）
 */
export function highlightMatches(text: string, query: string): string {
  const keywords = query
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // 转义正则特殊字符

  if (keywords.length === 0) return text;

  const pattern = new RegExp(`(${keywords.join("|")})`, "gi");
  return text.replace(pattern, "**$1**");
}

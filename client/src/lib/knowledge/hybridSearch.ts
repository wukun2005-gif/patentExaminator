/**
 * 混合检索 — 语义检索 + BM25 关键词检索，RRF 融合排序
 */
import type { KnowledgeSearchResult, KnowledgeConfig, KnowledgeChunk } from "@shared/types/knowledge";
import type { EmbedderConfig } from "./embedder";
import { embedSingle } from "./embedder";
import { searchKnowledge } from "./vectorStore";
import { searchBM25 } from "./bm25Search";
import { getKnowledgeStats, getAllChunks } from "./knowledgeRepo";
import { expandQuery } from "./normalizers";
import { createLogger } from "../logger";

const log = createLogger("HybridSearch");

const RRF_K = 60; // RRF 常数，标准值为 60

/** Reciprocal Rank Fusion：融合多个排序列表 */
function reciprocalRankFusion(
  rankings: Array<Array<{ id: string; score: number }>>,
  k: number = RRF_K
): Array<{ id: string; score: number }> {
  const scoreMap = new Map<string, number>();

  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const { id } = ranking[rank]!;
      const rrfScore = 1 / (k + rank + 1);
      scoreMap.set(id, (scoreMap.get(id) ?? 0) + rrfScore);
    }
  }

  return Array.from(scoreMap.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export interface SearchFilters {
  documentCategory?: string;
  mediaType?: string;
  sourceId?: string;
  /** 表格语义查询：对表格 chunk 额外做列值匹配 */
  tableQuery?: string;
  /** 包含图片结果：是否在检索结果中包含图片 chunk */
  includeImages?: boolean;
}

/** 混合检索：语义 + BM25，RRF 融合 */
export async function hybridSearch(
  query: string,
  config: KnowledgeConfig,
  embedConfig: EmbedderConfig,
  topK: number = 5,
  filters?: SearchFilters
): Promise<KnowledgeSearchResult[]> {
  const stats = await getKnowledgeStats();
  if (!config.enabled || stats.chunkCount === 0) {
    return [];
  }

  const expandedQuery = expandQuery(query);

  // bg-70: 语义检索 — embedding 失败时降级到纯 BM25
  let semanticRanking: Array<{ id: string; score: number }> = [];
  let semanticResults: KnowledgeSearchResult[] = [];

  // cr-1: 仅在配置了远程 embedding API 且有 embedding 数据时进行语义检索
  if (embedConfig.remoteBaseUrl && embedConfig.remoteApiKey && stats.embeddedCount > 0) {
    try {
      const queryVector = await embedSingle(expandedQuery, embedConfig);
      semanticResults = await searchKnowledge(queryVector, topK * 2, config.scoreThreshold);
      semanticRanking = semanticResults.map((r) => ({ id: r.chunk.id, score: r.score }));
    } catch (err) {
      // bg-70: Embedding 失败时降级到纯 BM25，不抛出异常
      log(`Embedding failed, falling back to pure BM25: ${err}`);
      semanticResults = [];
      semanticRanking = [];
    }
  } else {
    log("No embedding provider configured or no embedded data, using pure BM25 search");
  }

  // BM25 检索
  const bm25Results = searchBM25(expandedQuery, topK * 2);
  const bm25Ranking = bm25Results.map((r) => ({ id: r.id, score: r.score }));

  // RRF 融合（如果只有 BM25，则直接使用 BM25 结果）
  const rankings = [semanticRanking, bm25Ranking].filter((r) => r.length > 0);
  const fusedRanking = rankings.length > 0 ? reciprocalRankFusion(rankings) : [];

  // 构建 chunkId → chunk 映射（用于 BM25 结果）
  const allChunks = getAllChunks();
  const chunkMap = new Map<string, KnowledgeChunk>(allChunks.map((c) => [c.id, c]));

  // 取 top-K 并映射回 KnowledgeSearchResult，应用元数据过滤
  const semanticMap = new Map(semanticResults.map((r) => [r.chunk.id, r]));
  const results: KnowledgeSearchResult[] = [];

  for (const { id } of fusedRanking) {
    if (results.length >= topK) break;
    // 优先使用语义检索结果（如果有的话），否则使用 BM25 结果
    const semanticResult = semanticMap.get(id);
    const chunk = semanticResult?.chunk ?? chunkMap.get(id);

    if (!chunk) continue;

    // 元数据过滤
    if (filters?.documentCategory && chunk.metadata.documentCategory !== filters.documentCategory) continue;
    if (filters?.mediaType && chunk.metadata.mediaType !== filters.mediaType) continue;
    if (filters?.sourceId && chunk.sourceId !== filters.sourceId) continue;
    // 图片过滤：默认包含，设为 false 时排除
    if (filters?.includeImages === false && chunk.metadata.mediaType === "image") continue;

    // 使用语义检索的分数（如果有的话），否则使用 RRF 融合分数
    const score = semanticResult?.score ?? (fusedRanking.find((r) => r.id === id)?.score ?? 0);
    results.push({ chunk, score });
  }

  // 表格语义查询：如果有 tableQuery，额外匹配表格 chunk 的列值
  if (filters?.tableQuery) {
    const tableResults = searchBM25(filters.tableQuery, topK * 2);
    const tableMap = new Map(tableResults.map((r) => [r.id, r.score]));

    // 提升表格 chunk 的分数
    for (const result of results) {
      if (result.chunk.metadata.mediaType === "table") {
        const tableBoost = tableMap.get(result.chunk.id);
        if (tableBoost) {
          result.score = Math.min(1, result.score + tableBoost * 0.3);
        }
      }
    }
  }

  log(`Hybrid search: ${semanticResults.length} semantic + ${bm25Results.length} BM25 → ${results.length} fused results`);
  return results;
}

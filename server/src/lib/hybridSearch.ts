/**
 * 服务端混合检索 — BM25 + 向量相似度，RRF 融合排序
 * 从 client/src/lib/knowledge/hybridSearch.ts + bm25Search.ts 迁移
 */
import MiniSearch from "minisearch";
import { getAllChunks } from "./knowledgeDb.js";
import { logger } from "./logger.js";

const RRF_K = 60; // RRF 常数

// ── BM25 索引 ─────────────────────────────────────────

let miniSearch: MiniSearch | null = null;
let _indexedSourceIds = new Set<string>();

/** 构建或更新 BM25 索引 */
function ensureBM25Index(): MiniSearch {
  if (miniSearch) return miniSearch;

  const chunks = getAllChunks();
  miniSearch = new MiniSearch({
    fields: ["text"],
    storeFields: ["sourceId"],
    searchOptions: {
      boost: { text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const documents = chunks.map((c) => ({
    id: c.id,
    text: c.text,
    sourceId: c.sourceId,
  }));

  miniSearch.addAll(documents);
  _indexedSourceIds = new Set(chunks.map((c) => c.sourceId));
  logger.info(`BM25 index built: ${chunks.length} documents`);
  return miniSearch;
}

/** BM25 关键词检索 */
function searchBM25(query: string, topK: number = 10): Array<{ id: string; score: number }> {
  const index = ensureBM25Index();
  const results = index.search(query).slice(0, topK);
  return results.map((r) => ({ id: String(r.id), score: r.score }));
}

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

// ── 混合检索 ──────────────────────────────────────────

interface HybridSearchResult {
  chunkId: string;
  score: number;
}

/**
 * 混合检索：向量相似度 + BM25，RRF 融合
 * 当 chunk 数量 > 0 时使用混合检索，否则回退到纯向量搜索
 */
export function hybridSearch(
  query: string,
  vectorScores: Array<{ chunkId: string; score: number }>,
  topK: number = 10
): HybridSearchResult[] {
  // 向量检索结果转为 RRF 格式
  const vectorRanking = vectorScores.map((s) => ({ id: s.chunkId, score: s.score }));

  // BM25 检索
  const bm25Results = searchBM25(query, topK * 2);
  const bm25Ranking = bm25Results.map((r) => ({ id: r.id, score: r.score }));

  // 如果 BM25 没有结果，直接返回向量检索结果
  if (bm25Ranking.length === 0) {
    return vectorScores.slice(0, topK);
  }

  // RRF 融合
  const fused = reciprocalRankFusion([vectorRanking, bm25Ranking]);

  logger.info(`Hybrid search: ${vectorRanking.length} vector + ${bm25Ranking.length} BM25 → ${fused.length} fused`);

  return fused.slice(0, topK).map((r) => ({
    chunkId: r.id,
    score: r.score,
  }));
}

/** 清除 BM25 索引（知识库更新后调用） */
export function invalidateBM25Index(): void {
  miniSearch = null;
  _indexedSourceIds.clear();
}

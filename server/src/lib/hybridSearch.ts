/**
 * 服务端混合检索 — BM25 + 向量相似度，RRF 融合排序
 * 从 client/src/lib/knowledge/hybridSearch.ts + bm25Search.ts 迁移
 */
import MiniSearch from "minisearch";
import { getAllChunks } from "./knowledgeDb.js";
import { logger } from "./logger.js";

const RRF_K = 60; // RRF 常数

// ── 中文分词 ─────────────────────────────────────────

/** 中文分词：bigram + 单字 + 英文单词 */
function tokenizeChinese(text: string): string[] {
  const tokens: string[] = [];
  // 去标点，保留中英文和数字
  const cleaned = text.replace(/[^一-鿿\w]/g, " ");
  const segments = cleaned.split(/\s+/).filter(Boolean);

  for (const seg of segments) {
    // 英文/数字段：直接作为 token
    if (/^[\w\d]+$/.test(seg)) {
      tokens.push(seg.toLowerCase());
      continue;
    }
    // 中文段：bigram 分词 + 单字
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]!); // 单字
      if (i + 1 < seg.length) {
        tokens.push(seg.slice(i, i + 2)); // bigram
      }
    }
  }
  return [...new Set(tokens)];
}

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
    tokenize: (text) => tokenizeChinese(text),
    searchOptions: {
      boost: { text: 1 },
      combineWith: "OR",
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
  if (results.length > 0) {
    const top = results[0];
    logger.info(`[BM25] query="${query.slice(0, 40)}..." → ${results.length} hits, top score=${top?.score?.toFixed(4) ?? "N/A"}`);
  } else {
    logger.info(`[BM25] query="${query.slice(0, 40)}..." → 0 hits`);
  }
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
      const entry = ranking[rank];
      if (!entry) continue;
      const { id } = entry;
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
    logger.info(`[Hybrid] BM25 无结果，仅返回 vector 结果: ${vectorRanking.length} 条`);
    return vectorScores.slice(0, topK);
  }

  // RRF 融合
  const fused = reciprocalRankFusion([vectorRanking, bm25Ranking]);

  logger.info(`[Hybrid] RRF 融合: ${vectorRanking.length} vector + ${bm25Ranking.length} BM25 → ${fused.length} fused, topK=${topK}`);
  if (fused.length > 0) {
    const top3 = fused.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const item = top3[i];
      if (item) logger.info(`[Hybrid]   #${i + 1}: ${item.id} (score=${item.score.toFixed(4)})`);
    }
  }

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

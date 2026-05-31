/**
 * 知识库向量存储 — 管理向量的索引和检索
 */
import type { KnowledgeSearchResult, KnowledgeChunk } from "@shared/types/knowledge";
import * as repo from "./knowledgeRepo";
import { buildBM25Index } from "./bm25Search";
import { ANNIndex } from "./annIndex";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeVectorStore");

// ── 内存向量索引（ANN 优化版） ────────────────────────

let annIndex: ANNIndex | null = null;
let chunkLookup: Map<string, KnowledgeChunk> | null = null;
let indexBuiltAt = 0;

/** 构建内存向量索引（首次检索时自动构建，已构建则跳过） */
export async function buildVectorIndex(): Promise<void> {
  // 如果索引已构建且未失效，跳过重建
  if (annIndex && annIndex.size > 0 && indexBuiltAt > 0) {
    log(`ANN index already built (${annIndex.size} entries), skipping rebuild`);
    return;
  }

  const vectors = await repo.getAllVectors();

  // 获取所有 chunk
  const sources = await repo.getAllSources();
  chunkLookup = new Map<string, KnowledgeChunk>();

  for (const source of sources) {
    const sourceChunks = await repo.getChunksBySource(source.id);
    for (const chunk of sourceChunks) {
      chunkLookup.set(chunk.id, chunk);
    }
  }

  annIndex = new ANNIndex();
  for (const vec of vectors) {
    const chunk = chunkLookup.get(vec.chunkId);
    if (chunk) {
      annIndex.add(vec.chunkId, chunk, vec.vector);
    }
  }

  indexBuiltAt = Date.now();

  // 同时构建 BM25 索引
  const allChunks = Array.from(chunkLookup.values());
  buildBM25Index(allChunks);

  log(`Built ANN index: ${annIndex.size} entries, BM25 index: ${allChunks.length} documents`);
}

export function invalidateVectorIndex(): void {
  annIndex = null;
  chunkLookup = null;
  indexBuiltAt = 0;
}

// ── 检索 ──────────────────────────────────────────────

export async function searchKnowledge(
  queryVector: number[],
  topK: number = 5,
  scoreThreshold: number = 0.3
): Promise<KnowledgeSearchResult[]> {
  if (!annIndex || annIndex.size === 0) {
    await buildVectorIndex();
  }

  if (!annIndex || annIndex.size === 0) {
    return [];
  }

  // 构建 source 过期时间映射
  const sources = await repo.getAllSources();
  const expiredSourceIds = new Set<string>();
  const now = new Date().toISOString();
  for (const source of sources) {
    if (source.expiryDate && source.expiryDate < now) {
      expiredSourceIds.add(source.id);
    }
  }

  // 使用 ANN 索引搜索（Float32Array + 预计算范数）
  const results = annIndex.search(queryVector, topK * 2, scoreThreshold);

  // 过滤已废止的 chunk，取 top-k
  const filtered = results
    .filter((r) => !expiredSourceIds.has(r.chunk.sourceId))
    .slice(0, topK);

  return filtered.map(({ chunkId, chunk, score }) => ({ chunkId, chunk, score }));
}

// ── 统计 ─────────────────────────────────────────────

export function getVectorIndexStats(): { size: number; builtAt: number } {
  return { size: vectorIndex?.size ?? 0, builtAt: indexBuiltAt };
}

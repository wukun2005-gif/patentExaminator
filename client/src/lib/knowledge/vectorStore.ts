/**
 * 知识库向量存储 — 管理向量的索引和检索
 */
import type { KnowledgeSearchResult, KnowledgeChunk } from "@shared/types/knowledge";
import { cosineSimilarity } from "./embedder";
import * as repo from "./knowledgeRepo";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeVectorStore");

// ── 内存向量索引 ──────────────────────────────────────

let vectorIndex: Map<string, { vector: number[]; chunk: KnowledgeChunk }> | null = null;
let indexBuiltAt = 0;

/** 构建内存向量索引（首次检索时自动构建） */
export async function buildVectorIndex(): Promise<void> {
  const vectors = await repo.getAllVectors();

  // 获取所有 chunk
  const sources = await repo.getAllSources();
  const chunkMap = new Map<string, KnowledgeChunk>();

  for (const source of sources) {
    const sourceChunks = await repo.getChunksBySource(source.id);
    for (const chunk of sourceChunks) {
      chunkMap.set(chunk.id, chunk);
    }
  }

  vectorIndex = new Map();
  for (const vec of vectors) {
    const chunk = chunkMap.get(vec.chunkId);
    if (chunk) {
      vectorIndex.set(vec.chunkId, { vector: vec.vector, chunk });
    }
  }

  indexBuiltAt = Date.now();
  log(`Built vector index: ${vectorIndex.size} entries`);
}

export function invalidateVectorIndex(): void {
  vectorIndex = null;
  indexBuiltAt = 0;
}

// ── 检索 ──────────────────────────────────────────────

export async function searchKnowledge(
  queryVector: number[],
  topK: number = 5,
  scoreThreshold: number = 0.3
): Promise<KnowledgeSearchResult[]> {
  if (!vectorIndex || vectorIndex.size === 0) {
    await buildVectorIndex();
  }

  if (!vectorIndex || vectorIndex.size === 0) {
    return [];
  }

  const scores: Array<{ chunkId: string; score: number }> = [];

  for (const [chunkId, { vector }] of vectorIndex) {
    const score = cosineSimilarity(queryVector, vector);
    if (score >= scoreThreshold) {
      scores.push({ chunkId, score });
    }
  }

  // 按相似度降序排列，取 top-k
  scores.sort((a, b) => b.score - a.score);
  const topResults = scores.slice(0, topK);

  return topResults.map(({ chunkId, score }) => ({
    chunk: vectorIndex!.get(chunkId)!.chunk,
    score,
  }));
}

// ── 统计 ─────────────────────────────────────────────

export function getVectorIndexStats(): { size: number; builtAt: number } {
  return { size: vectorIndex?.size ?? 0, builtAt: indexBuiltAt };
}

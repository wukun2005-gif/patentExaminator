/**
 * 知识库向量化引擎 — 纯远程 API（cr-1: 移除本地 Embedding 模型）
 */
import type { KnowledgeChunk, KnowledgeVector } from "@shared/types/knowledge";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeEmbedder");

// ── 类型 ──────────────────────────────────────────────

export interface EmbedResult {
  vector: number[];
  modelId: string;
}

export interface EmbedderConfig {
  /** 远程 embedding API 的基础 URL */
  remoteBaseUrl?: string;
  /** 远程 embedding API 的 API Key */
  remoteApiKey?: string;
  /** 远程 embedding 模型 ID */
  remoteModelId?: string;
}

// ── 远程 Embedder（OpenAI-compatible API） ──────────────

async function embedRemote(
  texts: string[],
  config: EmbedderConfig
): Promise<number[][]> {
  const baseUrl = config.remoteBaseUrl ?? "";
  const apiKey = config.remoteApiKey ?? "";
  const modelId = config.remoteModelId ?? "text-embedding-3-small";

  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Remote embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((d) => d.embedding);
}

// ── 统一接口 ──────────────────────────────────────────

export async function embedTexts(
  texts: string[],
  config: EmbedderConfig
): Promise<number[][]> {
  if (texts.length === 0) return [];

  log(`Embedding ${texts.length} texts (remote)`);

  if (!config.remoteBaseUrl || !config.remoteApiKey) {
    throw new Error("Remote embedding API not configured. Please configure Embedding Provider in settings.");
  }

  return await embedRemote(texts, config);
}

export async function embedSingle(
  text: string,
  config: EmbedderConfig
): Promise<number[]> {
  const results = await embedTexts([text], config);
  return results[0] ?? [];
}

// ── 批量向量化 chunk ──────────────────────────────────

// Embedding 缓存：chunk text hash → vector
const embeddingCache = new Map<string, number[]>();

export async function embedChunks(
  chunks: KnowledgeChunk[],
  config: EmbedderConfig,
  batchSize: number = 10,
  onProgress?: (done: number, total: number) => void
): Promise<KnowledgeVector[]> {
  const modelId = config.remoteModelId ?? "text-embedding-3-small";

  const vectors: KnowledgeVector[] = [];
  const now = new Date().toISOString();

  // 分离已缓存和未缓存的 chunk
  const { hashChunkText } = await import("./normalizers");
  const uncachedChunks: KnowledgeChunk[] = [];
  const uncachedHashes: string[] = [];

  for (const chunk of chunks) {
    const hash = await hashChunkText(chunk.text);
    const cached = embeddingCache.get(hash);
    if (cached) {
      vectors.push({ chunkId: chunk.id, vector: cached, modelId, createdAt: now });
    } else {
      uncachedChunks.push(chunk);
      uncachedHashes.push(hash);
    }
  }

  if (uncachedChunks.length > 0) {
    log(`Embedding: ${vectors.length} cached, ${uncachedChunks.length} to compute`);
  }

  for (let i = 0; i < uncachedChunks.length; i += batchSize) {
    const batch = uncachedChunks.slice(i, i + batchSize);
    const batchHashes = uncachedHashes.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);
    const embeddings = await embedTexts(texts, config);

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]!;
      const embedding = embeddings[j]!;
      const hash = batchHashes[j]!;
      vectors.push({
        chunkId: chunk.id,
        vector: embedding,
        modelId,
        createdAt: now,
      });
      embeddingCache.set(hash, embedding); // 缓存
    }

    onProgress?.(Math.min(i + batchSize, uncachedChunks.length), uncachedChunks.length);
  }

  log(`Embedded ${vectors.length} chunks with model=${modelId}`);
  return vectors;
}

// ── 余弦相似度 ────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 知识库向量化引擎 — 本地 Transformers.js + 远程 API
 */
import type { KnowledgeChunk, KnowledgeVector, EmbedProviderType } from "@shared/types/knowledge";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeEmbedder");

// ── 类型 ──────────────────────────────────────────────

export interface EmbedResult {
  vector: number[];
  modelId: string;
}

export interface EmbedderConfig {
  type: EmbedProviderType;
  /** 远程 embedding API 的基础 URL */
  remoteBaseUrl?: string;
  /** 远程 embedding API 的 API Key */
  remoteApiKey?: string;
  /** 远程 embedding 模型 ID */
  remoteModelId?: string;
}

// ── 本地 Embedder（Transformers.js + BGE） ─────────────

let localPipeline: unknown = null;
let localModelId = "";

const DEFAULT_LOCAL_MODEL = "Xenova/bge-large-zh-v1.5";

async function getLocalPipeline(modelId: string = DEFAULT_LOCAL_MODEL) {
  if (localPipeline && localModelId === modelId) {
    return localPipeline;
  }

  log(`Loading local embedding model: ${modelId}`);
  const { pipeline } = await import("@huggingface/transformers");
  localPipeline = await pipeline("feature-extraction", modelId, {
    dtype: "fp32",
    device: "cpu",
  });
  localModelId = modelId;
  log(`Local model loaded: ${modelId}`);
  return localPipeline;
}

async function embedLocal(texts: string[]): Promise<number[][]> {
  const pipe = (await getLocalPipeline()) as (
    text: string,
    opts: { pooling: string; normalize: boolean }
  ) => Promise<{ data: Float32Array }>;

  const results: number[][] = [];
  for (const text of texts) {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data));
  }
  return results;
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

  log(`Embedding ${texts.length} texts (type=${config.type})`);

  if (config.type === "local") {
    return embedLocal(texts);
  } else {
    return embedRemote(texts, config);
  }
}

export async function embedSingle(
  text: string,
  config: EmbedderConfig
): Promise<number[]> {
  const results = await embedTexts([text], config);
  return results[0];
}

// ── 批量向量化 chunk ──────────────────────────────────

export async function embedChunks(
  chunks: KnowledgeChunk[],
  config: EmbedderConfig,
  batchSize: number = 10,
  onProgress?: (done: number, total: number) => void
): Promise<KnowledgeVector[]> {
  const modelId =
    config.type === "local"
      ? DEFAULT_LOCAL_MODEL
      : config.remoteModelId ?? "text-embedding-3-small";

  const vectors: KnowledgeVector[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);
    const embeddings = await embedTexts(texts, config);

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        chunkId: batch[j].id,
        vector: embeddings[j],
        modelId,
        createdAt: now,
      });
    }

    onProgress?.(Math.min(i + batchSize, chunks.length), chunks.length);
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
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

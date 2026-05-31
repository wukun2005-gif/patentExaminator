/**
 * 知识库检索器 — 将用户 query 向量化后检索相关 chunk
 */
import type { KnowledgeSearchResult, KnowledgeConfig } from "@shared/types/knowledge";
import type { EmbedderConfig } from "./embedder";
import { embedSingle } from "./embedder";
import { searchKnowledge } from "./vectorStore";
import { getKnowledgeStats } from "./knowledgeRepo";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeRetriever");

export interface RetrieveOptions {
  query: string;
  topK?: number;
  scoreThreshold?: number;
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

  log(`Retrieving for query: "${query.slice(0, 50)}..." (topK=${topK})`);

  // 将 query 向量化
  const queryVector = await embedSingle(query, embedConfig);

  // 检索
  const results = await searchKnowledge(queryVector, topK, scoreThreshold);

  log(`Retrieved ${results.length} chunks (scores: ${results.map((r) => r.score.toFixed(3)).join(", ")})`);

  return results;
}

/**
 * 将检索结果格式化为 Prompt 注入文本
 */
export function formatRetrievedChunks(results: KnowledgeSearchResult[]): string {
  if (results.length === 0) return "";

  const parts = [
    `## 参考法规（由知识库检索，仅供参考）`,
    `以下段落与当前分析内容相关，请在回答时参考但不仅限于此：`,
    ``,
  ];

  for (const result of results) {
    const { chunk, score } = result;
    const { metadata } = chunk;
    const sourceLabel = metadata.sectionId
      ? `${metadata.fileName} ${metadata.sectionId}`
      : metadata.articleId
        ? `${metadata.fileName} ${metadata.articleId}`
        : metadata.sheetName
          ? `${metadata.fileName} - ${metadata.sheetName} 行${metadata.rowIndex}`
          : metadata.fileName;

    parts.push(`> 【来源：${sourceLabel} · 相似度: ${score.toFixed(2)}】`);

    // 表格类型保留格式
    if (metadata.mediaType === "table") {
      const lines = chunk.text.split(" | ");
      for (const line of lines) {
        parts.push(`> ${line}`);
      }
    } else {
      for (const line of chunk.text.split("\n")) {
        parts.push(`> ${line}`);
      }
    }
    parts.push(``);
  }

  return parts.join("\n");
}

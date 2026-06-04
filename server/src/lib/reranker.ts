/**
 * 服务端重排序器 — 使用多信号评分对检索结果重新排序
 * 从 client/src/lib/knowledge/reranker.ts 迁移到服务端
 *
 * cr-2: 优先使用 Cross-Encoder 模型（BAAI/bge-reranker-v2-m3）精排，
 * 模型不可用时降级为本地启发式算法。
 * 5 个信号加权：语义相似度、关键词匹配、文档类型、法条引用、chunk 深度
 */

import { logger } from "./logger.js";

export interface RerankConfig {
  semanticWeight: number;
  keywordWeight: number;
  categoryWeight: number;
  articleRefWeight: number;
  depthWeight: number;
}

const DEFAULT_CONFIG: RerankConfig = {
  semanticWeight: 0.4,
  keywordWeight: 0.25,
  categoryWeight: 0.15,
  articleRefWeight: 0.15,
  depthWeight: 0.05,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  "法律": 1.0,
  "行政法规": 0.9,
  "司法解释": 0.85,
  "审查指南": 0.95,
  "案例": 0.7,
  "其他": 0.5,
};

interface RerankInput {
  chunkId: string;
  text: string;
  metadata: Record<string, unknown>;
  score: number;
}

interface RerankOutput {
  chunkId: string;
  score: number;
}

/** 对检索结果进行本地重排序 */
export function localRerank(
  results: RerankInput[],
  query: string,
  config: RerankConfig = DEFAULT_CONFIG
): RerankOutput[] {
  logger.info(`[Rerank] localRerank 开始: ${results.length} 候选, query="${query.slice(0, 40)}..."`);
  if (results.length <= 1) {
    logger.info(`[Rerank] 候选数 ≤ 1，跳过重排`);
    return results.map((r) => ({ chunkId: r.chunkId, score: r.score }));
  }

  const queryTerms = extractTerms(query);

  const scored = results.map((result) => {
    const { chunkId, text, metadata, score: semanticScore } = result;

    // 1. 原始相似度分数
    const s1 = semanticScore;

    // 2. 关键词匹配度
    const chunkTerms = extractTerms(text);
    const matchedTerms = queryTerms.filter((t) => chunkTerms.includes(t));
    const s2 = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0;

    // 3. 文档类型权重
    const category = (metadata.documentCategory as string) ?? "其他";
    const s3 = CATEGORY_WEIGHTS[category] ?? 0.5;

    // 4. 法条引用匹配度
    const articleRefs = (metadata.articleRefs as string[]) ?? [];
    const matchedRefs = articleRefs.filter((ref) =>
      queryTerms.some((t) => ref.includes(t) || t.includes(ref))
    );
    const s4 = articleRefs.length > 0 ? matchedRefs.length / articleRefs.length : 0;

    // 5. 深度权重（depth 0 = 最权威）
    const depth = (metadata.depth as number) ?? 2;
    const s5 = 1 - Math.min(depth / 3, 1);

    // 综合评分
    const finalScore =
      s1 * config.semanticWeight +
      s2 * config.keywordWeight +
      s3 * config.categoryWeight +
      s4 * config.articleRefWeight +
      s5 * config.depthWeight;

    return { chunkId, score: finalScore };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  logger.info(`[Rerank] localRerank 完成: ${sorted.length} 结果, top score=${sorted[0]?.score?.toFixed(4) ?? "N/A"}`);
  return sorted;
}

/** 提取文本中的关键词（去停用词） */
function extractTerms(text: string): string[] {
  const stopWords = new Set([
    "的", "了", "是", "在", "和", "有", "不", "这", "我", "他", "她", "它",
    "们", "那", "被", "从", "到", "也", "就", "都", "而", "及", "与", "或",
    "但", "如", "所", "之", "等", "将", "已", "可", "对", "于", "其", "上",
    "下", "中", "为", "以", "因", "并", "地", "要", "会", "能", "来", "去",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "to", "of", "in", "for", "on", "with",
    "at", "by", "from", "as", "into", "through", "during", "before", "after",
  ]);

  const tokens: string[] = [];
  const chineseChars = text.match(/[一-鿿]{2,}/g) ?? [];
  const englishWords = text.match(/[a-zA-Z]{3,}/g) ?? [];
  tokens.push(...chineseChars, ...englishWords.map((w) => w.toLowerCase()));

  return [...new Set(tokens.filter((t) => !stopWords.has(t) && t.length >= 2))];
}

// ── Cross-Encoder 重排序（cr-2） ──────────────────────────────

// 模型缓存（单例）
let crossEncoderModel: unknown = null;
let crossEncoderLoading = false;
let crossEncoderFailed = false;

const RERANKER_MODEL = "Xenova/bge-reranker-v2-m3";

/** 获取 Cross-Encoder 模型（懒加载，失败后不再重试） */
async function getCrossEncoder(): Promise<unknown> {
  if (crossEncoderFailed) return null;
  if (crossEncoderModel) return crossEncoderModel;
  if (crossEncoderLoading) {
    // 等待加载完成
    while (crossEncoderLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return crossEncoderModel;
  }

  crossEncoderLoading = true;
  try {
    const { pipeline } = await import("@xenova/transformers");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crossEncoderModel = await (pipeline as any)("text-classification", RERANKER_MODEL, {
      quantized: true,
    });
    logger.info(`Cross-encoder reranker loaded: ${RERANKER_MODEL}`);
    return crossEncoderModel;
  } catch (err) {
    logger.warn(`Failed to load cross-encoder reranker: ${err}`);
    crossEncoderFailed = true;
    return null;
  } finally {
    crossEncoderLoading = false;
  }
}

interface CrossEncoderInput {
  chunkId: string;
  text: string;
  metadata: Record<string, unknown>;
  score: number;
}

interface CrossEncoderOutput {
  chunkId: string;
  score: number;
}

/** Cross-Encoder 精排：对 (query, chunk) pair 逐一评分 */
export async function crossEncoderRerank(
  results: CrossEncoderInput[],
  query: string
): Promise<CrossEncoderOutput[]> {
  logger.info(`[Rerank] crossEncoderRerank 开始: ${results.length} 候选`);
  const model = await getCrossEncoder();
  if (!model) {
    logger.info("[Rerank] Cross-encoder 不可用，降级到 localRerank");
    return localRerank(results, query);
  }

  try {
    // 构造 (query, chunk) pairs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const classifier = model as any;
    const scored: CrossEncoderOutput[] = [];

    for (const result of results) {
      // bge-reranker 输入格式: "query [SEP] chunk"
      const input = `${query} [SEP] ${result.text.slice(0, 512)}`;
      const output = await classifier(input, { topk: 1 });
      // 输出格式: [{ label: string, score: number }]
      const relevanceScore = output?.[0]?.score ?? 0;
      scored.push({ chunkId: result.chunkId, score: relevanceScore });
    }

    const sorted = scored.sort((a, b) => b.score - a.score);
    logger.info(`[Rerank] crossEncoderRerank 完成: ${sorted.length} 结果, top score=${sorted[0]?.score?.toFixed(4) ?? "N/A"}`);
    return sorted;
  } catch (err) {
    logger.warn(`Cross-encoder inference failed, falling back to local rerank: ${err}`);
    return localRerank(results, query);
  }
}

/**
 * 服务端混合检索 — BM25 + 向量相似度，RRF 融合排序
 * 从 client/src/lib/knowledge/hybridSearch.ts + bm25Search.ts 迁移
 *
 * v0.2.x: 使用 jieba 分词替换 bigram，提升中文分词质量
 */
import MiniSearch from "minisearch";
import { getAllChunks } from "./knowledgeDb.js";
import { logger } from "./logger.js";

const RRF_K = 60; // RRF 常数

// 模块加载时初始化 jieba（异步，不阻塞模块导出）
ensureJieba().catch((err) => { logger.warn("[hybridSearch] jieba init failed, falling back to bigram:", err); });

// ── jieba 分词 ─────────────────────────────────────────

// 法律术语自定义词典
const LEGAL_DICTIONARY = [
  "专利法实施细则", "审查指南", "复审请求", "创造性三步法",
  "区别技术特征", "权利要求书", "说明书", "新颖性", "创造性",
  "实用性", "充分公开", "修改超范围", "单一性", "先申请原则",
  "优先权", "不丧失新颖性", "宽限期", "抵触申请", "现有技术",
  "技术启示", "显而易见", "技术方案", "技术特征", "有益效果",
  "背景技术", "实施方式", "附图", "摘要", "独立权利要求",
  "从属权利要求", "复审委员会", "专利代理人", "专利权人",
  "申请人", "审查员", "驳回理由", "意见陈述书", "复审决定",
];

let jiebaModule: typeof import("jieba-wasm") | null = null;
let jiebaReady = false;

/** 初始化 jieba 并添加自定义词典 */
async function ensureJieba(): Promise<void> {
  if (jiebaReady) return;
  try {
    jiebaModule = await import("jieba-wasm");
    for (const word of LEGAL_DICTIONARY) {
      jiebaModule.add_word(word);
    }
    jiebaReady = true;
    logger.info(`[Jieba] 初始化完成，自定义词典 ${LEGAL_DICTIONARY.length} 词`);
  } catch (err) {
    logger.warn(`[Jieba] 初始化失败，降级到 bigram: ${err}`);
  }
}

/** jieba 中文分词 */
function tokenizeWithJieba(text: string): string[] {
  if (!jiebaModule) return [];
  const words = jiebaModule.cut(text, true);
  return words
    .filter((w) => w.trim().length > 0)
    .map((w) => w.toLowerCase());
}

/** 中文分词：jieba 优先，降级到 bigram */
function tokenizeChinese(text: string): string[] {
  // 尝试 jieba 分词
  if (jiebaReady && jiebaModule) {
    const jiebaTokens = tokenizeWithJieba(text);
    if (jiebaTokens.length > 0) {
      return [...new Set(jiebaTokens)];
    }
  }

  // 降级：bigram + 单字 + 英文单词
  const tokens: string[] = [];
  const cleaned = text.replace(/[^一-鿿\w]/g, " ");
  const segments = cleaned.split(/\s+/).filter(Boolean);

  for (const seg of segments) {
    if (/^[\w\d]+$/.test(seg)) {
      tokens.push(seg.toLowerCase());
      continue;
    }
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]!);
      if (i + 1 < seg.length) {
        tokens.push(seg.slice(i, i + 2));
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

/** BM25 关键词检索（含长度归一化） */
function searchBM25(query: string, topK: number = 10): Array<{ id: string; score: number }> {
  const index = ensureBM25Index();
  const rawResults = index.search(query);

  // 长度归一化：短 chunk 得分 boost（长 chunk 天然得分高，短 chunk 被压制）
  const chunks = getAllChunks();
  const chunkLengthMap = new Map(chunks.map(c => [c.id, c.text.length]));

  const normalized = rawResults.map((r) => {
    const len = chunkLengthMap.get(String(r.id)) ?? 500;
    // 对数长度归一化：500 字为基准，越短 boost 越大
    const lenNorm = 1 / (1 + Math.log(Math.max(len, 1) / 500));
    return { id: String(r.id), score: r.score * lenNorm };
  });

  const results = normalized.sort((a, b) => b.score - a.score).slice(0, topK);

  if (results.length > 0) {
    const top = results[0];
    logger.info(`[BM25] query="${query.slice(0, 40)}..." → ${results.length} hits, top score=${top?.score?.toFixed(4) ?? "N/A"} (length-normalized)`);
  } else {
    logger.info(`[BM25] query="${query.slice(0, 40)}..." → 0 hits`);
  }
  return results;
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

// ── MMR 多样性排序 ──────────────────────────────────────

/**
 * MMR (Maximal Marginal Relevance) 多样性排序
 * 避免返回过于相似的结果，增加多样性
 *
 * @param candidates - 候选结果（已按分数排序）
 * @param chunkTexts - chunk 文本映射（用于计算相似度）
 * @param lambda - 相关性 vs 多样性权重（0=纯多样性, 1=纯相关性）
 * @param topK - 返回数量
 */
export function mmrDiversityRank(
  candidates: HybridSearchResult[],
  chunkTexts: Map<string, string>,
  lambda: number = 0.7,
  topK: number = 5
): HybridSearchResult[] {
  if (candidates.length <= topK) return candidates;

  const selected: HybridSearchResult[] = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const relevance = candidate.score;

      // 与已选结果的最大相似度
      let maxSimilarity = 0;
      for (const sel of selected) {
        const sim = textSimilarity(
          chunkTexts.get(candidate.chunkId) ?? "",
          chunkTexts.get(sel.chunkId) ?? ""
        );
        maxSimilarity = Math.max(maxSimilarity, sim);
      }

      // MMR 公式：λ * relevance - (1-λ) * maxSimilarity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    const best = remaining.splice(bestIdx, 1)[0];
    if (best) selected.push(best);
  }

  return selected;
}

/** 简单文本相似度（Jaccard 系数） */
function textSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const tokens1 = new Set(text1.match(/[一-鿿]{2,}|[a-zA-Z]{3,}/g) ?? []);
  const tokens2 = new Set(text2.match(/[一-鿿]{2,}|[a-zA-Z]{3,}/g) ?? []);

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** 清除 BM25 索引（知识库更新后调用） */
export function invalidateBM25Index(): void {
  miniSearch = null;
  _indexedSourceIds.clear();
}

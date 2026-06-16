/**
 * 离线评估指标计算模块（nf5）
 *
 * 实现 golden-set-spec.md §5 定义的全部指标：
 * - 检索质量：NDCG@K（chunk 级）、Recall@K、KB Hit Rate（实时 LLM judge 评估）
 * - 生成质量：Faithfulness、Answer Correctness、Fact Coverage（multi-judge）
 * - 确定性指标：Article Accuracy、Source Routing/Attribution Accuracy
 * - 跨源特有：Conflict Resolution、Refusal Accuracy
 *
 * 所有函数为纯计算或 async LLM 调用，不依赖 DB。
 */
import {
  multiJudgeContinuous,
  extractJsonFromLLM,
  type MultiJudgeResult,
} from "./multiJudge.js";
import { logger } from "./logger.js";
import type { SourceType, ExpectedSource } from "../../../shared/src/types/metrics.js";

// ── 检索质量指标（chunk 级，实时 LLM judge 评估） ──

/**
 * 批量评估多个题目的检索 chunk 相关性（0-3）
 *
 * 分批处理：每批最多 batchQuestions 个题目，避免 prompt 过大导致 judge 超时。
 * 每批内 2 个 judge 并行评估。
 */
export async function computeRetrievalMetricsBatch(
  questions: Array<{
    questionId: string;
    query: string;
    chunks: Array<{ id: string; text?: string }>;
  }>,
  judgeApiKeys: Record<string, string>,
  k: number = 10,
  batchQuestions: number = 5,
): Promise<Map<string, { ndcg: number; recall: number; grades: Array<{ chunkId: string; grade: number }> }>> {
  const result = new Map<string, { ndcg: number; recall: number; grades: Array<{ chunkId: string; grade: number }> }>();

  if (questions.length === 0) return result;

  // 分批处理，避免 prompt 过大导致超时
  for (let batchStart = 0; batchStart < questions.length; batchStart += batchQuestions) {
    const batch = questions.slice(batchStart, batchStart + batchQuestions);
    const batchResult = await computeRetrievalMetricsSingleBatch(batch, judgeApiKeys, k);
    batchResult.forEach((metrics, id) => {
      result.set(id, metrics);
    });
  }

  return result;
}

/**
 * 单批检索指标评估（内部函数）
 */
async function computeRetrievalMetricsSingleBatch(
  questions: Array<{
    questionId: string;
    query: string;
    chunks: Array<{ id: string; text?: string }>;
  }>,
  judgeApiKeys: Record<string, string>,
  k: number,
): Promise<Map<string, { ndcg: number; recall: number; grades: Array<{ chunkId: string; grade: number }> }>> {
  const result = new Map<string, { ndcg: number; recall: number; grades: Array<{ chunkId: string; grade: number }> }>();

  // 构建合并 prompt：一次评估本批次题目的所有 chunk
  const allChunksParts: string[] = [];
  const chunkIndexMap: Array<{ questionId: string; chunkId: string; index: number }> = [];

  for (const q of questions) {
    const topK = q.chunks.slice(0, k);
    if (topK.length === 0) continue;

    allChunksParts.push(`## 问题：${q.query}`);
    for (const chunk of topK) {
      const text = chunk.text?.slice(0, 300) || "";
      const globalIndex = chunkIndexMap.length;
      allChunksParts.push(`### Chunk ${globalIndex + 1} (ID: ${chunk.id}, Question: ${q.questionId})\n${text}`);
      chunkIndexMap.push({ questionId: q.questionId, chunkId: chunk.id, index: globalIndex });
    }
  }

  if (chunkIndexMap.length === 0) return result;

  const system = "你是专利复审领域的评估专家。请判断每个文本片段与问题的相关程度。只输出 JSON，不要输出其他内容。";
  const user = `${allChunksParts.join("\n\n")}

请对每个 chunk 判断相关程度，输出 JSON 数组：
{"grades": [{"chunkId": "chunk_id", "grade": 0|1|2|3, "rationale": "打分理由"}, ...]}

评分标准：
- 0分：完全不相关，内容与问题无关
- 1分：边际相关，提及了相关主题但不直接回答问题
- 2分：部分相关，包含回答问题所需的部分信息
- 3分：高度相关，直接且完整地回答了问题

必须为每个 chunk 输出一个 grade，数量必须等于 ${chunkIndexMap.length}。`;

  // 2 个 judge 并行评估
  const { callMultiJudge } = await import("./multiJudge.js");
  const outputs = await callMultiJudge(
    { system, user },
    judgeApiKeys,
    { temperature: 0, maxTokens: 4000 },
  );

  // 解析每个 judge 的结果
  const judgeGrades: Array<Array<{ chunkId: string; grade: number }>> = [];

  for (const output of outputs) {
    if (!output.success || !output.rawText) continue;

    try {
      const match = output.rawText.match(/\{[^}]*"grades"\s*:\s*\[([\s\S]*?)\][^}]*\}/);
      if (match) {
        const gradesStr = match[1]!;
        const grades = JSON.parse(`[${gradesStr}]`);
        if (Array.isArray(grades) && grades.length === chunkIndexMap.length) {
          judgeGrades.push(grades.map((g: { chunkId: string; grade: number }) => ({
            chunkId: g.chunkId,
            grade: Math.max(0, Math.min(3, g.grade || 0)),
          })));
        }
      }
    } catch (e) {
      logger.warn(`[EvalMetrics] Failed to parse judge output: ${e}`);
    }
  }

  // 聚合结果：多个 judge 取平均
  const aggregatedGrades: Array<{ chunkId: string; grade: number }> = [];

  if (judgeGrades.length > 0) {
    for (let i = 0; i < chunkIndexMap.length; i++) {
      const gradesForChunk = judgeGrades.map(jg => jg[i]?.grade ?? 0);
      const avgGrade = gradesForChunk.reduce((a, b) => a + b, 0) / gradesForChunk.length;
      aggregatedGrades.push({ chunkId: chunkIndexMap[i]!.chunkId, grade: Math.round(avgGrade) });
    }
  } else {
    logger.warn(`[EvalMetrics] Batch chunk grading failed (${questions.length} questions, ${chunkIndexMap.length} chunks), all graded 0`);
    for (const item of chunkIndexMap) {
      aggregatedGrades.push({ chunkId: item.chunkId, grade: 0 });
    }
  }

  // 按 questionId 分组，计算每个题目的 NDCG 和 Recall
  for (const q of questions) {
    const topK = q.chunks.slice(0, k);
    const questionGrades = aggregatedGrades
      .filter(g => topK.some(c => c.id === g.chunkId))
      .slice(0, k);

    // 计算 NDCG
    let dcg = 0;
    for (let i = 0; i < questionGrades.length; i++) {
      dcg += (Math.pow(2, questionGrades[i]!.grade) - 1) / Math.log2(i + 2);
    }

    let idcg = 0;
    for (let i = 0; i < Math.min(k, questionGrades.length); i++) {
      idcg += (Math.pow(2, 3) - 1) / Math.log2(i + 2);
    }

    const ndcg = idcg > 0 ? Math.min(1, dcg / idcg) : 0;

    // 计算 Recall
    const relevantInTopK = questionGrades.filter(g => g.grade >= 2).length;
    const recall = questionGrades.length > 0 ? relevantInTopK / questionGrades.length : 0;

    result.set(q.questionId, { ndcg, recall, grades: questionGrades });
  }

  return result;
}

/**
 * 单题检索指标评估（向后兼容）
 */
export async function computeRetrievalMetricsRealtime(
  retrievedChunks: Array<{ id: string; text?: string }>,
  query: string,
  judgeApiKeys: Record<string, string>,
  k: number = 10,
): Promise<{ ndcg: number; recall: number; grades: Array<{ chunkId: string; grade: number }> }> {
  const results = await computeRetrievalMetricsBatch(
    [{ questionId: "single", query, chunks: retrievedChunks }],
    judgeApiKeys,
    k,
  );
  return results.get("single") ?? { ndcg: 0, recall: 0, grades: [] };
}

// ── 生成质量指标（multi-judge） ──

/**
 * Faithfulness — 答案是否忠实于检索上下文（reference-free, multi-judge）
 *
 * 规范 §5.2: 3 个 judge 各自拆 claims → 检查支持度 → 取 average
 */
export async function computeFaithfulnessMultiJudge(
  answer: string,
  context: string,
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<MultiJudgeResult<number>> {
  if (!answer || !context) {
    // 空答案无法验证忠实度，返回 0 而非 1
    return { aggregated: 0, individualResults: [], judgeCount: 0 };
  }

  const system = [
    "你是专利审查 AI 助手的事实核查员。请判断以下回答是否忠实于提供的参考文档。",
    "",
    "评分标准（0.0 - 1.0）：",
    "- 1.0: 回答完全忠实于文档，所有声明都有文档支撑",
    "- 0.7-0.9: 大部分忠实，个别声明无法验证",
    "- 0.4-0.6: 部分忠实，存在一些无支撑声明",
    "- 0.1-0.3: 大部分不忠实，多数声明无文档支撑",
    "- 0.0: 完全不忠实，回答与文档无关或全是幻觉",
    "",
    "输出 JSON：{ \"score\": 0.0-1.0, \"reasoning\": \"评分理由\" }",
    "严格按 JSON 格式输出，不要输出 markdown 代码块。",
  ].join("\n");

  const user = [
    "## 参考文档",
    context.slice(0, 8000),
    "",
    "## AI 生成的回答",
    answer.slice(0, 4000),
    "",
    "请评估回答的忠实度。",
  ].join("\n");

  return multiJudgeContinuous(
    { system, user },
    judgeApiKeys,
    parseScoreFromJson,
    { defaultValue: 0.5, ...judgeOpts }
  );
}

/**
 * Answer Correctness — 答案与参考答案的匹配度（multi-judge）
 *
 * 规范 §5.2: 3 个 judge 各自对比 expectedAnswer → 取 average
 */
export async function computeAnswerCorrectness(
  answer: string,
  expectedAnswer: string,
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<MultiJudgeResult<number>> {
  if (!answer || !expectedAnswer) {
    return { aggregated: 0, individualResults: [], judgeCount: 0 };
  }

  const system = [
    "你是专利复审评估专家。给定一个参考答案和一个实际答案，请判断实际答案的正确性。",
    "",
    "评分标准（0.0 - 1.0）：",
    "- 1.0: 完全正确，覆盖参考答案所有要点",
    "- 0.7-0.9: 大部分正确，遗漏个别要点",
    "- 0.4-0.6: 部分正确，有明显遗漏或错误",
    "- 0.1-0.3: 大部分错误",
    "- 0.0: 完全错误或无关",
    "",
    "输出 JSON：{ \"score\": 0.0-1.0, \"reasoning\": \"评分理由\" }",
    "严格按 JSON 格式输出，不要输出 markdown 代码块。",
  ].join("\n");

  const user = [
    "## 参考答案",
    expectedAnswer,
    "",
    "## 实际答案",
    answer.slice(0, 4000),
    "",
    "请评估实际答案的正确性。",
  ].join("\n");

  return multiJudgeContinuous(
    { system, user },
    judgeApiKeys,
    parseScoreFromJson,
    { defaultValue: 0, ...judgeOpts }
  );
}

/**
 * Fact Coverage — 必须包含的关键事实点是否被覆盖（multi-judge）
 *
 * 规范 §5.2: 3 个 judge 各自检查事实点覆盖 → 取 average
 */
export async function computeFactCoverage(
  answer: string,
  mustIncludeFacts: string[],
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<MultiJudgeResult<number>> {
  if (!answer) {
    return { aggregated: 0, individualResults: [], judgeCount: 0 };
  }
  if (mustIncludeFacts.length === 0) {
    return { aggregated: 1, individualResults: [], judgeCount: 0 };
  }

  const factsList = mustIncludeFacts.map((f, i) => `${i + 1}. ${f}`).join("\n");

  const system = [
    "你是专利复审评估专家。给定一个答案和一组必须包含的关键事实点，请检查答案是否覆盖了每个事实点。",
    "",
    "对每个事实点判断：答案是否包含了该事实（语义匹配，不要求原文完全一致）。",
    "",
    "输出 JSON：",
    "{",
    '  "coverage": [',
    '    { "fact": "事实点原文", "covered": true/false, "evidence": "答案中的相关文本（如有）" }',
    "  ],",
    '  "score": 0.0-1.0',
    "}",
    "score = 被覆盖的事实点数 / 总事实点数",
    "严格按 JSON 格式输出，不要输出 markdown 代码块。",
  ].join("\n");

  const user = [
    "## 必须包含的关键事实点",
    factsList,
    "",
    "## 答案",
    answer.slice(0, 4000),
    "",
    "请检查答案是否覆盖了每个事实点。",
  ].join("\n");

  return multiJudgeContinuous(
    { system, user },
    judgeApiKeys,
    (rawText) => {
      // 优先从 JSON 中提取 score 字段
      const json = extractJsonFromLLM(rawText);
      if (json && typeof json.score === "number") return json.score;
      // fallback: 从 coverage 数组计算
      if (json && Array.isArray(json.coverage)) {
        const covered = json.coverage.filter((c: { covered?: boolean }) => c.covered).length;
        return json.coverage.length > 0 ? covered / json.coverage.length : 0;
      }
      return null;
    },
    { defaultValue: 0, ...judgeOpts }
  );
}

// ── 确定性指标（不需要 judge） ──

/**
 * 中文数字 → 阿拉伯数字映射
 */
const CN_NUM_MAP: Record<string, string> = {
  "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
  "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
  "十一": "11", "十二": "12", "十三": "13", "十四": "14", "十五": "15",
  "十六": "16", "十七": "17", "十八": "18", "十九": "19", "二十": "20",
  "二十一": "21", "二十二": "22", "二十三": "23", "二十四": "24", "二十五": "25",
  "二十六": "26", "二十七": "27", "二十八": "28", "二十九": "29",
};

/**
 * 专利法条文 ↔ 审查指南章节 交叉引用表
 *
 * key: 专利法条文（如"第二十二条第二款"）
 * value: 对应的审查指南章节关键词列表
 *
 * 来源：《专利审查指南》与《专利法》对照表
 */
const LAW_TO_GUIDE_KEYWORDS: Record<string, string[]> = {
  // 第二十二条：授予专利权的发明和实用新型应当具备新颖性、创造性和实用性
  "第二十二条": ["新颖性", "创造性", "实用性", "三章", "第四章", "第五章"],
  "第二十二条第一款": ["新颖性", "创造性", "实用性"],
  "第二十二条第二款": ["新颖性", "第三章3.1", "单独对比", "现有技术"],
  "第二十二条第三款": ["创造性", "第四章", "非显而易见", "突出的实质性特点"],
  "第二十三条": ["外观设计", "新颖性", "区别"],
  "第二十四条": ["新颖性宽限", "不丧失新颖性"],
  "第二十五条": ["不授予专利权"],
  "第二十六条": ["说明书", "权利要求书", "充分公开"],
  "第二十六条第三款": ["充分公开", "清楚", "完整", "实现"],
  "第二十六条第四款": ["权利要求", "清楚", "简要", "支持"],
  "第三十三条": ["修改", "超范围"],
  "第三十八条": ["驳回"],
  "第四十一条": ["复审"],
  "第六十四条": ["保护范围", "权利要求"],
};

/**
 * 从法条/章节引用中提取编号（数字部分）
 * 如 "第二十二条第二款" → "22-2", "第6.1节" → "6.1"
 */
function extractArticleNumber(ref: string): string {
  // 匹配 "第N条" 或 "第N条第M款" 格式
  const lawMatch = ref.match(/第([一二三四五六七八九十百]+)条(?:第([一二三四五六七八九十百]+)款)?/);
  if (lawMatch) {
    const article = CN_NUM_MAP[lawMatch[1]!] ?? lawMatch[1]!;
    const clause = lawMatch[2] ? `-${CN_NUM_MAP[lawMatch[2]!] ?? lawMatch[2]}` : "";
    return article + clause;
  }
  // 匹配 "第N.M节" 或 "N.M" 格式（审查指南）
  const guideMatch = ref.match(/(\d+(?:\.\d+)?)/);
  if (guideMatch) return guideMatch[1]!;
  return "";
}

/**
 * 检查法条引用与答案中的引用是否匹配（支持交叉引用）
 *
 * 匹配策略（按优先级）：
 * 1. 直接字符串包含
 * 2. 编号格式统一后匹配（"第九条" ↔ "第9条"）
 * 3. 同一法条的不同款匹配（答案引用法条，expected 是其中一款）
 * 4. 交叉引用：专利法条文 ↔ 审查指南章节（通过共享关键词）
 */
export function computeArticleAccuracy(
  answer: string,
  expectedArticles: string[]
): number {
  if (!answer) return 0;
  if (expectedArticles.length === 0) return 1;

  const normAnswer = answer.toLowerCase();
  // 提取答案中所有法条/章节引用
  const answerRefs = extractAllArticleRefs(answer);
  let matched = 0;

  for (const article of expectedArticles) {
    const normArticle = article.toLowerCase().trim();
    if (!normArticle) continue;

    // 策略 1：直接字符串包含
    if (normAnswer.includes(normArticle)) {
      matched++;
      continue;
    }

    // 策略 2：编号格式统一后匹配（"第二十二条第二款" ↔ "第22条第2款"）
    const normalized = normalizeArticleRef(normArticle);
    if (normalized && normAnswer.includes(normalized)) {
      matched++;
      continue;
    }

    // 策略 3：提取编号比较（"第二十二条第二款" → "22-2"）
    const expectedNum = extractArticleNumber(article);
    if (expectedNum) {
      const answerNums = answerRefs.map(extractArticleNumber).filter(Boolean);
      if (answerNums.some((n) => n === expectedNum || expectedNum.startsWith(n) || n.startsWith(expectedNum))) {
        matched++;
        continue;
      }
    }

    // 策略 4：交叉引用 — 专利法条文 ↔ 审查指南章节
    // 如果 expected 是法条，检查答案是否引用了对应的审查指南章节
    if (checkCrossReference(article, answerRefs, normAnswer)) {
      matched++;
      continue;
    }
  }

  return matched / expectedArticles.length;
}

/**
 * 从文本中提取所有法条/章节引用
 * 匹配：第N条、第N条第M款、第N.M节、第N章、第N节 等
 */
function extractAllArticleRefs(text: string): string[] {
  const refs: string[] = [];
  // 第N条（第M款）
  const lawPattern = /第[一二三四五六七八九十百\d]+条(?:第[一二三四五六七八九十百\d]+款)?/g;
  let match: RegExpExecArray | null;
  while ((match = lawPattern.exec(text)) !== null) {
    refs.push(match[0]);
  }
  // 第N.M节、第N章
  const guidePattern = /第?\d+(?:\.\d+)?(?:节|章|部分)/g;
  while ((match = guidePattern.exec(text)) !== null) {
    refs.push(match[0]);
  }
  // 审查指南特定格式：如 "第二部分第三章3.1节"
  const guideSection = /第[一二三四五六七八九十百]+部分第[一二三四五六七八九十百]+章[\d.]*节?/g;
  while ((match = guideSection.exec(text)) !== null) {
    refs.push(match[0]);
  }
  return refs;
}

/**
 * 将中文法条编号转为阿拉伯数字格式
 * "第二十二条第二款" → "第22条第2款"
 */
function normalizeArticleRef(ref: string): string {
  return ref.replace(/[一二三四五六七八九十百]+/g, (m) => CN_NUM_MAP[m] ?? m);
}

/**
 * 检查交叉引用：expected 法条 vs answer 中的审查指南引用
 *
 * 逻辑：如果 expected 是专利法条文，而 answer 引用了审查指南章节，
 * 通过交叉引用表检查两者是否指向同一法律概念。
 */
function checkCrossReference(
  expectedArticle: string,
  answerRefs: string[],
  normAnswer: string
): boolean {
  // 查找 expected 对应的审查指南关键词
  const expectedNorm = expectedArticle.toLowerCase();
  for (const [law, keywords] of Object.entries(LAW_TO_GUIDE_KEYWORDS)) {
    if (expectedNorm.includes(law.toLowerCase()) || law.toLowerCase().includes(expectedNorm)) {
      // 检查答案中是否有引用审查指南且包含对应关键词
      for (const ref of answerRefs) {
        if (ref.includes("审查指南") || ref.includes("指南") || /\d+\.\d+/.test(ref)) {
          // 答案引用了审查指南，检查是否包含相关关键词
          if (keywords.some((kw) => normAnswer.includes(kw.toLowerCase()))) {
            return true;
          }
        }
      }
      // 也检查答案中是否有同一条法律的其他款（如 expected 是"第二十二条第二款"，
      // 答案只引用了"第二十二条"，也算部分匹配）
      const lawNum = extractArticleNumber(law);
      if (lawNum) {
        for (const ref of answerRefs) {
          const refNum = extractArticleNumber(ref);
          if (refNum && (lawNum.startsWith(refNum) || refNum.startsWith(lawNum))) {
            // 同一条法律，检查关键词
            if (keywords.some((kw) => normAnswer.includes(kw.toLowerCase()))) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

/**
 * Source Routing Accuracy — 路由是否正确
 *
 * 比较 expectedSource vs 实际使用的源
 */
export function computeSourceRoutingAccuracy(
  expectedSource: ExpectedSource,
  actualSources: { kb: boolean; web: boolean }
): number {
  switch (expectedSource) {
    case "kb":
      return actualSources.kb ? 1 : 0;
    case "web":
      return actualSources.web ? 1 : 0;
    case "kb+web":
      return (actualSources.kb && actualSources.web) ? 1 :
        (actualSources.kb || actualSources.web) ? 0.5 : 0;
    case "any":
      return 1; // 任何源都算正确
    default:
      return 0;
  }
}

/**
 * Source Attribution Accuracy — 引用的来源是否真实被使用
 *
 * 检查答案中引用的来源是否实际被检索/使用
 */
export function computeSourceAttributionAccuracy(
  citedSources: string[],
  actualUsedSources: string[]
): number {
  if (citedSources.length === 0) return 1;

  const normUsed = actualUsedSources.map(normalizeDocId);
  let matched = 0;

  for (const cited of citedSources) {
    const normCited = normalizeDocId(cited);
    if (normUsed.some((used) => fuzzyDocMatch(used, normCited))) {
      matched++;
    }
  }

  return matched / citedSources.length;
}

/**
 * Conflict Resolution Rate — 冲突题中正确选择权威源的比例
 *
 * 规范 §5.3: conflict 类型题目，正确行为是优先采用 KB（权威来源）
 */
export function computeConflictResolution(
  sourceType: SourceType,
  expectedSource: ExpectedSource,
  actualSource: "kb" | "web" | "mixed"
): number {
  if (sourceType !== "conflict") return 1; // 非冲突题不评估

  // conflict 题的 expectedSource 应为 "kb"（权威优先）
  if (expectedSource === "kb") {
    return actualSource === "kb" ? 1 : 0;
  }
  return actualSource === "kb" ? 1 : 0.5;
}

/**
 * Refusal Accuracy — no_answer 题中正确拒绝回答的比例（multi-LLM-judge）
 *
 * 规范 §5.3: no_answer 类型题目，系统应回答"无法确定"
 * 使用 multi-judge 而非 pattern matching，避免脆弱的字符串匹配
 */
export async function computeRefusalAccuracy(
  sourceType: SourceType,
  answer: string,
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<MultiJudgeResult<number>> {
  if (sourceType !== "no_answer") {
    return { aggregated: 1, individualResults: [], judgeCount: 0 };
  }

  const system = [
    "你是专利复审评估专家。判断一个回答是否正确地拒绝了无法回答的问题。",
    "",
    "背景：这是一个 golden set 中的 no_answer 类型题目，正确做法是表明无法确定/信息不足。",
    "",
    "评分标准（0.0 - 1.0）：",
    "- 1.0: 明确拒绝回答，表明信息不足或无法确定，且保持简洁",
    "- 0.7: 拒绝回答但内容冗长",
    "- 0.4: 部分拒绝但包含不确定的推测",
    "- 0.1: 没有拒绝，直接给出了不确定的答案",
    "- 0.0: 完全没有拒绝，自信地给出了错误答案",
    "",
    "输出 JSON：{ \"score\": 0.0-1.0, \"reasoning\": \"评分理由\" }",
    "严格按 JSON 格式输出，不要输出 markdown 代码块。",
  ].join("\n");

  const user = [
    "## 待评估的回答",
    answer.slice(0, 4000),
    "",
    "请评估该回答是否正确地拒绝了无法回答的问题。",
  ].join("\n");

  return multiJudgeContinuous(
    { system, user },
    judgeApiKeys,
    parseScoreFromJson,
    { defaultValue: 0, ...judgeOpts }
  );
}

// ── 辅助函数 ──

function parseScoreFromJson(rawText: string): number | null {
  const json = extractJsonFromLLM(rawText);
  if (json && typeof json.score === "number") {
    return Math.max(0, Math.min(1, json.score));
  }
  // 诊断日志：解析失败时输出 rawText 前 200 字符
  const preview = rawText.slice(0, 200).replace(/\n/g, "\\n");
  logger.warn(`[parseScoreFromJson] failed: json=${JSON.stringify(json)?.slice(0, 100)}, rawText(200)=${preview}`);
  return null;
}

/**
 * 字符 bigram Jaccard 相似度 — 纯 CPU，不需 LLM
 * 用于 chunk 内容匹配：不同 chunk ID 但内容高度相似时应视为匹配
 */
export function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // 取前 500 字符足够区分内容，避免长文本性能问题
  const sa = a.slice(0, 500);
  const sb = b.slice(0, 500);
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s[i]! + s[i + 1]!);
    return set;
  };
  const setA = bigrams(sa);
  const setB = bigrams(sb);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Source name 归一化（去扩展名、折叠空白）— 用于 source attribution 匹配 */
function normalizeDocId(docId: string): string {
  return docId
    .toLowerCase()
    .replace(/\.\w{1,5}$/i, "")       // remove file extension
    .replace(/\s+/g, " ")              // collapse whitespace
    .trim();
}

/** Source name fuzzy match — 用于 source attribution 匹配 */
function fuzzyDocMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const tokensA = new Set(a.split(/\s+/).filter((t) => t.length >= 2));
  const tokensB = b.split(/\s+/).filter((t) => t.length >= 2);
  if (tokensB.length === 0) return false;
  const matched = tokensB.filter((t) => tokensA.has(t)).length;
  return matched / tokensB.length > 0.5;
}

// ── 合并指标函数（优化 LLM 调用次数） ──

/**
 * 合并评估 M5/M6/M7 三个语义指标（单次 LLM 调用）
 *
 * 优化：把 Faithfulness + Answer Correctness + Fact Coverage 合并到 1 个 prompt
 * 原来：3 指标 × 2 providers = 6 次/题
 * 优化后：1 prompt × 2 providers = 2 次/题
 */
export async function computeSemanticMetricsCombined(
  answer: string,
  context: string,
  expectedAnswer: string | undefined,
  mustIncludeFacts: string[],
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<{
  faithfulness: MultiJudgeResult<number>;
  answerCorrectness: MultiJudgeResult<number>;
  factCoverage: MultiJudgeResult<number>;
}> {
  // 空答案处理
  if (!answer) {
    const emptyResult = { aggregated: 0, individualResults: [], judgeCount: 0 };
    return { faithfulness: emptyResult, answerCorrectness: emptyResult, factCoverage: emptyResult };
  }

  const system = `你是专利复审评估专家。请一次性评估以下三个维度，输出 JSON。

评估维度：
1. **Faithfulness (0.0-1.0)**：回答是否忠实于参考文档，所有声明都有文档支撑
2. **Answer Correctness (0.0-1.0)**：回答与参考答案的正确性（如有参考答案）
3. **Fact Coverage (0.0-1.0)**：必须包含的关键事实点是否被覆盖（如有事实点）

输出 JSON 格式：
{
  "faithfulness": {"score": 0.0-1.0, "reasoning": "理由"},
  "answerCorrectness": {"score": 0.0-1.0, "reasoning": "理由"},
  "factCoverage": {"score": 0.0-1.0, "reasoning": "理由", "covered_facts": ["事实点1", "事实点2"]}
}

评分标准：
- Faithfulness: 1.0=完全忠实，0.0=严重幻觉
- Answer Correctness: 1.0=完全正确，0.0=完全错误
- Fact Coverage: score = 被覆盖的事实点数 / 总事实点数

严格按 JSON 格式输出，不要输出 markdown 代码块。`;

  // 构建 user prompt
  const userParts = ["## 参考文档", context.slice(0, 6000)];

  if (expectedAnswer) {
    userParts.push("", "## 参考答案", expectedAnswer);
  }

  if (mustIncludeFacts.length > 0) {
    const factsList = mustIncludeFacts.map((f, i) => `${i + 1}. ${f}`).join("\n");
    userParts.push("", "## 必须包含的关键事实点", factsList);
  }

  userParts.push("", "## AI 生成的回答", answer.slice(0, 4000), "", "请一次性评估以上三个维度。");

  const user = userParts.join("\n");

  // 2 个 judge 并行评估
  const result = await multiJudgeContinuous(
    { system, user },
    judgeApiKeys,
    (rawText: string) => {
      try {
        const json = extractJsonFromLLM(rawText);
        if (json && typeof json === "object") {
          // 返回整个 JSON 对象，后续解析各维度分数
          return json as unknown as number;
        }
      } catch {}
      return null;
    },
    { defaultValue: 0, ...judgeOpts }
  );

  // 解析各维度分数
  const parseResult = (json: Record<string, unknown> | null, field: string): number => {
    if (!json) return 0;
    const obj = json[field];
    if (obj && typeof obj === "object" && "score" in obj) {
      return Math.max(0, Math.min(1, (obj as { score: number }).score || 0));
    }
    return 0;
  };

  // 从 judge 结果中提取各维度分数
  const individualResults = result.individualResults.map(r => {
    if (r.success && r.value && typeof r.value === "object") {
      const json = r.value as Record<string, unknown>;
      return {
        providerId: r.providerId,
        value: json, // 保持原始 JSON
        success: true,
      };
    }
    return { providerId: r.providerId, value: null, success: false };
  });

  // 聚合各维度分数
  const faithfulnessScores = individualResults
    .filter(r => r.success && r.value)
    .map(r => parseResult(r.value as Record<string, unknown>, "faithfulness"));
  const acScores = individualResults
    .filter(r => r.success && r.value)
    .map(r => parseResult(r.value as Record<string, unknown>, "answerCorrectness"));
  const fcScores = individualResults
    .filter(r => r.success && r.value)
    .map(r => parseResult(r.value as Record<string, unknown>, "factCoverage"));

  const aggregateScores = (scores: number[]): number => {
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  return {
    faithfulness: {
      aggregated: aggregateScores(faithfulnessScores),
      individualResults: individualResults.map(r => ({
        providerId: r.providerId,
        value: r.success ? parseResult(r.value as Record<string, unknown>, "faithfulness") : 0,
        success: r.success,
      })),
      judgeCount: faithfulnessScores.length,
    },
    answerCorrectness: {
      aggregated: aggregateScores(acScores),
      individualResults: individualResults.map(r => ({
        providerId: r.providerId,
        value: r.success ? parseResult(r.value as Record<string, unknown>, "answerCorrectness") : 0,
        success: r.success,
      })),
      judgeCount: acScores.length,
    },
    factCoverage: {
      aggregated: aggregateScores(fcScores),
      individualResults: individualResults.map(r => ({
        providerId: r.providerId,
        value: r.success ? parseResult(r.value as Record<string, unknown>, "factCoverage") : 0,
        success: r.success,
      })),
      judgeCount: fcScores.length,
    },
  };
}

/**
 * 批量评估多个题目的语义指标（M5/M6/M7）
 *
 * 优化：把多个题目合并到 1 个 prompt，2 个 judge 并行评估。
 * 原来：每题单独调用 → 21 题 × 2 judge = 42 次
 * 优化后：分 3 批（每批 7 题）→ 3 批 × 2 judge = 6 次
 */
export async function computeSemanticMetricsBatch(
  questions: Array<{
    questionId: string;
    answer: string;
    context: string;
    expectedAnswer?: string;
    mustIncludeFacts?: string[];
  }>,
  judgeApiKeys: Record<string, string>,
  judgeOpts?: { modelFallbacks?: Record<string, string[]>; enableModelFallback?: boolean }
): Promise<Map<string, {
  faithfulness: MultiJudgeResult<number>;
  answerCorrectness: MultiJudgeResult<number>;
  factCoverage: MultiJudgeResult<number>;
}>> {
  const result = new Map<string, {
    faithfulness: MultiJudgeResult<number>;
    answerCorrectness: MultiJudgeResult<number>;
    factCoverage: MultiJudgeResult<number>;
  }>();

  if (questions.length === 0) return result;

  // 构建合并 prompt：一次评估多个题目
  const system = `你是专利复审评估专家。请一次性评估多个题目的三个维度，输出 JSON 数组。

评估维度：
1. **Faithfulness (0.0-1.0)**：回答是否忠实于参考文档，所有声明都有文档支撑
2. **Answer Correctness (0.0-1.0)**：回答与参考答案的正确性（如有参考答案）
3. **Fact Coverage (0.0-1.0)**：必须包含的关键事实点是否被覆盖（如有事实点）

输出 JSON 格式：
{
  "results": [
    {
      "questionId": "题目ID",
      "faithfulness": {"score": 0.0-1.0, "reasoning": "理由"},
      "answerCorrectness": {"score": 0.0-1.0, "reasoning": "理由"},
      "factCoverage": {"score": 0.0-1.0, "reasoning": "理由"}
    },
    ...
  ]
}

评分标准：
- Faithfulness: 1.0=完全忠实，0.0=严重幻觉
- Answer Correctness: 1.0=完全正确，0.0=完全错误（无参考答案时给 0）
- Fact Coverage: score = 被覆盖的事实点数 / 总事实点数（无事实点时给 1）

严格按 JSON 格式输出，不要输出 markdown 代码块。`;

  // 构建 user prompt
  const userParts: string[] = [];

  for (const q of questions) {
    userParts.push(`## 题目：${q.questionId}`);
    userParts.push("### 参考文档");
    userParts.push(q.context.slice(0, 4000));

    if (q.expectedAnswer) {
      userParts.push("", "### 参考答案");
      userParts.push(q.expectedAnswer);
    }

    if (q.mustIncludeFacts && q.mustIncludeFacts.length > 0) {
      userParts.push("", "### 必须包含的关键事实点");
      userParts.push(q.mustIncludeFacts.map((f, i) => `${i + 1}. ${f}`).join("\n"));
    }

    userParts.push("", "### AI 生成的回答");
    userParts.push(q.answer.slice(0, 3000));
    userParts.push("");
  }

  userParts.push("请一次性评估以上所有题目的三个维度。");

  const user = userParts.join("\n");

  // 2 个 judge 并行评估
  const { callMultiJudge } = await import("./multiJudge.js");
  const outputs = await callMultiJudge(
    { system, user },
    judgeApiKeys,
    { temperature: 0, maxTokens: 8000, ...judgeOpts },
  );

  // 解析每个 judge 的结果
  const judgeResults: Array<Map<string, {
    faithfulness: number;
    answerCorrectness: number;
    factCoverage: number;
  }>> = [];

  for (const output of outputs) {
    if (!output.success || !output.rawText) continue;

    try {
      const json = extractJsonFromLLM(output.rawText);
      if (json && Array.isArray(json.results)) {
        const resultMap = new Map<string, {
          faithfulness: number;
          answerCorrectness: number;
          factCoverage: number;
        }>();

        for (const r of json.results) {
          if (r.questionId) {
            resultMap.set(r.questionId, {
              faithfulness: Math.max(0, Math.min(1, r.faithfulness?.score ?? 0)),
              answerCorrectness: Math.max(0, Math.min(1, r.answerCorrectness?.score ?? 0)),
              factCoverage: Math.max(0, Math.min(1, r.factCoverage?.score ?? 0)),
            });
          }
        }

        judgeResults.push(resultMap);
      }
    } catch (e) {
      logger.warn(`[EvalMetrics] Failed to parse batch judge output: ${e}`);
    }
  }

  // 聚合结果：多个 judge 取平均
  for (const q of questions) {
    const emptyResult = { aggregated: 0, individualResults: [], judgeCount: 0 };

    if (judgeResults.length === 0) {
      result.set(q.questionId, {
        faithfulness: emptyResult,
        answerCorrectness: emptyResult,
        factCoverage: emptyResult,
      });
      continue;
    }

    // 只过滤掉 judge 调用失败的结果（undefined），不排除合法的 0.0 分数
    const faithfulnessScores = judgeResults
      .map(jr => jr.get(q.questionId)?.faithfulness)
      .filter((s): s is number => s !== undefined);
    const acScores = judgeResults
      .map(jr => jr.get(q.questionId)?.answerCorrectness)
      .filter((s): s is number => s !== undefined);
    const fcScores = judgeResults
      .map(jr => jr.get(q.questionId)?.factCoverage)
      .filter((s): s is number => s !== undefined);

    const aggregateScores = (scores: number[]): number => {
      if (scores.length === 0) return 0;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };

    result.set(q.questionId, {
      faithfulness: {
        aggregated: aggregateScores(faithfulnessScores),
        individualResults: judgeResults.map((jr, i) => ({
          providerId: `judge-${i}`,
          value: jr.get(q.questionId)?.faithfulness ?? 0,
          success: jr.has(q.questionId),
        })),
        judgeCount: faithfulnessScores.length,
      },
      answerCorrectness: {
        aggregated: aggregateScores(acScores),
        individualResults: judgeResults.map((jr, i) => ({
          providerId: `judge-${i}`,
          value: jr.get(q.questionId)?.answerCorrectness ?? 0,
          success: jr.has(q.questionId),
        })),
        judgeCount: acScores.length,
      },
      factCoverage: {
        aggregated: aggregateScores(fcScores),
        individualResults: judgeResults.map((jr, i) => ({
          providerId: `judge-${i}`,
          value: jr.get(q.questionId)?.factCoverage ?? 0,
          success: jr.has(q.questionId),
        })),
        judgeCount: fcScores.length,
      },
    });
  }

  return result;
}

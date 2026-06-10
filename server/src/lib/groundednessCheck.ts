/**
 * NF2: Groundedness Detection — LLM-as-Judge 验证
 *
 * 在 LLM 生成回答之后，检查回答是否忠实于检索到的文档，
 * 移除无支撑声明后再返回给用户。
 */
import { logger } from "./logger.js";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

// ── 类型定义 ──────────────────────────────────────────

export interface GroundingDoc {
  source: string;
  excerpt: string;
  score?: number | undefined;
}

export interface ClaimVerdict {
  text: string;
  verdict: "grounded" | "ungrounded" | "not_verifiable";
  evidence?: string;
  reason?: string;
}

export interface JudgeResult {
  claims: ClaimVerdict[];
  groundedRatio: number;
  overallVerdict: "pass" | "fail" | "partial";
}

export interface FilteredOutput {
  output: string;
  groundingScore: number;
  removedClaims: Array<{ text: string; reason: string }>;
  verdict: "pass" | "partial" | "fail";
}

export interface GroundednessConfig {
  apiKey?: string | undefined;
  providerPreference?: string[] | undefined;
  modelId?: string | undefined;
  modelFallbacks?: Record<string, string[]> | undefined;
  enableModelFallback?: Record<string, boolean> | undefined;
  providerBaseUrls?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}

// ── 句子拆分 ──────────────────────────────────────────

/**
 * 将文本拆分为句子/段落
 * - 按中文句号、问号、感叹号、英文句号拆分
 * - 保留编号段落（如 [0001]）的完整性
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  // 保护编号段落 [0001] 等，先替换为占位符
  const protectedMarkers: string[] = [];
  const protectedText = text.replace(/\[(\d{4,})\]/g, (match) => {
    const idx = protectedMarkers.length;
    protectedMarkers.push(match);
    return `__PROTECTED_MARKER_${idx}__`;
  });

  // 按句子分隔符拆分（中文句号、问号、感叹号、英文句号）
  // 保留分隔符在句子末尾
  const rawSentences = protectedText.split(/(?<=[。！？.!?])/);

  // 还原保护的标记
  const sentences = rawSentences
    .map((s) => {
      let restored = s;
      protectedMarkers.forEach((marker, idx) => {
        restored = restored.replace(`__PROTECTED_MARKER_${idx}__`, marker);
      });
      return restored.trim();
    })
    .filter((s) => s.length > 0);

  // 合并过短的句子（< 5 字符）到前一个句子
  const merged: string[] = [];
  for (const s of sentences) {
    if (merged.length > 0 && s.length < 5) {
      merged[merged.length - 1] += s;
    } else {
      merged.push(s);
    }
  }

  return merged;
}

// ── Judge Prompt 构建 ──────────────────────────────────

export function buildJudgePrompt(
  sentences: string[],
  groundingDocs: GroundingDoc[]
): { system: string; user: string } {
  const system = [
    "你是专利审查 AI 助手的事实核查员。你的任务是判断 AI 生成的回答中，每个声明是否被提供的参考文档支撑。",
    "",
    "规则：",
    "- grounded: 声明有明确的文档支撑（可引用具体段落）",
    "- ungrounded: 声明没有文档支撑，可能是幻觉或推测",
    "- not_verifiable: 声明无法从文档中判断（如常识性陈述、过渡语句）",
    "",
    "输出格式（JSON）：",
    "{",
    '  "claims": [',
    "    {",
    '      "text": "声明原文",',
    '      "verdict": "grounded | ungrounded | not_verifiable",',
    '      "evidence": "支撑该声明的文档片段（如有）",',
    '      "reason": "判断理由"',
    "    }",
    "  ],",
    '  "groundedRatio": 0.85,',
    '  "overallVerdict": "pass | fail | partial"',
    "}",
    "",
    "注意：",
    "- groundedRatio = grounded 数量 / (grounded + ungrounded) 数量",
    "- overallVerdict: groundedRatio >= 0.8 为 pass, 0.5~0.8 为 partial, < 0.5 为 fail",
    "- not_verifiable 不计入 groundedRatio 计算",
    "- 严格按 JSON 格式输出，不要输出 markdown 代码块或任何解释性文字",
  ].join("\n");

  const docSection = groundingDocs
    .map(
      (doc, i) =>
        `[${i + 1}] ${doc.source}${doc.score ? ` (相似度: ${doc.score.toFixed(2)})` : ""}\n${doc.excerpt}`
    )
    .join("\n\n");

  const sentenceSection = sentences
    .map((s, i) => `[S${i + 1}] ${s}`)
    .join("\n");

  const user = [
    "## 参考文档",
    docSection || "（无参考文档）",
    "",
    "## AI 生成的回答（已拆分为声明）",
    sentenceSection,
    "",
    "请逐句检查以上回答的每个声明，判断是否有文档支撑。",
  ].join("\n");

  return { system, user };
}

// ── LLM Judge 调用 ──────────────────────────────────

async function callJudge(
  sentences: string[],
  groundingDocs: GroundingDoc[],
  config: GroundednessConfig
): Promise<JudgeResult> {
  const { system, user } = buildJudgePrompt(sentences, groundingDocs);

  try {
    const { registry } = await import("../providers/registry.js");
    const { getApiKey } = await import("../security/keyStore.js");

    // 构建 provider → apiKey 映射
    const providerApiKeys: Record<string, string> = {};
    for (const pid of config.providerPreference ?? []) {
      const key = config.apiKey ?? getApiKey(pid);
      if (key) providerApiKeys[pid] = key;
    }

    const chatReq: ChatRequest = {
      modelId: config.modelId ?? "",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      apiKey: "",
      maxTokens: 2000,
      temperature: 0,
      ...(config.signal !== undefined && { signal: config.signal }),
    };

    const result = await registry.runWithFallback(
      config.providerPreference ?? [],
      chatReq,
      undefined,
      config.modelFallbacks,
      config.enableModelFallback,
      config.providerBaseUrls,
      providerApiKeys
    );

    if (result.response.error) {
      logger.warn(`[Groundedness] Judge LLM 调用失败: ${result.response.error.message}`);
      // 降级：全部通过
      return {
        claims: sentences.map((s) => ({
          text: s,
          verdict: "grounded" as const,
          reason: "Judge 调用失败，默认通过",
        })),
        groundedRatio: 1,
        overallVerdict: "pass",
      };
    }

    // 解析 JSON 输出
    const outputText = result.response.text;
    const parsed = extractJudgeJson(outputText);
    if (parsed) {
      return parsed;
    }

    // JSON 解析失败，降级为全部通过
    logger.warn(`[Groundedness] Judge JSON 解析失败，降级为全部通过`);
    return {
      claims: sentences.map((s) => ({
        text: s,
        verdict: "grounded" as const,
        reason: "JSON 解析失败，默认通过",
      })),
      groundedRatio: 1,
      overallVerdict: "pass",
    };
  } catch (err) {
    logger.warn(`[Groundedness] Judge 调用异常: ${err}`);
    return {
      claims: sentences.map((s) => ({
        text: s,
        verdict: "grounded" as const,
        reason: "调用异常，默认通过",
      })),
      groundedRatio: 1,
      overallVerdict: "pass",
    };
  }
}

export function extractJudgeJson(text: string): JudgeResult | null {
  try {
    // 尝试直接解析
    const parsed = JSON.parse(text) as JudgeResult;
    if (parsed.claims && Array.isArray(parsed.claims)) {
      return parsed;
    }
  } catch {
    // 尝试提取 JSON 块（找第一个 { 到最后一个 }，避免贪婪匹配错误）
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.substring(start, end + 1)) as JudgeResult;
        if (parsed.claims && Array.isArray(parsed.claims)) {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

// ── 过滤函数 ──────────────────────────────────────────

export function filterUngrounded(
  originalOutput: string,
  sentences: string[],
  judgeResult: JudgeResult
): FilteredOutput {
  const claimVerdicts = judgeResult.claims;

  // 构建句子 → verdict 映射
  const verdictMap = new Map<string, ClaimVerdict>();
  for (const cv of claimVerdicts) {
    verdictMap.set(cv.text, cv);
  }

  const keptSentences: string[] = [];
  const removedClaims: Array<{ text: string; reason: string }> = [];

  for (const sentence of sentences) {
    const verdict = verdictMap.get(sentence);
    if (!verdict) {
      // 未找到 verdict，保守保留
      keptSentences.push(sentence);
      continue;
    }

    switch (verdict.verdict) {
      case "grounded":
        keptSentences.push(sentence);
        break;
      case "not_verifiable":
        // pass 时保留，partial/fail 时移除
        if (judgeResult.overallVerdict === "pass") {
          keptSentences.push(sentence);
        } else {
          removedClaims.push({
            text: sentence,
            reason: verdict.reason || "无法验证",
          });
        }
        break;
      case "ungrounded":
        removedClaims.push({
          text: sentence,
          reason: verdict.reason || "无文档支撑",
        });
        break;
    }
  }

  return {
    output: keptSentences.join(""),
    groundingScore: judgeResult.groundedRatio,
    removedClaims,
    verdict: judgeResult.overallVerdict,
  };
}

// ── 主函数 ──────────────────────────────────────────

/**
 * 检查 LLM 回答的 groundedness
 * @param output LLM 生成的回答
 * @param knowledgeCitations RAG 引用
 * @param webSearchCitations Web Search 引用
 * @param config LLM 调用配置
 * @returns 过滤后的输出
 */
export async function checkGroundedness(
  output: string,
  knowledgeCitations?: Array<{ source: string; excerpt: string; score?: number }>,
  webSearchCitations?: Array<{ url: string; title: string; snippet: string; engine: string }>,
  config: GroundednessConfig = {}
): Promise<FilteredOutput> {
  // 收集 grounding documents
  const groundingDocs: GroundingDoc[] = [];

  if (knowledgeCitations) {
    for (const c of knowledgeCitations) {
      groundingDocs.push({
        source: `知识库: ${c.source}`,
        excerpt: c.excerpt,
        score: c.score,
      });
    }
  }

  if (webSearchCitations) {
    for (const c of webSearchCitations) {
      groundingDocs.push({
        source: `Web Search: ${c.title}`,
        excerpt: c.snippet,
      });
    }
  }

  // 如果没有 grounding documents，跳过检查
  if (groundingDocs.length === 0) {
    logger.info("[Groundedness] 无 grounding documents，跳过检查");
    return {
      output,
      groundingScore: 1,
      removedClaims: [],
      verdict: "pass",
    };
  }

  // 拆分句子
  const sentences = splitIntoSentences(output);
  if (sentences.length === 0) {
    return {
      output,
      groundingScore: 1,
      removedClaims: [],
      verdict: "pass",
    };
  }

  const ragCount = knowledgeCitations?.length ?? 0;
  const webCount = webSearchCitations?.length ?? 0;
  logger.info(
    `[Groundedness] 开始检查: ${sentences.length} 个句子, ${groundingDocs.length} 个 grounding documents (RAG=${ragCount}, Web=${webCount})`
  );

  // 调用 LLM Judge
  const judgeResult = await callJudge(sentences, groundingDocs, config);

  // 过滤
  const filtered = filterUngrounded(output, sentences, judgeResult);

  logger.info(
    `[Groundedness] 检查完成: verdict=${filtered.verdict}, score=${filtered.groundingScore.toFixed(2)}, removed=${filtered.removedClaims.length} 个声明`
  );

  return filtered;
}

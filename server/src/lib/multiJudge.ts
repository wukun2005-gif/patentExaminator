/**
 * Multi-Judge Infrastructure — 3 个 LLM Provider 并行打分 + 聚合
 *
 * nf5 规范 §3.2: 每个需要语义判断的指标都由 3 个 LLM provider 独立打分，
 * 使用不同模型家族 decorrelate 偏差。
 *
 * 聚合算法：
 * - 离散值（0-3 relevance grade）：Majority Vote → 无多数取中位数
 * - 连续值（0-1 faithfulness/correctness）：算术平均
 */
import { logger } from "./logger.js";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

// ── 类型定义 ──────────────────────────────────────────

/** 单个 Judge 的调用结果 */
export interface JudgeOutput {
  providerId: string;
  rawText: string;
  success: boolean;
  error?: string;
}

/** Multi-Judge 聚合结果 */
export interface MultiJudgeResult<T> {
  aggregated: T;
  individualResults: Array<{ providerId: string; value: T; success: boolean }>;
  judgeCount: number;       // 成功的 judge 数量
}

// ── 默认配置 ──────────────────────────────────────────

/** 默认 3 个 judge（不同模型，decorrelate 偏差）
 *  使用 {providerId, modelId} 元组数组，支持同一 provider 不同模型
 *  Gemini API 因超时频繁失败，已替换为火山 doubao-seed
 */
export const DEFAULT_JUDGE_CONFIGS: Array<{ providerId: string; modelId: string }> = [
  { providerId: "mimo", modelId: "mimo-v2.5" },
  { providerId: "volcengine", modelId: "deepseek-v4-flash-260425" },
  { providerId: "volcengine", modelId: "doubao-seed-2-0-pro-260215" },
];

/** 向后兼容：provider ID 列表 */
export const DEFAULT_JUDGE_PROVIDERS = DEFAULT_JUDGE_CONFIGS.map(c => c.providerId);

/** 向后兼容：provider → model 映射（注意：同一 provider 多模型时只保留最后一个） */
export const DEFAULT_JUDGE_MODELS: Record<string, string> = Object.fromEntries(
  DEFAULT_JUDGE_CONFIGS.map(c => [c.providerId, c.modelId])
);

// ── 聚合算法 ──────────────────────────────────────────

/**
 * 离散值聚合：Majority Vote → 无多数取中位数
 *
 * 规范 §3.2:
 * - 2 个 judge 给相同分数 → 取该分数
 * - 无多数（3 个各不同）→ 取中位数
 */
export function aggregateDiscrete(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return Math.round((values[0]! + values[1]!) / 2);

  // 3 个值：检查是否有 majority
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  // 找出现次数最多的值
  let maxCount = 0;
  let majorityValue = values[0]!;
  for (const [val, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      majorityValue = val;
    }
  }

  // 2 票以上即为多数
  if (maxCount >= 2) return majorityValue;

  // 无多数 → 取中位数
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * 连续值聚合：算术平均
 */
export function aggregateContinuous(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── 核心调用函数 ──────────────────────────────────────

/**
 * 并行调用 3 个 judge provider，返回各自的原始输出文本
 *
 * 使用 Promise.allSettled 确保任一 provider 失败不阻塞其他。
 * 2/3 成功即可聚合；全部失败时返回空数组。
 */
export async function callMultiJudge(
  prompt: { system: string; user: string },
  judgeApiKeys: Record<string, string>,
  options?: {
    providers?: string[];
    modelIds?: Record<string, string>;
    /** judge 配置数组（优先于 providers + modelIds，支持同一 provider 不同模型） */
    judgeConfigs?: Array<{ providerId: string; modelId: string }>;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    /** 用户在 APP 设置页配置的 fallback 链 */
    modelFallbacks?: Record<string, string[]>;
    /** 是否启用 fallback */
    enableModelFallback?: boolean;
  }
): Promise<JudgeOutput[]> {
  // judgeConfigs 优先（支持同一 provider 不同模型），否则向后兼容 providers + modelIds
  const judgeCfgs = options?.judgeConfigs
    ?? (options?.providers
      ? options.providers.map((p, i) => ({
        providerId: p,
        modelId: options?.modelIds?.[p] ?? DEFAULT_JUDGE_CONFIGS[i]?.modelId ?? "",
      }))
      : DEFAULT_JUDGE_CONFIGS);
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 2000;

  // 构建每个 judge 的调用任务
  const judgeTasks = judgeCfgs.map(async (cfg): Promise<JudgeOutput> => {
    const { providerId, modelId } = cfg;
    const apiKey = judgeApiKeys[providerId];
    if (!apiKey) {
      logger.warn(`[MultiJudge] ${providerId} judge skipped: no API key configured`);
      return { providerId, rawText: "", success: false, error: "No API key" };
    }

    try {
      const { registry } = await import("../providers/registry.js");

      const chatReq: ChatRequest = {
        modelId,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        apiKey: "",
        maxTokens,
        temperature,
        ...(options?.signal !== undefined && { signal: options.signal }),
      };

      const providerApiKeys: Record<string, string> = { [providerId]: apiKey };
      const enableFallback = options?.enableModelFallback !== undefined
        ? { [providerId]: options.enableModelFallback }
        : undefined;
      const result = await registry.runWithFallback(
        [providerId],
        chatReq,
        options?.modelFallbacks,
        enableFallback,
        undefined,
        providerApiKeys
      );

      if (result.response.error) {
        return {
          providerId,
          rawText: "",
          success: false,
          error: result.response.error.message,
        };
      }

      return {
        providerId,
        rawText: result.response.text,
        success: true,
      };
    } catch (err) {
      return {
        providerId,
        rawText: "",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 并行执行所有 judge 调用
  const settled = await Promise.allSettled(judgeTasks);

  return settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      providerId: judgeCfgs[i]?.providerId ?? "unknown",
      rawText: "",
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

// ── 高级聚合函数 ──────────────────────────────────────

/**
 * 调用多 judge 并聚合离散值结果
 *
 * @param prompt - judge prompt
 * @param judgeApiKeys - provider → apiKey 映射
 * @param parser - 从 rawText 解析出数值的函数
 * @param options - 可选配置
 * @returns 聚合后的离散值 + 各 judge 结果
 */
export async function multiJudgeDiscrete(
  prompt: { system: string; user: string },
  judgeApiKeys: Record<string, string>,
  parser: (rawText: string) => number | null,
  options?: {
    providers?: string[];
    modelIds?: Record<string, string>;
    defaultValue?: number;
    modelFallbacks?: Record<string, string[]>;
    enableModelFallback?: boolean;
  }
): Promise<MultiJudgeResult<number>> {
  const defaultVal = options?.defaultValue ?? 0;
  const outputs = await callMultiJudge(prompt, judgeApiKeys, options);

  const individualResults: Array<{ providerId: string; value: number; success: boolean }> = [];
  const validValues: number[] = [];

  for (const output of outputs) {
    if (output.success && output.rawText) {
      const parsed = parser(output.rawText);
      if (parsed !== null) {
        individualResults.push({ providerId: output.providerId, value: parsed, success: true });
        validValues.push(parsed);
        continue;
      }
    }
    individualResults.push({
      providerId: output.providerId,
      value: defaultVal,
      success: false,
    });
  }

  const aggregated = validValues.length > 0 ? aggregateDiscrete(validValues) : defaultVal;

  return { aggregated, individualResults, judgeCount: validValues.length };
}

/**
 * 调用多 judge 并聚合连续值结果
 *
 * @param prompt - judge prompt
 * @param judgeApiKeys - provider → apiKey 映射
 * @param parser - 从 rawText 解析出 0-1 分数的函数
 * @param options - 可选配置
 * @returns 聚合后的连续值 + 各 judge 结果
 */
export async function multiJudgeContinuous(
  prompt: { system: string; user: string },
  judgeApiKeys: Record<string, string>,
  parser: (rawText: string) => number | null,
  options?: {
    providers?: string[];
    modelIds?: Record<string, string>;
    defaultValue?: number;
    modelFallbacks?: Record<string, string[]>;
    enableModelFallback?: boolean;
  }
): Promise<MultiJudgeResult<number>> {
  const defaultVal = options?.defaultValue ?? 0.5;
  const outputs = await callMultiJudge(prompt, judgeApiKeys, options);

  const individualResults: Array<{ providerId: string; value: number; success: boolean }> = [];
  const validValues: number[] = [];

  for (const output of outputs) {
    if (output.success && output.rawText) {
      const parsed = parser(output.rawText);
      if (parsed !== null) {
        individualResults.push({ providerId: output.providerId, value: parsed, success: true });
        validValues.push(parsed);
        continue;
      }
    }
    individualResults.push({
      providerId: output.providerId,
      value: defaultVal,
      success: false,
    });
  }

  const aggregated = validValues.length > 0 ? aggregateContinuous(validValues) : defaultVal;

  return { aggregated, individualResults, judgeCount: validValues.length };
}

// ── JSON 解析辅助 ──────────────────────────────────────

/**
 * 从 LLM 输出中提取 JSON 对象
 * 处理 markdown 代码块、前后缀文本等情况
 */
export function extractJsonFromLLM(text: string): Record<string, unknown> | null {
  // 直接尝试解析
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
  } catch { /* continue */ }

  // 提取 ```json ... ``` 代码块
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch { /* continue */ }
  }

  // 提取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.substring(start, end + 1));
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch { /* continue */ }
  }

  return null;
}

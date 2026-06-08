import type { ProviderId } from "@shared/types/agents";
import type { MultimodalPart } from "@shared/types/domain";
import { logger } from "../lib/logger.js";
import { getModelCapabilities } from "./model-capabilities-registry.js";

const NON_TEXT_PATTERNS =
  /\bembed\b|\bimage\b|\bimagen\b|\btts\b|\baudio\b|\bspeech\b|\basr\b|\bwhisper\b|\bdall\b|\bvision\b|\bmoderation\b|\brerank\b|\bcode-search\b|\bveo\b|\bvideo\b|\blyria\b|\bmusic\b|\bclip\b|\bupscale\b|\brecontext\b|\btranscrib|\bcomputer[- ]?use\b/i;

function isTextModel(id: string): boolean {
  return !NON_TEXT_PATTERNS.test(id);
}

// L2 regex: 宽松兜底 — 宁可误判放大，不要漏判导致崩溃
const REASONING_MODEL_PATTERNS = /mimo|r1\b|o[134]\b|reasoner|thinking|gemini-\d|glm-\d|k2\.[56]|deepseek-v[34]|kimi-k2|gpt-5|doubao-seed-\d/i;
const REASONING_MAX_TOKENS_MULTIPLIER = 4;

// L1 运行时缓存：modelId → isReasoning（从 API 响应中学到的）
const thinkingModelCache = new Map<string, boolean>();

/**
 * 从 API 响应中学习：如果模型使用了 thinking tokens，缓存为 thinking 模型
 */
export function learnThinkingCapability(modelId: string, thinkingTokens: number | undefined): void {
  if (thinkingTokens && thinkingTokens > 0) {
    if (!thinkingModelCache.has(modelId)) {
      logger.info(`[ModelAdapt] Auto-detected thinking model: ${modelId} (${thinkingTokens} thinking tokens)`);
    }
    thinkingModelCache.set(modelId, true);
  }
}

/**
 * 判断模型是否为推理模型 — 三层查询：
 * 1. 运行时缓存（最高优先级：从响应中学到的）
 * 2. 静态能力声明（ModelCapabilities 注册表）
 * 3. regex 兜底（cold-start）
 */
export function isReasoningModel(modelId: string): boolean {
  // 1. 运行时缓存
  if (thinkingModelCache.has(modelId)) {
    return thinkingModelCache.get(modelId)!;
  }
  // 2. 静态能力声明
  const caps = getModelCapabilities(modelId);
  if (caps.isReasoning) {
    return true;
  }
  // 3. regex 兜底
  return REASONING_MODEL_PATTERNS.test(modelId);
}

export function resolveMaxTokens(modelId: string, requestedMaxTokens?: number): number {
  const base = requestedMaxTokens ?? 4096;
  if (isReasoningModel(modelId)) {
    return base * REASONING_MAX_TOKENS_MULTIPLIER;
  }
  return base;
}

/** 仅用于测试 — 清空运行时缓存 */
export function clearThinkingCache(): void {
  thinkingModelCache.clear();
}

export interface ChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string | MultimodalPart[] }>;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
  signal?: AbortSignal;
  baseUrl?: string;
  /** Per-request timeout override (ms). Falls back to registry default if omitted. */
  timeoutMs?: number;
  /** D4: structured output response format (JSON schema) */
  responseFormat?: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
  };
}

export interface ChatResponse {
  text: string;
  tokenUsage?: { input: number; output: number; total: number };
  thinkingTokens?: number;       // thinking token 数量（>0 表示推理模型）
  reasoningText?: string;        // reasoning 内容文本（用于日志/调试）
  rawResponse: unknown;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ProviderAdapter {
  id: ProviderId;
  defaultBaseUrl: string;
  supportedModels(): string[];
  chat(req: ChatRequest): Promise<ChatResponse>;
  listModels(apiKey: string, customBaseUrl?: string): Promise<string[]>;
}

/**
 * Base adapter for OpenAI-compatible providers.
 * Subclasses only need to set id, defaultBaseUrl, and supportedModels.
 */
export abstract class OpenAICompatibleAdapter implements ProviderAdapter {
  abstract id: ProviderId;
  abstract defaultBaseUrl: string;
  protected baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? "";
  }

  /** Must be called after construction to set baseUrl from defaultBaseUrl if not provided */
  protected init(): void {
    if (!this.baseUrl) this.baseUrl = this.defaultBaseUrl;
  }

  abstract supportedModels(): string[];

  async listModels(apiKey: string, customBaseUrl?: string): Promise<string[]> {
    const base = customBaseUrl || this.baseUrl || this.defaultBaseUrl;
    const url = `${base}/models`;
    const MAX_RETRIES = 2;
    const BACKOFF_MS = [1000, 3000];

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const err = new Error(`Failed to list models for ${this.id}: ${res.status} ${body}`);
          // Don't retry auth errors
          if (res.status === 401 || res.status === 403) throw err;
          lastError = err;
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
            continue;
          }
          throw err;
        }
        const data = (await res.json()) as { data: Array<{ id: string }> };
        const ids = data.data.map((m) => m.id).filter((id) => isTextModel(id));
        return ids.sort();
      } catch (e) {
        if (e instanceof Error && (e.message.includes("401") || e.message.includes("403"))) {
          throw e; // Don't retry auth errors
        }
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        }
      }
    }
    throw lastError ?? new Error(`Failed to list models for ${this.id}`);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.baseUrl && !req.baseUrl) this.init();
    const url = `${req.baseUrl ?? this.baseUrl}/chat/completions`;
    const effectiveMaxTokens = resolveMaxTokens(req.modelId, req.maxTokens);

    // D2: temperature 自适应 — 按模型能力决定是否发送和范围
    const caps = getModelCapabilities(req.modelId);
    let temperature = req.temperature;
    if (!caps.temperature.supported) {
      temperature = undefined; // 不支持 → 不发送
    } else if (temperature !== undefined) {
      const [min, max] = caps.temperature.range;
      temperature = Math.max(min, Math.min(max, temperature)); // clamp 到合法范围
    }

    const body: Record<string, unknown> = {
      model: req.modelId,
      max_tokens: effectiveMaxTokens
    };
    if (temperature !== undefined) {
      body.temperature = temperature;
    }

    // D4: structured output — 只在模型支持时发送 response_format
    if (req.responseFormat && caps.supportsStructuredOutput) {
      body.response_format = req.responseFormat;
    }

    // D6: 视觉/多模态 — 按模型能力处理消息内容
    const messages = req.messages.map(m => {
      if (typeof m.content === "string") return m;
      if (!Array.isArray(m.content)) return m;

      if (!caps.supportsVision) {
        // 不支持视觉：只保留文本部分
        const textOnly = m.content
          .filter(p => p.type === "text")
          .map(p => (p as { type: "text"; text: string }).text)
          .join("\n");
        return { ...m, content: textOnly };
      }

      // 支持视觉：转换为 OpenAI 格式
      const parts = m.content.map(p => {
        if (p.type === "text") return { type: "text", text: p.text };
        if (p.type === "image_url") return { type: "image_url", image_url: p.image_url };
        if (p.type === "inline_data" && p.inline_data) {
          return {
            type: "image_url",
            image_url: { url: `data:${p.inline_data.mimeType};base64,${p.inline_data.data}` },
          };
        }
        return p;
      });
      return { ...m, content: parts };
    });

    body.messages = messages;

    const maskedKey = req.apiKey ? `${req.apiKey.slice(0, 6)}...${req.apiKey.slice(-4)}` : "none";
    const fetchInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify(body),
      signal: req.signal ?? null
    };

    const reqTimestamp = new Date().toISOString();
    console.log(`[MIMO-DEBUG] ──── REQUEST START ──── ${reqTimestamp}`);
    console.log(`[MIMO-DEBUG] provider=${this.id} url=${url}`);
    console.log(`[MIMO-DEBUG] model=${req.modelId} maxTokens=${effectiveMaxTokens} temp=${temperature ?? "auto"}`);
    console.log(`[MIMO-DEBUG] apiKey=${maskedKey} messages=${req.messages.length}`);
    console.log(`[MIMO-DEBUG] signal=${req.signal ? "set" : "none"} signal.aborted=${req.signal?.aborted ?? "n/a"}`);
    console.log(`[MIMO-DEBUG] bodySize=${JSON.stringify(body).length} bytes`);
    const reqStartMs = Date.now();

    let res: Response;
    try {
      res = await fetch(url, fetchInit);
    } catch (fetchErr) {
      const elapsed = Date.now() - reqStartMs;
      const errName = fetchErr instanceof Error ? fetchErr.name : "unknown";
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const errCode = (fetchErr as NodeJS.ErrnoException)?.code ?? "none";
      const errCause = fetchErr instanceof Error && fetchErr.cause
        ? `cause={name=${(fetchErr.cause as Error)?.name} message=${(fetchErr.cause as Error)?.message} code=${(fetchErr.cause as NodeJS.ErrnoException)?.code}}`
        : "cause=none";
      console.log(`[MIMO-DEBUG] ──── FETCH ERROR ──── elapsed=${elapsed}ms`);
      console.log(`[MIMO-DEBUG] name=${errName} code=${errCode} message=${errMsg}`);
      console.log(`[MIMO-DEBUG] ${errCause}`);
      console.log(`[MIMO-DEBUG] stack=${fetchErr instanceof Error ? fetchErr.stack?.split("\n").slice(0, 5).join(" | ") : "no stack"}`);
      throw fetchErr;
    }

    const elapsed = Date.now() - reqStartMs;
    console.log(`[MIMO-DEBUG] ──── RESPONSE ──── elapsed=${elapsed}ms`);
    console.log(`[MIMO-DEBUG] status=${res.status} statusText=${res.statusText}`);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    console.log(`[MIMO-DEBUG] responseHeaders=${JSON.stringify(resHeaders)}`);
    const contentLength = res.headers.get("content-length");
    const contentType = res.headers.get("content-type");
    console.log(`[MIMO-DEBUG] contentLength=${contentLength} contentType=${contentType}`);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.log(`[MIMO-DEBUG] ──── HTTP ERROR ──── status=${res.status} body=${errorBody.slice(0, 500)}`);
      const error = new Error(`Provider ${this.id} returned ${res.status}: ${errorBody}`);
      (error as Error & { status: number; providerId: ProviderId }).status = res.status;
      (error as Error & { status: number; providerId: ProviderId }).providerId = this.id;
      throw error;
    }

    const data = (await res.json()) as Record<string, unknown>;
    const totalElapsed = Date.now() - reqStartMs;
    console.log(`[MIMO-DEBUG] ──── SUCCESS ──── totalElapsed=${totalElapsed}ms`);
    const usage = data.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      reasoning_tokens?: number; // OpenRouter 顶层字段
    } | undefined;
    console.log(`[MIMO-DEBUG] usage=${usage ? JSON.stringify(usage) : "none"}`);
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const text = (typeof message?.content === "string" ? message.content : "") as string;
    console.log(`[MIMO-DEBUG] choices=${choices.length} textLen=${text.length} finishReason=${firstChoice?.finish_reason}`);

    // D1: 提取 thinking tokens（四层信号）
    const thinkingTokensFromUsage = usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens ?? 0;
    const reasoningContent = typeof message?.reasoning_content === "string" ? message.reasoning_content : undefined;
    const reasoningFromMessage = typeof message?.reasoning === "string" ? message.reasoning : undefined; // OpenRouter
    // OpenRouter Claude: reasoning_details 数组，每项有 type="text" 和 text 字段
    const reasoningDetails = Array.isArray(message?.reasoning_details)
      ? message.reasoning_details
          .filter((d: Record<string, unknown>) => d.type === "text" && typeof d.text === "string")
          .map((d: Record<string, unknown>) => d.text as string)
          .join("")
      : undefined;
    const thinkingTokens = thinkingTokensFromUsage ||
      (reasoningContent ? 1 : 0) ||
      (reasoningFromMessage ? 1 : 0) ||
      (reasoningDetails ? 1 : 0);

    learnThinkingCapability(req.modelId, thinkingTokens);
    console.log(`[MIMO-DEBUG] thinkingTokens=${thinkingTokens} reasoningLen=${reasoningContent?.length ?? 0}`);
    console.log(`[MIMO-DEBUG] ──── REQUEST END ────`);

    if (!text) {
      logger.warn(`${this.id} returned empty or missing content in response`, {
        model: req.modelId,
        hasChoices: Array.isArray(data.choices),
        choicesLength: choices.length,
        firstChoiceKeys: firstChoice ? Object.keys(firstChoice) : [],
        messageKeys: message ? Object.keys(message) : [],
        contentType: typeof message?.content,
        contentLen: typeof message?.content === "string" ? (message.content as string).length : -1,
        hasReasoning: reasoningContent != null,
        reasoningLen: reasoningContent?.length ?? -1,
        finishReason: firstChoice?.finish_reason
      });
    }

    const tokenUsage = usage
      ? {
          input: usage.prompt_tokens ?? 0,
          output: usage.completion_tokens ?? 0,
          total: usage.total_tokens ?? 0
        }
      : undefined;

    return {
      text,
      ...(tokenUsage ? { tokenUsage } : {}),
      thinkingTokens: thinkingTokens > 0 ? thinkingTokens : undefined,
      reasoningText: reasoningContent || reasoningFromMessage || reasoningDetails || undefined,
      rawResponse: data
    };
  }
}

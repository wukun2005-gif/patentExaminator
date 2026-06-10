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

// ── Tool Use 类型定义（NF1）──────────────────────────────────

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameterProperty>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string | MultimodalPart[]; tool_call_id?: string; name?: string }>;
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
  /** NF1: tool definitions for function calling */
  tools?: ToolDefinition[];
  /** NF1: tool choice strategy ("auto" | "none" | "required") */
  tool_choice?: "auto" | "none" | "required";
}

export interface ChatResponse {
  text: string;
  tokenUsage?: { input: number; output: number; total: number };
  thinkingTokens?: number;       // thinking token 数量（>0 表示推理模型）
  reasoningText?: string;        // reasoning 内容文本（用于日志/调试）
  rawResponse: unknown;
  error?: { code: string; message: string; retryable: boolean };
  /** NF1: tool calls returned by the model */
  toolCalls?: ToolCall[];
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
        // Verify each model is actually callable (API may list models that return 404 on chat)
        const verified = await this.verifyModels(ids, apiKey, base);
        return verified.sort();
      } catch (e) {
        if (e instanceof Error && (e.message.includes("401") || e.message.includes("403"))) {
          throw e;
        }
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        }
      }
    }
    throw lastError ?? new Error(`Failed to list models for ${this.id}`);
  }

  /** Verify models are callable by sending a lightweight chat request to each. */
  private async verifyModels(modelIds: string[], apiKey: string, baseUrl: string): Promise<string[]> {
    const CONCURRENCY = 3;
    const TIMEOUT_MS = 10_000;
    const verified: string[] = [];
    const queue = [...modelIds];

    const check = async (modelId: string): Promise<string | null> => {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok ? modelId : null;
      } catch {
        return null;
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          const result = await check(id);
          if (result) verified.push(result);
        }
      })());
    }
    await Promise.all(workers);
    logger.info(`[listModels] ${this.id}: ${modelIds.length} returned by API, ${verified.length} verified callable`);
    return verified;
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

    // NF1: tool calling support
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
      body.tool_choice = req.tool_choice ?? "auto";
    }

    body.messages = messages;
    body.stream = true;
    body.stream_options = { include_usage: true };

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

    const now = new Date();
    const pad2 = (n: number) => n < 10 ? `0${n}` : String(n);
    const reqTimestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    const tag = this.id.toUpperCase();
    console.log(`[${tag}] ──── REQUEST START ──── ${reqTimestamp}`);
    console.log(`[${tag}] provider=${this.id} url=${url}`);
    console.log(`[${tag}] model=${req.modelId} maxTokens=${effectiveMaxTokens} temp=${temperature ?? "auto"}`);
    console.log(`[${tag}] apiKey=${maskedKey} messages=${req.messages.length}`);
    console.log(`[${tag}] signal=${req.signal ? "set" : "none"} signal.aborted=${req.signal?.aborted ?? "n/a"}`);
    console.log(`[${tag}] bodySize=${JSON.stringify(body).length} bytes`);
    const reqStartMs = Date.now();

    // Streaming 读取 + 一次性降级到非 streaming
    // 策略：streaming 超时 → 尝试非 streaming 一次 → 仍失败 → 错误冒泡到 registry（Provider/Model fallback）
    const STREAM_CHUNK_TIMEOUT_MS = 60_000; // streaming: 60 秒无新数据 → 判定流 hang
    let buffer = "";

    try {
      buffer = await this.fetchAndReadStream(url, fetchInit, body, tag, reqStartMs, STREAM_CHUNK_TIMEOUT_MS);
    } catch (streamErr) {
      if (streamErr instanceof Error && (streamErr as Error & { streamTimeout?: boolean }).streamTimeout) {
        // 流超时：降级到非 streaming（chunk timeout 不适用，registry timeout 兜底）
        console.log(`[${tag}] ──── STREAM TIMEOUT, RETRY AS NON-STREAMING ────`);
        delete body.stream;
        fetchInit.body = JSON.stringify(body);
        try {
          buffer = await this.fetchAndReadStream(url, fetchInit, body, tag, reqStartMs, 0);
        } catch (retryErr) {
          console.log(`[${tag}] ──── NON-STREAMING RETRY ALSO FAILED ────`);
          throw retryErr;
        }
      } else {
        throw streamErr;
      }
    }

    const totalElapsed = Date.now() - reqStartMs;

    // 解析：SSE 格式（data: {...}）或普通 JSON
    // streaming 时需要分开保存：data（最后 chunk）和 lastContentChunk（最后有 choices 的 chunk）
    let data: Record<string, unknown> = {};
    let lastContentChunk: Record<string, unknown> | undefined;
    const isSSE = buffer.trimStart().startsWith("data: ");
    if (isSSE) {
      for (const line of buffer.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as Record<string, unknown>;
          data = chunk;
          const c = chunk.choices as unknown[] | undefined;
          if (c && c.length > 0) lastContentChunk = chunk;
        } catch { /* skip */ }
      }
    } else {
      try { data = JSON.parse(buffer) as Record<string, unknown>; lastContentChunk = data; } catch { /* will be caught below */ }
    }

    console.log(`[${tag}] ──── SUCCESS ──── totalElapsed=${totalElapsed}ms`);
    // usage 从 data（最后一个 chunk）取，choices 从 lastContentChunk（最后有内容的 chunk）取
    const usage = data.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      reasoning_tokens?: number; // OpenRouter 顶层字段
    } | undefined;
    console.log(`[${tag}] usage=${usage ? JSON.stringify(usage) : "none"}`);
    const source = lastContentChunk ?? data;
    const choices = Array.isArray(source.choices) ? source.choices : [];
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;

    // 拼接完整文本：SSE 从 delta 累加，普通 JSON 直接取 message.content
    // NF1: 同时累加 tool_calls（流式分 chunk 到达）
    let text = "";
    let reasoningContent = "";
    const toolCallsAccum: Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }> = new Map();
    if (isSSE) {
      for (const line of buffer.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as Record<string, unknown>;
          const delta = (chunk.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown> | undefined;
          if (typeof delta?.content === "string") text += delta.content;
          if (typeof delta?.reasoning_content === "string") reasoningContent += delta.reasoning_content;
          // NF1: accumulate tool_calls from streaming delta
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
              const idx = tc.index as number;
              const existing = toolCallsAccum.get(idx);
              if (!existing) {
                toolCallsAccum.set(idx, {
                  id: (tc.id as string) ?? `call_${idx}`,
                  type: "function",
                  function: {
                    name: (tc.function as Record<string, unknown>)?.name as string ?? "",
                    arguments: (tc.function as Record<string, unknown>)?.arguments as string ?? "",
                  },
                });
              } else {
                if (tc.id) existing.id = tc.id as string;
                const fn = tc.function as Record<string, unknown> | undefined;
                if (fn?.name) existing.function.name = fn.name as string;
                if (typeof fn?.arguments === "string") existing.function.arguments += fn.arguments;
              }
            }
          }
        } catch { /* skip */ }
      }
    }
    if (!text && typeof message?.content === "string") text = message.content;
    if (!reasoningContent && typeof message?.reasoning_content === "string") reasoningContent = message.reasoning_content;
    console.log(`[${tag}] choices=${choices.length} textLen=${text.length} finishReason=${firstChoice?.finish_reason}`);
    if (isSSE && toolCallsAccum.size > 0) logger.info(`[${tag}] SSE toolCallsAccum.size=${toolCallsAccum.size}`);

    // D1: 提取 thinking tokens（四层信号）
    const thinkingTokensFromUsage = usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens ?? 0;
    // reasoningContent 已从流式 chunks 累加（line 373）
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
    console.log(`[${tag}] thinkingTokens=${thinkingTokens} reasoningLen=${reasoningContent?.length ?? 0}`);
    console.log(`[${tag}] ──── REQUEST END ────`);

    // tool_calls 响应不需要 text content，不是异常
    const hasToolCalls = (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) ||
      (isSSE && toolCallsAccum.size > 0) ||
      firstChoice?.finish_reason === "tool_calls";
    if (!text && !hasToolCalls) {
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

    // NF1: extract tool_calls — from non-streaming message or accumulated streaming chunks
    let toolCalls: ToolCall[] | undefined;
    if (isSSE && toolCallsAccum.size > 0) {
      toolCalls = Array.from(toolCallsAccum.entries())
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => tc);
    } else if (!isSSE && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
      toolCalls = (message.tool_calls as Array<Record<string, unknown>>).map((tc) => ({
        id: (tc.id as string) ?? "call_0",
        type: "function" as const,
        function: {
          name: (tc.function as Record<string, unknown>)?.name as string ?? "",
          arguments: (tc.function as Record<string, unknown>)?.arguments as string ?? "",
        },
      }));
    }

    const resp: ChatResponse = {
      text,
      rawResponse: data,
    };
    if (tokenUsage) resp.tokenUsage = tokenUsage;
    if (thinkingTokens > 0) resp.thinkingTokens = thinkingTokens;
    const rText = reasoningContent || reasoningFromMessage || reasoningDetails;
    if (rText) resp.reasoningText = rText;
    if (toolCalls) resp.toolCalls = toolCalls;
    return resp;
  }

  /**
   * 发起 HTTP 请求并读取完整响应体（streaming SSE 或普通 JSON）。
   * 内置 chunk 级超时：如果 chunkTimeoutMs 内没有新数据，强制取消流。
   * 抛出的错误带 streamTimeout=true 标记，调用方可据此降级重试。
   */
  private async fetchAndReadStream(
    url: string,
    fetchInit: RequestInit,
    body: Record<string, unknown>,
    tag: string,
    reqStartMs: number,
    chunkTimeoutMs: number
  ): Promise<string> {
    let res: Response;
    try {
      res = await fetch(url, fetchInit);
    } catch (fetchErr) {
      const elapsed = Date.now() - reqStartMs;
      const errName = fetchErr instanceof Error ? fetchErr.name : "unknown";
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.log(`[${tag}] ──── FETCH ERROR ──── elapsed=${elapsed}ms name=${errName} msg=${errMsg}`);
      throw fetchErr;
    }

    const elapsed = Date.now() - reqStartMs;
    console.log(`[${tag}] ──── RESPONSE ──── elapsed=${elapsed}ms`);
    console.log(`[${tag}] status=${res.status} statusText=${res.statusText}`);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    console.log(`[${tag}] responseHeaders=${JSON.stringify(resHeaders)}`);
    console.log(`[${tag}] contentLength=${res.headers.get("content-length")} contentType=${res.headers.get("content-type")}`);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.log(`[${tag}] ──── HTTP ERROR ──── status=${res.status} body=${errorBody.slice(0, 500)}`);

      // 400 + streaming → 回退到非 streaming
      if (res.status === 400 && body.stream) {
        console.log(`[${tag}] streaming not supported (400), retrying as non-streaming`);
        delete body.stream;
        fetchInit.body = JSON.stringify(body);
        res = await fetch(url, fetchInit);
        if (!res.ok) {
          const retryBody = await res.text().catch(() => "");
          const error = new Error(`Provider ${this.id} returned ${res.status} after retry: ${retryBody}`);
          (error as Error & { status: number; providerId: ProviderId }).status = res.status;
          (error as Error & { status: number; providerId: ProviderId }).providerId = this.id;
          throw error;
        }
      } else {
        const error = new Error(`Provider ${this.id} returned ${res.status}: ${errorBody}`);
        (error as Error & { status: number; providerId: ProviderId }).status = res.status;
        (error as Error & { status: number; providerId: ProviderId }).providerId = this.id;
        throw error;
      }
    }

    // 读取响应体
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is null");
    const decoder = new TextDecoder();
    let buffer = "";
    let firstChunkTime = 0;
    let chunkCount = 0;
    let chunkTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      for (;;) {
        const readPromise = chunkTimeoutMs > 0
          ? reader.read().finally(() => {
              if (chunkTimeoutId) { clearTimeout(chunkTimeoutId); chunkTimeoutId = undefined; }
            })
          : reader.read();

        if (chunkTimeoutMs > 0) {
          chunkTimeoutId = setTimeout(() => {
            console.log(`[${tag}] ──── CHUNK TIMEOUT ──── no data for ${chunkTimeoutMs}ms, canceling stream (chunks=${chunkCount})`);
            reader.cancel("chunk timeout").catch(() => {});
          }, chunkTimeoutMs);
        }

        let result: { done: boolean; value?: Uint8Array };
        try {
          result = await readPromise as { done: boolean; value?: Uint8Array };
        } catch (readErr) {
          if (readErr instanceof Error && readErr.name === "AbortError") {
            const streamElapsed = Date.now() - reqStartMs;
            console.log(`[${tag}] ──── STREAM ABORTED ──── chunks=${chunkCount} elapsed=${streamElapsed}ms`);
            // 标记为流超时，调用方可据此降级重试
            const timeoutErr = new Error(`Stream timed out after ${streamElapsed}ms (${chunkCount} chunks)`);
            (timeoutErr as Error & { streamTimeout: boolean }).streamTimeout = true;
            throw timeoutErr;
          }
          throw readErr;
        }

        if (result.done) break;
        if (!firstChunkTime) {
          firstChunkTime = Date.now() - reqStartMs;
          console.log(`[${tag}] ──── FIRST CHUNK ──── TTFB=${firstChunkTime}ms (response headers at ${elapsed}ms)`);
        }
        chunkCount++;
        buffer += decoder.decode(result.value!, { stream: true });
      }

      const streamElapsed = Date.now() - reqStartMs;
      console.log(`[${tag}] ──── STREAM DONE ──── chunks=${chunkCount} totalElapsed=${streamElapsed}ms`);
    } finally {
      if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
    }

    return buffer;
  }
}

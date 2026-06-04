import type { ProviderId } from "@shared/types/agents";
import type { MultimodalPart } from "@shared/types/domain";
import { logger } from "../lib/logger.js";

const NON_TEXT_PATTERNS =
  /\bembed\b|\bimage\b|\bimagen\b|\btts\b|\baudio\b|\bspeech\b|\basr\b|\bwhisper\b|\bdall\b|\bvision\b|\bmoderation\b|\brerank\b|\bcode-search\b|\bveo\b|\bvideo\b|\blyria\b|\bmusic\b|\bclip\b|\bupscale\b|\brecontext\b|\btranscrib|\bcomputer[- ]?use\b/i;

function isTextModel(id: string): boolean {
  return !NON_TEXT_PATTERNS.test(id);
}

const REASONING_MODEL_PATTERNS = /mimo|r1\b|o[134]\b|reasoner|thinking/i;
const REASONING_MAX_TOKENS_MULTIPLIER = 4;

function isReasoningModel(modelId: string): boolean {
  return REASONING_MODEL_PATTERNS.test(modelId);
}

export function resolveMaxTokens(modelId: string, requestedMaxTokens?: number): number {
  const base = requestedMaxTokens ?? 4096;
  if (isReasoningModel(modelId)) {
    return base * REASONING_MAX_TOKENS_MULTIPLIER;
  }
  return base;
}

export interface ChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string | MultimodalPart[] }>;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
  signal?: AbortSignal;
  baseUrl?: string;
}

export interface ChatResponse {
  text: string;
  tokenUsage?: { input: number; output: number; total: number };
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
    const body = {
      model: req.modelId,
      messages: req.messages,
      temperature: req.temperature ?? 0.1,
      max_tokens: effectiveMaxTokens
    };

    const fetchInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify(body),
      signal: req.signal ?? null
    };

    const res = await fetch(url, fetchInit);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      const error = new Error(`Provider ${this.id} returned ${res.status}: ${errorBody}`);
      (error as Error & { status: number; providerId: ProviderId }).status = res.status;
      (error as Error & { status: number; providerId: ProviderId }).providerId = this.id;
      throw error;
    }

    const data = (await res.json()) as Record<string, unknown>;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const text = (typeof message?.content === "string" ? message.content : "") as string;

    if (!text) {
      const reasoningContent = typeof message?.reasoning_content === "string" ? message.reasoning_content : undefined;
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

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
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
      rawResponse: data
    };
  }
}

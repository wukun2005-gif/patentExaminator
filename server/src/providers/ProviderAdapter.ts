import type { ProviderId } from "@shared/types/agents";
import type { MultimodalPart } from "@shared/types/domain";
import { logger } from "../lib/logger.js";

const NON_TEXT_PATTERNS = /embed|image|tts|audio|speech|whisper|dall|vision|moderation|rerank|code-search/i;

function isTextModel(id: string): boolean {
  return !NON_TEXT_PATTERNS.test(id);
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
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to list models for ${this.id}: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { data: Array<{ id: string }> };
    const ids = data.data.map((m) => m.id).filter((id) => isTextModel(id));
    return ids.sort();
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.baseUrl && !req.baseUrl) this.init();
    const url = `${req.baseUrl ?? this.baseUrl}/chat/completions`;
    const body = {
      model: req.modelId,
      messages: req.messages,
      temperature: req.temperature ?? 0.1,
      max_tokens: req.maxTokens ?? 4096
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

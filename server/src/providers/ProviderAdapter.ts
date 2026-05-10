import type { ProviderId } from "@shared/types/agents";

export interface ChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
  signal?: AbortSignal;
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

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.baseUrl) this.init();
    const url = `${this.baseUrl}/chat/completions`;
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

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const tokenUsage = data.usage
      ? {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens,
          total: data.usage.total_tokens
        }
      : undefined;

    return {
      text: data.choices[0]?.message?.content ?? "",
      ...(tokenUsage ? { tokenUsage } : {}),
      rawResponse: data
    };
  }
}

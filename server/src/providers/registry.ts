import type { ProviderId } from "@shared/types/agents";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "./ProviderAdapter.js";
import { KimiAdapter } from "./kimi.js";
import { GlmAdapter } from "./glm.js";
import { MinimaxAdapter } from "./minimax.js";
import { MimoAdapter } from "./mimo.js";
import { DeepseekAdapter } from "./deepseek.js";
import { GeminiAdapter } from "./gemini.js";
import { QwenAdapter } from "./qwen.js";
import { BedrockAdapter } from "./bedrock.js";
import { OpenRouterAdapter } from "./openrouter.js";
import { OpencodeAdapter } from "./opencode.js";
import { DoubaoAdapter } from "./doubao.js";

const MIMO_MODEL_FALLBACKS = ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni"];
const GEMINI_MODEL_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

const BACKOFF_DELAYS = [500, 1500];
const MAX_RETRIES = 2;
const MAX_TOTAL_ATTEMPTS = 8;
const TIMEOUT_MS = 120_000;

export interface AttemptRecord {
  providerId: ProviderId;
  ok: boolean;
  errorCode?: string;
}

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  constructor() {
    this.register(new KimiAdapter());
    this.register(new GlmAdapter());
    this.register(new MinimaxAdapter());
    this.register(new MimoAdapter());
    this.register(new DeepseekAdapter());
    this.register(new GeminiAdapter());
    this.register(new QwenAdapter());
    this.register(new BedrockAdapter());
    this.register(new OpenRouterAdapter());
    this.register(new OpencodeAdapter());
    this.register(new DoubaoAdapter());
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

/**
    * Execute a chat request with fallback logic.
    * - 429/quota: try next provider (for mimo/gemini, try model fallbacks first)
    * - 5xx/network: exponential backoff retry up to 2 times, then next provider
    * - 401: no retry, no fallback
    * - timeout: treated as network error
    */
  async runWithFallback(
    providerPreference: string[],
    req: ChatRequest,
    mimoModelFallbacks?: string[],
    modelFallbacks?: Partial<Record<string, string[]>>,
    enableModelFallback?: Partial<Record<string, boolean>>,
    providerBaseUrls?: Partial<Record<string, string>>,
    providerApiKeys?: Partial<Record<string, string>>
  ): Promise<{ response: ChatResponse; attempts: AttemptRecord[] }> {
    const attempts: AttemptRecord[] = [];
    let totalAttempts = 0;

    for (const pid of providerPreference) {
      const providerId = pid as ProviderId;
      const adapter = this.adapters.get(pid);
      if (!adapter) {
        attempts.push({ providerId, ok: false, errorCode: "adapter-not-found" });
        continue;
      }

      const providerBaseUrl = providerBaseUrls?.[pid];
      const providerApiKey = providerApiKeys?.[pid];
      const enabled = enableModelFallback?.[pid] ?? true;
      const configuredFallbacks = modelFallbacks?.[pid] ?? (pid === "mimo" ? (mimoModelFallbacks ?? MIMO_MODEL_FALLBACKS) : (pid === "gemini" ? GEMINI_MODEL_FALLBACKS : null));
      // agent 指定了模型 → 先用它，失败再走用户配置的 fallback 顺序
      const models = req.modelId && configuredFallbacks
        ? [req.modelId, ...configuredFallbacks.filter((m) => m !== req.modelId)]
        : configuredFallbacks;

      const buildReq = (base: ChatRequest, overrides: Partial<ChatRequest>): ChatRequest => {
        const result = { ...base, ...overrides };
        if (providerApiKey) {
          result.apiKey = providerApiKey;
        }
        if (providerBaseUrl) {
          result.baseUrl = providerBaseUrl;
        }
        return result;
      };

      if (enabled && models && models.length > 0) {
        for (const modelId of models) {
          totalAttempts++;
          if (totalAttempts > MAX_TOTAL_ATTEMPTS) {
            return {
              response: buildMaxAttemptsError(attempts),
              attempts
            };
          }
          try {
            const result = await this.executeWithRetry(adapter, buildReq(req, { modelId }));
            attempts.push(...result.attempts);
            return { response: result.response, attempts };
          } catch (error) {
            const errInfo = classifyError(error);
            const inner = (error as Error & { attempts?: AttemptRecord[] }).attempts;
            if (inner) attempts.push(...inner);
            else attempts.push({ providerId, ok: false, errorCode: errInfo.code });
            if (errInfo.code === "auth-failed") {
              return { response: buildErrorResponse(errInfo), attempts };
            }
          }
        }
        // All model fallbacks failed, try next provider
        continue;
      }

      totalAttempts++;
      if (totalAttempts > MAX_TOTAL_ATTEMPTS) {
        return {
          response: buildMaxAttemptsError(attempts),
          attempts
        };
      }

      try {
        const result = await this.executeWithRetry(adapter, buildReq(req, {}));
        attempts.push(...result.attempts);
        return { response: result.response, attempts };
      } catch (error) {
        const errInfo = classifyError(error);
        const inner = (error as Error & { attempts?: AttemptRecord[] }).attempts;
        if (inner) attempts.push(...inner);
        else attempts.push({ providerId, ok: false, errorCode: errInfo.code });
        if (errInfo.code === "auth-failed") {
          return { response: buildErrorResponse(errInfo), attempts };
        }
      }
    }

    const attemptSummary = attempts
      .map((a) => `${a.providerId}(${a.errorCode ?? "unknown"})`)
      .join(", ");

    return {
      response: {
        text: "",
        rawResponse: null,
        error: { code: "all-providers-failed", message: `All providers failed: ${attemptSummary}`, retryable: false }
      },
      attempts
    };
  }

  private async executeWithRetry(
    adapter: ProviderAdapter,
    req: ChatRequest
  ): Promise<{ response: ChatResponse; attempts: AttemptRecord[] }> {
    const attempts: AttemptRecord[] = [];
    let lastError: unknown;
    let lastErrInfo: ErrorInfo | undefined;

    const clientSignal = req.signal;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BACKOFF_DELAYS[attempt - 1] ?? 3000);
      }

      try {
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), req.timeoutMs ?? TIMEOUT_MS);

        if (clientSignal?.aborted) {
          throw new Error("Request aborted by client");
        }

        const onClientAbort = () => timeoutController.abort();
        clientSignal?.addEventListener("abort", onClientAbort);

        try {
          const response = await adapter.chat({ ...req, signal: timeoutController.signal });
          attempts.push({ providerId: adapter.id as ProviderId, ok: true });
          return { response, attempts };
        } finally {
          clearTimeout(timeout);
          clientSignal?.removeEventListener("abort", onClientAbort);
        }
      } catch (error) {
        lastError = error;
        lastErrInfo = classifyError(error);
        attempts.push({ providerId: adapter.id as ProviderId, ok: false, errorCode: lastErrInfo.code });

        // Client disconnection — don't waste retries
        if (clientSignal?.aborted) {
          (error as Error & { attempts: AttemptRecord[] }).attempts = [...attempts];
          throw error;
        }

        if (lastErrInfo.code === "auth-failed" || lastErrInfo.code === "quota-exceeded" || lastErrInfo.code === "bad-request") {
          (error as Error & { attempts: AttemptRecord[] }).attempts = [...attempts];
          throw error;
        }
      }
    }

    (lastError as Error & { attempts: AttemptRecord[] }).attempts = [...attempts];
    throw lastError;
  }
}

interface ErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

function classifyError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 401) {
      return { code: "auth-failed", message: error.message, retryable: false };
    }
    if (status === 400) {
      return { code: "bad-request", message: error.message, retryable: false };
    }
    if (status === 429) {
      return { code: "quota-exceeded", message: error.message, retryable: true };
    }
    if (status && status >= 500) {
      return { code: "server-error", message: error.message, retryable: true };
    }
    if (error.name === "AbortError") {
      // Client disconnection also triggers AbortError — don't retry those
      return { code: "timeout", message: "Request timed out", retryable: true };
    }
    return { code: "network-error", message: error.message, retryable: true };
  }
  return { code: "unknown-error", message: String(error), retryable: false };
}

function buildErrorResponse(errInfo: ErrorInfo): ChatResponse {
  return {
    text: "",
    rawResponse: null,
    error: { code: errInfo.code, message: errInfo.message, retryable: errInfo.retryable }
  };
}

function buildMaxAttemptsError(attempts: AttemptRecord[]): ChatResponse {
  const summary = attempts
    .map((a) => `${a.providerId}(${a.errorCode ?? "unknown"})`)
    .join(", ");
  return {
    text: "",
    rawResponse: null,
    error: {
      code: "max-attempts-reached",
      message: `Max total attempts (${MAX_TOTAL_ATTEMPTS}) reached: ${summary}`,
      retryable: false
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const registry = new ProviderRegistry();

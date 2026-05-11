import type { ProviderId } from "@shared/types/agents";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "./ProviderAdapter.js";
import { KimiAdapter } from "./kimi.js";
import { GlmAdapter } from "./glm.js";
import { MinimaxAdapter } from "./minimax.js";
import { MimoAdapter } from "./mimo.js";
import { DeepseekAdapter } from "./deepseek.js";
import { GeminiAdapter } from "./gemini.js";

const MIMO_MODEL_FALLBACKS = ["MiMo-V2.5-Pro", "MiMo-V2.5", "MiMo-V2-Pro", "MiMo-V2-Omni"];
const GEMINI_MODEL_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

const BACKOFF_DELAYS = [500, 1500, 3000];
const MAX_RETRIES = 2;
const TIMEOUT_MS = 60_000;

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
    mimoModelFallbacks?: string[]
  ): Promise<{ response: ChatResponse; attempts: AttemptRecord[] }> {
    const attempts: AttemptRecord[] = [];

    for (const pid of providerPreference) {
      const providerId = pid as ProviderId;
      const adapter = this.adapters.get(pid);
      if (!adapter) {
        attempts.push({ providerId, ok: false, errorCode: "adapter-not-found" });
        continue;
      }

      // For mimo, try model fallbacks first
      if (pid === "mimo") {
        const models = mimoModelFallbacks ?? MIMO_MODEL_FALLBACKS;
        for (const modelId of models) {
          try {
            const response = await this.executeWithRetry(adapter, { ...req, modelId });
            attempts.push({ providerId, ok: true });
            return { response, attempts };
          } catch (error) {
            const errInfo = classifyError(error);
            attempts.push({ providerId, ok: false, errorCode: errInfo.code });
            if (errInfo.code === "auth-failed") {
              return { response: buildErrorResponse(errInfo), attempts };
            }
            if (errInfo.code === "quota-exceeded") {
              break; // Try next provider
            }
            // For other errors, try next model
          }
        }
        continue;
      }

      // For gemini, try model fallbacks first
      if (pid === "gemini") {
        const models = GEMINI_MODEL_FALLBACKS;
        for (const modelId of models) {
          try {
            const response = await this.executeWithRetry(adapter, { ...req, modelId });
            attempts.push({ providerId, ok: true });
            return { response, attempts };
          } catch (error) {
            const errInfo = classifyError(error);
            attempts.push({ providerId, ok: false, errorCode: errInfo.code });
            if (errInfo.code === "auth-failed") {
              return { response: buildErrorResponse(errInfo), attempts };
            }
            if (errInfo.code === "quota-exceeded") {
              break; // Try next provider
            }
            // For other errors, try next model
          }
        }
        continue;
      }

      try {
        const response = await this.executeWithRetry(adapter, req);
        attempts.push({ providerId, ok: true });
        return { response, attempts };
      } catch (error) {
        const errInfo = classifyError(error);
        attempts.push({ providerId, ok: false, errorCode: errInfo.code });
        if (errInfo.code === "auth-failed") {
          return { response: buildErrorResponse(errInfo), attempts };
        }
        // For other errors, try next provider
      }
    }

    return {
      response: {
        text: "",
        rawResponse: null,
        error: { code: "all-providers-failed", message: "All providers failed", retryable: false }
      },
      attempts
    };
  }

  private async executeWithRetry(
    adapter: ProviderAdapter,
    req: ChatRequest
  ): Promise<ChatResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BACKOFF_DELAYS[attempt - 1] ?? 3000);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await adapter.chat({ ...req, signal: controller.signal });
          return response;
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        const errInfo = classifyError(error);
        if (errInfo.code === "auth-failed" || errInfo.code === "quota-exceeded") {
          throw error;
        }
        // 5xx/network: retry
      }
    }

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
    if (status === 429) {
      return { code: "quota-exceeded", message: error.message, retryable: true };
    }
    if (status && status >= 500) {
      return { code: "server-error", message: error.message, retryable: true };
    }
    if (error.name === "AbortError") {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const registry = new ProviderRegistry();

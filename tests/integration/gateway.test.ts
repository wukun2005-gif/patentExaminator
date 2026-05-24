import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "@server/providers/registry";
import { setApiKey, getApiKey, clearAll, listProviders } from "@server/security/keyStore";
import { sanitizeText } from "@server/security/sanitize";
import { aiRunRequestSchema } from "@server/lib/schemas";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "@server/providers/ProviderAdapter";
import type { ProviderId } from "@shared/types/agents";

// Mock adapter for testing
class MockAdapter implements ProviderAdapter {
  id: ProviderId = "kimi";
  defaultBaseUrl = "https://mock.api";
  private responses: ChatResponse[];
  private callCount = 0;

  constructor(responses: ChatResponse[]) {
    this.responses = responses;
  }

  supportedModels(): string[] {
    return ["mock-model"];
  }

  async chat(_req: ChatRequest): Promise<ChatResponse> {
    const response = this.responses[this.callCount % this.responses.length]!;
    this.callCount++;
    if (response.error) {
      const error = new Error(response.error.message);
      (error as Error & { status: number }).status =
        response.error.code === "auth-failed"
          ? 401
          : response.error.code === "quota-exceeded"
            ? 429
            : 500;
      throw error;
    }
    return response;
  }

  async listModels(): Promise<string[]> {
    return ["mock-model"];
  }
}

// Failing adapter that always throws with a specific status
class FailingAdapter implements ProviderAdapter {
  id: ProviderId = "glm";
  defaultBaseUrl = "https://mock.api";
  private status: number;

  constructor(status: number) {
    this.status = status;
  }

  supportedModels(): string[] {
    return ["mock-model"];
  }

  async chat(_req: ChatRequest): Promise<ChatResponse> {
    const error = new Error(`HTTP ${this.status}`);
    (error as Error & { status: number }).status = this.status;
    throw error;
  }

  async listModels(): Promise<string[]> {
    return [];
  }
}

interface CallBehavior {
  text?: string;
  errorStatus?: number;
  isAbortError?: boolean;
  isNetworkError?: boolean;
}

class SequenceAdapter implements ProviderAdapter {
  id: ProviderId = "gemini";
  defaultBaseUrl = "https://mock.api";
  private callCount = 0;

  constructor(id: ProviderId, private behaviors: CallBehavior[]) {
    this.id = id;
  }

  supportedModels(): string[] { return ["mock"]; }

  async chat(_req: ChatRequest): Promise<ChatResponse> {
    const behavior = this.behaviors[this.callCount % this.behaviors.length]!;
    this.callCount++;

    if (behavior.isAbortError) {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }

    if (behavior.errorStatus) {
      const error = new Error(`HTTP ${behavior.errorStatus}`);
      (error as Error & { status: number }).status = behavior.errorStatus;
      throw error;
    }

    if (behavior.isNetworkError) {
      throw new Error("fetch failed: connect ECONNREFUSED");
    }

    return { text: behavior.text ?? "success", rawResponse: {} };
  }

  async listModels(): Promise<string[]> { return ["mock"]; }

  getCallCount(): number { return this.callCount; }
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    clearAll();
  });

  it("T-GW-001: fallback to next provider on 429", async () => {
    const failingAdapter = new FailingAdapter(429);
    const successAdapter = new MockAdapter([
      { text: "success", rawResponse: {} }
    ]);

    failingAdapter.id = "kimi";
    successAdapter.id = "glm";
    registry.register(failingAdapter);
    registry.register(successAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("success");
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts.some((a) => !a.ok)).toBe(true);
    expect(attempts.some((a) => a.ok)).toBe(true);
  });

  it("T-GW-002: exponential backoff on 5xx", async () => {
    let callCount = 0;
    const adapter: ProviderAdapter = {
      id: "kimi",
      defaultBaseUrl: "https://mock.api",
      supportedModels: () => ["test"],
      async listModels(_apiKey: string): Promise<string[]> { return ["test"]; },
      async chat(_req: ChatRequest): Promise<ChatResponse> {
        callCount++;
        if (callCount <= 2) {
          const error = new Error("Server Error");
          (error as Error & { status: number }).status = 500;
          throw error;
        }
        return { text: "success", rawResponse: {} };
      }
    };

    registry.register(adapter);

    const { response } = await registry.runWithFallback(
      ["kimi"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("success");
    expect(callCount).toBe(3); // 1 initial + 2 retries
  });

  it("T-GW-003: 401 does not retry or fallback", async () => {
    const authFailAdapter = new FailingAdapter(401);
    authFailAdapter.id = "kimi";

    const successAdapter = new MockAdapter([{ text: "success", rawResponse: {} }]);
    successAdapter.id = "glm";

    registry.register(authFailAdapter);
    registry.register(successAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "bad-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("auth-failed");
    // Should not have tried glm
    expect(attempts.every((a) => a.providerId === "kimi")).toBe(true);
  });

  it("T-GW-004: returns error when all providers fail", async () => {
    const adapter1 = new FailingAdapter(500);
    adapter1.id = "kimi";
    const adapter2 = new FailingAdapter(500);
    adapter2.id = "glm";

    registry.register(adapter1);
    registry.register(adapter2);

    const { response } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("all-providers-failed");
  });

  it("T-GW-005: enforces per-agent max total attempts", async () => {
    const ids: ProviderId[] = [];
    for (let i = 0; i < 10; i++) {
      const adapter = new FailingAdapter(500);
      adapter.id = `kimi` as ProviderId;
      registry.register(adapter);
      ids.push(adapter.id);
    }

    const { response, attempts } = await registry.runWithFallback(
      ids,
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("max-attempts-reached");
    expect(attempts.length).toBeLessThanOrEqual(8);
  }, 30000);

  // ── Gemini Model Fallback Tests ──

  it("FW-001: Gemini model fallback chain (4 models fail, 5th succeeds)", async () => {
    const geminiAdapter = new SequenceAdapter("gemini", [
      { errorStatus: 503 },
      { errorStatus: 429 },
      { errorStatus: 500 },
      { isNetworkError: true },
      { text: "fallback-success" },
    ]);
    registry.register(geminiAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("fallback-success");
    expect(attempts.length).toBe(5);
    expect(attempts[0]!.ok).toBe(false);
    expect(attempts[1]!.ok).toBe(false);
    expect(attempts[2]!.ok).toBe(false);
    expect(attempts[3]!.ok).toBe(false);
    expect(attempts[4]!.ok).toBe(true);
    expect(attempts[0]!.errorCode).toBe("server-error");
    expect(attempts[1]!.errorCode).toBe("quota-exceeded");
    expect(attempts[2]!.errorCode).toBe("server-error");
    expect(attempts[3]!.errorCode).toBe("network-error");
    // All 5 are gemini (model fallback within same provider)
    expect(attempts.every((a) => a.providerId === "gemini")).toBe(true);
  });

  it("FW-002: Gemini model fallback on network error (no HTTP status)", async () => {
    const geminiAdapter = new SequenceAdapter("gemini", [
      { isNetworkError: true },
      { isNetworkError: true },
      { text: "recovered" },
    ]);
    registry.register(geminiAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("recovered");
    expect(attempts.length).toBe(3);
    expect(attempts[0]!.errorCode).toBe("network-error");
    expect(attempts[1]!.errorCode).toBe("network-error");
    expect(attempts[2]!.ok).toBe(true);
  });

  it("FW-003: Gemini model fallback on 429 quota (switches model, no same-model retry)", async () => {
    const geminiAdapter = new SequenceAdapter("gemini", [
      { errorStatus: 429 },
      { errorStatus: 429 },
      { text: "quota-recovered" },
    ]);
    registry.register(geminiAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("quota-recovered");
    expect(attempts.length).toBe(3);
    expect(attempts[0]!.errorCode).toBe("quota-exceeded");
    expect(attempts[1]!.errorCode).toBe("quota-exceeded");
    expect(attempts[2]!.ok).toBe(true);
  });

  it("FW-004: Gemini auth error (401) stops entire fallback chain immediately", async () => {
    const geminiAdapter = new SequenceAdapter("gemini", [
      { errorStatus: 503 },
      { errorStatus: 401 },
      { text: "should-not-reach" },
    ]);
    const kimiAdapter = new MockAdapter([{ text: "kimi-success", rawResponse: {} }]);
    kimiAdapter.id = "kimi";
    registry.register(geminiAdapter);
    registry.register(kimiAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini", "kimi"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "bad-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("auth-failed");
    expect(attempts.length).toBe(2);
    expect(attempts[0]!.errorCode).toBe("server-error");
    expect(attempts[1]!.errorCode).toBe("auth-failed");
    // kimi should NOT have been tried
    expect(attempts.every((a) => a.providerId === "gemini")).toBe(true);
  });

  it("FW-005: All Gemini models fail → max-attempts-reached (no provider fallback room)", async () => {
    const geminiAdapter = new FailingAdapter(503);
    geminiAdapter.id = "gemini";
    const bedrockAdapter = new FailingAdapter(503);
    bedrockAdapter.id = "bedrock";
    const kimiAdapter = new FailingAdapter(503);
    kimiAdapter.id = "kimi";
    const glmAdapter = new FailingAdapter(503);
    glmAdapter.id = "glm";
    const deepseekAdapter = new FailingAdapter(503);
    deepseekAdapter.id = "deepseek";
    registry.register(geminiAdapter);
    registry.register(bedrockAdapter);
    registry.register(kimiAdapter);
    registry.register(glmAdapter);
    registry.register(deepseekAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini", "bedrock", "kimi", "glm", "deepseek"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("max-attempts-reached");
    // Gemini 5 + Bedrock 1 + Kimi 1 + GLM 1 + DeepSeek 1 = 9, exceeds MAX_TOTAL_ATTEMPTS=8
    expect(attempts.length).toBe(8);
    expect(attempts.filter((a) => a.providerId === "gemini").length).toBe(5);
    expect(attempts.some((a) => a.providerId === "bedrock")).toBe(true);
  }, 120000);

  it("FW-009: Gemini 5 models fail → Bedrock (qwen) takes over successfully", async () => {
    const geminiAdapter = new FailingAdapter(503);
    geminiAdapter.id = "gemini";
    const bedrockAdapter = new MockAdapter([{ text: "qwen-qwen3-vl-success", rawResponse: {} }]);
    bedrockAdapter.id = "bedrock";
    registry.register(geminiAdapter);
    registry.register(bedrockAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["gemini", "bedrock"],
      { modelId: "gemini-2.5-flash-lite", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("qwen-qwen3-vl-success");
    expect(attempts.length).toBe(6);
    expect(attempts.slice(0, 5).every((a) => a.providerId === "gemini" && !a.ok)).toBe(true);
    expect(attempts[5]!.providerId).toBe("bedrock");
    expect(attempts[5]!.ok).toBe(true);
  });

  // ── executeWithRetry Layer Tests (non-Gemini providers) ──

  it("FW-006: executeWithRetry retries on server error (5xx) within same provider", async () => {
    const adapter = new SequenceAdapter("kimi", [
      { errorStatus: 500 },
      { errorStatus: 503 },
      { text: "retry-success" },
    ]);
    registry.register(adapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("retry-success");
    // 1 initial + 2 retries = 3 internal calls, but only 1 attempt record
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.ok).toBe(true);
    expect(adapter.getCallCount()).toBe(3);
  });

  it("FW-007: executeWithRetry retries on AbortError (timeout) within same provider", async () => {
    const adapter = new SequenceAdapter("kimi", [
      { isAbortError: true },
      { isAbortError: true },
      { text: "timeout-recovered" },
    ]);
    registry.register(adapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("timeout-recovered");
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.ok).toBe(true);
    expect(adapter.getCallCount()).toBe(3);
  });

  it("FW-008: executeWithRetry does NOT retry on 429 (quota), bubbles up for provider fallback", async () => {
    const kimiAdapter = new SequenceAdapter("kimi", [
      { errorStatus: 429 },
    ]);
    const glmAdapter = new MockAdapter([{ text: "glm-success", rawResponse: {} }]);
    glmAdapter.id = "glm";
    registry.register(kimiAdapter);
    registry.register(glmAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.text).toBe("glm-success");
    expect(attempts.length).toBe(2);
    expect(attempts[0]!.providerId).toBe("kimi");
    expect(attempts[0]!.errorCode).toBe("quota-exceeded");
    // kimi adapter was called only once (no retry on 429)
    expect(kimiAdapter.getCallCount()).toBe(1);
    expect(attempts[1]!.providerId).toBe("glm");
    expect(attempts[1]!.ok).toBe(true);
  });

  it("T-GW-BG12-001: 所有 provider 均返回 quota-exceeded → all-providers-failed", async () => {
    const kimiAdapter = new FailingAdapter(429);
    kimiAdapter.id = "kimi";
    const glmAdapter = new FailingAdapter(429);
    glmAdapter.id = "glm";
    registry.register(kimiAdapter);
    registry.register(glmAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("all-providers-failed");
    expect(attempts.length).toBe(2);
    expect(attempts.every((a) => a.errorCode === "quota-exceeded")).toBe(true);
    expect(attempts.every((a) => !a.ok)).toBe(true);
  });

  it("T-GW-BG12-002: 所有 provider 均为 quota-exceeded，response.error.message 包含 quota 关键词", async () => {
    const kimiAdapter = new FailingAdapter(429);
    kimiAdapter.id = "kimi";
    const glmAdapter = new FailingAdapter(429);
    glmAdapter.id = "glm";
    registry.register(kimiAdapter);
    registry.register(glmAdapter);

    const { response } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.message).toContain("quota-exceeded");
  });

  it("T-GW-BG12-003: 混合场景 - 一个 provider quota-exceeded，另一个 auth-failed → auth-failed 优先", async () => {
    const kimiAdapter = new FailingAdapter(429);
    kimiAdapter.id = "kimi";
    const glmAdapter = new FailingAdapter(401);
    glmAdapter.id = "glm";
    registry.register(kimiAdapter);
    registry.register(glmAdapter);

    const { response, attempts } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("auth-failed");
    expect(attempts.length).toBe(2);
    expect(attempts[0]!.errorCode).toBe("quota-exceeded");
    expect(attempts[1]!.errorCode).toBe("auth-failed");
  });
});

describe("sanitize", () => {
  it("removes email addresses", () => {
    const result = sanitizeText("Contact user@example.com for details");
    expect(result).toBe("Contact [EMAIL] for details");
  });

  it("removes phone numbers", () => {
    const result = sanitizeText("Call 13812345678 now");
    expect(result).toBe("Call [PHONE] now");
  });

  it("removes API keys", () => {
    const result = sanitizeText("Key: sk-abcdefghijklmnopqrstuvwxyz");
    expect(result).toBe("Key: [API_KEY]");
  });

  it("applies custom rules", () => {
    const result = sanitizeText("ID: ABC-12345", [{ pattern: "ABC-\\d+", replace: "[ID]" }]);
    expect(result).toBe("ID: [ID]");
  });
});

describe("aiRunRequestSchema", () => {
  it("validates correct request", () => {
    const result = aiRunRequestSchema.safeParse({
      agent: "claim-chart",
      providerPreference: ["mimo"],
      modelId: "MiMo-V2.5-Pro",
      prompt: "Analyze this claim",
      sanitized: true,
      metadata: { caseId: "test", moduleScope: "claim-chart", tokenEstimate: 100 }
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = aiRunRequestSchema.safeParse({
      agent: "claim-chart",
      providerPreference: ["mimo"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent", () => {
    const result = aiRunRequestSchema.safeParse({
      agent: "invalid-agent",
      providerPreference: ["mimo"],
      modelId: "test",
      prompt: "test",
      sanitized: true,
      metadata: { caseId: "test", moduleScope: "test", tokenEstimate: 0 }
    });
    expect(result.success).toBe(false);
  });
});

describe("keyStore", () => {
  beforeEach(() => {
    clearAll();
  });

  it("stores and retrieves API keys", () => {
    setApiKey("mimo", "tp-test123");
    expect(getApiKey("mimo")).toBe("tp-test123");
  });

  it("lists providers with keys", () => {
    setApiKey("mimo", "tp-test123");
    setApiKey("kimi", "sk-test456");
    const providers = listProviders();
    expect(providers).toContain("mimo");
    expect(providers).toContain("kimi");
  });
});

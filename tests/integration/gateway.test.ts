import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "@server/providers/registry";
import { setApiKey, getApiKey, clearAll, listProviders } from "@server/security/keyStore";
import { sanitizeText } from "@server/security/sanitize";
import { aiRunRequestSchema } from "@server/lib/schemas";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "@server/providers/ProviderAdapter";

// Mock adapter for testing
class MockAdapter implements ProviderAdapter {
  id: "kimi" = "kimi";
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
}

// Failing adapter that always throws with a specific status
class FailingAdapter implements ProviderAdapter {
  id: "glm" = "glm";
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

    failingAdapter.id = "kimi" as "kimi";
    successAdapter.id = "glm" as "glm";
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
    authFailAdapter.id = "kimi" as "kimi";

    const successAdapter = new MockAdapter([{ text: "success", rawResponse: {} }]);
    successAdapter.id = "glm" as "glm";

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
    adapter1.id = "kimi" as "kimi";
    const adapter2 = new FailingAdapter(500);
    adapter2.id = "glm" as "glm";

    registry.register(adapter1);
    registry.register(adapter2);

    const { response } = await registry.runWithFallback(
      ["kimi", "glm"],
      { modelId: "test", messages: [{ role: "user", content: "test" }], apiKey: "test-key" }
    );

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe("all-providers-failed");
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

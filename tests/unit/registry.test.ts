import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderRegistry } from "@server/providers/registry";
import type { ProviderAdapter, ChatRequest, ChatResponse } from "@server/providers/ProviderAdapter";
import type { ProviderId } from "@shared/types/agents";

function createMockAdapter(id: string, chatFn?: (req: ChatRequest) => Promise<ChatResponse>): ProviderAdapter {
  return {
    id: id as ProviderId,
    defaultBaseUrl: `https://api.${id}.com/v1`,
    supportedModels: () => [`${id}-model-1`, `${id}-model-2`],
    listModels: vi.fn().mockResolvedValue([`${id}-model-1`, `${id}-model-2`]),
    chat: chatFn ?? vi.fn().mockResolvedValue({
      text: "response from " + id,
      rawResponse: {},
      tokenUsage: { input: 100, output: 50, total: 150 }
    })
  };
}

function createErrorAdapter(id: string, error: Error): ProviderAdapter {
  return createMockAdapter(id, vi.fn().mockRejectedValue(error));
}

function createHttpError(status: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { status: number }).status = status;
  return error;
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe("basic operations", () => {
    it("TC-REG-001: register and get adapter", () => {
      const adapter = createMockAdapter("test-provider");
      registry.register(adapter);

      expect(registry.get("test-provider")).toBe(adapter);
    });

    it("TC-REG-002: get non-existent adapter returns undefined", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("TC-REG-003: overwrite adapter registration", () => {
      const adapter1 = createMockAdapter("test");
      const adapter2 = createMockAdapter("test");

      registry.register(adapter1);
      registry.register(adapter2);

      expect(registry.get("test")).toBe(adapter2);
    });
  });

  describe("runWithFallback", () => {
    const baseReq: ChatRequest = {
      modelId: "model-1",
      messages: [{ role: "user", content: "test" }],
      apiKey: "test-key"
    };

    it("TC-REG-004: successful call on first provider", async () => {
      const adapter = createMockAdapter("primary");
      registry.register(adapter);

      const result = await registry.runWithFallback(["primary"], baseReq);

      expect(result.response.text).toBe("response from primary");
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]!.ok).toBe(true);
      expect(result.attempts[0]!.providerId).toBe("primary");
    });

    it("TC-REG-005: fallback to second provider on 5xx", async () => {
      const failing = createErrorAdapter("failing", createHttpError(500, "Server Error"));
      const success = createMockAdapter("success");

      registry.register(failing);
      registry.register(success);

      const result = await registry.runWithFallback(["failing", "success"], baseReq);

      // Should have retried failing (MAX_RETRIES=2 times) then fallen back to success
      expect(result.response.text).toBe("response from success");
      expect(result.attempts.some(a => a.providerId === ("success" as ProviderId) && a.ok)).toBe(true);
    });

    it("TC-REG-006: 401 stops all retries and fallback", async () => {
      const authFail = createErrorAdapter("auth-fail", createHttpError(401, "Unauthorized"));
      const fallback = createMockAdapter("fallback");

      registry.register(authFail);
      registry.register(fallback);

      const result = await registry.runWithFallback(["auth-fail", "fallback"], baseReq);

      // 401 should stop immediately, no fallback
      expect(result.response.error?.code).toBe("auth-failed");
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]!.errorCode).toBe("auth-failed");
    });

    it("TC-REG-007: 429 triggers provider fallback", async () => {
      const quotaExceeded = createErrorAdapter("quota", createHttpError(429, "Rate Limited"));
      const success = createMockAdapter("success");

      registry.register(quotaExceeded);
      registry.register(success);

      const result = await registry.runWithFallback(["quota", "success"], baseReq);

      expect(result.response.text).toBe("response from success");
    });

    it("TC-REG-008: all providers fail", async () => {
      const fail1 = createErrorAdapter("fail1", createHttpError(500, "Error 1"));
      const fail2 = createErrorAdapter("fail2", createHttpError(500, "Error 2"));

      registry.register(fail1);
      registry.register(fail2);

      const result = await registry.runWithFallback(["fail1", "fail2"], baseReq);

      expect(result.response.error?.code).toBe("all-providers-failed");
      expect(result.attempts.length).toBeGreaterThan(0);
    });

    it("TC-REG-009: unknown adapter skipped", async () => {
      const success = createMockAdapter("success");
      registry.register(success);

      const result = await registry.runWithFallback(["nonexistent", "success"], baseReq);

      expect(result.response.text).toBe("response from success");
      expect(result.attempts[0]!.errorCode).toBe("adapter-not-found");
    });

    it("TC-REG-010: model fallback for mimo provider", async () => {
      let callCount = 0;
      const mimoAdapter = createMockAdapter("mimo", vi.fn().mockImplementation(async (req) => {
        callCount++;
        if (req.modelId === "mimo-v2.5-pro") {
          throw createHttpError(500, "Model unavailable");
        }
        return {
          text: `response from mimo model ${req.modelId}`,
          rawResponse: {},
          tokenUsage: { input: 100, output: 50, total: 150 }
        };
      }));

      registry.register(mimoAdapter);

      // req.modelId 被插到 fallback 列表前面，所以这里用 mimo-v2.5-pro 作为初始模型
      const result = await registry.runWithFallback(
        ["mimo"],
        { ...baseReq, modelId: "mimo-v2.5-pro" },
        ["mimo-v2.5-pro", "mimo-v2.5"]
      );

      expect(result.response.text).toContain("mimo-v2.5");
      expect(callCount).toBeGreaterThan(1);
    });

    it("TC-REG-011: MAX_TOTAL_ATTEMPTS stops execution", async () => {
      // Create adapters that fail immediately (no retry delay)
      const failAdapter = createMockAdapter("fail", vi.fn().mockRejectedValue(createHttpError(429, "Rate Limited")));
      registry.register(failAdapter);

      // Create many providers to exceed MAX_TOTAL_ATTEMPTS (8)
      const providers = Array.from({ length: 10 }, () => "fail");

      const result = await registry.runWithFallback(providers, baseReq);

      // Should stop after MAX_TOTAL_ATTEMPTS (429 doesn't retry, so each attempt is 1)
      expect(result.response.error?.code).toBe("max-attempts-reached");
      expect(result.attempts.length).toBeLessThanOrEqual(10);
    }, 10000);
  });

  describe("error classification", () => {
    const baseReq: ChatRequest = {
      modelId: "model-1",
      messages: [{ role: "user", content: "test" }],
      apiKey: "test-key"
    };

    it("TC-REG-012: network error retries then fallback", async () => {
      const networkError = new Error("ECONNREFUSED");
      const failAdapter = createErrorAdapter("fail", networkError);
      const successAdapter = createMockAdapter("success");

      registry.register(failAdapter);
      registry.register(successAdapter);

      const result = await registry.runWithFallback(["fail", "success"], baseReq);

      expect(result.response.text).toBe("response from success");
    });

    it("TC-REG-013: AbortError treated as timeout", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";

      const failAdapter = createErrorAdapter("fail", abortError);
      const successAdapter = createMockAdapter("success");

      registry.register(failAdapter);
      registry.register(successAdapter);

      const result = await registry.runWithFallback(["fail", "success"], baseReq);

      // Should fallback after timeout
      expect(result.response.text).toBe("response from success");
    });

    it("TC-REG-014: unknown error stops retries", async () => {
      const unknownError = "string error"; // not an Error instance
      const failAdapter = createMockAdapter("fail", vi.fn().mockRejectedValue(unknownError));
      const successAdapter = createMockAdapter("success");

      registry.register(failAdapter);
      registry.register(successAdapter);

      const result = await registry.runWithFallback(["fail", "success"], baseReq);

      // Should fallback
      expect(result.response.text).toBe("response from success");
    });
  });

  describe("retry behavior", () => {
    const baseReq: ChatRequest = {
      modelId: "model-1",
      messages: [{ role: "user", content: "test" }],
      apiKey: "test-key"
    };

    it("TC-REG-015: retries on 5xx errors", async () => {
      let attempts = 0;
      const adapter = createMockAdapter("retry-test", vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) {
          throw createHttpError(503, "Service Unavailable");
        }
        return {
          text: "success after retries",
          rawResponse: {},
          tokenUsage: { input: 100, output: 50, total: 150 }
        };
      }));

      registry.register(adapter);

      const result = await registry.runWithFallback(["retry-test"], baseReq);

      expect(result.response.text).toBe("success after retries");
      expect(attempts).toBe(3); // 1 initial + 2 retries
    });

    it("TC-REG-016: no retry on 401", async () => {
      let attempts = 0;
      const adapter = createMockAdapter("no-retry", vi.fn().mockImplementation(async () => {
        attempts++;
        throw createHttpError(401, "Unauthorized");
      }));

      registry.register(adapter);

      const result = await registry.runWithFallback(["no-retry"], baseReq);

      expect(result.response.error?.code).toBe("auth-failed");
      expect(attempts).toBe(1); // No retries for 401
    });

    it("TC-REG-017: client abort stops retries", async () => {
      let attempts = 0;
      const controller = new AbortController();

      const adapter = createMockAdapter("abort-test", vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          controller.abort();
          throw new Error("Request aborted by client");
        }
        return { text: "should not reach", rawResponse: {} };
      }));

      registry.register(adapter);

      const reqWithSignal = { ...baseReq, signal: controller.signal };

      await registry.runWithFallback(["abort-test"], reqWithSignal);

      // Should stop after client abort
      expect(attempts).toBe(1);
    });
  });
});

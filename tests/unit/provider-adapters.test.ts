/**
 * Unit tests for server/src/providers/* adapters.
 *
 * Covers:
 * - OpenAICompatibleAdapter (base class for most providers)
 * - All concrete adapters: supportedModels() non-empty, id set
 * - resolveMaxTokens utility
 *
 * Test strategy: mock global fetch to avoid real HTTP calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChatRequest } from "@server/providers/ProviderAdapter.js";
import { OpenAICompatibleAdapter, resolveMaxTokens, isReasoningModel, learnThinkingCapability, clearThinkingCache } from "@server/providers/ProviderAdapter.js";
import { getModelCapabilities } from "@server/providers/model-capabilities-registry.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Suppress logger noise in tests
vi.mock("@server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// Helper to create a mock Response
function mockResponse(init: {
  status?: number;
  body?: unknown;
  text?: string;
}): Response {
  const status = init.status ?? 200;
  const bodyStr = init.text ?? JSON.stringify(init.body ?? {});
  return new Response(bodyStr, {
    status,
    headers: { "content-type": "application/json" }
  });
}

// Standard chat request for tests
function makeChatRequest(overrides?: Partial<ChatRequest>): ChatRequest {
  return {
    modelId: "test-model",
    messages: [{ role: "user", content: "Hello" }],
    apiKey: "test-key",
    ...overrides
  };
}

// Standard OpenAI-compatible success response
const OPENAI_SUCCESS = {
  choices: [{ message: { content: "Hello from AI" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
};

// Concrete test adapter
class TestAdapter extends OpenAICompatibleAdapter {
  id = "kimi" as const;
  defaultBaseUrl = "https://test.api/v1";
  supportedModels() { return ["test-model"]; }
}

// ──────────────────────────────────────────────────
// 1. All concrete adapters: basic sanity checks
// ──────────────────────────────────────────────────

describe("All Provider Adapters — basic sanity", () => {
  const adapterModules = [
    { name: "deepseek", mod: () => import("@server/providers/deepseek.js") },
    { name: "glm", mod: () => import("@server/providers/glm.js") },
    { name: "kimi", mod: () => import("@server/providers/kimi.js") },
    { name: "mimo", mod: () => import("@server/providers/mimo.js") },
    { name: "minimax", mod: () => import("@server/providers/minimax.js") },
    { name: "opencode", mod: () => import("@server/providers/opencode.js") },
    { name: "openrouter", mod: () => import("@server/providers/openrouter.js") },
    { name: "qwen", mod: () => import("@server/providers/qwen.js") },
    { name: "gemini", mod: () => import("@server/providers/gemini.js") },
    { name: "bedrock", mod: () => import("@server/providers/bedrock.js") },
  ];

  for (const { name, mod } of adapterModules) {
    describe(name, () => {
      it(`${name}: has non-empty id`, async () => {
        const m = await mod();
        const AdapterClass = Object.values(m).find(
          (v) => typeof v === "function" && v.prototype?.supportedModels
        ) as (new () => { id: string }) | undefined;
        expect(AdapterClass).toBeDefined();
        const adapter = new AdapterClass!();
        expect(adapter.id).toBeTruthy();
        expect(typeof adapter.id).toBe("string");
      });

      it(`${name}: supportedModels() returns non-empty array`, async () => {
        const m = await mod();
        const AdapterClass = Object.values(m).find(
          (v) => typeof v === "function" && v.prototype?.supportedModels
        ) as (new () => { supportedModels(): string[] }) | undefined;
        expect(AdapterClass).toBeDefined();
        const adapter = new AdapterClass!();
        const models = adapter.supportedModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
        for (const model of models) {
          expect(typeof model).toBe("string");
          expect(model.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

// ──────────────────────────────────────────────────
// 2. OpenAICompatibleAdapter — chat() tests
// ──────────────────────────────────────────────────

describe("OpenAICompatibleAdapter.chat()", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text and tokenUsage on success", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ body: OPENAI_SUCCESS }));

    const result = await adapter.chat(makeChatRequest());

    expect(result.text).toBe("Hello from AI");
    expect(result.tokenUsage).toEqual({ input: 10, output: 5, total: 15 });
    expect(result.rawResponse).toEqual(OPENAI_SUCCESS);
    expect(result.error).toBeUndefined();
  });

  it("throws on 401 (auth-failed)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 401, text: '{"error":"invalid key"}' })
    );

    await expect(adapter.chat(makeChatRequest())).rejects.toThrow(/401/);
  });

  it("throws on 429 (quota-exceeded)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 429, text: '{"error":"rate limited"}' })
    );

    await expect(adapter.chat(makeChatRequest())).rejects.toThrow(/429/);
  });

  it("throws on 500 (server error)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 500, text: "Internal Server Error" })
    );

    await expect(adapter.chat(makeChatRequest())).rejects.toThrow(/500/);
  });

  it("returns empty text when choices missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { choices: [], usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } } })
    );

    const result = await adapter.chat(makeChatRequest());
    expect(result.text).toBe("");
  });

  it("returns empty text when message.content is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { choices: [{ message: { role: "assistant" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } } })
    );

    const result = await adapter.chat(makeChatRequest());
    expect(result.text).toBe("");
  });

  it("handles missing usage gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { choices: [{ message: { content: "hi" }, finish_reason: "stop" }] } })
    );

    const result = await adapter.chat(makeChatRequest());
    expect(result.text).toBe("hi");
    expect(result.tokenUsage).toBeUndefined();
  });

  it("passes Authorization header with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ body: OPENAI_SUCCESS }));

    await adapter.chat(makeChatRequest({ apiKey: "my-secret-key" }));

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers).toHaveProperty("Authorization", "Bearer my-secret-key");
  });

  it("passes baseUrl from request if provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ body: OPENAI_SUCCESS }));

    await adapter.chat(makeChatRequest({ baseUrl: "https://custom.api/v1" }));

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://custom.api/v1/chat/completions");
  });
});

// ──────────────────────────────────────────────────
// 3. OpenAICompatibleAdapter — listModels() tests
// ──────────────────────────────────────────────────

describe("OpenAICompatibleAdapter.listModels()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns model IDs on success", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { data: [{ id: "model-a" }, { id: "model-b" }] } })
    );

    const adapter = new TestAdapter();
    const models = await adapter.listModels("test-key");
    expect(models).toContain("model-a");
    expect(models).toContain("model-b");
  });

  it("throws on 401 without retry", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 401, text: "Unauthorized" })
    );

    const adapter = new TestAdapter();
    await expect(adapter.listModels("bad-key")).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1); // No retry for auth errors
  });
});

// ──────────────────────────────────────────────────
// 4. resolveMaxTokens tests
// ──────────────────────────────────────────────────

describe("resolveMaxTokens", () => {
  it("returns requested maxTokens for normal models", () => {
    // Use a model not matched by reasoning regex (no gemini, mimo, reasoner, etc.)
    expect(resolveMaxTokens("qwen-turbo", 4096)).toBe(4096);
  });

  it("returns 4x for reasoning models (mimo)", () => {
    expect(resolveMaxTokens("mimo-v2.5-pro", 4096)).toBe(16384);
  });

  it("returns 4x for reasoning models (r1)", () => {
    expect(resolveMaxTokens("deepseek-r1", 2048)).toBe(8192);
  });

  it("returns 4x for reasoning models (o1/o3)", () => {
    expect(resolveMaxTokens("o1-preview", 4096)).toBe(16384);
    expect(resolveMaxTokens("o3-mini", 4096)).toBe(16384);
  });

  it("defaults to 4096 when no maxTokens specified", () => {
    // gemini-2.0-flash matches gemini-\d regex → 4x (by design: over-allocate > under-allocate)
    expect(resolveMaxTokens("gemini-2.0-flash")).toBe(16384);
  });

  it("defaults to 16384 for reasoning model when no maxTokens specified", () => {
    expect(resolveMaxTokens("mimo-v2.5-pro")).toBe(16384);
  });

  it("returns 4x for reasoning models (gemini-2.5)", () => {
    expect(resolveMaxTokens("gemini-2.5-flash", 4096)).toBe(16384);
    expect(resolveMaxTokens("gemini-2.5-pro", 4096)).toBe(16384);
  });
});

// ──────────────────────────────────────────────────
// 5. GeminiAdapter — chat() tests (independent implementation)
// ──────────────────────────────────────────────────

describe("GeminiAdapter.chat()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text on success with x-goog-api-key header", async () => {
    const geminiResponse = {
      candidates: [{ content: { parts: [{ text: "Gemini says hello" }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ body: geminiResponse }));

    const { GeminiAdapter } = await import("@server/providers/gemini.js");
    const adapter = new GeminiAdapter();
    const result = await adapter.chat(makeChatRequest({ modelId: "gemini-2.5-flash" }));

    expect(result.text).toBe("Gemini says hello");
    expect(result.tokenUsage).toEqual({ input: 10, output: 5, total: 15 });

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers).toHaveProperty("x-goog-api-key", "test-key");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("throws on 401 with status attached", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 401, text: '{"error":"invalid key"}' })
    );

    const { GeminiAdapter } = await import("@server/providers/gemini.js");
    const adapter = new GeminiAdapter();
    await expect(adapter.chat(makeChatRequest({ modelId: "gemini-2.5-flash" }))).rejects.toThrow(/401/);
  });

  it("throws on 500", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 500, text: "Internal Server Error" })
    );

    const { GeminiAdapter } = await import("@server/providers/gemini.js");
    const adapter = new GeminiAdapter();
    await expect(adapter.chat(makeChatRequest({ modelId: "gemini-2.5-flash" }))).rejects.toThrow(/500/);
  });

  it("constructs correct URL with modelId", async () => {
    const geminiResponse = {
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ body: geminiResponse }));

    const { GeminiAdapter } = await import("@server/providers/gemini.js");
    const adapter = new GeminiAdapter();
    await adapter.chat(makeChatRequest({ modelId: "gemini-2.5-pro" }));

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/models/gemini-2.5-pro:generateContent");
  });
});

// ──────────────────────────────────────────────────
// 6. BedrockAdapter — chat() tests (independent implementation)
// ──────────────────────────────────────────────────

describe("BedrockAdapter.chat()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text on success", async () => {
    const bedrockResponse = {
      choices: [{ message: { content: "Bedrock says hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ body: bedrockResponse }));

    const { BedrockAdapter } = await import("@server/providers/bedrock.js");
    const adapter = new BedrockAdapter();
    const result = await adapter.chat(makeChatRequest({ modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0" }));

    expect(result.text).toBe("Bedrock says hello");
    expect(result.tokenUsage).toEqual({ input: 10, output: 5, total: 15 });
  });

  it("throws on 401", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 401, text: "Unauthorized" })
    );

    const { BedrockAdapter } = await import("@server/providers/bedrock.js");
    const adapter = new BedrockAdapter();
    await expect(adapter.chat(makeChatRequest())).rejects.toThrow(/401/);
  });

  it("throws on 429", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 429, text: "Rate limited" })
    );

    const { BedrockAdapter } = await import("@server/providers/bedrock.js");
    const adapter = new BedrockAdapter();
    await expect(adapter.chat(makeChatRequest())).rejects.toThrow(/429/);
  });
});

// ──────────────────────────────────────────────────
// 6. learnThinkingCapability + isReasoningModel cache
// ──────────────────────────────────────────────────

describe("learnThinkingCapability + isReasoningModel cache", () => {
  beforeEach(() => clearThinkingCache());

  it("caches model as thinking when thinkingTokens > 0", () => {
    expect(isReasoningModel("some-new-model-v1")).toBe(false);
    learnThinkingCapability("some-new-model-v1", 500);
    expect(isReasoningModel("some-new-model-v1")).toBe(true);
  });

  it("does not cache when thinkingTokens is 0 or undefined", () => {
    learnThinkingCapability("gpt-4o", 0);
    expect(isReasoningModel("gpt-4o")).toBe(false);

    learnThinkingCapability("gpt-4o", undefined);
    expect(isReasoningModel("gpt-4o")).toBe(false);
  });

  it("cache takes priority over static capabilities and regex", () => {
    // Use a model NOT matched by regex and NOT in static capabilities
    expect(isReasoningModel("totally-unknown-model-v1")).toBe(false);
    learnThinkingCapability("totally-unknown-model-v1", 100);
    expect(isReasoningModel("totally-unknown-model-v1")).toBe(true);
  });

  it("clearThinkingCache resets all cached entries", () => {
    learnThinkingCapability("model-a", 100);
    learnThinkingCapability("model-b", 200);
    expect(isReasoningModel("model-a")).toBe(true);
    clearThinkingCache();
    // After clear, falls back to static capabilities / regex
    expect(isReasoningModel("model-a")).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// 7. resolveMaxTokens with cache
// ──────────────────────────────────────────────────

describe("resolveMaxTokens with cache", () => {
  beforeEach(() => clearThinkingCache());

  it("returns 4x for cached thinking model", () => {
    learnThinkingCapability("unknown-model-xyz", 100);
    expect(resolveMaxTokens("unknown-model-xyz", 1024)).toBe(4096);
  });

  it("returns base for non-thinking model", () => {
    expect(resolveMaxTokens("gpt-4o", 1024)).toBe(1024);
  });
});

// ──────────────────────────────────────────────────
// 8. ModelCapabilities registry
// ──────────────────────────────────────────────────

describe("getModelCapabilities", () => {
  it("returns reasoning capabilities for gemini-2.5 models", () => {
    const caps = getModelCapabilities("gemini-2.5-flash");
    expect(caps.isReasoning).toBe(true);
    expect(caps.contextWindow).toBe(1_048_576);
    expect(caps.supportsVision).toBe(true);
    expect(caps.systemPromptMode).toBe("parameter");
  });

  it("returns reasoning capabilities for mimo-v2 models", () => {
    const caps = getModelCapabilities("mimo-v2.5-pro");
    expect(caps.isReasoning).toBe(true);
    expect(caps.contextWindow).toBe(1_048_576);
    expect(caps.maxOutputTokens).toBe(131_072);
    expect(caps.supportsVision).toBe(false);
  });

  it("returns non-reasoning for gemini-2.0 models", () => {
    const caps = getModelCapabilities("gemini-2.0-flash");
    expect(caps.isReasoning).toBe(false);
  });

  it("matches OpenRouter prefixed models (longest prefix wins)", () => {
    const caps = getModelCapabilities("anthropic/claude-opus-4-8");
    expect(caps.isReasoning).toBe(true);
    expect(caps.contextWindow).toBe(1_048_576);
    expect(caps.maxOutputTokens).toBe(131_072);
  });

  it("returns default caps for unknown models", () => {
    const caps = getModelCapabilities("totally-unknown-model");
    expect(caps.isReasoning).toBe(false);
    expect(caps.contextWindow).toBe(128_000);
    expect(caps.temperature.supported).toBe(true);
  });

  it("temperature range varies by model", () => {
    const gemini = getModelCapabilities("gemini-2.5-flash");
    expect(gemini.temperature.range).toEqual([0, 2]);

    const mimo = getModelCapabilities("mimo-v2.5-pro");
    expect(mimo.temperature.range).toEqual([0, 1.5]);

    const deepseekReasoner = getModelCapabilities("deepseek-reasoner");
    expect(deepseekReasoner.temperature.supported).toBe(false);
  });

  it("structured output support varies by model", () => {
    const gemini = getModelCapabilities("gemini-2.5-flash");
    expect(gemini.supportsStructuredOutput).toBe(true);

    const mimo = getModelCapabilities("mimo-v2.5-pro");
    expect(mimo.supportsStructuredOutput).toBe(true);
  });

  it("returns reasoning capabilities for doubao-seed-2.0 models", () => {
    const caps = getModelCapabilities("doubao-seed-2-0-pro-260215");
    expect(caps.isReasoning).toBe(true);
    expect(caps.contextWindow).toBe(262_144);
    expect(caps.maxOutputTokens).toBe(131_072);
    expect(caps.supportsVision).toBe(true);
    expect(caps.supportsStructuredOutput).toBe(false);
    expect(caps.systemPromptMode).toBe("message");
  });

  it("doubao-seed-2-0-lite/mini-260215 support structured output", () => {
    const lite = getModelCapabilities("doubao-seed-2-0-lite-260215");
    expect(lite.supportsStructuredOutput).toBe(true);
    const mini = getModelCapabilities("doubao-seed-2-0-mini-260215");
    expect(mini.supportsStructuredOutput).toBe(true);
  });

  it("returns reasoning capabilities for doubao-seed-1.6 models", () => {
    const caps = getModelCapabilities("doubao-seed-1-6-250615");
    expect(caps.isReasoning).toBe(true);
    expect(caps.contextWindow).toBe(262_144);
    expect(caps.maxOutputTokens).toBe(32_768);
    expect(caps.supportsStructuredOutput).toBe(true);
    expect(caps.supportsVision).toBe(true);
  });

  it("doubao-seed-character is non-reasoning", () => {
    const caps = getModelCapabilities("doubao-seed-character-251128");
    expect(caps.isReasoning).toBe(false);
    expect(caps.contextWindow).toBe(131_072);
    expect(caps.supportsVision).toBe(false);
  });

  it("doubao-1-5-vision supports vision", () => {
    const caps = getModelCapabilities("doubao-1-5-vision-pro-32k-250115");
    expect(caps.supportsVision).toBe(true);
    expect(caps.isReasoning).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// 9. Extended regex coverage
// ──────────────────────────────────────────────────

describe("isReasoningModel extended regex", () => {
  beforeEach(() => clearThinkingCache());

  it("matches deepseek-v4 models", () => {
    expect(isReasoningModel("deepseek-v4-flash-free")).toBe(true);
  });

  it("matches kimi-k2 models", () => {
    expect(isReasoningModel("kimi-k2.6")).toBe(true);
  });

  it("matches glm-5 models", () => {
    expect(isReasoningModel("glm-5")).toBe(true);
    expect(isReasoningModel("glm-5.1")).toBe(true);
  });

  it("matches gpt-5 models", () => {
    expect(isReasoningModel("openai/gpt-5.5")).toBe(true);
  });

  it("matches doubao models", () => {
    expect(isReasoningModel("doubao-1.5-pro-32k")).toBe(false);
  });

  it("matches doubao-seed-2.0 models as reasoning", () => {
    expect(isReasoningModel("doubao-seed-2-0-pro-260215")).toBe(true);
    expect(isReasoningModel("doubao-seed-2-0-lite-260215")).toBe(true);
    expect(isReasoningModel("doubao-seed-2-0-mini-260215")).toBe(true);
    expect(isReasoningModel("doubao-seed-2-0-lite-260428")).toBe(true);
    expect(isReasoningModel("doubao-seed-2-0-mini-260428")).toBe(true);
  });

  it("matches doubao-seed-1.6 models as reasoning", () => {
    expect(isReasoningModel("doubao-seed-1-6-250615")).toBe(true);
    expect(isReasoningModel("doubao-seed-1-6-251015")).toBe(true);
    expect(isReasoningModel("doubao-seed-1-6-flash-250828")).toBe(true);
    expect(isReasoningModel("doubao-seed-1-6-vision-250815")).toBe(true);
    expect(isReasoningModel("doubao-seed-code-preview-251028")).toBe(true);
  });

  it("doubao-seed-character is NOT reasoning", () => {
    expect(isReasoningModel("doubao-seed-character-251128")).toBe(false);
  });

  it("matches all gemini-N models (not just 2.5/3.5)", () => {
    expect(isReasoningModel("gemini-3.1-flash-lite-preview")).toBe(true);
    expect(isReasoningModel("gemini-4.0-pro")).toBe(true);
  });
});

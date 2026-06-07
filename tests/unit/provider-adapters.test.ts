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
import { OpenAICompatibleAdapter, resolveMaxTokens } from "@server/providers/ProviderAdapter.js";

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
    expect(resolveMaxTokens("gemini-2.0-flash", 4096)).toBe(4096);
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
    expect(resolveMaxTokens("gemini-2.0-flash")).toBe(4096);
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

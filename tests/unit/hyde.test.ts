/**
 * HyDE (Hypothetical Document Embeddings) 单元测试
 * arXiv:2212.10496 — LLM 生成假设答案用于向量检索，失败时降级为原始 query 检索
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock registry / keyStore / logger（与 groundedness.test.ts 同款模式）
const mockRunWithFallback = vi.fn();

vi.mock("../../server/src/providers/registry.js", () => ({
  registry: { runWithFallback: mockRunWithFallback },
}));
vi.mock("../../server/src/security/keyStore.js", () => ({
  getApiKey: vi.fn(() => "mock-keystore-key"),
}));
vi.mock("../../server/src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateHydeDocument, buildHydePrompt } from "../../server/src/lib/hyde.js";

const HYDE_DOC = "根据专利法第二十二条第三款，创造性是指与现有技术相比，该发明具有突出的实质性特点和显著的进步。判断时采用三步法：确定最接近的现有技术、确定区别特征和实际解决的技术问题、判断要求保护的发明对本领域技术人员是否显而易见。";

function mockSuccess(text: string = HYDE_DOC) {
  mockRunWithFallback.mockResolvedValue({
    response: { text, error: undefined },
    attempts: [],
  });
}

describe("buildHydePrompt", () => {
  it("TC-001: prompt 包含 query 且要求答案文体", () => {
    const { system, user } = buildHydePrompt("创造性的三步法是什么？");
    expect(user).toBe("创造性的三步法是什么？");
    expect(system).toContain("假设性");
    expect(system).toContain("正式文体");
  });
});

describe("generateHydeDocument", () => {
  beforeEach(() => {
    mockRunWithFallback.mockReset();
  });

  it("TC-002: 成功生成假设答案并 trim", async () => {
    mockSuccess(`  ${HYDE_DOC}\n`);
    const doc = await generateHydeDocument("创造性的三步法是什么？", {
      providerPreference: ["gemini"],
      modelId: "gemini-2.0-flash",
    });
    expect(doc).toBe(HYDE_DOC);
    expect(mockRunWithFallback).toHaveBeenCalledTimes(1);
  });

  it("TC-003: 请求体参数正确（temperature/maxTokens/apiKey 映射）", async () => {
    mockSuccess();
    await generateHydeDocument("创造性的三步法是什么？", {
      providerPreference: ["gemini", "mimo"],
      modelId: "gemini-2.0-flash",
    });
    const [providers, chatReq, , , , apiKeys] = mockRunWithFallback.mock.calls[0]!;
    expect(providers).toEqual(["gemini", "mimo"]);
    expect(chatReq.modelId).toBe("gemini-2.0-flash");
    expect(chatReq.temperature).toBe(0.3);
    // 1500 基数：thinking 模型经框架 ×4 得 6000，覆盖 reasoning + 正文
    expect(chatReq.maxTokens).toBe(1500);
    expect(chatReq.messages[1].content).toBe("创造性的三步法是什么？");
    expect(apiKeys).toEqual({ gemini: "mock-keystore-key", mimo: "mock-keystore-key" });
  });

  it("TC-004: 请求体 apiKey 优先于 keyStore（B-041 两类 key 隔离）", async () => {
    mockSuccess();
    await generateHydeDocument("query", {
      providerPreference: ["gemini"],
      apiKey: "dev-test-key-from-env",
    });
    const apiKeys = mockRunWithFallback.mock.calls[0]![5];
    expect(apiKeys).toEqual({ gemini: "dev-test-key-from-env" });
  });

  it("TC-005: LLM 返回 error → 返回 null（降级）", async () => {
    mockRunWithFallback.mockResolvedValue({
      response: { text: "", error: { code: "429", message: "quota exceeded" } },
      attempts: [],
    });
    const doc = await generateHydeDocument("query", { providerPreference: ["gemini"] });
    expect(doc).toBeNull();
  });

  it("TC-006: 生成内容过短（<20字）→ 返回 null", async () => {
    mockSuccess("不知道。");
    const doc = await generateHydeDocument("query", { providerPreference: ["gemini"] });
    expect(doc).toBeNull();
  });

  it("TC-007: registry 抛异常 → 返回 null（不阻断 RAG）", async () => {
    mockRunWithFallback.mockRejectedValue(new Error("network failure"));
    const doc = await generateHydeDocument("query", { providerPreference: ["gemini"] });
    expect(doc).toBeNull();
  });

  it("TC-008: 无 providerPreference → 返回 null 且不调用 LLM", async () => {
    const doc = await generateHydeDocument("query", {});
    expect(doc).toBeNull();
    expect(mockRunWithFallback).not.toHaveBeenCalled();
  });

  it("TC-009: 空 query → 返回 null 且不调用 LLM", async () => {
    const doc = await generateHydeDocument("   ", { providerPreference: ["gemini"] });
    expect(doc).toBeNull();
    expect(mockRunWithFallback).not.toHaveBeenCalled();
  });
});

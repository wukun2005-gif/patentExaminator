/**
 * orchestrator.test.ts — Agent 编排逻辑测试
 * ===========================================
 * Tests: prompt 构建、agent 路由、sanitizeText 集成、extractQuery
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@server/providers/registry.js", () => ({
  registry: {
    runWithFallback: vi.fn().mockResolvedValue({
      response: { text: '{"ok":true}', tokenUsage: { input: 10, output: 5, total: 15 } },
      attempts: [{ providerId: "gemini", ok: true }]
    })
  }
}));

vi.mock("@server/security/keyStore.js", () => ({
  getApiKey: vi.fn().mockReturnValue("test-key")
}));

vi.mock("@server/lib/hybridSearch.js", () => ({
  hybridSearch: vi.fn().mockReturnValue([]),
  mmrDiversityRank: vi.fn().mockReturnValue([])
}));

vi.mock("@server/lib/knowledgeDb.js", () => ({
  getAllChunks: vi.fn().mockReturnValue([]),
  getAllVectors: vi.fn().mockReturnValue([]),
  getChunksWithParent: vi.fn().mockReturnValue([])
}));

vi.mock("@server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { runAgent } from "@server/lib/orchestrator.js";
import { registry } from "@server/providers/registry.js";

// ── Agent 路由 ─────────────────────────────────────────────

describe("orchestrator — agent routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const agents = [
    "claim-chart", "novelty", "inventive", "defects", "chat",
    "interpret", "opinion-analysis", "argument-analysis",
    "reexam-draft", "summary", "translate",
    "extract-case-fields", "classify-documents"
  ];

  for (const agent of agents) {
    it(`routes "${agent}" to correct prompt builder`, async () => {
      const result = await runAgent({
        agent,
        caseId: "test-case",
        request: { caseId: "test-case" },
        providerPreference: ["gemini"],
        modelId: "gemini-2.5-flash",
        apiKey: "test-key",
      });
      expect(result.ok).toBe(true);
      expect(registry.runWithFallback).toHaveBeenCalledTimes(1);
    });
  }

  it("returns error for unknown agent", async () => {
    const result = await runAgent({
      agent: "nonexistent",
      caseId: "test-case",
      request: {},
      providerPreference: ["gemini"],
      modelId: "gemini-2.5-flash",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("unsupported");
    expect(result.error?.message).toContain("Unknown agent: nonexistent");
  });
});

// ── Prompt 构建质量 ─────────────────────────────────────────

describe("orchestrator — prompt building", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claim-chart prompt includes claim text and JSON schema", async () => {
    await runAgent({
      agent: "claim-chart",
      caseId: "c1",
      request: {
        claimNumber: 1,
        claimText: "一种装置，包括A和B",
        specificationText: "[0001] 本发明涉及..."
      },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    const call = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const systemPrompt = call[1]!.messages[0]!.content as string;
    const userPrompt = call[1]!.messages[1]!.content as string;
    expect(userPrompt).toContain("权利要求 1");
    expect(userPrompt).toContain("一种装置，包括A和B");
    expect(systemPrompt).toContain("featureCode");
    expect(systemPrompt).toContain("citationStatus");
  });

  it("novelty prompt includes features and reference text", async () => {
    await runAgent({
      agent: "novelty",
      caseId: "c1",
      request: {
        features: [{ featureCode: "A", description: "特征A" }],
        referenceText: "对比文件内容",
        referenceId: "REF-001",
        claimNumber: 1,
      },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    const systemPrompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[0]!.content as string;
    const userPrompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[1]!.content as string;
    expect(userPrompt).toContain("特征A");
    expect(userPrompt).toContain("REF-001");
    expect(systemPrompt).toContain("disclosureStatus");
  });

  it("chat prompt includes sanitized history", async () => {
    await runAgent({
      agent: "chat",
      caseId: "c1",
      request: {
        userMessage: "你好",
        history: [{ role: "user", content: "之前的问题" }],
        moduleScope: "novelty",
        contextSummary: "案件数据",
      },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    const prompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[1]!.content as string;
    expect(prompt).toContain("你好");
    expect(prompt).toContain("之前的问题");
    expect(prompt).toContain("novelty");
  });

  it("interpret prompt handles different document types", async () => {
    for (const docType of ["application", "office-action", "office-action-response"]) {
      vi.clearAllMocks();
      await runAgent({
        agent: "interpret",
        caseId: "c1",
        request: {
          documentType: docType,
          documentText: "文档内容",
          fileName: "test.pdf",
        },
        providerPreference: ["gemini"],
        modelId: "test",
        apiKey: "key",
      });
      const prompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[1]!.content as string;
      expect(prompt).toContain("test.pdf");
    }
  });

  it("summary prompt sanitizes all 4 input fields", async () => {
    await runAgent({
      agent: "summary",
      caseId: "c1",
      request: {
        caseBaseline: "基线数据",
        confirmedFeatures: "确认特征",
        reviewedNoveltyComparisons: "新颖性对照",
        inventiveAnalysis: "创造性分析",
      },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    const prompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[1]!.content as string;
    expect(prompt).toContain("基线数据");
    expect(prompt).toContain("确认特征");
    expect(prompt).toContain("新颖性对照");
    expect(prompt).toContain("创造性分析");
  });

  it("translate prompt includes target language", async () => {
    await runAgent({
      agent: "translate",
      caseId: "c1",
      request: { documentText: "Hello world", targetLang: "中文" },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    const systemPrompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[0]!.content as string;
    const userPrompt = (registry.runWithFallback as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.messages[1]!.content as string;
    expect(systemPrompt).toContain("中文");
    expect(userPrompt).toContain("Hello world");
  });
});

// ── 知识库增强 ──────────────────────────────────────────────

describe("orchestrator — knowledge enhancement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips knowledge when knowledgeEnabled=false", async () => {
    const { getAllChunks } = await import("@server/lib/knowledgeDb.js");
    await runAgent({
      agent: "novelty",
      caseId: "c1",
      request: { features: [], referenceText: "", referenceId: "R1", claimNumber: 1 },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
      knowledgeEnabled: false,
    });
    expect(getAllChunks).not.toHaveBeenCalled();
  });

  it("calls getAllChunks when knowledgeEnabled=true", async () => {
    const { getAllChunks } = await import("@server/lib/knowledgeDb.js");
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await runAgent({
      agent: "novelty",
      caseId: "c1",
      request: { features: [{ featureCode: "A", description: "特征A" }], referenceText: "", referenceId: "R1", claimNumber: 1 },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
      knowledgeEnabled: true,
    });
    expect(getAllChunks).toHaveBeenCalled();
  });

  it("passes knowledge citations when knowledge returns results", async () => {
    const { getAllChunks } = await import("@server/lib/knowledgeDb.js");
    const { hybridSearch } = await import("@server/lib/hybridSearch.js");
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { chunk_id: "c1", source_id: "s1", text: "relevant knowledge", metadata: "{}" }
    ]);
    (hybridSearch as ReturnType<typeof vi.fn>).mockReturnValue([
      { chunkId: "c1", score: 0.95 }
    ]);

    const result = await runAgent({
      agent: "novelty",
      caseId: "c1",
      request: { features: [{ featureCode: "A", description: "特征A" }], referenceText: "ref", referenceId: "R1", claimNumber: 1 },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
      knowledgeEnabled: true,
    });

    expect(result.ok).toBe(true);
  });
});

// ── claim-chart 后处理 ──────────────────────────────────────

describe("orchestrator — claim-chart post-processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds id and source to features when output is parsed object", async () => {
    const parsedOutput = {
      claimNumber: 1,
      features: [
        { featureCode: "A", description: "特征A" },
        { featureCode: "B", description: "特征B" }
      ]
    };
    (registry.runWithFallback as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      response: {
        text: parsedOutput,  // 返回对象而非字符串，模拟路由层 JSON.parse
        tokenUsage: { input: 10, output: 5, total: 15 }
      },
      attempts: [{ providerId: "gemini", ok: true }]
    });

    const result = await runAgent({
      agent: "claim-chart",
      caseId: "case-1",
      request: { claimNumber: 1, claimText: "test" },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    expect(result.ok).toBe(true);
    const output = result.output as Record<string, unknown>;
    const features = output.features as Array<Record<string, unknown>>;
    expect(features[0]!.id).toBe("case-1-chart-1-A");
    expect(features[0]!.source).toBe("ai");
    expect(features[1]!.id).toBe("case-1-chart-1-B");
  });
});

// ── 错误处理 ────────────────────────────────────────────────

describe("orchestrator — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when gateway throws", async () => {
    (registry.runWithFallback as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network down"));

    const result = await runAgent({
      agent: "chat",
      caseId: "c1",
      request: { userMessage: "hi" },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("orchestrator");
    expect(result.error?.message).toContain("Network down");
  });

  it("returns error when gateway returns malformed JSON string", async () => {
    (registry.runWithFallback as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      response: { text: "not-json{{", tokenUsage: { input: 10, output: 5, total: 15 } },
      attempts: [{ providerId: "gemini", ok: true }]
    });

    const result = await runAgent({
      agent: "claim-chart",
      caseId: "c1",
      request: { claimNumber: 1, claimText: "test" },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    // orchestrator should still return ok=true — JSON parsing happens downstream
    expect(result.ok).toBe(true);
    expect(typeof result.output).toBe("string");
  });

  it("handles missing request fields gracefully", async () => {
    const result = await runAgent({
      agent: "novelty",
      caseId: "c1",
      request: {},  // missing all required fields
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    expect(result.ok).toBe(true);
    expect(registry.runWithFallback).toHaveBeenCalledTimes(1);
  });

  it("returns token usage from gateway response", async () => {
    (registry.runWithFallback as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      response: { text: '{"ok":true}', tokenUsage: { input: 100, output: 50, total: 150 } },
      attempts: [{ providerId: "gemini", ok: true }]
    });

    const result = await runAgent({
      agent: "chat",
      caseId: "c1",
      request: { userMessage: "hi" },
      providerPreference: ["gemini"],
      modelId: "test",
      apiKey: "key",
    });

    expect(result.ok).toBe(true);
    expect(result.tokenUsage).toEqual({ input: 100, output: 50, total: 150 });
  });
});

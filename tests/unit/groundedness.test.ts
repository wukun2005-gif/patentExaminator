/**
 * NF2: Groundedness Detection 单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  splitIntoSentences,
  buildJudgePrompt,
  filterUngrounded,
  extractJudgeJson,
  type JudgeResult,
  type GroundingDoc,
} from "../../server/src/lib/groundednessCheck.js";

// Mock registry for checkGroundedness tests
const mockRunWithFallback = vi.fn();

vi.mock("../../server/src/providers/registry.js", () => ({
  registry: { runWithFallback: mockRunWithFallback },
}));
vi.mock("../../server/src/security/keyStore.js", () => ({
  getApiKey: vi.fn(() => "mock-key"),
}));
vi.mock("../../server/src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("splitIntoSentences", () => {
  it("TC-001: 按中文句号拆分", () => {
    const text = "这是第一句话。这是第二句话。这是第三句话。";
    const result = splitIntoSentences(text);
    expect(result).toEqual([
      "这是第一句话。",
      "这是第二句话。",
      "这是第三句话。",
    ]);
  });

  it("TC-002: 按英文句号拆分", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const result = splitIntoSentences(text);
    expect(result).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);
  });

  it("TC-003: 混合中英文标点", () => {
    const text = "中文句子。English sentence. 最后一个完整的句子！";
    const result = splitIntoSentences(text);
    expect(result).toEqual([
      "中文句子。",
      "English sentence.",
      "最后一个完整的句子！",
    ]);
  });

  it("TC-004: 保留编号段落 [0001]", () => {
    const text = "根据[0001]所述的技术方案。该方案具有创新性。";
    const result = splitIntoSentences(text);
    expect(result[0]).toContain("[0001]");
  });

  it("TC-005: 合并过短句子", () => {
    const text = "这是主要句子。是的。这是后续内容。";
    const result = splitIntoSentences(text);
    // "是的。" 应该被合并到前一个句子
    expect(result.length).toBeLessThan(3);
  });

  it("TC-006: 空文本返回空数组", () => {
    expect(splitIntoSentences("")).toEqual([]);
    expect(splitIntoSentences("   ")).toEqual([]);
  });

  it("TC-007: 单个句子", () => {
    const text = "只有一个句子。";
    const result = splitIntoSentences(text);
    expect(result).toEqual(["只有一个句子。"]);
  });
});

describe("buildJudgePrompt", () => {
  it("TC-008: 包含系统提示和用户提示", () => {
    const sentences = ["句子1。", "句子2。"];
    const docs: GroundingDoc[] = [
      { source: "文档1", excerpt: "内容1" },
    ];
    const { system, user } = buildJudgePrompt(sentences, docs);

    expect(system).toContain("事实核查员");
    expect(system).toContain("grounded");
    expect(system).toContain("ungrounded");
    expect(user).toContain("参考文档");
    expect(user).toContain("文档1");
    expect(user).toContain("[S1] 句子1。");
    expect(user).toContain("[S2] 句子2。");
  });

  it("TC-009: 无参考文档时显示占位符", () => {
    const sentences = ["句子1。"];
    const { user } = buildJudgePrompt(sentences, []);
    expect(user).toContain("（无参考文档）");
  });

  it("TC-010: 包含相似度分数", () => {
    const sentences = ["句子1。"];
    const docs: GroundingDoc[] = [
      { source: "文档1", excerpt: "内容1", score: 0.85 },
    ];
    const { user } = buildJudgePrompt(sentences, docs);
    expect(user).toContain("0.85");
  });
});

describe("filterUngrounded", () => {
  const sentences = ["句子A。", "句子B。", "句子C。"];

  it("TC-011: pass 时保留 grounded 和 not_verifiable", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        { text: "句子B。", verdict: "not_verifiable" },
        { text: "句子C。", verdict: "ungrounded" },
      ],
      groundedRatio: 0.5,
      overallVerdict: "pass",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toContain("句子A。");
    expect(result.output).toContain("句子B。");
    expect(result.output).not.toContain("句子C。");
    expect(result.removedClaims).toHaveLength(1);
    expect(result.removedClaims[0]?.text).toBe("句子C。");
  });

  it("TC-012: partial 时移除 ungrounded 和 not_verifiable", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        { text: "句子B。", verdict: "not_verifiable" },
        { text: "句子C。", verdict: "ungrounded" },
      ],
      groundedRatio: 0.5,
      overallVerdict: "partial",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toContain("句子A。");
    expect(result.output).not.toContain("句子B。");
    expect(result.output).not.toContain("句子C。");
    expect(result.removedClaims).toHaveLength(2);
  });

  it("TC-013: fail 时同样移除 ungrounded", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        { text: "句子B。", verdict: "ungrounded" },
        { text: "句子C。", verdict: "ungrounded" },
      ],
      groundedRatio: 0.33,
      overallVerdict: "fail",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toContain("句子A。");
    expect(result.removedClaims).toHaveLength(2);
  });

  it("TC-014: 全部 grounded 时不移除", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        { text: "句子B。", verdict: "grounded" },
        { text: "句子C。", verdict: "grounded" },
      ],
      groundedRatio: 1,
      overallVerdict: "pass",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toBe("句子A。句子B。句子C。");
    expect(result.removedClaims).toHaveLength(0);
  });

  it("TC-015: 全部 ungrounded 时全部移除", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "ungrounded" },
        { text: "句子B。", verdict: "ungrounded" },
        { text: "句子C。", verdict: "ungrounded" },
      ],
      groundedRatio: 0,
      overallVerdict: "fail",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toBe("");
    expect(result.removedClaims).toHaveLength(3);
  });

  it("TC-016: verdict 映射缺失时保守保留", () => {
    const judgeResult: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        // 句子B 和 句子C 没有 verdict
      ],
      groundedRatio: 1,
      overallVerdict: "pass",
    };

    const result = filterUngrounded("句子A。句子B。句子C。", sentences, judgeResult);
    expect(result.output).toContain("句子A。");
    expect(result.output).toContain("句子B。");
    expect(result.output).toContain("句子C。");
  });
});

describe("extractJudgeJson", () => {
  it("TC-017: 直接解析纯 JSON", () => {
    const json: JudgeResult = {
      claims: [{ text: "句子A。", verdict: "grounded" }],
      groundedRatio: 1,
      overallVerdict: "pass",
    };
    const result = extractJudgeJson(JSON.stringify(json));
    expect(result).not.toBeNull();
    expect(result!.claims).toHaveLength(1);
    expect(result!.overallVerdict).toBe("pass");
  });

  it("TC-018: 从 markdown 代码块中提取 JSON", () => {
    const json: JudgeResult = {
      claims: [{ text: "句子A。", verdict: "ungrounded" }],
      groundedRatio: 0,
      overallVerdict: "fail",
    };
    const text = `这是分析结果：\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n以上是结果。`;
    const result = extractJudgeJson(text);
    expect(result).not.toBeNull();
    expect(result!.overallVerdict).toBe("fail");
  });

  it("TC-019: 从混杂文本中提取 JSON", () => {
    const json: JudgeResult = {
      claims: [
        { text: "句子A。", verdict: "grounded" },
        { text: "句子B。", verdict: "ungrounded" },
      ],
      groundedRatio: 0.5,
      overallVerdict: "partial",
    };
    const text = `根据我的分析，结果如下：${JSON.stringify(json)}希望对你有帮助。`;
    const result = extractJudgeJson(text);
    expect(result).not.toBeNull();
    expect(result!.claims).toHaveLength(2);
    expect(result!.overallVerdict).toBe("partial");
  });

  it("TC-020: 无效 JSON 返回 null", () => {
    expect(extractJudgeJson("这不是JSON")).toBeNull();
    expect(extractJudgeJson("")).toBeNull();
    expect(extractJudgeJson("{ broken json")).toBeNull();
  });

  it("TC-021: JSON 无 claims 字段返回 null", () => {
    expect(extractJudgeJson(JSON.stringify({ groundedRatio: 1 }))).toBeNull();
  });

  it("TC-022: claims 非数组返回 null", () => {
    expect(extractJudgeJson(JSON.stringify({ claims: "not-array", groundedRatio: 1 }))).toBeNull();
  });
});

describe("checkGroundedness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-023: 无 grounding docs 时跳过检查，返回 pass", async () => {
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness("这是回答。");
    expect(result.verdict).toBe("pass");
    expect(result.groundingScore).toBe(1);
    expect(result.removedClaims).toHaveLength(0);
    expect(result.output).toBe("这是回答。");
  });

  it("TC-024: 空回答时跳过检查，返回 pass", async () => {
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness("", [{ source: "doc", excerpt: "content" }]);
    expect(result.verdict).toBe("pass");
  });

  it("TC-025: judge LLM 失败时降级为全部通过", async () => {
    mockRunWithFallback.mockResolvedValueOnce({
      response: { error: { code: "ERROR", message: "fail", retryable: false }, text: "" },
    });
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness(
      "句子A。句子B。",
      [{ source: "doc", excerpt: "content" }],
      undefined,
      { providerPreference: ["gemini"] }
    );
    expect(result.verdict).toBe("pass");
    expect(result.groundingScore).toBe(1);
  });

  it("TC-026: judge 返回无效 JSON 时降级为全部通过", async () => {
    mockRunWithFallback.mockResolvedValueOnce({
      response: { text: "我无法判断", rawResponse: {} },
    });
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness(
      "句子A。",
      [{ source: "doc", excerpt: "content" }],
      undefined,
      { providerPreference: ["gemini"] }
    );
    expect(result.verdict).toBe("pass");
  });

  it("TC-027: judge 返回有效结果时正确过滤", async () => {
    const judgeJson: JudgeResult = {
      claims: [
        { text: "有支撑的句子。", verdict: "grounded" },
        { text: "无支撑的句子。", verdict: "ungrounded" },
      ],
      groundedRatio: 0.5,
      overallVerdict: "partial",
    };
    mockRunWithFallback.mockResolvedValueOnce({
      response: { text: JSON.stringify(judgeJson), rawResponse: {} },
    });
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness(
      "有支撑的句子。无支撑的句子。",
      [{ source: "doc", excerpt: "content" }],
      undefined,
      { providerPreference: ["gemini"] }
    );
    expect(result.verdict).toBe("partial");
    expect(result.output).toContain("有支撑的句子。");
    expect(result.output).not.toContain("无支撑的句子。");
    expect(result.removedClaims).toHaveLength(1);
  });

  it("TC-028: web search citations 也被用作 grounding docs", async () => {
    mockRunWithFallback.mockResolvedValueOnce({
      response: { error: { code: "ERROR", message: "fail", retryable: false }, text: "" },
    });
    const { checkGroundedness } = await import("../../server/src/lib/groundednessCheck.js");
    const result = await checkGroundedness(
      "句子A。",
      undefined,
      [{ url: "https://example.com", title: "Test", snippet: "snippet", engine: "google" }],
      { providerPreference: ["gemini"] }
    );
    // Should attempt to call judge (not skip) since web citations exist
    expect(mockRunWithFallback).toHaveBeenCalled();
    expect(result.verdict).toBe("pass"); // degraded to pass on error
  });
});

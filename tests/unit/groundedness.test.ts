/**
 * NF2: Groundedness Detection 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  splitIntoSentences,
  buildJudgePrompt,
  filterUngrounded,
  type JudgeResult,
  type GroundingDoc,
} from "../../server/src/lib/groundednessCheck.js";

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

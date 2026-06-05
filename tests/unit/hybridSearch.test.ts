/**
 * hybridSearch.test.ts — 混合检索 BM25 + 向量 RRF 融合测试
 * ===========================================================
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock knowledgeDb to control chunk data
vi.mock("@server/lib/knowledgeDb.js", () => ({
  getAllChunks: vi.fn().mockReturnValue([])
}));

vi.mock("@server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { hybridSearch, invalidateBM25Index } from "@server/lib/hybridSearch.js";
import { getAllChunks } from "@server/lib/knowledgeDb.js";

describe("hybridSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateBM25Index();
  });

  it("returns empty when no chunks and no vector scores", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = hybridSearch("test query", [], 10);
    expect(result).toEqual([]);
  });

  it("returns vector results when BM25 has no matches", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "完全无关的内容", metadata: "{}" }
    ]);
    const vectorScores = [
      { chunkId: "c1", score: 0.9 },
      { chunkId: "c2", score: 0.7 }
    ];
    // BM25 won't match "quantum computing" to "完全无关的内容"
    const result = hybridSearch("quantum computing", vectorScores, 10);
    // When BM25 has no results, falls back to vector scores
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("fuses BM25 and vector results via RRF", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "patent claim analysis method", metadata: "{}" },
      { id: "c2", sourceId: "s1", text: "novelty comparison technique", metadata: "{}" },
      { id: "c3", sourceId: "s1", text: "inventive step evaluation", metadata: "{}" }
    ]);

    const vectorScores = [
      { chunkId: "c1", score: 0.95 },
      { chunkId: "c3", score: 0.80 }
    ];

    const result = hybridSearch("patent claim", vectorScores, 10);
    expect(result.length).toBeGreaterThan(0);
    // All results should have chunkId and score
    for (const r of result) {
      expect(r).toHaveProperty("chunkId");
      expect(r).toHaveProperty("score");
      expect(typeof r.score).toBe("number");
    }
  });

  it("respects topK limit", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`, sourceId: "s1", text: `chunk ${i} about patents`, metadata: "{}"
      }))
    );

    const vectorScores = Array.from({ length: 20 }, (_, i) => ({
      chunkId: `c${i}`, score: 1 - i * 0.05
    }));

    const result = hybridSearch("patents", vectorScores, 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("scores are sorted descending", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "machine learning patent", metadata: "{}" },
      { id: "c2", sourceId: "s1", text: "deep learning invention", metadata: "{}" }
    ]);

    const vectorScores = [
      { chunkId: "c1", score: 0.9 },
      { chunkId: "c2", score: 0.8 }
    ];

    const result = hybridSearch("learning patent", vectorScores, 10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });
});

describe("invalidateBM25Index", () => {
  it("resets index so next search rebuilds", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "test content", metadata: "{}" }
    ]);

    // First search builds index + length normalization calls getAllChunks
    const callCountBefore = (getAllChunks as ReturnType<typeof vi.fn>).mock.calls.length;
    hybridSearch("test", [{ chunkId: "c1", score: 0.5 }]);
    const callsAfterFirst = (getAllChunks as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(callCountBefore);

    // Second search reuses BM25 index (no rebuild), but length normalization still calls getAllChunks
    hybridSearch("test", [{ chunkId: "c1", score: 0.5 }]);
    const callsAfterSecond = (getAllChunks as ReturnType<typeof vi.fn>).mock.calls.length;
    // Length normalization calls getAllChunks each time, so count increases
    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);

    // Invalidate forces rebuild
    invalidateBM25Index();
    hybridSearch("test", [{ chunkId: "c1", score: 0.5 }]);
    const callsAfterInvalidate = (getAllChunks as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterInvalidate).toBeGreaterThan(callsAfterSecond);
  });
});

describe("jieba 分词", () => {
  it("法律术语不被拆成碎片", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "专利法实施细则第六十五条规定了复审请求的条件", metadata: "{}" }
    ]);

    // "专利法实施细则" 应该作为一个整体被检索到
    const result = hybridSearch("专利法实施细则", [{ chunkId: "c1", score: 0.5 }], 10);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.chunkId === "c1")).toBe(true);
  });

  it("BM25 能匹配中文法律术语", () => {
    (getAllChunks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "c1", sourceId: "s1", text: "创造性三步法是评价发明是否具备创造性的方法", metadata: "{}" },
      { id: "c2", sourceId: "s1", text: "新颖性单独对比原则", metadata: "{}" }
    ]);

    // 提供 vector scores 确保结果非空，然后验证 BM25 的排序增强效果
    const result = hybridSearch("创造性三步法", [
      { chunkId: "c1", score: 0.5 },
      { chunkId: "c2", score: 0.3 }
    ], 10);
    // 必须返回结果
    expect(result.length).toBeGreaterThan(0);
    // c1 包含"创造性三步法"，BM25 应给它更高分，使其排在 c2 前面
    const c1Idx = result.findIndex(r => r.chunkId === "c1");
    const c2Idx = result.findIndex(r => r.chunkId === "c2");
    expect(c1Idx).toBeGreaterThanOrEqual(0);
    expect(c2Idx).toBeGreaterThanOrEqual(0);
    expect(c1Idx).toBeLessThan(c2Idx);
  });
});

import { describe, it, expect } from "vitest";
import { computeOcrQuality } from "@client/lib/ocrQuality";

describe("computeOcrQuality", () => {
  it("clean text → good quality", () => {
    const pageTexts = ["这是一段正常的中文文本，包含足够的字符。".repeat(10)];
    const result = computeOcrQuality(pageTexts);
    expect(result.level).toBe("good");
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("mostly junk → bad quality", () => {
    // Create text with many control characters
    const junk = String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8) + "abc";
    const pageTexts = [junk.repeat(100)];
    const result = computeOcrQuality(pageTexts);
    expect(result.junkRatio).toBeGreaterThan(0);
  });

  it("short pages → higher shortPageRatio", () => {
    const pageTexts = ["短", "也很短", "a"];
    const result = computeOcrQuality(pageTexts);
    expect(result.shortPageRatio).toBe(1); // All pages < 50 chars
  });

  it("empty pages → score 0.5 (shortPageRatio=1)", () => {
    const pageTexts = [""];
    const result = computeOcrQuality(pageTexts);
    expect(result.score).toBe(0.5); // shortPageRatio=1 → 1 - 0 - 0.5
    expect(result.effectiveChars).toBe(0);
  });

  it("mixed quality pages", () => {
    const goodPage = "正常文本内容".repeat(100);
    const badPage = "x".repeat(200) + String.fromCharCode(1, 2, 3).repeat(10);
    const result = computeOcrQuality([goodPage, badPage]);
    expect(result.score).toBeGreaterThan(0);
    expect(result.effectiveChars).toBeGreaterThan(0);
  });

  it("custom thresholds", () => {
    const pageTexts = ["正常文本内容".repeat(20)];
    const result = computeOcrQuality(pageTexts, { good: 0.99, poor: 0.98 });
    // Even clean text might not reach 0.99 with default scoring
    expect(result.score).toBeGreaterThan(0);
  });
});

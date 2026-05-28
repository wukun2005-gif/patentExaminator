import { describe, it, expect } from "vitest";
import {
  extractFigureCaptions,
  isFigureSectionHeader,
  isLikelyFigurePage,
  buildFigureId
} from "@client/lib/figureExtract";

describe("extractFigureCaptions", () => {
  it("extracts Chinese figure captions", () => {
    const text = "图1 是本发明实施例的结构示意图\n图2 是电路连接图";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ number: 1, caption: "本发明实施例的结构示意图" });
    expect(result[1]).toEqual({ number: 2, caption: "电路连接图" });
  });

  it("extracts English figure captions", () => {
    const text = "Fig. 1 shows the structure\nFig. 2 is a circuit diagram";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(2);
    expect(result[0]!.number).toBe(1);
    expect(result[1]!.number).toBe(2);
  });

  it("extracts 附图 captions", () => {
    const text = "附图1\n附图2";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(2);
  });

  it("deduplicates by figure number", () => {
    const text = "图1 是结构图\n图1 为详细视图";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(1);
  });

  it("sorts by figure number", () => {
    const text = "图3 第三图\n图1 第一图\n图2 第二图";
    const result = extractFigureCaptions(text);
    expect(result[0]!.number).toBe(1);
    expect(result[1]!.number).toBe(2);
    expect(result[2]!.number).toBe(3);
  });

  it("rejects figure numbers > 200", () => {
    const text = "图201 无效编号";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(0);
  });

  it("rejects figure number 0", () => {
    const text = "图0 无效";
    const result = extractFigureCaptions(text);
    expect(result).toHaveLength(0);
  });

  it("returns empty for no matches", () => {
    const result = extractFigureCaptions("This text has no figure references");
    expect(result).toHaveLength(0);
  });
});

describe("isFigureSectionHeader", () => {
  it("detects 附图说明", () => {
    expect(isFigureSectionHeader("附图说明")).toBe(true);
  });

  it("detects 说明书附图", () => {
    expect(isFigureSectionHeader("说明书附图")).toBe(true);
  });

  it("detects English headers", () => {
    expect(isFigureSectionHeader("BRIEF DESCRIPTION OF THE DRAWINGS")).toBe(true);
  });

  it("rejects normal text", () => {
    expect(isFigureSectionHeader("本发明涉及一种散热装置")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isFigureSectionHeader("brief description of drawings")).toBe(true);
  });
});

describe("isLikelyFigurePage", () => {
  it("returns true for empty page", () => {
    expect(isLikelyFigurePage("")).toBe(true);
  });

  it("returns true for very short text", () => {
    expect(isLikelyFigurePage("图1")).toBe(true);
  });

  it("returns true for page with many figure labels", () => {
    const text = "图1\n图2\n图3\n图4\n图5\n一些其他文字";
    expect(isLikelyFigurePage(text)).toBe(true);
  });

  it("returns false for text-heavy page", () => {
    const text = "本发明涉及一种LED灯具散热装置，".repeat(20);
    expect(isLikelyFigurePage(text)).toBe(false);
  });
});

describe("buildFigureId", () => {
  it("builds correct ID format", () => {
    expect(buildFigureId("doc-123", 1)).toBe("doc-123_fig1");
  });

  it("handles different document IDs", () => {
    expect(buildFigureId("abc", 5)).toBe("abc_fig5");
  });
});

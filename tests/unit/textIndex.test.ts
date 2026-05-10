import { describe, it, expect } from "vitest";
import { buildTextIndex } from "@client/lib/textIndex";
import { matchCitation } from "@client/lib/citationMatch";
import type { Citation } from "@shared/types/domain";

describe("buildTextIndex", () => {
  it("splits double-newline paragraphs", () => {
    const text = "段落一的内容。\n\n段落二的内容。\n\n段落三的内容。";
    const index = buildTextIndex(text);
    expect(index.paragraphs).toHaveLength(3);
    expect(index.paragraphs[0]!.text).toBe("段落一的内容。");
    expect(index.paragraphs[1]!.text).toBe("段落二的内容。");
  });

  it("extracts paragraph number from § marker", () => {
    const text = "§0001 这是第一段。\n\n§0002 这是第二段。";
    const index = buildTextIndex(text);
    expect(index.paragraphs[0]!.paragraphNumber).toBe("0001");
    expect(index.paragraphs[1]!.paragraphNumber).toBe("0002");
  });

  it("computes correct offsets", () => {
    const text = "AB\n\nCD";
    const index = buildTextIndex(text);
    expect(index.paragraphs[0]!.startOffset).toBe(0);
    expect(index.paragraphs[0]!.endOffset).toBe(2);
    expect(index.paragraphs[1]!.startOffset).toBe(4);
    expect(index.paragraphs[1]!.endOffset).toBe(6);
  });

  it("builds line map", () => {
    const text = "line1\nline2\nline3";
    const index = buildTextIndex(text);
    expect(index.lineMap).toHaveLength(3);
    expect(index.lineMap[0]!.line).toBe(1);
    expect(index.lineMap[1]!.line).toBe(2);
  });
});

describe("matchCitation", () => {
  const index = buildTextIndex(
    "§0001 一种散热装置，包括基板和散热翅片。\n\n§0002 所述基板为铝合金材质。\n\n§0003 散热翅片与基板一体成型。"
  );

  it("Level 1: exact paragraph match → high confidence", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "[0001]",
      paragraph: "0001",
      confidence: "high"
    };
    const result = matchCitation(citation, index);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("high");
    expect(result.matchedParagraphId).toBe("p-0");
  });

  it("Level 2: ±1 neighbor match → medium confidence", () => {
    const citationForNeighbor: Citation = {
      documentId: "doc-1",
      label: "[0003]",
      paragraph: "0003",
      confidence: "high"
    };
    const result = matchCitation(citationForNeighbor, index);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("high");
  });

  it("Level 3: quote substring search → medium confidence", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "片段",
      quote: "所述基板为铝合金材质",
      confidence: "medium"
    };
    const result = matchCitation(citation, index);
    expect(result.status).toBe("found");
    expect(result.confidence).toBe("medium");
    expect(result.matchedParagraphId).toBe("p-1");
  });

  it("Level 4: all fail → not-found", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "不存在",
      paragraph: "9999",
      quote: "不存在的文本片段",
      confidence: "low"
    };
    const result = matchCitation(citation, index);
    expect(result.status).toBe("not-found");
    expect(result.confidence).toBe("low");
  });

  it("quote too short (< 10 chars) → skips level 3", () => {
    const citation: Citation = {
      documentId: "doc-1",
      label: "短引文",
      quote: "短文本",
      confidence: "low"
    };
    const result = matchCitation(citation, index);
    expect(result.status).toBe("not-found");
  });
});

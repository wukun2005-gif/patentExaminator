import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { buildTextIndex } from "@client/lib/textIndex";
import { extractHtmlText } from "@client/lib/htmlText";

const FIXTURES_DIR = resolve(__dirname, "../fixtures/docs");

describe("T-DOC-001: sample.txt extraction", () => {
  it("extracts text with § paragraph markers", async () => {
    const content = await readFile(resolve(FIXTURES_DIR, "sample.txt"), "utf-8");
    const index = buildTextIndex(content);

    expect(index.paragraphs.length).toBeGreaterThanOrEqual(5);
    expect(index.paragraphs[0]!.paragraphNumber).toBe("0001");
    expect(index.paragraphs[0]!.text).toContain("LED散热装置");
    expect(index.paragraphs[4]!.paragraphNumber).toBe("0005");
  });

  it("computes correct offsets", async () => {
    const content = await readFile(resolve(FIXTURES_DIR, "sample.txt"), "utf-8");
    const index = buildTextIndex(content);

    // Verify offset consistency
    for (const para of index.paragraphs) {
      const slice = content.slice(para.startOffset, para.endOffset);
      expect(slice).toBe(para.text);
    }
  });
});

describe("T-DOC-002: sample.html extraction", () => {
  it("strips tags and extracts text", async () => {
    const html = await readFile(resolve(FIXTURES_DIR, "sample.html"), "utf-8");
    const result = extractHtmlText(html);

    expect(result.text).toContain("LED散热装置");
    expect(result.text).toContain("铝合金材质");
    expect(result.text).not.toContain("<p>");
    expect(result.text).not.toContain("<script>");
    expect(result.text).not.toContain("<style>");
  });

  it("builds TextIndex with paragraphs", async () => {
    const html = await readFile(resolve(FIXTURES_DIR, "sample.html"), "utf-8");
    const result = extractHtmlText(html);

    expect(result.textIndex.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("TextIndex buildTextIndex", () => {
  it("handles empty text", () => {
    const index = buildTextIndex("");
    expect(index.paragraphs).toHaveLength(0);
    expect(index.lineMap).toHaveLength(1); // single empty line
  });

  it("handles single paragraph", () => {
    const index = buildTextIndex("单一段落内容");
    expect(index.paragraphs).toHaveLength(1);
    expect(index.paragraphs[0]!.text).toBe("单一段落内容");
  });
});

import { describe, it, expect } from "vitest";
import { extractHtmlText } from "@client/lib/htmlText";

describe("extractHtmlText", () => {
  it("extracts text from simple HTML", () => {
    const result = extractHtmlText("<p>Hello World</p>");
    expect(result.text).toBe("Hello World");
  });

  it("strips script tags", () => {
    const result = extractHtmlText('<p>Text</p><script>var x = 1;</script>');
    expect(result.text).toBe("Text");
    expect(result.text).not.toContain("var x");
  });

  it("strips style tags", () => {
    const result = extractHtmlText("<p>Text</p><style>.x { color: red; }</style>");
    expect(result.text).toBe("Text");
  });

  it("normalizes whitespace", () => {
    const result = extractHtmlText("<p>  Hello   World  </p>");
    expect(result.text).toBe("Hello World");
  });

  it("handles nested tags", () => {
    const result = extractHtmlText("<div><p>Hello</p><p>World</p></div>");
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
  });

  it("handles empty HTML", () => {
    const result = extractHtmlText("");
    expect(result.text).toBe("");
  });

  it("handles HTML with only tags", () => {
    const result = extractHtmlText("<br><hr><img src='x'>");
    expect(result.text).toBe("");
  });

  it("returns TextIndex", () => {
    const result = extractHtmlText("<p>Hello World</p>");
    expect(result.textIndex).toBeDefined();
    expect(result.textIndex.paragraphs).toBeDefined();
  });
});

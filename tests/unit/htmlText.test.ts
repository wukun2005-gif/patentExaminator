import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractHtmlText } from "@client/lib/htmlText";

// Mock fetch for the async extractHtmlText (calls /api/documents/extract-html + /api/documents/build-text-index)
function mockFetchResponses(text: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/documents/extract-html") {
      return {
        ok: true,
        json: async () => ({ ok: true, text }),
      } as Response;
    }
    if (url === "/api/documents/build-text-index") {
      // Simple paragraph splitting for mock
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).map((p, i) => ({
        id: `p-${i}`,
        text: p.trim(),
        startOffset: text.indexOf(p.trim()),
        endOffset: text.indexOf(p.trim()) + p.trim().length,
      }));
      return {
        ok: true,
        json: async () => ({ ok: true, pages: [], paragraphs, lineMap: [] }),
      } as Response;
    }
    return { ok: false, status: 404, statusText: "Not Found" } as Response;
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("extractHtmlText", () => {
  it("extracts text from simple HTML", async () => {
    mockFetchResponses("Hello World");
    const result = await extractHtmlText("<p>Hello World</p>");
    expect(result.text).toBe("Hello World");
  });

  it("strips script tags", async () => {
    mockFetchResponses("Text");
    const result = await extractHtmlText('<p>Text</p><script>var x = 1;</script>');
    expect(result.text).toBe("Text");
    expect(result.text).not.toContain("var x");
  });

  it("strips style tags", async () => {
    mockFetchResponses("Text");
    const result = await extractHtmlText("<p>Text</p><style>.x { color: red; }</style>");
    expect(result.text).toBe("Text");
  });

  it("normalizes whitespace", async () => {
    mockFetchResponses("Hello World");
    const result = await extractHtmlText("<p>  Hello   World  </p>");
    expect(result.text).toBe("Hello World");
  });

  it("handles nested tags", async () => {
    mockFetchResponses("Hello\n\nWorld");
    const result = await extractHtmlText("<div><p>Hello</p><p>World</p></div>");
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
  });

  it("handles empty HTML", async () => {
    mockFetchResponses("");
    const result = await extractHtmlText("");
    expect(result.text).toBe("");
  });

  it("handles HTML with only tags", async () => {
    mockFetchResponses("");
    const result = await extractHtmlText("<br><hr><img src='x'>");
    expect(result.text).toBe("");
  });

  it("returns TextIndex", async () => {
    mockFetchResponses("Hello World");
    const result = await extractHtmlText("<p>Hello World</p>");
    expect(result.textIndex).toBeDefined();
    expect(result.textIndex.paragraphs).toBeDefined();
  });
});

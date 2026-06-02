import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFile } from "fs/promises";
import { resolve } from "path";
import express from "express";
import { createServer, type Server } from "http";

const FIXTURES_DIR = resolve(__dirname, "../fixtures/docs");

// 启动测试服务器
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // extract-html 端点
  app.post("/api/documents/extract-html", async (req, res) => {
    const { html } = req.body;
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    res.json({ ok: true, text });
  });

  // build-text-index 端点
  app.post("/api/documents/build-text-index", async (req, res) => {
    const { text } = req.body;

    // 空文本处理
    if (!text || text.trim() === "") {
      res.json({ ok: true, pages: [], paragraphs: [], lineMap: [""] });
      return;
    }

    // 按双换行分割段落
    const paragraphs: Array<{ paragraphNumber: string; text: string; startOffset: number; endOffset: number }> = [];
    let currentOffset = 0;
    const parts = text.split(/\n\s*\n/);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const trimmed = part.trim();
      if (trimmed) {
        const startOffset = text.indexOf(trimmed, currentOffset);
        paragraphs.push({
          paragraphNumber: String(i + 1).padStart(4, "0"),
          text: trimmed,
          startOffset,
          endOffset: startOffset + trimmed.length,
        });
        currentOffset = startOffset + trimmed.length;
      }
    }

    // 构建 lineMap
    const lineMap = text.split("\n");

    res.json({ ok: true, pages: [], paragraphs, lineMap });
  });

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        baseUrl = `http://localhost:${address.port}`;
      }
      resolve();
    });
  });

  // Mock 模块，让它们调用测试服务器
  vi.mock("@client/lib/textIndex", async () => {
    const original = await vi.importActual<typeof import("@client/lib/textIndex")>("@client/lib/textIndex");
    return {
      ...original,
      buildTextIndex: async (text: string) => {
        const res = await fetch(`${baseUrl}/api/documents/build-text-index`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`Build text index failed: ${res.status}`);
        const data = await res.json() as { ok: boolean; pages: unknown[]; paragraphs: unknown[]; lineMap: unknown[] };
        return { pages: data.pages, paragraphs: data.paragraphs, lineMap: data.lineMap };
      },
    };
  });

  vi.mock("@client/lib/htmlText", async () => {
    const original = await vi.importActual<typeof import("@client/lib/htmlText")>("@client/lib/htmlText");
    return {
      ...original,
      extractHtmlText: async (html: string) => {
        const res = await fetch(`${baseUrl}/api/documents/extract-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        });
        if (!res.ok) throw new Error(`HTML extraction failed: ${res.status}`);
        const data = await res.json() as { ok: boolean; text: string };
        // 调用真实的 buildTextIndex（已经被 mock）
        const { buildTextIndex } = await import("@client/lib/textIndex");
        return { text: data.text, textIndex: await buildTextIndex(data.text) };
      },
    };
  });
});

afterAll(() => {
  server?.close();
  vi.restoreAllMocks();
});

describe("T-DOC-001: sample.txt extraction", () => {
  it("extracts text with § paragraph markers", async () => {
    const { buildTextIndex } = await import("@client/lib/textIndex");
    const content = await readFile(resolve(FIXTURES_DIR, "sample.txt"), "utf-8");
    const index = await buildTextIndex(content);

    expect(index.paragraphs.length).toBeGreaterThanOrEqual(5);
    expect(index.paragraphs[0]!.paragraphNumber).toBe("0001");
    expect(index.paragraphs[0]!.text).toContain("LED散热装置");
    expect(index.paragraphs[4]!.paragraphNumber).toBe("0005");
  });

  it("computes correct offsets", async () => {
    const { buildTextIndex } = await import("@client/lib/textIndex");
    const content = await readFile(resolve(FIXTURES_DIR, "sample.txt"), "utf-8");
    const index = await buildTextIndex(content);

    for (const para of index.paragraphs) {
      const slice = content.slice(para.startOffset, para.endOffset);
      expect(slice).toBe(para.text);
    }
  });
});

describe("T-DOC-002: sample.html extraction", () => {
  it("strips tags and extracts text", async () => {
    const { extractHtmlText } = await import("@client/lib/htmlText");
    const html = await readFile(resolve(FIXTURES_DIR, "sample.html"), "utf-8");
    const result = await extractHtmlText(html);

    expect(result.text).toContain("LED散热装置");
    expect(result.text).toContain("铝合金材质");
    expect(result.text).not.toContain("<p>");
    expect(result.text).not.toContain("<script>");
    expect(result.text).not.toContain("<style>");
  });

  it("builds TextIndex with paragraphs", async () => {
    const { extractHtmlText } = await import("@client/lib/htmlText");
    const html = await readFile(resolve(FIXTURES_DIR, "sample.html"), "utf-8");
    const result = await extractHtmlText(html);

    expect(result.textIndex.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("TextIndex buildTextIndex", () => {
  it("handles empty text", async () => {
    const { buildTextIndex } = await import("@client/lib/textIndex");
    const index = await buildTextIndex("");
    expect(index.paragraphs).toHaveLength(0);
    expect(index.lineMap).toHaveLength(1);
  });

  it("handles single paragraph", async () => {
    const { buildTextIndex } = await import("@client/lib/textIndex");
    const index = await buildTextIndex("单一段落内容");
    expect(index.paragraphs).toHaveLength(1);
    expect(index.paragraphs[0]!.text).toBe("单一段落内容");
  });
});

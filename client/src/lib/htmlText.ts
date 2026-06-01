import { buildTextIndex } from "./textIndex";
import type { TextIndex } from "@shared/types/domain";

export interface HtmlExtractionResult {
  text: string;
  textIndex: TextIndex;
}

/**
 * Extract plain text from an HTML string using server-side cheerio.
 * MIGRATE-006: HTML 文本提取从前端迁移到后端
 */
export async function extractHtmlText(html: string): Promise<HtmlExtractionResult> {
  const res = await fetch("/api/documents/extract-html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  });

  if (!res.ok) {
    throw new Error(`HTML extraction failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean; text: string };

  return { text: data.text, textIndex: await buildTextIndex(data.text) };
}

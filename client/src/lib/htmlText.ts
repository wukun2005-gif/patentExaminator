import { buildTextIndex } from "./textIndex";
import type { TextIndex } from "@shared/types/domain";

export interface HtmlExtractionResult {
  text: string;
  textIndex: TextIndex;
}

/**
 * Extract plain text from an HTML string using DOMParser.
 * Strips all tags, preserves text content, normalizes whitespace.
 */
export function extractHtmlText(html: string): HtmlExtractionResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove script and style elements
  for (const el of doc.querySelectorAll("script, style")) {
    el.remove();
  }

  const text = (doc.body?.textContent ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  return { text, textIndex: buildTextIndex(text) };
}

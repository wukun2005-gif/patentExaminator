import { buildTextIndex } from "./textIndex";
import type { TextIndex } from "@shared/types/domain";

export interface DocxExtractionResult {
  text: string;
  textIndex: TextIndex;
}

/**
 * Extract plain text from a DOCX file using mammoth.
 */
export async function extractDocxText(file: File): Promise<DocxExtractionResult> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });

  const text = result.value.trim();
  return { text, textIndex: buildTextIndex(text) };
}

import { buildTextIndex } from "./textIndex";
import type { TextIndex } from "@shared/types/domain";

export interface DocxExtractionResult {
  text: string;
  textIndex: TextIndex;
}

/**
 * Extract plain text from a DOCX file using server-side mammoth.
 * MIGRATE-005: DOCX 文本提取从前端迁移到后端
 */
export async function extractDocxText(file: File): Promise<DocxExtractionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/documents/extract-docx", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`DOCX extraction failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean; text: string };

  return { text: data.text, textIndex: buildTextIndex(data.text) };
}

import { buildTextIndex } from "./textIndex";
import type { TextIndex, TextPage } from "@shared/types/domain";

export interface PdfExtractionResult {
  text: string;
  textIndex: TextIndex;
  hasTextLayer: boolean;
}

/**
 * Extract text from a PDF file using server-side pdfjs-dist.
 * MIGRATE-003: PDF 文本提取从前端迁移到后端
 */
export async function extractPdfText(file: File): Promise<PdfExtractionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/documents/extract-pdf", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`PDF extraction failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    ok: boolean;
    text: string;
    pages: TextPage[];
    hasTextLayer: boolean;
  };

  const textIndex = buildTextIndex(data.text);
  textIndex.pages = data.pages;

  return {
    text: data.text,
    textIndex,
    hasTextLayer: data.hasTextLayer,
  };
}

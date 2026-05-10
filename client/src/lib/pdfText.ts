import { buildTextIndex } from "./textIndex";
import type { TextIndex, TextPage } from "@shared/types/domain";

export interface PdfExtractionResult {
  text: string;
  textIndex: TextIndex;
  hasTextLayer: boolean;
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 * Detects whether the PDF has a usable text layer.
 */
export async function extractPdfText(file: File): Promise<PdfExtractionResult> {
  const pdfjsLib = await import("pdfjs-dist");

  // Disable worker for Node/test environments
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: TextPage[] = [];
  const pageTexts: string[] = [];
  let totalLength = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");

    const startOffset = totalLength;
    pageTexts.push(pageText);
    totalLength += pageText.length + 1; // +1 for newline separator

    pages.push({
      pageNumber: i,
      startOffset,
      endOffset: totalLength - 1
    });
  }

  const text = pageTexts.join("\n").trim();
  const textIndex = buildTextIndex(text);
  textIndex.pages = pages;

  // Heuristic: if average characters per page < 40, likely no text layer
  const avgCharsPerPage = text.length / (pdf.numPages || 1);
  const hasTextLayer = avgCharsPerPage >= 40;

  return { text, textIndex, hasTextLayer };
}

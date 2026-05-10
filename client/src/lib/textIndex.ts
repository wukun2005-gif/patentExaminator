import type { TextIndex, TextParagraph, TextLine } from "@shared/types/domain";

/**
 * Build a TextIndex from raw extracted text.
 * Splits text into paragraphs (double newline or numbered § paragraphs)
 * and lines, computing character offsets for each.
 */
export function buildTextIndex(text: string): TextIndex {
  const paragraphs = extractParagraphs(text);
  const lines = extractLines(text);
  return {
    pages: [], // Page detection requires PDF-specific logic; populated by pdfText.ts
    paragraphs,
    lineMap: lines
  };
}

function extractParagraphs(text: string): TextParagraph[] {
  const paragraphs: TextParagraph[] = [];
  // Split on double newline or § paragraph markers
  const rawParts = text.split(/\n\s*\n/);
  let offset = 0;

  for (const raw of rawParts) {
    const trimmed = raw.trim();
    if (!trimmed) {
      offset += raw.length + 2; // +2 for the \n\n
      continue;
    }

    const startOffset = text.indexOf(trimmed, offset);
    const endOffset = startOffset + trimmed.length;

    // Try to extract paragraph number (§0001, [0001], etc.)
    const paraNumMatch = trimmed.match(/^(?:§|\[)(\d+)(?:\])?\s/);
    const paragraphNumber = paraNumMatch ? paraNumMatch[1] : undefined;

    const para: TextParagraph = {
      id: `p-${paragraphs.length}`,
      text: trimmed,
      startOffset,
      endOffset
    };
    if (paragraphNumber) para.paragraphNumber = paragraphNumber;
    paragraphs.push(para);

    offset = endOffset + 2;
  }

  return paragraphs;
}

function extractLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let offset = 0;
  const textLines = text.split("\n");

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i]!;
    const startOffset = offset;
    const endOffset = offset + line.length;
    lines.push({ line: i + 1, startOffset, endOffset });
    offset = endOffset + 1; // +1 for the newline
  }

  return lines;
}

import type { DocumentFigure } from "@shared/types/domain";

const FIGURE_CAPTION_PATTERNS: RegExp[] = [
  /图\s*(\d+)\s*(?:是|为|示出了|表示|示出)?\s*(.{0,80})/g,
  /Fig\.?\s*(\d+)\s*(?:is|shows|illustrates|depicts)?\s*(.{0,80})/gi,
  /附图\s*(\d+)/g,
];

const FIGURE_SECTION_HEADERS = [
  "附图说明",
  "说明书附图",
  "附图",
  "BRIEF DESCRIPTION OF THE DRAWINGS",
  "BRIEF DESCRIPTION OF DRAWINGS",
  "DESCRIPTION OF DRAWINGS",
];

const MIN_TEXT_FOR_NON_FIGURE_PAGE = 50;

export interface FigureExtractionResult {
  figures: DocumentFigure[];
  errors: string[];
}

export function extractFigureCaptions(text: string): Array<{ number: number; caption: string }> {
  const results: Array<{ number: number; caption: string }> = [];
  const seen = new Set<number>();

  for (const pattern of FIGURE_CAPTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (!seen.has(num) && num > 0 && num <= 200) {
        seen.add(num);
        results.push({ number: num, caption: (match[2] ?? "").trim() });
      }
    }
  }

  results.sort((a, b) => a.number - b.number);
  return results;
}

export function isFigureSectionHeader(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return FIGURE_SECTION_HEADERS.some((h) => trimmed.includes(h.toLowerCase()));
}

export function isLikelyFigurePage(pageText: string): boolean {
  const trimmed = pageText.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < MIN_TEXT_FOR_NON_FIGURE_PAGE) return true;

  const figureLabelCount = (trimmed.match(/图\s*\d+|Fig\.?\s*\d+/gi) || []).length;
  const totalLines = trimmed.split("\n").length;
  if (totalLines > 0 && figureLabelCount / totalLines > 0.3) return true;

  return false;
}

export function buildFigureId(documentId: string, figureNumber: number): string {
  return `${documentId}_fig${figureNumber}`;
}

export function estimateFigurePages(
  captions: Array<{ number: number; caption: string }>,
  totalPages: number,
  pageTexts: string[]
): Map<number, number[]> {
  const figurePages = new Map<number, number[]>();

  const figureSectionStart = pageTexts.findIndex((text) => isFigureSectionHeader(text));

  if (figureSectionStart >= 0) {
    let currentFigure: number | null = null;
    for (let i = figureSectionStart; i < pageTexts.length; i++) {
      const pt = pageTexts[i] ?? "";
      for (const cap of captions) {
        if (pt.includes(`图${cap.number}`) || pt.includes(`Fig.${cap.number}`) || pt.includes(`Fig ${cap.number}`)) {
          currentFigure = cap.number;
          break;
        }
      }
      if (currentFigure !== null) {
        const pages = figurePages.get(currentFigure) ?? [];
        pages.push(i);
        figurePages.set(currentFigure, pages);
      }
    }
  }

  if (figurePages.size === 0) {
    for (let i = 0; i < pageTexts.length; i++) {
      const pt = pageTexts[i] ?? "";
      if (isLikelyFigurePage(pt)) {
        for (const cap of captions) {
          if (pt.includes(`图${cap.number}`) || pt.includes(`Fig.${cap.number}`)) {
            const pages = figurePages.get(cap.number) ?? [];
            pages.push(i);
            figurePages.set(cap.number, pages);
          }
        }
      }
    }
  }

  return figurePages;
}
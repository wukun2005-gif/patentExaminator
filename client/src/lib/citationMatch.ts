import type { Citation, TextIndex } from "@shared/types/domain";

export interface MatchResult {
  status: "found" | "not-found";
  confidence: "high" | "medium" | "low";
  matchedParagraphId?: string;
  matchedOffset?: { start: number; end: number };
}

/**
 * Four-level citation matching against a TextIndex.
 *
 * 1. Exact paragraph number match → high confidence
 * 2. ±1 paragraph neighbor → medium confidence
 * 3. Quote substring search (≥10 chars, unique) → medium confidence
 * 4. All fail → not-found
 */
export function matchCitation(citation: Citation, index: TextIndex): MatchResult {
  // Level 1: Exact paragraph number match
  if (citation.paragraph) {
    const normalized = normalizeParagraphNumber(citation.paragraph);
    const exact = index.paragraphs.find(
      (p) => p.paragraphNumber && normalizeParagraphNumber(p.paragraphNumber) === normalized
    );
    if (exact) {
      return { status: "found", confidence: "high", matchedParagraphId: exact.id };
    }

    // Level 2: ±1 neighbor
    const num = parseInt(normalized, 10);
    if (!isNaN(num)) {
      const neighbor = index.paragraphs.find((p) => {
        if (!p.paragraphNumber) return false;
        const pNum = parseInt(normalizeParagraphNumber(p.paragraphNumber), 10);
        return !isNaN(pNum) && Math.abs(pNum - num) === 1;
      });
      if (neighbor) {
        return { status: "found", confidence: "medium", matchedParagraphId: neighbor.id };
      }
    }
  }

  // Level 3: Quote substring search
  if (citation.quote && citation.quote.length >= 10) {
    const matches = index.paragraphs.filter((p) => p.text.includes(citation.quote!));
    if (matches.length === 1) {
      const match = matches[0]!;
      const startOffset = match.text.indexOf(citation.quote!);
      return {
        status: "found",
        confidence: "medium",
        matchedParagraphId: match.id,
        matchedOffset: {
          start: match.startOffset + startOffset,
          end: match.startOffset + startOffset + citation.quote!.length
        }
      };
    }
  }

  // Level 4: not-found
  return { status: "not-found", confidence: "low" };
}

function normalizeParagraphNumber(paragraph: string): string {
  return paragraph.replace(/^0+/, "").trim();
}

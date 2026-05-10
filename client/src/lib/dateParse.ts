import type { ISODateString } from "@shared/types/domain";

export interface ParseDateResult {
  iso: ISODateString;
  confidence: "high" | "medium" | "low";
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD) with confidence level.
 *
 * - "high": already ISO format (YYYY-MM-DD)
 * - "medium": recognizable format (Chinese, slash, English month)
 * - "low": partial date (YYYY-MM only → padded to 01)
 *
 * Returns undefined if the input cannot be parsed at all.
 */
export function parseDate(input: string): ParseDateResult | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Already ISO: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { iso: trimmed, confidence: "high" };
  }

  // Chinese format: YYYY年M月D日
  const cnMatch = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (cnMatch) {
    const iso = toIso(cnMatch[1]!, cnMatch[2]!, cnMatch[3]!);
    if (iso) return { iso, confidence: "medium" };
  }

  // Slash format: YYYY/M/D or YYYY/MM/DD
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const iso = toIso(slashMatch[1]!, slashMatch[2]!, slashMatch[3]!);
    if (iso) return { iso, confidence: "medium" };
  }

  // Dot format: YYYY.M.D or YYYY.MM.DD
  const dotMatch = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const iso = toIso(dotMatch[1]!, dotMatch[2]!, dotMatch[3]!);
    if (iso) return { iso, confidence: "medium" };
  }

  // English format: Month D, YYYY or Month D YYYY
  const enMatch = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (enMatch) {
    const monthIndex = EN_MONTHS.indexOf(enMatch[1]!.toLowerCase());
    if (monthIndex >= 0) {
      const iso = toIso(enMatch[3]!, String(monthIndex + 1), enMatch[2]!);
      if (iso) return { iso, confidence: "medium" };
    }
  }

  // Partial: YYYY-MM only
  const partialMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (partialMatch) {
    return { iso: `${partialMatch[1]}-${partialMatch[2]}-01`, confidence: "low" };
  }

  return undefined;
}

const EN_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

function toIso(year: string, month: string, day: string): ISODateString | undefined {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

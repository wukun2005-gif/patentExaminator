export type OcrQualityLevel = "good" | "poor" | "bad";

export interface OcrQualityResult {
  score: number;
  level: OcrQualityLevel;
  effectiveChars: number;
  junkRatio: number;
  shortPageRatio: number;
}

/**
 * Compute OCR quality score per ADR-011.
 *
 * effectiveChars = non-whitespace character count
 * junkRatio = (non-printable - whitespace - newline - common punctuation) / effectiveChars
 * shortPageRatio = pages with < 50 effective chars / total pages
 * quality = clamp(1 - (junkRatio * 2) - (shortPageRatio * 0.5), 0, 1)
 *
 * UI mapping: ≥0.70 green / 0.40–0.70 yellow / <0.40 red
 */
export function computeOcrQuality(
  pageTexts: string[],
  thresholds = { good: 0.7, poor: 0.4 }
): OcrQualityResult {
  let totalEffective = 0;
  let totalJunk = 0;
  let shortPages = 0;

  for (const pageText of pageTexts) {
    const effective = pageText.replace(/\s/g, "");
    const effectiveLen = effective.length;
    totalEffective += effectiveLen;

    if (effectiveLen < 50) shortPages++;

    // Count junk: non-printable characters (excluding whitespace, newlines, common punctuation)
    for (const ch of effective) {
      const code = ch.charCodeAt(0);
      if (isJunkChar(code)) totalJunk++;
    }
  }

  const junkRatio = totalEffective > 0 ? totalJunk / totalEffective : 0;
  const shortPageRatio = pageTexts.length > 0 ? shortPages / pageTexts.length : 0;
  const score = Math.max(0, Math.min(1, 1 - junkRatio * 2 - shortPageRatio * 0.5));

  let level: OcrQualityLevel;
  if (score >= thresholds.good) level = "good";
  else if (score >= thresholds.poor) level = "poor";
  else level = "bad";

  return { score, level, effectiveChars: totalEffective, junkRatio, shortPageRatio };
}

function isJunkChar(code: number): boolean {
  // Control characters (except tab, newline, carriage return)
  if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
  // DEL
  if (code === 127) return true;
  // C1 control characters
  if (code >= 128 && code <= 159) return true;
  return false;
}

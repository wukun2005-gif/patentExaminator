import type { ISODateString, TimelineStatus } from "@shared/types/domain";

/**
 * Compute the baseline date for timeline comparison.
 * Rule (ADR-009): baselineDate = priorityDate ?? applicationDate
 * Returns undefined if neither is provided.
 */
export function computeBaselineDate(params: {
  applicationDate?: ISODateString;
  priorityDate?: ISODateString;
}): ISODateString | undefined {
  return params.priorityDate ?? params.applicationDate ?? undefined;
}

/**
 * Classify a reference document's timeline status relative to the baseline date.
 *
 * Rules:
 * - pubDate missing → "needs-publication-date"
 * - baselineDate missing → "needs-baseline-date"
 * - pubDate < baselineDate → "available" (prior art predates the application)
 * - pubDate === baselineDate → "unavailable-same-day" (same day, not usable)
 * - pubDate > baselineDate → "unavailable-later" (published after application)
 *
 * For low-confidence publication dates, the result is still computed but the
 * caller should display a warning in the UI.
 */
export function classifyReferenceDate(
  baselineDate: ISODateString | undefined,
  pubDate: ISODateString | undefined,
  _pubConfidence?: "high" | "medium" | "low" | "manual"
): TimelineStatus {
  if (!pubDate) return "needs-publication-date";
  if (!baselineDate) return "needs-baseline-date";

  // ADR-009: literal string comparison, no timezone conversion
  if (pubDate < baselineDate) return "available";
  if (pubDate === baselineDate) return "unavailable-same-day";
  return "unavailable-later";
}

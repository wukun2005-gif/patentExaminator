/**
 * Evaluation scoring metrics per §9.5.
 * All scores normalized to 0..1.
 */

export interface ScoringResult {
  score: number;
  passed: boolean;
  detail: string;
}

export interface ScoringThresholds {
  coverage: number;
  citationAccuracy: number;
  differenceAccuracy: number;
  timelineScore: number;
}

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  coverage: 0.8,
  citationAccuracy: 0.8,
  differenceAccuracy: 0.9,
  timelineScore: 1.0
};

/**
 * §9.5.1 Claim Feature Coverage
 * coverage = |A ∩ E| / |E|
 */
export function scoreFeatureCoverage(
  expected: Set<string>,
  actual: Set<string>
): ScoringResult {
  if (expected.size === 0) {
    return { score: 1, passed: true, detail: "no expected features" };
  }
  const intersection = new Set([...expected].filter((x) => actual.has(x)));
  const score = intersection.size / expected.size;
  return {
    score,
    passed: score >= DEFAULT_THRESHOLDS.coverage,
    detail: `hits=${intersection.size}/${expected.size}`
  };
}

/**
 * §9.5.2 Citation Accuracy
 * For each expected (featureCode → paragraphNumber), check if actual citations match.
 */
export function scoreCitationAccuracy(
  expected: Array<{ featureCode: string; paragraph: string }>,
  actual: Array<{ featureCode: string; paragraph?: string }>
): ScoringResult {
  if (expected.length === 0) {
    return { score: 1, passed: true, detail: "no expected citations" };
  }
  let hits = 0;
  for (const exp of expected) {
    const found = actual.some(
      (a) => a.featureCode === exp.featureCode && normalizeParagraph(a.paragraph) === normalizeParagraph(exp.paragraph)
    );
    if (found) hits++;
  }
  const score = hits / expected.length;
  return {
    score,
    passed: score >= DEFAULT_THRESHOLDS.citationAccuracy,
    detail: `hits=${hits}/${expected.length}`
  };
}

/**
 * §9.5.3 Difference Candidate Correctness
 * differenceAccuracy = 1 - (|D_exp △ D_act| / max(|D_exp ∪ D_act|, 1))
 */
export function scoreDifferenceAccuracy(
  expected: Set<string>,
  actual: Set<string>
): ScoringResult {
  const union = new Set([...expected, ...actual]);
  const symmetricDiff = new Set(
    [...expected].filter((x) => !actual.has(x)).concat([...actual].filter((x) => !expected.has(x)))
  );
  const score = 1 - symmetricDiff.size / Math.max(union.size, 1);
  return {
    score,
    passed: score >= DEFAULT_THRESHOLDS.differenceAccuracy,
    detail: `symDiff=${symmetricDiff.size}, union=${union.size}`
  };
}

/**
 * §9.5.4 Timeline Check
 * Binary: all timeline statuses match expected → 1, else 0.
 */
export function scoreTimeline(
  expected: Record<string, string>,
  actual: Record<string, string>
): ScoringResult {
  const keys = Object.keys(expected);
  if (keys.length === 0) {
    return { score: 1, passed: true, detail: "no timeline checks" };
  }
  for (const key of keys) {
    if (expected[key] !== actual[key]) {
      return {
        score: 0,
        passed: false,
        detail: `mismatch on ${key}: expected=${expected[key]}, actual=${actual[key]}`
      };
    }
  }
  return { score: 1, passed: true, detail: `${keys.length} checks passed` };
}

function normalizeParagraph(p?: string): string {
  if (!p) return "";
  return p.replace(/^0+/, "").trim();
}

/**
 * Evaluation runner — validates agent response fixtures against scoring metrics.
 * Runs G1/G2/G3 through the 4 scoring dimensions per §9.5.
 */

import type { ClaimChartResponse, NoveltyResponse } from "@client/agent/contracts";
import {
  scoreFeatureCoverage,
  scoreDifferenceAccuracy,
  scoreTimeline,
  type ScoringResult
} from "./metrics";

export interface EvaluationResult {
  evalId: string;
  scores: Record<string, ScoringResult>;
  overallPassed: boolean;
}

/**
 * Evaluate a ClaimChartResponse fixture against expected feature codes.
 */
export function evaluateClaimChart(
  evalId: string,
  response: ClaimChartResponse,
  expectedFeatureCodes: string[]
): EvaluationResult {
  const actualCodes = response.features.map((f) => f.featureCode);
  const coverage = scoreFeatureCoverage(
    new Set(expectedFeatureCodes),
    new Set(actualCodes)
  );

  return {
    evalId,
    scores: { coverage },
    overallPassed: coverage.passed
  };
}

/**
 * Evaluate a NoveltyResponse fixture against expected values.
 */
export function evaluateNovelty(
  evalId: string,
  response: NoveltyResponse,
  expected: {
    differenceFeatureCodes: string[];
    expectedDisclosureStatuses?: Record<string, string>;
  }
): EvaluationResult {
  const diffAccuracy = scoreDifferenceAccuracy(
    new Set(expected.differenceFeatureCodes),
    new Set(response.differenceFeatureCodes)
  );

  const scores: Record<string, ScoringResult> = {
    differenceAccuracy: diffAccuracy
  };

  if (expected.expectedDisclosureStatuses) {
    const actualStatuses: Record<string, string> = {};
    for (const row of response.rows) {
      actualStatuses[row.featureCode] = row.disclosureStatus;
    }
    scores.timeline = scoreTimeline(expected.expectedDisclosureStatuses, actualStatuses);
  }

  const overallPassed = Object.values(scores).every((s) => s.passed);

  return {
    evalId,
    scores,
    overallPassed
  };
}

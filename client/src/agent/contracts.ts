import type { ClaimFeature } from "@shared/types/domain";

export interface ClaimChartRequest {
  caseId: string;
  claimText: string;
  claimNumber: number;
  specificationText: string;
}

export interface ClaimChartResponse {
  features: ClaimFeature[];
  warnings: string[];
  pendingSearchQuestions: string[];
  legalCaution: string;
}

export interface NoveltyRequest {
  caseId: string;
  claimNumber: number;
  features: Array<{ featureCode: string; description: string }>;
  referenceId: string;
  referenceText: string;
}

export interface NoveltyResponse {
  referenceId: string;
  claimNumber: number;
  rows: Array<{
    featureCode: string;
    disclosureStatus: "clearly-disclosed" | "possibly-disclosed" | "not-found" | "not-applicable";
    citations: Array<{
      label: string;
      paragraph?: string;
      quote?: string;
      confidence: "high" | "medium" | "low";
    }>;
    mismatchNotes?: string;
  }>;
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  legalCaution: string;
}

export interface InventiveRequest {
  caseId: string;
  claimNumber: number;
  features: Array<{ featureCode: string; description: string }>;
  availableReferences: Array<{
    referenceId: string;
    label: string;
    excerpt: string;
  }>;
  closestPriorArtId?: string;
}

export interface InventiveResponse {
  claimNumber: number;
  closestPriorArtId?: string;
  sharedFeatureCodes: string[];
  distinguishingFeatureCodes: string[];
  objectiveTechnicalProblem?: string;
  motivationEvidence: Array<{
    referenceId: string;
    label: string;
    paragraph?: string;
    quote?: string;
    confidence: "high" | "medium" | "low";
  }>;
  candidateAssessment:
    | "possibly-lacks-inventiveness"
    | "possibly-inventive"
    | "insufficient-evidence"
    | "not-analyzed";
  cautions: string[];
  legalCaution: string;
}

export interface AgentRunOptions {
  providerId?: string;
  modelId?: string;
  maxTokens?: number;
}

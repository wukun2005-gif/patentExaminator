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

export interface AgentRunOptions {
  providerId?: string;
  modelId?: string;
  maxTokens?: number;
}

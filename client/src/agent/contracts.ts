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
  applicantArguments?: string;
  amendedClaimText?: string;
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
  applicantArguments?: string;
  examinerResponse?: string;
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
  applicantArguments?: string;
  amendedClaimText?: string;
}

export interface InventiveResponse {
  claimNumber: number;
  closestPriorArtId?: string;
  sharedFeatureCodes: string[];
  distinguishingFeatureCodes: string[];
  applicantArguments?: string;
  examinerResponse?: string;
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

export interface ChatRequest {
  caseId: string;
  sessionId: string;
  moduleScope: string;
  userMessage: string;
  contextSummary: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatResponse {
  reply: string;
  action?: {
    type: "regenerate" | "update";
    target: string;
    params?: Record<string, unknown>;
  };
}

export interface DefectRequest {
  caseId: string;
  claimText: string;
  specificationText: string;
  claimFeatures: Array<{ featureCode: string; description: string }>;
}

export interface DefectResponse {
  defects: Array<{
    category: string;
    description: string;
    location?: string;
    severity: "error" | "warning" | "info";
    previouslyRaised?: boolean;
    overcomeStatus?: "overcome" | "not-overcome" | "partially-overcome";
  }>;
  warnings: string[];
  legalCaution: string;
}

export interface ExtractCaseFieldsRequest {
  caseId: string;
  documents: Array<{ fileName: string; text: string }>;
}

export interface ExtractCaseFieldsResponse {
  title: string | null;
  applicationNumber: string | null;
  applicant: string | null;
  applicationDate: string | null;
  priorityDate: string | null;
  claims: Array<{
    claimNumber: number;
    type: "independent" | "dependent";
    dependsOn: number[];
    rawText: string;
  }>;
}

export interface SearchReferencesRequest {
  caseId: string;
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
  maxResults?: number;
  searchProviderId?: string;
  searchApiKey?: string;
  searchBaseUrl?: string;
}

export interface SearchReferencesCandidate {
  title: string;
  publicationNumber: string;
  publicationDate?: string;
  summary: string;
  relevanceScore: number;
  recommendationReason: string;
  sourceUrl?: string;
}

export interface SearchReferencesResponse {
  ok: boolean;
  candidates: SearchReferencesCandidate[];
  searchQuery?: string;
  error?: string;
}

export interface InterpretRequest {
  caseId: string;
  documentText: string;
}

export interface InterpretResponse {
  reply: string;
}

// ── 复审 Agent 契约 ──────────────────────────────────

export interface OpinionAnalysisRequest {
  caseId: string;
  officeActionText: string;
  documentId: string;
}

export interface OpinionAnalysisResponse {
  documentId: string;
  rejectionGrounds: Array<{
    code: string;
    category: "novelty" | "inventive" | "clarity" | "support" | "amendment" | "other";
    claimNumbers: number[];
    summary: string;
    legalBasis: string;
    originalText?: string;
  }>;
  citedReferences: Array<{
    publicationNumber: string;
    rejectionGroundCodes: string[];
    featureMapping: string;
  }>;
  legalCaution: string;
}

export interface ArgumentAnalysisRequest {
  caseId: string;
  rejectionGrounds: OpinionAnalysisResponse["rejectionGrounds"];
  responseText: string;
  amendedClaimsText?: string;
}

export interface ArgumentAnalysisResponse {
  mappings: Array<{
    rejectionGroundCode: string;
    applicantArgument: string;
    argumentSummary: string;
    confidence: "high" | "medium" | "low";
    amendedClaims?: Array<{
      claimNumber: number;
      originalText: string;
      amendedText: string;
      changeDescription: string;
    }>;
    newEvidence?: string;
  }>;
  unmappedGrounds?: string[];
  legalCaution: string;
}

export interface ReexamDraftRequest {
  caseId: string;
  claimNumber: number;
  rejectionGrounds: OpinionAnalysisResponse["rejectionGrounds"];
  argumentMappings: ArgumentAnalysisResponse["mappings"];
  noveltyResults?: string;
  inventiveResults?: string;
  defectResults?: string;
}

export interface ReexamDraftResponse {
  claimNumber: number;
  responseItems: Array<{
    rejectionGroundCode: string;
    category: string;
    applicantArgumentSummary: string;
    examinerResponse: string;
    conclusion:
      | "argument-accepted"
      | "argument-partially-accepted"
      | "argument-rejected"
      | "needs-further-review";
    supportingEvidence?: Array<{
      label: string;
      quote?: string;
      confidence: "high" | "medium" | "low";
    }>;
  }>;
  overallAssessment: string;
  defectReviewSummary?: string;
  legalCaution: string;
}

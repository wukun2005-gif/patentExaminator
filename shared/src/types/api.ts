import type { ProviderId } from "./agents.js";
import type { ClaimFeature } from "./domain.js";

// ── AI Gateway 错误分类 ──────────────────────────────

export type AiErrorType = "quota" | "auth" | "timeout" | "network" | "structure" | "abort" | "other";

export class AiGatewayError extends Error {
  readonly type: AiErrorType;
  readonly attempts: Array<{ providerId: string; errorCode?: string }> | undefined;

  constructor(
    type: AiErrorType,
    message: string,
    attempts?: Array<{ providerId: string; errorCode?: string }>
  ) {
    super(message);
    this.name = "AiGatewayError";
    this.type = type;
    this.attempts = attempts;
  }
}

// ── Agent Run 选项 ──────────────────────────────────

export interface AgentRunOptions {
  providerId?: string;
  modelId?: string;
  maxTokens?: number;
  signal?: AbortSignal | null;
}

// ── Agent Run 请求/响应（/api/agent/run） ──────────

export interface AiRunRequest {
  agent: "interpret" | "claim-chart" | "novelty" | "inventive" | "summary" | "draft" | "chat" | "defects" | "search-references" | "extract-case-fields" | "opinion-analysis" | "argument-analysis" | "reexam-draft" | "translate" | "classify-documents";
  providerPreference: ProviderId[];
  modelId: string;
  maxTokens?: number;
  modelFallbacks?: Partial<Record<ProviderId, string[]>>;
  enableModelFallback?: Partial<Record<ProviderId, boolean>>;
  providerBaseUrls?: Partial<Record<ProviderId, string>>;
  reasoningLevel?: "low" | "medium" | "high";
  prompt: string;
  expectedSchemaName?: string;
  sanitized: boolean;
  metadata: {
    caseId: string;
    moduleScope: string;
    tokenEstimate: number;
  };
}

export interface AiRunResponse {
  ok: boolean;
  provider?: ProviderId;
  modelId?: string;
  outputJson?: unknown;
  rawText?: string;
  tokenUsage?: { input: number; output: number; total: number };
  durationMs?: number;
  error?: { code: string; message: string; retryable: boolean; providerId?: ProviderId };
  attempts?: Array<{ providerId: ProviderId; ok: boolean; errorCode?: string }>;
  structureErrors?: string[];
}

// ── Claim Chart ──────────────────────────────────────

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

// ── Novelty ──────────────────────────────────────────

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
  /** @deprecated Use reviewerConclusions instead */
  pendingSearchConclusions?: string[];
  reviewerConclusions?: string[];
  aiPreliminaryConclusions?: string[];
  applicantArguments?: string;
  examinerResponse?: string;
  legalCaution: string;
}

// ── Inventive Step ────────────────────────────────────

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

// ── Chat ─────────────────────────────────────────────

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

// ── Defects ──────────────────────────────────────────

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

// ── Extract Case Fields ──────────────────────────────

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

// ── Search References ────────────────────────────────

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

/** 每个搜索 Provider 的结果计数 */
export interface ProviderResultCount {
  providerId: string;
  providerName: string;
  resultCount: number;
  candidateCount: number;
}

export interface SearchSummary {
  featureCount: number;
  queryCount: number;
  dataSource: string;
  queries: string[];
  providerResults?: ProviderResultCount[];
}

export interface SearchReferencesResponse {
  ok: boolean;
  candidates: SearchReferencesCandidate[];
  /** @deprecated 使用 searchSummary 代替 */
  searchQuery?: string;
  searchSummary?: SearchSummary;
  error?: string;
}

/** nf-7: Step 1 — 仅提取检索词 */
export interface ExtractSearchTermsRequest {
  caseId: string;
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
  searchProviderId?: string;
  searchApiKey?: string;
  searchBaseUrl?: string;
}

export interface ExtractSearchTermsResponse {
  ok: boolean;
  queries: string[];
  featureCount: number;
  error?: string;
}

/** nf-7: Step 2 — 用用户编辑后的检索词搜索 */
export interface SearchWithTermsRequest {
  caseId: string;
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
  searchQueries: string[];
  maxResults?: number;
  searchProviderId?: string;
  searchApiKey?: string;
  searchBaseUrl?: string;
}

// ── Interpret ────────────────────────────────────────

export type InterpretDocumentType = "application" | "office-action" | "office-action-response";

export interface InterpretRequest {
  caseId: string;
  documentId?: string;
  fileName?: string;
  documentText: string;
  documentType: InterpretDocumentType;
  relatedDocuments?: Array<{
    fileName: string;
    documentType: InterpretDocumentType;
  }>;
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

// ── Summary ──────────────────────────────────────────

export interface SummaryRequest {
  caseId: string;
  caseBaseline: string;
  confirmedFeatures: string;
  reviewedNoveltyComparisons: string;
  inventiveAnalysis: string;
}

export interface SummaryResponse {
  body: string;
  aiNotes: string;
  legalCaution: string;
}

// ── Translate ────────────────────────────────────────

export interface TranslateRequest {
  caseId: string;
  documentText: string;
}

export interface TranslateResponse {
  translatedText: string;
}

// ── 文档分类 ─────────────────────────────────────────

export interface ClassifyDocumentsRequest {
  caseId: string;
  documents: Array<{
    fileIndex: number;
    fileName: string;
    textSample: string;
  }>;
}

export interface DocumentClassification {
  fileIndex: number;
  fileName: string;
  role: "application" | "office-action" | "office-action-response" | "reference";
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface ClassifyDocumentsResponse {
  classifications: DocumentClassification[];
  warnings?: string[];
}

export type ISODateString = string;
export type ISODateTimeString = string;
export type AppMode = "mock" | "real";

export type CaseWorkflowState =
  | "empty"
  | "case-ready"
  | "documents-uploaded"
  | "text-extracted"
  | "ocr-running"
  | "ocr-failed"
  | "ocr-review"
  | "text-confirmed"
  | "opinion-analyzed"
  | "argument-mapped"
  | "references-ready"
  | "timeline-checked"
  | "claim-chart-ready"
  | "claim-chart-reviewed"
  | "novelty-ready"
  | "inventive-ready"
  | "defects-ready"
  | "draft-ready"
  | "export-ready";

export interface PatentCase {
  id: string;
  applicationNumber: string | null;
  title: string;
  applicant?: string;
  applicationDate: ISODateString;
  priorityDate?: ISODateString;
  patentType: "invention";
  textVersion: "original" | `amended-${number}`;
  targetClaimNumber: number;
  guidelineVersion: string;
  examinerNotes?: string;
  reexaminationRound: number;
  previousCaseId?: string;
  workflowState: CaseWorkflowState;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface SourceDocument {
  id: string;
  caseId: string;
  role: "application" | "reference" | "office-action-response" | "office-action";
  fileName: string;
  fileType: "pdf" | "docx" | "txt" | "html" | "manual";
  fileHash?: string;
  textLayerStatus?: "present" | "absent" | "unknown";
  ocrStatus?: "not-needed" | "pending" | "running" | "completed" | "failed";
  textStatus: "empty" | "extracted" | "confirmed" | "needs-review";
  extractedText: string;
  textIndex: TextIndex;
  createdAt: ISODateTimeString;
}

export interface ReferenceDocument extends SourceDocument {
  title?: string;
  publicationNumber?: string;
  publicationDate?: ISODateString;
  publicationDateConfidence: "high" | "medium" | "low" | "manual";
  timelineStatus: TimelineStatus;
  technicalField?: string;
  summary?: string;
  relevanceNotes?: string;
  source?: "user-upload" | "ai-search";
  sourceUrl?: string;
  candidateStatus?: "pending" | "accepted" | "rejected";
  aiRelevanceScore?: number;
  aiRecommendationReason?: string;
}

export type TimelineStatus =
  | "available"
  | "unavailable-same-day"
  | "unavailable-later"
  | "needs-publication-date"
  | "needs-baseline-date";

export interface TextIndex {
  pages: TextPage[];
  paragraphs: TextParagraph[];
  lineMap: TextLine[];
}

export interface TextPage {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
}

export interface TextParagraph {
  id: string;
  page?: number;
  paragraphNumber?: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface TextLine {
  line: number;
  startOffset: number;
  endOffset: number;
}

export interface ClaimNode {
  id: string;
  caseId: string;
  claimNumber: number;
  type: "independent" | "dependent" | "unknown";
  dependsOn: number[];
  rawText: string;
}

export interface ClaimFeature {
  id: string;
  caseId: string;
  claimNumber: number;
  featureCode: string;
  description: string;
  specificationCitations: Citation[];
  citationStatus: "confirmed" | "needs-review" | "not-found";
  userNotes?: string;
  source: "ai" | "user" | "mock";
}

export interface NoveltyComparison {
  id: string;
  caseId: string;
  referenceId: string;
  claimNumber: number;
  rows: NoveltyComparisonRow[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  pendingSearchConclusions?: string[];
  applicantArguments?: string;
  examinerResponse?: string;
  status: "draft" | "user-reviewed" | "stale";
  legalCaution: string;
}

export interface NoveltyComparisonRow {
  featureCode: string;
  disclosureStatus: "clearly-disclosed" | "possibly-disclosed" | "not-found" | "not-applicable";
  citations: Citation[];
  mismatchNotes?: string;
  reviewerNotes?: string;
}

export interface InventiveStepAnalysis {
  id: string;
  caseId: string;
  closestPriorArtId?: string;
  sharedFeatureCodes: string[];
  distinguishingFeatureCodes: string[];
  applicantArguments?: string;
  examinerResponse?: string;
  status: "draft" | "user-reviewed" | "stale";
  objectiveTechnicalProblem?: string;
  motivationEvidence: Citation[];
  candidateAssessment:
    | "possibly-lacks-inventiveness"
    | "possibly-inventive"
    | "insufficient-evidence"
    | "not-analyzed";
  cautions: string[];
  legalCaution: string;
}

export interface Citation {
  documentId: string;
  label: string;
  page?: number;
  paragraph?: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string;
  confidence: "high" | "medium" | "low";
}

export interface FormalDefect {
  id: string;
  caseId: string;
  category: string;
  description: string;
  location?: string;
  severity: "error" | "warning" | "info";
  resolved: boolean;
  previouslyRaised?: boolean;
  overcomeStatus?: "overcome" | "not-overcome" | "partially-overcome";
}

export interface FeedbackEntry {
  id: string;
  targetId: string;
  targetType: "claim-feature" | "novelty-row" | "chat-message";
  sentiment: "like" | "dislike" | null;
  comment: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type ModuleScope =
  | "claim-chart"
  | "novelty"
  | "inventive"
  | "summary"
  | "draft"
  | "defects"
  | "case"
  | "documents"
  | "interpret"
  | "opinion-analysis"
  | "argument-mapping";

export interface ChatSession {
  id: string;
  caseId: string;
  moduleScope: ModuleScope;
  title: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface ChatMessage {
  id: string;
  caseId: string;
  sessionId: string;
  moduleScope: ModuleScope;
  role: "user" | "assistant" | "system";
  content: string;
  attachedContextSnapshot?: {
    digestHash: string;
    summary: string;
  };
  externalSendMeta?: {
    provider: string;
    modelId: string;
    tokenInput: number;
    tokenOutput: number;
  };
  createdAt: ISODateTimeString;
}

// ── 复审专用类型 ──────────────────────────────────────

export interface OfficeActionAnalysis {
  id: string;
  caseId: string;
  documentId: string;
  rejectionGrounds: RejectionGround[];
  citedReferences: RejectionCitedReference[];
  status: "draft" | "user-reviewed" | "stale";
  createdAt: ISODateTimeString;
}

export interface RejectionGround {
  code: string;
  category: "novelty" | "inventive" | "clarity" | "support" | "amendment" | "other";
  claimNumbers: number[];
  summary: string;
  legalBasis: string;
  originalText?: string;
}

export interface RejectionCitedReference {
  publicationNumber: string;
  rejectionGroundCodes: string[];
  featureMapping: string;
}

export interface ArgumentMapping {
  id: string;
  caseId: string;
  rejectionGroundCode: string;
  applicantArgument: string;
  argumentSummary: string;
  confidence: "high" | "medium" | "low";
  amendedClaims?: AmendedClaimDetail[];
  newEvidence?: string;
  status: "draft" | "user-reviewed" | "stale";
  createdAt: ISODateTimeString;
}

export interface AmendedClaimDetail {
  claimNumber: number;
  originalText: string;
  amendedText: string;
  changeDescription: string;
}

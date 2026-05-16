import type { ProviderId } from "./agents.js";

export interface AiRunRequest {
  agent: "interpret" | "claim-chart" | "novelty" | "inventive" | "summary" | "draft" | "chat" | "defects" | "search-references" | "extract-case-fields" | "opinion-analysis" | "argument-analysis" | "reexam-draft" | "translate";
  providerPreference: ProviderId[];
  modelId: string;
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
}

export interface SearchReferencesRequest {
  caseId: string;
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
  maxResults?: number;
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

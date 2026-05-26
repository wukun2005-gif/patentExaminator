import type { ProviderId } from "./agents.js";

export interface AiRunRequest {
  agent: "interpret" | "claim-chart" | "novelty" | "inventive" | "summary" | "draft" | "chat" | "defects" | "search-references" | "extract-case-fields" | "opinion-analysis" | "argument-analysis" | "reexam-draft" | "translate" | "classify-documents";
  providerPreference: ProviderId[];
  modelId: string;
  modelFallbacks?: Partial<Record<ProviderId, string[]>>;
  enableModelFallback?: Partial<Record<ProviderId, boolean>>;
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

export interface SearchSummary {
  /** 技术特征数量 */
  featureCount: number;
  /** 检索式数量 */
  queryCount: number;
  /** 数据源名称（如 "EPO"、"Tavily"、"SerpAPI"） */
  dataSource: string;
  /** 原始检索词列表（供折叠展示） */
  queries: string[];
}

export interface SearchReferencesResponse {
  ok: boolean;
  candidates: SearchReferencesCandidate[];
  /** @deprecated 使用 searchSummary 代替 */
  searchQuery?: string;
  /** 检索摘要信息 */
  searchSummary?: SearchSummary;
  error?: string;
}

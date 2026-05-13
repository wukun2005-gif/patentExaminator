import type { AppMode } from "./domain.js";

export type ProviderId = "kimi" | "glm" | "minimax" | "mimo" | "deepseek" | "gemini";

export interface ModelInfo {
  id: string;
  recommendation?: string;
  rpm?: number;
  rpd?: number;
  tpm?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface ProviderConnection {
  providerId: ProviderId;
  baseUrl?: string;
  protocol?: "openai-compatible" | "anthropic-compatible";
  apiKeyRef: string;
  modelIds: string[];
  defaultModelId: string;
  modelFallbacks?: string[];
  enabled: boolean;
}

export type AgentKey = "interpret" | "claim-chart" | "novelty" | "inventive" | "summary" | "draft" | "chat" | "search-references" | "defects" | "extract-case-fields" | "opinion-analysis" | "argument-analysis" | "reexam-draft";

export interface AgentAssignment {
  agent: AgentKey;
  providerOrder: ProviderId[];
  modelId: string;
  modelFallbacks?: string[];
  reasoningLevel?: "low" | "medium" | "high";
  maxTokens: number;
}

export type SearchProviderId = "tavily" | "serpapi" | "custom";

export interface SearchProviderConnection {
  providerId: SearchProviderId;
  name: string;
  apiKeyRef: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface AppSettings {
  mode: AppMode;
  guidelineVersion: string;
  providers: ProviderConnection[];
  agents: AgentAssignment[];
  searchProviders: SearchProviderConnection[];
  sanitizeRules?: Array<{ pattern: string; replace: string; note?: string }>;
  ocrQualityThresholds?: { good: number; poor: number };
  persistKeysEncrypted: boolean;
}

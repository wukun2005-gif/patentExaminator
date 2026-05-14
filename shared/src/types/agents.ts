import type { AppMode } from "./domain.js";

export type ProviderId = "kimi" | "glm" | "minimax" | "mimo" | "deepseek" | "gemini" | "qwen";

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

export interface PresetModelProvider {
  id: ProviderId;
  displayName: string;
  desc: string;
  baseUrl: string;
  keyPlaceholder: string;
}

export interface PresetSearchProvider {
  id: SearchProviderId;
  displayName: string;
  desc: string;
  baseUrl: string;
  keyPlaceholder: string;
}

export const PRESET_MODEL_PROVIDERS: PresetModelProvider[] = [
  { id: "gemini", displayName: "Gemini", desc: "Google AI Studio (免费)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyPlaceholder: "AIza..." },
  { id: "mimo", displayName: "MiMo", desc: "小米 Token Plan", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1", keyPlaceholder: "sk-..." },
  { id: "kimi", displayName: "Kimi", desc: "Moonshot / 月之暗面", baseUrl: "https://api.moonshot.cn/v1", keyPlaceholder: "sk-..." },
  { id: "glm", displayName: "GLM", desc: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", keyPlaceholder: "your-glm-key" },
  { id: "minimax", displayName: "MiniMax", desc: "MiniMax", baseUrl: "https://api.minimax.chat/v1", keyPlaceholder: "your-minimax-key" },
  { id: "deepseek", displayName: "DeepSeek", desc: "深度求索", baseUrl: "https://api.deepseek.com", keyPlaceholder: "sk-..." },
  { id: "qwen", displayName: "Qwen", desc: "阿里通义千问 (DashScope)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyPlaceholder: "sk-..." }
];

export const PRESET_SEARCH_PROVIDERS: PresetSearchProvider[] = [
  { id: "tavily", displayName: "Tavily", desc: "免费额度 1000 次/月，注册地址: app.tavily.com", baseUrl: "https://api.tavily.com", keyPlaceholder: "tvly-..." },
  { id: "serpapi", displayName: "SerpAPI", desc: "Google 专利搜索 API，免费额度 100 次/月", baseUrl: "https://serpapi.com", keyPlaceholder: "your-serpapi-key" }
];

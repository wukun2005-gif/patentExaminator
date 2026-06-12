import type { AppMode } from "./domain.js";
import type { KnowledgeConfig } from "./knowledge.js";

export type ProviderId = "kimi" | "glm" | "minimax" | "mimo" | "deepseek" | "gemini" | "qwen" | "bedrock" | "openrouter" | "opencode" | "volcengine";

export interface ModelInfo {
  id: string;
  recommendation?: string;
  rpm?: number;
  rpd?: number;
  tpm?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  isReasoning?: boolean;
  supportsVision?: boolean;
  supportsStructuredOutput?: boolean;
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
  enableModelFallback?: boolean;
}

type AgentKey = "interpret" | "claim-chart" | "novelty" | "inventive" | "summary" | "chat" | "search-references" | "defects" | "extract-case-fields" | "opinion-analysis" | "argument-analysis" | "reexam-draft" | "classify-documents" | "translate";

export interface AgentAssignment {
  agent: AgentKey;
  providerOrder: ProviderId[];
  modelId: string;
  modelFallbacks?: string[];
  reasoningLevel?: "low" | "medium" | "high";
  maxTokens: number;
}

export type SearchProviderId = "tavily" | "serpapi" | "custom" | "epo";

export interface SearchProviderConnection {
  providerId: SearchProviderId;
  name: string;
  apiKeyRef: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface ProviderErrorMessage {
  id: string;
  providerId: ProviderId;
  modelId?: string;
  errorCode: string;
  message: string;
  timestamp: string;
  read: boolean;
  agent?: string;
  caseId?: string;
}

export interface AppSettings {
  mode: AppMode;
  guidelineVersion: string;
  providers: ProviderConnection[];
  agents: AgentAssignment[];
  searchProviders: SearchProviderConnection[];
  sanitizeRules?: Array<{ pattern: string; replace: string; note?: string }>;
  ocrQualityThresholds?: { good: number; poor: number };
  // B-027: persistKeysEncrypted 已删除（从未有实现）
  enableProviderFallback?: boolean;
  providerErrorMessages?: ProviderErrorMessage[];
  knowledge?: KnowledgeConfig;
  /** nf-9: 知识库独立 API Provider 配置 */
  knowledgeProviders?: KnowledgeProviderConnection[];
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
  { id: "qwen", displayName: "Qwen", desc: "阿里通义千问 (DashScope)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyPlaceholder: "sk-..." },
  { id: "bedrock", displayName: "AWS Bedrock", desc: "AWS Bedrock OpenAI-Compatible API", baseUrl: "https://bedrock-mantle.us-east-1.api.aws/v1", keyPlaceholder: "bedrock-api-key" },
  { id: "openrouter", displayName: "OpenRouter", desc: "统一 API 聚合数百模型", baseUrl: "https://openrouter.ai/api/v1", keyPlaceholder: "sk-or-v1-..." },
  { id: "opencode", displayName: "OpenCode Zen", desc: "OpenCode 官方精选模型网关", baseUrl: "https://opencode.ai/zen/v1", keyPlaceholder: "opencode-zen-key" },
  { id: "volcengine", displayName: "火山引擎", desc: "字节跳动 · 火山引擎", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", keyPlaceholder: "sk-..." }
];

export const PRESET_SEARCH_PROVIDERS: PresetSearchProvider[] = [
  { id: "tavily", displayName: "Tavily", desc: "免费额度 1000 次/月，注册地址: app.tavily.com", baseUrl: "https://api.tavily.com", keyPlaceholder: "tvly-..." },
  { id: "serpapi", displayName: "SerpAPI", desc: "Google 专利搜索 API，免费额度 100 次/月", baseUrl: "https://serpapi.com", keyPlaceholder: "your-serpapi-key" },
  { id: "epo", displayName: "EPO OPS", desc: "欧洲专利局官方 API (OPS v3.2)，结构化专利数据", baseUrl: "https://ops.epo.org/3.2", keyPlaceholder: "Consumer Key / Consumer Secret" }
];

// ── nf-9: 知识库独立 API Provider ─────────────────────

export type KnowledgeProviderType = "embedding" | "reranker";

export interface KnowledgeProviderConnection {
  providerType: KnowledgeProviderType;
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKeyRef: string;
  modelId: string;
  availableModels: string[];
  enabled: boolean;
}

export interface PresetKnowledgeProvider {
  providerType: KnowledgeProviderType;
  providerId: string;
  displayName: string;
  desc: string;
  baseUrl: string;
  defaultModelId: string;
  keyPlaceholder: string;
}

export const PRESET_KNOWLEDGE_PROVIDERS: PresetKnowledgeProvider[] = [
  {
    providerType: "embedding",
    providerId: "siliconflow",
    displayName: "硅基流动 Embedding",
    desc: "SiliconFlow Embedding API（免费额度）",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModelId: "BAAI/bge-m3",
    keyPlaceholder: "sk-...",
  },
  {
    providerType: "reranker",
    providerId: "siliconflow",
    displayName: "硅基流动 Re-ranker",
    desc: "SiliconFlow Re-ranker API（免费额度）",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModelId: "BAAI/bge-reranker-v2-m3",
    keyPlaceholder: "sk-...",
  },
];

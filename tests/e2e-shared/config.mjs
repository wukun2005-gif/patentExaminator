/**
 * E2E 测试共享配置
 * ================
 *
 * 集中管理所有 E2E 测试的配置项，包括：
 * - API key 名称和环境变量
 * - Fallback 模型链条
 * - 可重试错误关键词
 * - 超时和延迟配置
 * - 测试数据路径
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ── 测试数据路径 ──────────────────────────────────────────────────

/** 案件测试数据目录 */
export const SAMPLES_CASE_DIR = path.join(ROOT, "samples", "led-heatsink-mini");

/** 知识库测试数据目录 */
export const SAMPLES_KNOWLEDGE_DIR = path.join(ROOT, "samples", "knowledge-base");

// ── API Key 配置 ─────────────────────────────────────────────────────

/** API key 环境变量名称映射 */
export const API_KEY_NAMES = {
  gemini: "GEMINI_KEY",
  mimo: "MiMo_KEY",
  openrouter: "Openrouter_KEY",
  tavily: "TAVILY_API_KEY",
  serp: "SerpAPI_KEY",
  epo: "EPO_CONSUMER_KEY",
  epoSecret: "EPO_CONSUMER_SECRET_KEY",
  // 知识库 Embedding 和 Reranker 可以用不同的 key
  // 当前简化为同一个 siliconflow key，但保持独立映射以便将来扩展
  embedding: "siliconflow_Key",
  reranker: "siliconflow_Key",
};

/** 默认模型 ID */
export const DEFAULT_MODEL_IDS = {
  gemini: "gemini-3.1-flash-lite-preview",
  mimo: "MiMo-V2.5",
  openrouter: "deepseek/deepseek-v4-flash:free",
};

// ── Fallback 模型链条 ────────────────────────────────────────────────

/** Gemini fallback 模型列表 */
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro",
];

/** OpenRouter fallback 模型列表（带标签） */
export const OPENROUTER_FALLBACK_MODELS = [
  { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4" },
  { id: "z-ai/glm-4.5-air:free", label: "GLM-4.5" },
  { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder" },
  { id: "arcee-ai/trinity-large-thinking:free", label: "Trinity Large" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma-4" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next" },
  { id: "minimax/minimax-m2.5:free", label: "MiniMax M2.5" },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron" },
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS" },
];

/** OpenRouter 每个模型的最大重试次数 */
export const OPENROUTER_MAX_ATTEMPTS_PER_MODEL = 3;

// ── 可重试错误关键词 ─────────────────────────────────────────────────

/** 可重试的错误关键词列表 */
export const RETRYABLE_ERROR_KEYWORDS = [
  "配额不足",
  "resource_exhausted",
  "429",
  "503",
  "unavailable",
  "high demand",
  "rate limit",
  "quota",
  "500",
  "timeout",
  "econnreset",
];

// ── 禁止的模型模式 ──────────────────────────────────────────────────

/** 禁止的模型名称模式（用于过滤非文本模型） */
export const BANNED_MODEL_PATTERNS = [
  /\bimage\b/i,
  /\bimagen\b/i,
  /\bnano\s*banana\b/i,
  /\baudio\b/i,
  /\bspeech\b/i,
  /\btts\b/i,
  /\bembedding\b/i,
  /\bembed\b/i,
  /\bveo\b/i,
  /\bvideo\b/i,
  /\blyria\b/i,
  /\bmusic\b/i,
  /\bdeep[- ]?research\b/i,
  /\brobotics\b/i,
  /\bcomputer[- ]?use\b/i,
];

// ── 超时和延迟配置 ──────────────────────────────────────────────────

/** AI 请求速率限制延迟（毫秒） */
export const AI_RATE_LIMIT_DELAY = Number(process.env.GEMINI_RATE_LIMIT_DELAY) || 8000;

/** 搜索请求速率限制延迟（毫秒） */
export const SEARCH_RATE_LIMIT_DELAY = Number(process.env.SEARCH_RATE_LIMIT_DELAY) || 15000;

/** Real 模式测试单个测试超时（毫秒） */
export const REAL_MODE_TEST_TIMEOUT = 60_000;

/** 重试基础延迟（毫秒） */
export const RETRY_BASE_DELAY = 5000;

/** 重试延迟增量（毫秒） */
export const RETRY_DELAY_INCREMENT = 3000;

// ── 测试服务器配置 ──────────────────────────────────────────────────

/** 默认测试服务器地址 */
export const DEFAULT_TEST_BASE = "http://localhost:3000/api";

// ── 智能测试选择：文件路径 → 测试组映射 ─────────────────────────────

/**
 * 根据 git diff 变更文件自动选择测试组。
 * 用于 `node tests/e2e.mjs --auto`。
 */
export const FILE_TO_TEST_MAP = [
  // 知识库相关（knowledge 包含上传/搜索/集成测试）
  { pattern: /^server\/src\/routes\/knowledge/, groups: ["knowledge"] },
  { pattern: /^server\/src\/lib\/knowledgeDb/, groups: ["knowledge"] },
  { pattern: /^client\/src\/lib\/knowledge/, groups: ["knowledge"] },
  { pattern: /^client\/src\/features\/settings\/Knowledge/, groups: ["knowledge"] },
  { pattern: /^samples\/knowledge-base/, groups: ["knowledge"] },
  { pattern: /^shared\/src\/types\/knowledge/, groups: ["knowledgeCodeStructure"] },

  // AI Agent 相关
  { pattern: /^server\/src\/lib\/orchestrator/, groups: ["mock", "real", "schema", "pipeline"] },
  { pattern: /^server\/src\/lib\/agents/, groups: ["mock", "real", "schema"] },
  { pattern: /^server\/src\/routes\/ai/, groups: ["mock", "real", "schema"] },
  { pattern: /^shared\/src\/fixtures/, groups: ["mock", "schema"] },
  { pattern: /^shared\/src\/schemas/, groups: ["schema"] },

  // 搜索相关
  { pattern: /^server\/src\/lib\/search/, groups: ["mock", "real"] },
  { pattern: /^server\/src\/routes\/search/, groups: ["mock", "real"] },

  // 数据库相关
  { pattern: /^server\/src\/lib\/syncDb/, groups: ["db"] },
  { pattern: /^server\/src\/lib\/knowledgeDb/, groups: ["db", "knowledge"] },
  { pattern: /^tests\/integration\/db/, groups: ["db"] },

  // 前端 UI
  { pattern: /^client\/src/, groups: ["health"] },

  // 测试文件自身 — 不自动触发
  { pattern: /^tests\//, groups: [] },
  { pattern: /^(package|tsconfig|vitest)/, groups: [] },
  { pattern: /^docs\//, groups: [] },
];

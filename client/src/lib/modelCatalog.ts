import type { ProviderId, ModelInfo } from "@shared/types/agents";

export const DEFAULT_MODELS: Record<ProviderId, ModelInfo[]> = {
  gemini: [
    // ── Gemini 3.x 系列（最新）──
    { id: "gemini-3.5-flash", recommendation: "3.5 Flash 最智能 (1M/65K, 思考+GA)", inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { id: "gemini-3.1-flash-lite", recommendation: "3.1 Flash-Lite 低成本 (1M/65K)", inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    // ── Gemini 2.x 系列 ──
    { id: "gemini-2.5-flash-lite", recommendation: "2.5 Flash-Lite (速度极快、配额最高)", rpm: 30, rpd: 2000, tpm: "15.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.0-flash-lite", recommendation: "2.0 Flash-Lite 轻量快速", rpm: 30, rpd: 2000, tpm: "15.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.5-flash", recommendation: "2.5 Flash 综合能力最强", rpm: 15, rpd: 1500, tpm: "25.0M", inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { id: "gemini-2.0-flash", recommendation: "2.0 Flash 稳定版", rpm: 15, rpd: 1500, tpm: "25.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.5-pro", recommendation: "2.5 Pro 高级能力 (配额较低)", rpm: 2, rpd: 50, tpm: "12.5M", inputTokenLimit: 1048576, outputTokenLimit: 65536 }
  ],
  mimo: [
    // ── Pro 系列（1M/128K）──
    { id: "mimo-v2.5-pro", recommendation: "V2.5-Pro 最强推理 (1M/128K)", rpm: 100, rpd: 0, tpm: "10.0M", inputTokenLimit: 1048576, outputTokenLimit: 131072 },
    { id: "mimo-v2-pro", recommendation: "V2-Pro (1M/128K)", rpm: 100, rpd: 0, tpm: "10.0M", inputTokenLimit: 1048576, outputTokenLimit: 131072 },
    // ── Omni 系列（全模态理解）──
    { id: "mimo-v2.5", recommendation: "V2.5 全模态 (1M/128K)", inputTokenLimit: 1048576, outputTokenLimit: 131072 },
    { id: "mimo-v2-omni", recommendation: "V2-Omni 全模态 (256K/128K)", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    // ── Flash 系列（低成本快速）──
    { id: "mimo-v2-flash", recommendation: "V2-Flash 快速 (256K/64K)", inputTokenLimit: 262144, outputTokenLimit: 65536 },
  ],
  kimi: [
    // ── K2 系列（256k 上下文，思考模型，默认启用 thinking）──
    { id: "kimi-k2.6", recommendation: "K2.6 最新 (思考+视觉, 256K)", inputTokenLimit: 262144, outputTokenLimit: 16384 },
    { id: "kimi-k2.5", recommendation: "K2.5 (思考+视觉, 256K)", inputTokenLimit: 262144, outputTokenLimit: 16384 },
    // ── Moonshot V1 生成模型 ──
    { id: "moonshot-v1-128k", recommendation: "长文本 (128K)", rpm: 5, rpd: 300, tpm: "3.0M" },
    { id: "moonshot-v1-32k", recommendation: "标准 (32K)", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "moonshot-v1-8k", recommendation: "短文本 (8K)", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "moonshot-v1-auto", recommendation: "自动选择长度", rpm: 5, rpd: 300, tpm: "3.0M" },
    // ── Moonshot V1 Vision ──
    { id: "moonshot-v1-128k-vision-preview", recommendation: "Vision 长文本 (128K)", rpm: 5, rpd: 300, tpm: "3.0M" },
    { id: "moonshot-v1-32k-vision-preview", recommendation: "Vision 标准 (32K)", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "moonshot-v1-8k-vision-preview", recommendation: "Vision 短文本 (8K)", rpm: 10, rpd: 500, tpm: "5.0M" },
  ],
  glm: [
    // ── GLM-5 系列（200K/128K，思考模型）──
    { id: "glm-5.1", recommendation: "GLM-5.1 最新旗舰 (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    { id: "glm-5", recommendation: "GLM-5 高智能基座 (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    { id: "glm-5-turbo", recommendation: "GLM-5-Turbo (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    // ── GLM-5V 视觉 ──
    { id: "glm-5v-turbo", recommendation: "GLM-5V 多模态Coding (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    // ── GLM-4.7/4.6（200K/128K）──
    { id: "glm-4.7", recommendation: "GLM-4.7 (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    { id: "glm-4.7-flash", recommendation: "GLM-4.7-Flash 免费 (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    { id: "glm-4.6", recommendation: "GLM-4.6 (200K/128K)", inputTokenLimit: 204800, outputTokenLimit: 131072 },
    // ── GLM-4.5（128K/96K）──
    { id: "glm-4.5-air", recommendation: "GLM-4.5-Air 高性价比 (128K/96K)", inputTokenLimit: 131072, outputTokenLimit: 98304 },
    // ── GLM-4 视觉 ──
    { id: "glm-4.6v", recommendation: "GLM-4.6V 视觉推理 (128K/32K)", inputTokenLimit: 131072, outputTokenLimit: 32768 },
    { id: "glm-4.6v-flash", recommendation: "GLM-4.6V-Flash 免费视觉 (128K/32K)", inputTokenLimit: 131072, outputTokenLimit: 32768 },
    // ── GLM-4 其他 ──
    { id: "glm-4-long", recommendation: "GLM-4-Long 超长输入 (1M/4K)", inputTokenLimit: 1048576, outputTokenLimit: 4096 },
    { id: "glm-4-plus", recommendation: "GLM-4-Plus 旧版", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "glm-4", recommendation: "GLM-4 旧版", inputTokenLimit: 131072, outputTokenLimit: 8192 },
  ],
  minimax: [
    { id: "abab6.5s-chat", recommendation: "快速版", rpm: 15, rpd: 1000, tpm: "10.0M" },
    { id: "abab6.5-chat", recommendation: "标准版", rpm: 10, rpd: 500, tpm: "5.0M" }
  ],
  deepseek: [
    // ── V4 系列（官方 API，1M 上下文，384K 输出，支持 JSON/Tool Calls）──
    { id: "deepseek-v4-pro", recommendation: "V4 Pro (最强推理，500并发)", inputTokenLimit: 1048576, outputTokenLimit: 393216 },
    { id: "deepseek-v4-flash", recommendation: "V4 Flash (快速推理，2500并发)", inputTokenLimit: 1048576, outputTokenLimit: 393216 },
    // ── V3.2（火山引擎托管）──
    { id: "deepseek-v3-2-251201", recommendation: "V3.2 (深度思考)", inputTokenLimit: 131072, outputTokenLimit: 32768 },
    // ── 弃用模型（2026-07-24 前仍可用）──
    { id: "deepseek-reasoner", recommendation: "R1 (2026-07弃用→v4-flash思考)", inputTokenLimit: 65536, outputTokenLimit: 16384 },
    { id: "deepseek-chat", recommendation: "V3 (2026-07弃用→v4-flash非思考)", inputTokenLimit: 65536, outputTokenLimit: 8192 },
  ],
  qwen: [
    { id: "qwen-turbo", recommendation: "速度最快、配额最高", rpm: 15, rpd: 1000, tpm: "10.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "qwen-plus", recommendation: "能力均衡", rpm: 10, rpd: 500, tpm: "5.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "qwen-max", recommendation: "能力最强", rpm: 5, rpd: 200, tpm: "3.0M", inputTokenLimit: 32768, outputTokenLimit: 8192 },
    { id: "qwen3-235b-a22b", recommendation: "最新旗舰 MoE", rpm: 5, rpd: 200, tpm: "3.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 }
  ],
  bedrock: [
    { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", recommendation: "Claude 3.5 Sonnet (最强)", inputTokenLimit: 200000, outputTokenLimit: 8192 },
    { id: "anthropic.claude-3-5-haiku-20241022-v1:0", recommendation: "Claude 3.5 Haiku (快速)", inputTokenLimit: 200000, outputTokenLimit: 8192 },
    { id: "anthropic.claude-3-sonnet-20240229-v1:0", recommendation: "Claude 3 Sonnet", inputTokenLimit: 200000, outputTokenLimit: 4096 },
    { id: "anthropic.claude-3-haiku-20240307-v1:0", recommendation: "Claude 3 Haiku", inputTokenLimit: 200000, outputTokenLimit: 4096 },
    { id: "meta.llama3-2-3b-instruct-v1:0", recommendation: "Llama 3.2 3B (轻量)", inputTokenLimit: 131072, outputTokenLimit: 2048 },
    { id: "meta.llama3-2-1b-instruct-v1:0", recommendation: "Llama 3.2 1B (最小)", inputTokenLimit: 131072, outputTokenLimit: 2048 }
  ],
  openrouter: [
    // ── 推理模型 ──
    { id: "openai/gpt-5.5", recommendation: "GPT-5.5 最新旗舰 (1M/128K)", inputTokenLimit: 1048576, outputTokenLimit: 131072 },
    { id: "anthropic/claude-opus-4-8", recommendation: "Claude Opus 4.8 (1M/128K)", inputTokenLimit: 1048576, outputTokenLimit: 131072 },
    { id: "google/gemini-2.5-pro", recommendation: "Gemini 2.5 Pro (最强推理)", inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { id: "google/gemini-2.5-flash", recommendation: "Gemini 2.5 Flash (快速)", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "deepseek/deepseek-r1", recommendation: "DeepSeek R1 (推理)", inputTokenLimit: 65536, outputTokenLimit: 16384 },
    { id: "qwen/qwen3-235b-a22b", recommendation: "Qwen3 旗舰 MoE", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    // ── 非推理模型 ──
    { id: "openai/gpt-4o", recommendation: "OpenAI GPT-4o", inputTokenLimit: 128000, outputTokenLimit: 16384 },
    { id: "openai/gpt-4o-mini", recommendation: "GPT-4o Mini (快速经济)", inputTokenLimit: 128000, outputTokenLimit: 16384 },
    { id: "anthropic/claude-3.5-sonnet", recommendation: "Claude 3.5 Sonnet", inputTokenLimit: 200000, outputTokenLimit: 8192 },
    { id: "anthropic/claude-3-haiku", recommendation: "Claude 3 Haiku (快速)", inputTokenLimit: 200000, outputTokenLimit: 4096 },
    { id: "deepseek/deepseek-chat", recommendation: "DeepSeek V3 (弃用)", inputTokenLimit: 65536, outputTokenLimit: 8192 },
    { id: "meta-llama/llama-4-maverick", recommendation: "Llama 4 Maverick", inputTokenLimit: 128000, outputTokenLimit: 8192 },
  ],
  opencode: [
    { id: "deepseek-v4-flash-free", recommendation: "DeepSeek V4 Flash Free (免费)", inputTokenLimit: 1048576, outputTokenLimit: 393216 },
    { id: "kimi-k2.5", recommendation: "Kimi K2.5 (推荐)", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "kimi-k2.6", recommendation: "Kimi K2.6 (最新)", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "glm-5", recommendation: "GLM 5", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "glm-5.1", recommendation: "GLM 5.1 (最新)", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "minimax-m2.5", recommendation: "MiniMax M2.5", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "minimax-m2.7", recommendation: "MiniMax M2.7 (最新)", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "nemotron-3-super-free", recommendation: "Nemotron 3 Super Free (免费)", inputTokenLimit: 128000, outputTokenLimit: 8192 },
  ],
  doubao: [
    // ── Seed 2.0 最新推荐 (260428) ──
    { id: "doubao-seed-2-0-lite-260428", recommendation: "Seed 2.0 Lite (最新推荐)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    { id: "doubao-seed-2-0-mini-260428", recommendation: "Seed 2.0 Mini (最新推荐)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    // ── Seed 2.0 (260215) ──
    { id: "doubao-seed-2-0-pro-260215", recommendation: "Seed 2.0 Pro (旗舰推理)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    { id: "doubao-seed-2-0-lite-260215", recommendation: "Seed 2.0 Lite (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    { id: "doubao-seed-2-0-mini-260215", recommendation: "Seed 2.0 Mini (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    { id: "doubao-seed-2-0-code-preview-260215", recommendation: "Seed 2.0 Code (代码推理)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 131072 },
    // ── Seed 1.8 ──
    { id: "doubao-seed-1-8-251228", recommendation: "Seed 1.8", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 65536 },
    // ── Seed 1.6 ──
    { id: "doubao-seed-1-6-251015", recommendation: "Seed 1.6 (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    { id: "doubao-seed-1-6-250615", recommendation: "Seed 1.6 (0615)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    { id: "doubao-seed-1-6-flash-250828", recommendation: "Seed 1.6 Flash (快速+视觉定位)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    { id: "doubao-seed-1-6-flash-250615", recommendation: "Seed 1.6 Flash (0615)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    { id: "doubao-seed-1-6-vision-250815", recommendation: "Seed 1.6 Vision (GUI+多模态)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    // ── Seed Code ──
    { id: "doubao-seed-code-preview-251028", recommendation: "Seed Code (编程增强)", rpm: 5000, rpd: 0, tpm: "1.2M", inputTokenLimit: 262144, outputTokenLimit: 32768 },
    // ── Seed Character ──
    { id: "doubao-seed-character-251128", recommendation: "Seed Character (角色扮演)", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 98304, outputTokenLimit: 32768 },
    // ── 1.5 系列 ──
    { id: "doubao-1-5-pro-32k-250115", recommendation: "1.5 Pro 标准版", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 131072, outputTokenLimit: 16384 },
    { id: "doubao-1-5-lite-32k-250115", recommendation: "1.5 Lite 轻量版", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 32768, outputTokenLimit: 12288 },
    { id: "doubao-1-5-vision-pro-32k-250115", recommendation: "1.5 Vision 多模态", rpm: 30000, rpd: 0, tpm: "5.0M", inputTokenLimit: 32768, outputTokenLimit: 12288 },
    // ── 火山引擎托管的 DeepSeek 模型 ──
    { id: "deepseek-v4-pro-260425", recommendation: "DeepSeek V4 Pro (火山托管)", rpm: 15000, rpd: 0, tpm: "1.5M", inputTokenLimit: 1048576, outputTokenLimit: 393216 },
    { id: "deepseek-v4-flash-260425", recommendation: "DeepSeek V4 Flash (火山托管)", rpm: 15000, rpd: 0, tpm: "1.5M", inputTokenLimit: 1048576, outputTokenLimit: 393216 },
    { id: "deepseek-v3-2-251201", recommendation: "DeepSeek V3.2 (火山托管)", rpm: 15000, rpd: 0, tpm: "1.5M", inputTokenLimit: 131072, outputTokenLimit: 32768 },
  ]
};

/**
 * Gemini 免费 tier 配额按模型系列推断 (flash-lite > flash > pro)。
 * 查询 API 返回的模型 ID 可能不在 DEFAULT_MODELS 里，用此函数兜底。
 */
function inferGeminiMeta(id: string): ModelInfo {
  if (id.includes("flash-lite")) {
    return { id, recommendation: "最推荐 (速度极快、配额最高)", rpm: 30, rpd: 2000, tpm: "15.0M" };
  }
  if (id.includes("flash")) {
    return { id, recommendation: "综合能力均衡", rpm: 15, rpd: 1500, tpm: "25.0M" };
  }
  if (id.includes("pro")) {
    return { id, recommendation: "高级能力 (配额较低)", rpm: 2, rpd: 50, tpm: "12.5M" };
  }
  return { id, recommendation: "通用模型", rpm: 15, rpd: 1500, tpm: "25.0M" };
}

export function getModelMeta(providerId: ProviderId, modelId: string): ModelInfo | undefined {
  const exact = DEFAULT_MODELS[providerId]?.find((m) => m.id === modelId);
  if (exact) return exact;
  if (providerId === "gemini") return inferGeminiMeta(modelId);
  return undefined;
}

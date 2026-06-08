/**
 * 模型能力注册表 — 前缀匹配查询
 *
 * 精确前缀匹配 → 最长前缀胜出 → 保守默认值。
 * D1 的 thinkingModelCache 可在运行时覆盖 isReasoning 字段。
 */

import type { ModelCapabilities } from "./ModelCapabilities.js";

// 按 modelId 前缀匹配的默认能力表
// 精确匹配优先于前缀匹配
const CAPABILITY_PRESETS: Record<string, Partial<ModelCapabilities>> = {
  // ── 推理模型系列 ──
  "gemini-2.5":     { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  "gemini-3":       { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  // ── MiMo v2 系列（api.xiaomimimo.com）──
  // 来源：XMiMo 官方文档 → 模型与限速 + 模型超参（2026-06-02/03 更新）
  // temperature 范围 [0, 1.5]；思考模式下 pro/omni 强制 temperature=1.0, top_p=0.95
  // mimo-v2.5-pro: 1M 上下文，128K 输出，深度思考，结构化输出，函数调用
  "mimo-v2.5-pro":  { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // mimo-v2.5: 1M 上下文，128K 输出，全模态理解（图片/音频/视频），深度思考
  "mimo-v2.5":      { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  // mimo-v2-pro: 同 mimo-v2.5-pro
  "mimo-v2-pro":    { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // mimo-v2-omni: 256K 上下文，128K 输出，全模态理解
  "mimo-v2-omni":   { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  // mimo-v2-flash: 256K 上下文，64K 输出，低成本快速响应，默认 temperature 0.3
  "mimo-v2-flash":  { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 65_536,  temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // mimo-v2 默认兜底
  "mimo-v2":        { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // ── DeepSeek V4 — 官方 api.deepseek.com（2026-07-24 后 deepseek-chat/reasoner 弃用）──
  // 来源：https://api-docs.deepseek.com/zh-cn/ → 模型 & 价格
  // 上下文 1M，最大输出 384K，支持 JSON Output(json_object)、Tool Calls、思考模式
  // 思考模式下 temperature 被静默忽略；JSON Output 用 response_format:{type:'json_object'}（非 json_schema）
  "deepseek-v4":    { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // ── DeepSeek V4 — 火山引擎托管（带日期后缀）──
  // 来源：火山引擎模型广场 deepseek-v4-pro-260425 / deepseek-v4-flash-260425
  // 参数与官方 API 一致：1024k 上下文，384k 输出，深度思考，工具调用
  "deepseek-v4-pro-260425":  { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "deepseek-v4-flash-260425": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // ── DeepSeek V3.2 — 火山引擎托管 ──
  // 来源：火山引擎模型广场 deepseek-v3-2-251201，128k 上下文，32k 输出
  "deepseek-v3-2-251201": { isReasoning: true, contextWindow: 131_072, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // ── DeepSeek R1 — 官方 API（2026-07-24 弃用 → deepseek-v4-flash 思考模式）──
  "deepseek-reasoner": { isReasoning: true, contextWindow: 65_536, maxOutputTokens: 16_384, temperature: { supported: false, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // ── Kimi K2 系列（api.moonshot.cn）──
  // 来源：platform.kimi.com → 模型列表 + 模型参数参考 + 创建对话补全
  // kimi-k2.6: 256k 上下文，temperature 不可修改，支持 thinking（extra_body），支持 json_schema，支持视觉
  "kimi-k2.6":      { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 32_768, temperature: { supported: false, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  // kimi-k2.5: 256k 上下文，支持 thinking，temperature 不可修改（固定 1.0），支持视觉
  "kimi-k2.5":      { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 32_768, temperature: { supported: false, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  // 已下线模型（2026-05-25）— 保留注册表条目以兼容历史配置
  "kimi-k2":        { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  "kimi-k2-thinking": { isReasoning: true, contextWindow: 131_072,  maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // ── GLM 智谱（open.bigmodel.cn）──
  // 来源：docs.bigmodel.cn → 模型概览（2026-06 获取）
  // GLM-5.1 最新旗舰，GLM-5/5-Turbo/4.7/4.6/4.7-Flash 均为 200K/128K
  "glm-5.1":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "glm-5":          { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // GLM-5V-Turbo: 多模态 Coding 模型，支持视觉
  "glm-5v":         { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  // GLM-4.7/4.6: 200K/128K
  "glm-4.7":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "glm-4.6":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // GLM-4.5-Air/AirX: 128K/96K
  "glm-4.5":        { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 98_304,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // GLM-4-Long: 1M 上下文，4K 输出
  "glm-4-long":     { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 4_096,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // GLM-4.6V/4.5V 视觉推理
  "glm-4.6v":       { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 32_768,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  // GLM-4.1V-Thinking: 轻量视觉推理，64K/16K
  "glm-4.1v":       { isReasoning: true,  contextWindow: 65_536,    maxOutputTokens: 16_384,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "glm-4v":         { isReasoning: false, contextWindow: 16_384,    maxOutputTokens: 1_024,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  // GLM-4 默认（glm-4-plus 等旧模型）
  "glm-4":          { isReasoning: false, contextWindow: 131_072,   maxOutputTokens: 8_192,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // ── doubao-seed 系列（火山引擎官方参数）──
  // seed-2-0-lite/mini-260215 支持结构化输出（最长前缀优先）
  "doubao-seed-2-0-lite-260215": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  "doubao-seed-2-0-mini-260215": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  // doubao-seed-character: 非推理模型，128k 窗口
  "doubao-seed-character": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // doubao-seed-1-6 全系列支持结构化输出
  "doubao-seed-1-6": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  // doubao-seed-1-8: 64k 输出，32k 思维链
  "doubao-seed-1-8": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  // doubao-seed 默认（2.0-pro/code 等）：256k 窗口，128k 输出，支持视觉，不支持结构化输出
  "doubao-seed":    { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "doubao-1-5-vision": { isReasoning: false, contextWindow: 32_768, maxOutputTokens: 12_288, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "doubao-1-5":     { isReasoning: false, contextWindow: 131_072,   maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },

  // ── 带 provider 前缀的模型（OpenRouter 等）──
  // ── Anthropic Claude（OpenRouter 托管）──
  // 来源：openrouter.ai → anthropic/claude-opus-4.8（2026-06 获取）
  // 1M 上下文，128K 输出，支持推理（reasoning tokens）、视觉、文件输入
  "anthropic/claude-opus-4": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  // ── Anthropic Claude（Bedrock 托管，model ID 用 . 分隔）──
  "anthropic.claude-opus-4": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  // ── OpenAI GPT-5.5（OpenRouter 托管）──
  // 来源：openrouter.ai → openai/gpt-5.5（2026-06 获取）
  // 1M+ 上下文，128K 输出，支持推理、视觉、结构化输出
  "openai/gpt-5":   { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "google/gemini-": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter" },

  // ── 非推理模型 ──
  "gemini-2.0":     { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  // ── DeepSeek V3 — 官方 API（deepseek-chat 即 V3，2026-07-24 弃用）──
  "deepseek-chat":  { isReasoning: false, contextWindow: 65_536,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "gpt-4o":         { isReasoning: false, contextWindow: 128_000,  maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  "qwen-":          { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // moonshot-v1-*: 非推理，temperature [0,1] 默认 0.0，支持 json_schema
  // moonshot-v1-*-vision-preview: 支持 image_url/video_url 多模态输入
  "moonshot-v1-":    { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  "moonshot-v1-128k-vision": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "moonshot-v1-32k-vision":  { isReasoning: false, contextWindow: 32_768,  maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "moonshot-v1-8k-vision":   { isReasoning: false, contextWindow: 8_192,   maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "glm-4":          { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "minimax-":       { isReasoning: false, contextWindow: 65_536,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "doubao-2.0":     { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  isReasoning: false,
  temperature: { supported: true, range: [0, 2] },
  supportsStructuredOutput: false,
  supportsVision: false,
  systemPromptMode: "message",
};

/**
 * 获取模型能力。匹配逻辑：精确前缀匹配 → 最长前缀胜出 → 默认值。
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const normalized = modelId.toLowerCase();

  // 精确匹配
  if (CAPABILITY_PRESETS[normalized]) {
    return { ...DEFAULT_CAPABILITIES, ...CAPABILITY_PRESETS[normalized] };
  }

  // 最长前缀匹配
  let bestMatch: string | null = null;
  for (const prefix of Object.keys(CAPABILITY_PRESETS)) {
    if (normalized.startsWith(prefix.toLowerCase())) {
      if (!bestMatch || prefix.length > bestMatch.length) {
        bestMatch = prefix;
      }
    }
  }

  if (bestMatch) {
    return { ...DEFAULT_CAPABILITIES, ...CAPABILITY_PRESETS[bestMatch] };
  }

  return { ...DEFAULT_CAPABILITIES };
}

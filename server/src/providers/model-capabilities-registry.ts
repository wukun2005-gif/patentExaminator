/**
 * 模型能力注册表 — 前缀匹配查询 + 模型目录
 *
 * 精确前缀匹配 → 最长前缀胜出 → 保守默认值。
 * D1 的 thinkingModelCache 可在运行时覆盖 isReasoning 字段。
 *
 * bug9: CAPABILITY_PRESETS 同时作为 client 模型目录的单一数据源，
 * 包含 recommendation/rpm/rpd/tpm 元数据。getModelCatalog() 按 provider 分组返回。
 */

import type { ModelCapabilities } from "./ModelCapabilities.js";
import type { ProviderId, ModelInfo } from "../../../shared/src/types/agents.js";

// 按 modelId 前缀匹配的默认能力表
// 精确匹配优先于前缀匹配
const CAPABILITY_PRESETS: Record<string, Partial<ModelCapabilities>> = {
  // ── 推理模型系列 ──
  "gemini-2.5":     { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  "gemini-3":       { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  // ── Gemini 完整模型 ID（client 目录）──
  "gemini-3.5-flash":      { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "3.5 Flash 最智能 (1M/65K, 思考+GA)" },
  "gemini-3.1-flash-lite": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "3.1 Flash-Lite 低成本 (1M/65K)" },
  "gemini-2.5-flash-lite": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "2.5 Flash-Lite (速度极快、配额最高)", rpm: 30, rpd: 2000, tpm: "15.0M" },
  "gemini-2.0-flash-lite": { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "2.0 Flash-Lite 轻量快速", rpm: 30, rpd: 2000, tpm: "15.0M" },
  "gemini-2.5-flash":      { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "2.5 Flash 综合能力最强", rpm: 15, rpd: 1500, tpm: "25.0M" },
  "gemini-2.0-flash":      { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "2.0 Flash 稳定版", rpm: 15, rpd: 1500, tpm: "25.0M" },
  "gemini-2.5-pro":        { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "2.5 Pro 高级能力 (配额较低)", rpm: 2, rpd: 50, tpm: "12.5M" },
  // ── MiMo v2 系列（api.xiaomimimo.com）──
  // 来源：XMiMo 官方文档 → 模型与限速 + 模型超参（2026-06-02/03 更新）
  // temperature 范围 [0, 1.5]；思考模式下 pro/omni 强制 temperature=1.0, top_p=0.95
  // mimo-v2.5-pro: 1M 上下文，128K 输出，深度思考，结构化输出，函数调用
  "mimo-v2.5-pro":  { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message", recommendation: "V2.5-Pro 最强推理 (1M/128K)", rpm: 100, rpd: 0, tpm: "10.0M" },
  // mimo-v2.5: 1M 上下文，128K 输出，全模态理解（图片/音频/视频），深度思考
  "mimo-v2.5":      { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message", recommendation: "V2.5 全模态 (1M/128K)" },
  // mimo-v2-pro: 同 mimo-v2.5-pro
  "mimo-v2-pro":    { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message", recommendation: "V2-Pro (1M/128K)", rpm: 100, rpd: 0, tpm: "10.0M" },
  // mimo-v2-omni: 256K 上下文，128K 输出，全模态理解
  "mimo-v2-omni":   { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message", recommendation: "V2-Omni 全模态 (256K/128K)" },
  // mimo-v2-flash: 256K 上下文，64K 输出，低成本快速响应，默认 temperature 0.3
  "mimo-v2-flash":  { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 65_536,  temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message", recommendation: "V2-Flash 快速 (256K/64K)" },
  // mimo-v2 默认兜底
  "mimo-v2":        { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1.5] }, supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // ── DeepSeek V4 — 官方 api.deepseek.com（2026-07-24 后 deepseek-chat/reasoner 弃用）──
  // 来源：https://api-docs.deepseek.com/zh-cn/ → 模型 & 价格
  // 上下文 1M，最大输出 384K，支持 JSON Output(json_object)、Tool Calls、思考模式
  // 思考模式下 temperature 被静默忽略；JSON Output 用 response_format:{type:'json_object'}（非 json_schema）
  "deepseek-v4":    { isReasoning: true,  contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "deepseek-v4-pro":   { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "V4 Pro (最强推理，500并发)" },
  "deepseek-v4-flash": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "V4 Flash (快速推理，2500并发)" },
  // ── DeepSeek V4 — 火山引擎托管（带日期后缀）──
  // 来源：火山引擎模型广场 deepseek-v4-pro-260425 / deepseek-v4-flash-260425
  // 参数与官方 API 一致：1024k 上下文，384k 输出，深度思考，工具调用
  "deepseek-v4-pro-260425":  { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "DeepSeek V4 Pro (火山托管)", rpm: 15000, rpd: 0, tpm: "1.5M" },
  "deepseek-v4-flash-260425": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "DeepSeek V4 Flash (火山托管)", rpm: 15000, rpd: 0, tpm: "1.5M" },
  // ── DeepSeek V3.2 — 火山引擎托管 ──
  // 来源：火山引擎模型广场 deepseek-v3-2-251201，128k 上下文，32k 输出
  "deepseek-v3-2-251201": { isReasoning: true, contextWindow: 131_072, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "V3.2 (深度思考)", rpm: 15000, rpd: 0, tpm: "1.5M" },
  // ── DeepSeek R1 — 官方 API（2026-07-24 弃用 → deepseek-v4-flash 思考模式）──
  "deepseek-reasoner": { isReasoning: true, contextWindow: 65_536, maxOutputTokens: 16_384, temperature: { supported: false, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "R1 (2026-07弃用→v4-flash思考)" },
  "deepseek-chat":     { isReasoning: false, contextWindow: 65_536, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "V3 (2026-07弃用→v4-flash非思考)" },
  // ── Kimi K2 系列（api.moonshot.cn）──
  // 来源：platform.kimi.com → 模型列表 + 模型参数参考 + 创建对话补全
  // kimi-k2.6: 256k 上下文，temperature 不可修改，支持 thinking（extra_body），支持 json_schema，支持视觉
  "kimi-k2.6":      { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 32_768, temperature: { supported: false, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message", recommendation: "K2.6 最新 (思考+视觉, 256K)" },
  // kimi-k2.5: 256k 上下文，支持 thinking，temperature 不可修改（固定 1.0），支持视觉
  "kimi-k2.5":      { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 32_768, temperature: { supported: false, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message", recommendation: "K2.5 (思考+视觉, 256K)" },
  // 已下线模型（2026-05-25）— 保留注册表条目以兼容历史配置
  "kimi-k2":        { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  "kimi-k2-thinking": { isReasoning: true, contextWindow: 131_072,  maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  // ── Kimi Moonshot V1（非推理模型）──
  "moonshot-v1-128k":  { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: false, systemPromptMode: "message", recommendation: "长文本 (128K)", rpm: 5, rpd: 300, tpm: "3.0M" },
  "moonshot-v1-32k":   { isReasoning: false, contextWindow: 32_768,  maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: false, systemPromptMode: "message", recommendation: "标准 (32K)", rpm: 10, rpd: 500, tpm: "5.0M" },
  "moonshot-v1-8k":    { isReasoning: false, contextWindow: 8_192,   maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: false, systemPromptMode: "message", recommendation: "短文本 (8K)", rpm: 10, rpd: 500, tpm: "5.0M" },
  "moonshot-v1-auto":  { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: false, systemPromptMode: "message", recommendation: "自动选择长度", rpm: 5, rpd: 300, tpm: "3.0M" },
  "moonshot-v1-128k-vision-preview": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Vision 长文本 (128K)", rpm: 5, rpd: 300, tpm: "3.0M" },
  "moonshot-v1-32k-vision-preview":  { isReasoning: false, contextWindow: 32_768,  maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Vision 标准 (32K)", rpm: 10, rpd: 500, tpm: "5.0M" },
  "moonshot-v1-8k-vision-preview":   { isReasoning: false, contextWindow: 8_192,   maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Vision 短文本 (8K)", rpm: 10, rpd: 500, tpm: "5.0M" },
  // ── GLM 智谱（open.bigmodel.cn）──
  // 来源：docs.bigmodel.cn → 模型概览（2026-06 获取）
  // GLM-5.1 最新旗舰，GLM-5/5-Turbo/4.7/4.6/4.7-Flash 均为 200K/128K
  "glm-5.1":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-5.1 最新旗舰 (200K/128K)" },
  "glm-5":          { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-5 高智能基座 (200K/128K)" },
  "glm-5-turbo":    { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-5-Turbo (200K/128K)" },
  // GLM-5V-Turbo: 多模态 Coding 模型，支持视觉
  "glm-5v-turbo":   { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message", recommendation: "GLM-5V 多模态Coding (200K/128K)" },
  // GLM-4.7/4.6: 200K/128K
  "glm-4.7":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4.7 (200K/128K)" },
  "glm-4.7-flash":  { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4.7-Flash 免费 (200K/128K)" },
  "glm-4.6":        { isReasoning: true,  contextWindow: 204_800,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4.6 (200K/128K)" },
  // GLM-4.5-Air/AirX: 128K/96K
  "glm-4.5-air":    { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 98_304,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4.5-Air 高性价比 (128K/96K)" },
  // GLM-4-Long: 1M 上下文，4K 输出
  "glm-4-long":     { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 4_096,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4-Long 超长输入 (1M/4K)" },
  // GLM-4.6V/4.5V 视觉推理
  "glm-4.6v":       { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 32_768,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message", recommendation: "GLM-4.6V 视觉推理 (128K/32K)" },
  "glm-4.6v-flash": { isReasoning: true,  contextWindow: 131_072,   maxOutputTokens: 32_768,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message", recommendation: "GLM-4.6V-Flash 免费视觉 (128K/32K)" },
  // GLM-4.1V-Thinking: 轻量视觉推理，64K/16K
  "glm-4.1v":       { isReasoning: true,  contextWindow: 65_536,    maxOutputTokens: 16_384,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "glm-4v":         { isReasoning: false, contextWindow: 16_384,    maxOutputTokens: 1_024,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  // GLM-4 默认（glm-4-plus 等旧模型）
  "glm-4":          { isReasoning: false, contextWindow: 131_072,   maxOutputTokens: 8_192,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4 旧版" },
  "glm-4-plus":     { isReasoning: false, contextWindow: 131_072,   maxOutputTokens: 8_192,   temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "GLM-4-Plus 旧版" },
  // ── doubao-seed 系列（火山引擎官方参数）──
  // seed-2-0-lite/mini-260215 支持结构化输出（最长前缀优先）
  "doubao-seed-2-0-lite-260428": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Lite (最新推荐)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-2-0-mini-260428": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Mini (最新推荐)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-2-0-pro-260215":  { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Pro (旗舰推理)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-2-0-lite-260215": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Lite (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-2-0-mini-260215": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Mini (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-2-0-code-preview-260215": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 2.0 Code (代码推理)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  // doubao-seed-character: 非推理模型，128k 窗口
  "doubao-seed-character-251128": { isReasoning: false, contextWindow: 98_304, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Seed Character (角色扮演)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-character": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // doubao-seed-1-6 全系列支持结构化输出
  "doubao-seed-1-6-251015": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.6 (结构化输出)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-6-250615": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.6 (0615)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-6-flash-250828": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.6 Flash (快速+视觉定位)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-6-flash-250615": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.6 Flash (0615)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-6-vision-250815": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.6 Vision (GUI+多模态)", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-6": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  // doubao-seed-1-8: 64k 输出，32k 思维链
  "doubao-seed-1-8-251228": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Seed 1.8", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-seed-1-8": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true,  supportsVision: true, systemPromptMode: "message" },
  // doubao-seed-code
  "doubao-seed-code-preview-251028": { isReasoning: true, contextWindow: 262_144, maxOutputTokens: 32_768, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: false, systemPromptMode: "message", recommendation: "Seed Code (编程增强)", rpm: 5000, rpd: 0, tpm: "1.2M" },
  // doubao-seed 默认（2.0-pro/code 等）：256k 窗口，128k 输出，支持视觉，不支持结构化输出
  "doubao-seed":    { isReasoning: true,  contextWindow: 262_144,   maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "doubao-1-5-vision-pro-32k-250115": { isReasoning: false, contextWindow: 32_768, maxOutputTokens: 12_288, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: true, systemPromptMode: "message", recommendation: "1.5 Vision 多模态", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-1-5-vision": { isReasoning: false, contextWindow: 32_768, maxOutputTokens: 12_288, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: true,  systemPromptMode: "message" },
  "doubao-1-5-pro-32k-250115": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "1.5 Pro 标准版", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-1-5-lite-32k-250115": { isReasoning: false, contextWindow: 32_768, maxOutputTokens: 12_288, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "1.5 Lite 轻量版", rpm: 30000, rpd: 0, tpm: "5.0M" },
  "doubao-1-5":     { isReasoning: false, contextWindow: 131_072,   maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },

  // ── 带 provider 前缀的模型（OpenRouter 等）──
  // ── Anthropic Claude（OpenRouter 托管）──
  // 来源：openrouter.ai → anthropic/claude-opus-4.8（2026-06 获取）
  // 1M 上下文，128K 输出，支持推理（reasoning tokens）、视觉、文件输入
  "anthropic/claude-opus-4": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude Opus 4.8 (1M/128K)" },
  "anthropic/claude-opus-4-8": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude Opus 4.8 (1M/128K)" },
  "anthropic/claude-3.5-sonnet": { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3.5 Sonnet" },
  // ── Anthropic Claude Fable 5（OpenRouter 托管，2026-06-09 发布）──
  // 来源：openrouter.ai → anthropic/claude-fable-5
  // Mythos-class 模型，1M 上下文，128K 输出，支持推理、视觉、文件输入
  "anthropic/claude-fable-5": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude Fable 5 (Mythos, 1M/128K)" },
  "anthropic/claude-3-haiku":     { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 4_096, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3 Haiku (快速)" },
  // ── Anthropic Claude（Bedrock 托管，model ID 用 . 分隔）──
  "anthropic.claude-opus-4": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "anthropic.claude-3-5-sonnet-20241022-v2:0": { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3.5 Sonnet (最强)" },
  "anthropic.claude-3-5-haiku-20241022-v1:0":   { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3.5 Haiku (快速)" },
  "anthropic.claude-3-sonnet-20240229-v1:0":    { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 4_096, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3 Sonnet" },
  "anthropic.claude-3-haiku-20240307-v1:0":     { isReasoning: false, contextWindow: 200_000, maxOutputTokens: 4_096, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "Claude 3 Haiku" },
  "meta.llama3-2-3b-instruct-v1:0": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 2_048, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Llama 3.2 3B (轻量)" },
  "meta.llama3-2-1b-instruct-v1:0": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 2_048, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Llama 3.2 1B (最小)" },
  // ── OpenAI GPT-5.5（OpenRouter 托管）──
  // 来源：openrouter.ai → openai/gpt-5.5（2026-06 获取）
  // 1M+ 上下文，128K 输出，支持推理、视觉、结构化输出
  "openai/gpt-5.5":   { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "GPT-5.5 最新旗舰 (1M/128K)" },
  "openai/gpt-5":     { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 131_072, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "openai/gpt-4o":     { isReasoning: false, contextWindow: 128_000, maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "OpenAI GPT-4o" },
  "openai/gpt-4o-mini": { isReasoning: false, contextWindow: 128_000, maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message", recommendation: "GPT-4o Mini (快速经济)" },
  "google/gemini-": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter" },
  "google/gemini-2.5-pro":   { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "Gemini 2.5 Pro (最强推理)" },
  "google/gemini-2.5-flash": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 65_536, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "parameter", recommendation: "Gemini 2.5 Flash (快速)" },
  "deepseek/deepseek-r1":    { isReasoning: true, contextWindow: 65_536, maxOutputTokens: 16_384, temperature: { supported: false, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "DeepSeek R1 (推理)" },
  "deepseek/deepseek-chat":  { isReasoning: false, contextWindow: 65_536, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "DeepSeek V3 (弃用)" },
  "qwen/qwen3-235b-a22b":    { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Qwen3 旗舰 MoE" },
  "meta-llama/llama-4-maverick": { isReasoning: false, contextWindow: 128_000, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Llama 4 Maverick" },
  // ── OpenCode 模型 ──
  "deepseek-v4-flash-free": { isReasoning: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, temperature: { supported: true, range: [0, 2] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "DeepSeek V4 Flash Free (免费)" },
  "minimax-m2.5":    { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "MiniMax M2.5" },
  "minimax-m2.7":    { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "MiniMax M2.7 (最新)" },
  "nemotron-3-super-free": { isReasoning: false, contextWindow: 128_000, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "Nemotron 3 Super Free (免费)" },

  // ── 非推理模型（前缀匹配）──
  "gemini-2.0":     { isReasoning: false, contextWindow: 1_048_576, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "parameter" },
  "gpt-4o":         { isReasoning: false, contextWindow: 128_000,  maxOutputTokens: 16_384, temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: true,  supportsVision: true,  systemPromptMode: "message" },
  "qwen-turbo":     { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "速度最快、配额最高", rpm: 15, rpd: 1000, tpm: "10.0M" },
  "qwen-plus":      { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "能力均衡", rpm: 10, rpd: 500, tpm: "5.0M" },
  "qwen-max":       { isReasoning: false, contextWindow: 32_768,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "能力最强", rpm: 5, rpd: 200, tpm: "3.0M" },
  "qwen3-235b-a22b": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "最新旗舰 MoE", rpm: 5, rpd: 200, tpm: "3.0M" },
  "qwen-":          { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 2] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  // moonshot-v1-*: 非推理，temperature [0,1] 默认 0.0，支持 json_schema
  // moonshot-v1-*-vision-preview: 支持 image_url/video_url 多模态输入
  "moonshot-v1-":    { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: true,  supportsVision: false, systemPromptMode: "message" },
  "moonshot-v1-128k-vision": { isReasoning: false, contextWindow: 131_072, maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "moonshot-v1-32k-vision":  { isReasoning: false, contextWindow: 32_768,  maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "moonshot-v1-8k-vision":   { isReasoning: false, contextWindow: 8_192,   maxOutputTokens: 8_192, temperature: { supported: true, range: [0, 1] }, supportsStructuredOutput: true, supportsVision: true, systemPromptMode: "message" },
  "minimax-":       { isReasoning: false, contextWindow: 65_536,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "doubao-2.0":     { isReasoning: false, contextWindow: 131_072,  maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message" },
  "abab6.5s-chat":  { isReasoning: false, contextWindow: 65_536,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "快速版", rpm: 15, rpd: 1000, tpm: "10.0M" },
  "abab6.5-chat":   { isReasoning: false, contextWindow: 65_536,   maxOutputTokens: 8_192,  temperature: { supported: true, range: [0, 1] },  supportsStructuredOutput: false, supportsVision: false, systemPromptMode: "message", recommendation: "标准版", rpm: 10, rpd: 500, tpm: "5.0M" },
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

// ── bug9: 模型目录 — 按 provider 分组，供 client 设置页使用 ──

// 每个 provider 的完整模型 ID 列表（顺序即 UI 展示顺序）
const PROVIDER_MODEL_IDS: Record<ProviderId, string[]> = {
  gemini: [
    "gemini-3.5-flash", "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite", "gemini-2.0-flash-lite",
    "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro",
  ],
  mimo: [
    "mimo-v2.5-pro", "mimo-v2-pro",
    "mimo-v2.5", "mimo-v2-omni",
    "mimo-v2-flash",
  ],
  kimi: [
    "kimi-k2.6", "kimi-k2.5",
    "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k", "moonshot-v1-auto",
    "moonshot-v1-128k-vision-preview", "moonshot-v1-32k-vision-preview", "moonshot-v1-8k-vision-preview",
  ],
  glm: [
    "glm-5.1", "glm-5", "glm-5-turbo",
    "glm-5v-turbo",
    "glm-4.7", "glm-4.7-flash", "glm-4.6",
    "glm-4.5-air",
    "glm-4.6v", "glm-4.6v-flash",
    "glm-4-long", "glm-4-plus", "glm-4",
  ],
  minimax: [
    "abab6.5s-chat", "abab6.5-chat",
  ],
  deepseek: [
    "deepseek-v4-pro", "deepseek-v4-flash",
    "deepseek-v3-2-251201",
    "deepseek-reasoner", "deepseek-chat",
  ],
  qwen: [
    "qwen-turbo", "qwen-plus", "qwen-max", "qwen3-235b-a22b",
  ],
  bedrock: [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "anthropic.claude-3-sonnet-20240229-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "meta.llama3-2-3b-instruct-v1:0",
    "meta.llama3-2-1b-instruct-v1:0",
  ],
  openrouter: [
    "openai/gpt-5.5", "anthropic/claude-fable-5", "anthropic/claude-opus-4-8", "google/gemini-2.5-pro", "google/gemini-2.5-flash",
    "deepseek/deepseek-r1", "qwen/qwen3-235b-a22b",
    "openai/gpt-4o", "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet", "anthropic/claude-3-haiku",
    "deepseek/deepseek-chat", "meta-llama/llama-4-maverick",
  ],
  opencode: [
    "deepseek-v4-flash-free", "kimi-k2.5", "kimi-k2.6",
    "glm-5", "glm-5.1",
    "minimax-m2.5", "minimax-m2.7",
    "nemotron-3-super-free",
  ],
  doubao: [
    "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-mini-260428",
    "doubao-seed-2-0-pro-260215", "doubao-seed-2-0-lite-260215",
    "doubao-seed-2-0-mini-260215", "doubao-seed-2-0-code-preview-260215",
    "doubao-seed-1-8-251228",
    "doubao-seed-1-6-251015", "doubao-seed-1-6-250615",
    "doubao-seed-1-6-flash-250828", "doubao-seed-1-6-flash-250615",
    "doubao-seed-1-6-vision-250815",
    "doubao-seed-code-preview-251028",
    "doubao-seed-character-251128",
    "doubao-1-5-pro-32k-250115", "doubao-1-5-lite-32k-250115", "doubao-1-5-vision-pro-32k-250115",
    "deepseek-v4-pro-260425", "deepseek-v4-flash-260425", "deepseek-v3-2-251201",
  ],
};

/** Gemini 模型推荐语推断（API 返回的模型可能不在目录中） */
function inferGeminiRecommendation(id: string): string {
  if (id.includes("flash-lite")) return "最推荐 (速度极快、配额最高)";
  if (id.includes("flash")) return "综合能力均衡";
  if (id.includes("pro")) return "高级能力 (配额较低)";
  return "通用模型";
}

/** 获取单个模型的 ModelInfo（含能力元数据） */
export function getModelInfo(modelId: string): ModelInfo {
  const caps = getModelCapabilities(modelId);
  const rec = caps.recommendation ?? (modelId.startsWith("gemini-") ? inferGeminiRecommendation(modelId) : undefined);
  return {
    id: modelId,
    recommendation: rec,
    rpm: caps.rpm,
    rpd: caps.rpd,
    tpm: caps.tpm,
    contextWindow: caps.contextWindow,
    maxOutputTokens: caps.maxOutputTokens,
    isReasoning: caps.isReasoning,
    supportsVision: caps.supportsVision,
    supportsStructuredOutput: caps.supportsStructuredOutput,
  };
}

/** 获取所有 provider 的模型目录（client 设置页使用） */
export function getModelCatalog(): Record<ProviderId, ModelInfo[]> {
  const result: Partial<Record<ProviderId, ModelInfo[]>> = {};
  for (const [providerId, modelIds] of Object.entries(PROVIDER_MODEL_IDS)) {
    result[providerId as ProviderId] = modelIds.map(getModelInfo);
  }
  return result as Record<ProviderId, ModelInfo[]>;
}

import type { ProviderId, ModelInfo } from "@shared/types/agents";

export const DEFAULT_MODELS: Record<ProviderId, ModelInfo[]> = {
  gemini: [
    { id: "gemini-2.5-flash-lite", recommendation: "最推荐 (速度极快、配额最高)", rpm: 30, rpd: 2000, tpm: "15.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.0-flash-lite", recommendation: "轻量快速", rpm: 30, rpd: 2000, tpm: "15.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.5-flash", recommendation: "综合能力最强", rpm: 15, rpd: 1500, tpm: "25.0M", inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { id: "gemini-2.0-flash", recommendation: "稳定版", rpm: 15, rpd: 1500, tpm: "25.0M", inputTokenLimit: 1048576, outputTokenLimit: 8192 },
    { id: "gemini-2.5-pro", recommendation: "高级能力 (配额较低)", rpm: 2, rpd: 50, tpm: "12.5M", inputTokenLimit: 1048576, outputTokenLimit: 65536 }
  ],
  mimo: [
    { id: "MiMo-V2.5-Pro", recommendation: "推理能力最强", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "MiMo-V2.5", recommendation: "均衡推荐", rpm: 15, rpd: 1000, tpm: "10.0M" },
    { id: "MiMo-V2-Pro", recommendation: "上一代旗舰", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "MiMo-V2-Omni", recommendation: "多模态", rpm: 10, rpd: 500, tpm: "5.0M" }
  ],
  kimi: [
    { id: "moonshot-v1-128k", recommendation: "长文本 (128K)", rpm: 5, rpd: 300, tpm: "3.0M" },
    { id: "moonshot-v1-32k", recommendation: "标准 (32K)", rpm: 10, rpd: 500, tpm: "5.0M" }
  ],
  glm: [
    { id: "glm-4-plus", recommendation: "能力最强", rpm: 5, rpd: 300, tpm: "5.0M" },
    { id: "glm-4", recommendation: "标准版", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "glm-4-long", recommendation: "长文本", rpm: 5, rpd: 200, tpm: "3.0M" }
  ],
  minimax: [
    { id: "abab6.5s-chat", recommendation: "快速版", rpm: 15, rpd: 1000, tpm: "10.0M" },
    { id: "abab6.5-chat", recommendation: "标准版", rpm: 10, rpd: 500, tpm: "5.0M" }
  ],
  deepseek: [
    { id: "deepseek-chat", recommendation: "通用对话", rpm: 10, rpd: 500, tpm: "5.0M" },
    { id: "deepseek-reasoner", recommendation: "深度推理", rpm: 5, rpd: 200, tpm: "3.0M" }
  ],
  qwen: [
    { id: "qwen-turbo", recommendation: "速度最快、配额最高", rpm: 15, rpd: 1000, tpm: "10.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "qwen-plus", recommendation: "能力均衡", rpm: 10, rpd: 500, tpm: "5.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 },
    { id: "qwen-max", recommendation: "能力最强", rpm: 5, rpd: 200, tpm: "3.0M", inputTokenLimit: 32768, outputTokenLimit: 8192 },
    { id: "qwen3-235b-a22b", recommendation: "最新旗舰 MoE", rpm: 5, rpd: 200, tpm: "3.0M", inputTokenLimit: 131072, outputTokenLimit: 8192 }
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

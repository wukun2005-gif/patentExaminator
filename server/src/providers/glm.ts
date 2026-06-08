import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class GlmAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "glm";
  defaultBaseUrl = "https://open.bigmodel.cn/api/paas/v4";

  supportedModels(): string[] {
    return [
      // ── GLM-5 系列（200K/128K）──
      "glm-5.1",
      "glm-5",
      "glm-5-turbo",
      // ── GLM-5V 视觉 ──
      "glm-5v-turbo",
      // ── GLM-4.7/4.6 系列（200K/128K）──
      "glm-4.7",
      "glm-4.7-flash",
      "glm-4.7-flashx",
      "glm-4.6",
      // ── GLM-4.1V 视觉推理 ──
      "glm-4.1v-thinking-flashx",
      "glm-4.1v-thinking-flash",
      // ── GLM-4.5 系列（128K/96K）──
      "glm-4.5-air",
      "glm-4.5-airx",
      "glm-4.5-flash",
      // ── GLM-4 视觉 ──
      "glm-4.6v",
      "glm-4.6v-flash",
      "glm-4v-flash",
      // ── GLM-4 其他 ──
      "glm-4-long",
      "glm-4-flashx-250414",
      "glm-4-flash-250414",
      // ── 旧模型（保留兼容）──
      "glm-4-plus",
      "glm-4",
    ];
  }
}

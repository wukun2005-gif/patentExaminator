import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class DeepseekAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "deepseek";
  defaultBaseUrl = "https://api.deepseek.com";

  supportedModels(): string[] {
    return [
      // ── V4 系列（官方 api.deepseek.com，1M 上下文，384K 输出）──
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      // ── 弃用模型（2026-07-24 前仍可用，映射到 v4-flash）──
      "deepseek-reasoner",  // → v4-flash 思考模式
      "deepseek-chat",      // → v4-flash 非思考模式
    ];
  }
}

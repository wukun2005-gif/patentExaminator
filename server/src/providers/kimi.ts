import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class KimiAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "kimi";
  defaultBaseUrl = "https://api.moonshot.cn/v1";

  supportedModels(): string[] {
    return [
      // ── K2 系列（256k 上下文，思考模型）──
      "kimi-k2.6",
      "kimi-k2.5",
      // ── Moonshot V1 生成模型 ──
      "moonshot-v1-128k",
      "moonshot-v1-32k",
      "moonshot-v1-8k",
      "moonshot-v1-auto",
      // ── Moonshot V1 Vision ──
      "moonshot-v1-128k-vision-preview",
      "moonshot-v1-32k-vision-preview",
      "moonshot-v1-8k-vision-preview",
      // ── 已下线模型（2026-05-25，保留兼容）──
      // "kimi-k2-0905-preview", "kimi-k2-0711-preview", "kimi-k2-turbo-preview",
      // "kimi-k2-thinking", "kimi-k2-thinking-turbo",
    ];
  }
}

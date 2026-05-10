import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class KimiAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "kimi";
  defaultBaseUrl = "https://api.moonshot.cn/v1";

  supportedModels(): string[] {
    return ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"];
  }
}

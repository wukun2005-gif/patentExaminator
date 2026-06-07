import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class DoubaoAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "doubao";
  defaultBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";

  supportedModels(): string[] {
    return [
      "doubao-2.0-pro",
      "doubao-2.0-lite",
      "doubao-1.5-pro-256k",
      "doubao-1.5-pro-32k",
      "doubao-1.5-lite-32k",
      "doubao-1.5-vision-pro-32k",
    ];
  }
}

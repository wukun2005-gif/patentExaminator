import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class GlmAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "glm";
  defaultBaseUrl = "https://open.bigmodel.cn/api/paas/v4";

  supportedModels(): string[] {
    return ["glm-4-plus", "glm-4", "glm-4-long"];
  }
}

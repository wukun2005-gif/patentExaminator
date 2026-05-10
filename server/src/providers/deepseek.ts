import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class DeepseekAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "deepseek";
  defaultBaseUrl = "https://api.deepseek.com";

  supportedModels(): string[] {
    return ["deepseek-chat", "deepseek-reasoner"];
  }
}

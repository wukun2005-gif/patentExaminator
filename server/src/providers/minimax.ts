import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class MinimaxAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "minimax";
  defaultBaseUrl = "https://api.minimax.chat/v1";

  supportedModels(): string[] {
    return ["abab6.5s-chat", "abab6.5-chat", "abab5.5-chat"];
  }
}

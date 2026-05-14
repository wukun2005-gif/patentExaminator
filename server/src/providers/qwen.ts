import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class QwenAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "qwen";
  defaultBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";

  supportedModels(): string[] {
    return ["qwen-turbo", "qwen-plus", "qwen-max", "qwen3-235b-a22b"];
  }
}
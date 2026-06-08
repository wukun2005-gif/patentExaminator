import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class MimoAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "mimo";
  defaultBaseUrl = "https://token-plan-cn.xiaomimimo.com/v1";

  supportedModels(): string[] {
    return ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2-flash"];
  }
}

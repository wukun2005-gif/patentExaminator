import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class MimoAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "mimo";
  defaultBaseUrl = "https://token-plan-cn.xiaomimimo.com/v1";

  supportedModels(): string[] {
    return ["MiMo-V2.5-Pro", "MiMo-V2.5", "MiMo-V2-Pro", "MiMo-V2-Omni"];
  }
}

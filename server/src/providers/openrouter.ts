import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "openrouter";
  defaultBaseUrl = "https://openrouter.ai/api/v1";

  supportedModels(): string[] {
    return [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-opus-4-8",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat",
      "deepseek/deepseek-r1",
      "meta-llama/llama-4-maverick",
      "qwen/qwen3-235b-a22b",
    ];
  }
}
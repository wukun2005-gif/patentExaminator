import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "openrouter";
  defaultBaseUrl = "https://openrouter.ai/api/v1";

  supportedModels(): string[] {
    return [
      // ── 推理模型 ──
      "openai/gpt-5.5",
      "anthropic/claude-opus-4-8",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-r1",
      "qwen/qwen3-235b-a22b",
      // ── 非推理模型 ──
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "deepseek/deepseek-chat",
      "meta-llama/llama-4-maverick",
    ];
  }
}
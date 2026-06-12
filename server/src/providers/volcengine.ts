import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";

export class VolcengineAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "volcengine";
  defaultBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";

  supportedModels(): string[] {
    return [
      // ── Seed 2.0 最新推荐 (260428) ──
      "doubao-seed-2-0-lite-260428",
      "doubao-seed-2-0-mini-260428",
      // ── Seed 2.0 (260215) ──
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-code-preview-260215",
      // ── Seed 1.8 ──
      "doubao-seed-1-8-251228",
      // ── Seed 1.6 ──
      "doubao-seed-1-6-251015",
      "doubao-seed-1-6-250615",
      "doubao-seed-1-6-flash-250828",
      "doubao-seed-1-6-flash-250615",
      "doubao-seed-1-6-vision-250815",
      // ── Seed Code ──
      "doubao-seed-code-preview-251028",
      // ── Seed Character ──
      "doubao-seed-character-251128",
      // ── 1.5 系列 ──
      "doubao-1-5-pro-32k-250115",
      "doubao-1-5-lite-32k-250115",
      "doubao-1-5-vision-pro-32k-250115",
      // ── 火山引擎托管的第三方模型（同一 API 端点）──
      "glm-4-7-251222",
      "deepseek-v4-pro-260425",
      "deepseek-v4-flash-260425",
      "deepseek-v3-2-251201",
    ];
  }
}

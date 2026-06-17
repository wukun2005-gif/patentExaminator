import { OpenAICompatibleAdapter } from "./ProviderAdapter.js";
import type { ChatRequest, ChatResponse } from "./ProviderAdapter.js";
import type { ProviderId } from "@shared/types/agents";
import { logger } from "../lib/logger.js";

/**
 * 百炼 thinking 模式模型：不支持 tool_choice=required/object，需降级为 auto。
 * 维护策略：遇到新 thinking 模型 HTTP 400 "tool_choice ... not support ... thinking mode" 时加入。
 * 注：百炼非 thinking 模型收到 tool_choice=auto 无副作用，所以宁可多列不可遗漏。
 */
const BAILIAN_THINKING_MODELS = new Set([
  // Qwen3.7
  "qwen3.7-max",
  "qwen3.7-max-2026-06-08",
  "qwen3.7-max-2026-05-20",
  "qwen3.7-max-preview",
  "qwen3.7-plus",
  "qwen3.7-plus-2026-05-26",
  // Qwen3.6
  "qwen3.6-max-preview",
  // DeepSeek（百炼上的 deepseek-v4-pro/r1 均为 thinking 模式）
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-r1",
  "deepseek-r1-0528",
  "deepseek-r1-distill-qwen-32b",
  "deepseek-r1-distill-qwen-14b",
  "deepseek-r1-distill-qwen-7b",
]);

export class BailianAdapter extends OpenAICompatibleAdapter {
  id: ProviderId = "bailian";
  defaultBaseUrl = "https://ws-3vv2b1h4akmem3xz.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

  override async chat(req: ChatRequest): Promise<ChatResponse> {
    // 百炼 thinking 模式不支持 tool_choice=required/object，降级为 auto
    // 非 thinking 模型收到 tool_choice=auto 无副作用，所以统一处理
    if ((req.tool_choice === "required" || typeof req.tool_choice === "object") && BAILIAN_THINKING_MODELS.has(req.modelId)) {
      logger.info(`[Bailian] thinking 模型 ${req.modelId} 不支持 tool_choice=${JSON.stringify(req.tool_choice)}，降级为 auto`);
      return super.chat({ ...req, tool_choice: "auto" });
    }
    return super.chat(req);
  }

  supportedModels(): string[] {
    return [
      // ── Qwen3.7（最新旗舰）──
      "qwen3.7-max",                // 1M ctx, 64k out, 30000 RPM
      "qwen3.7-max-2026-06-08",
      "qwen3.7-max-2026-05-20",
      "qwen3.7-plus",               // 1M ctx, 64k out, 30000 RPM
      "qwen3.7-plus-2026-05-26",
      // ── Qwen3.6 ──
      "qwen3.6-max-preview",        // 256k ctx, 64k out, 600 RPM
      "qwen3.6-plus",               // 1M ctx, 64k out, 30000 RPM
      "qwen3.6-plus-2026-04-02",
      "qwen3.6-flash",              // 1M ctx, 64k out, 30000 RPM
      "qwen3.6-flash-2026-04-16",
      "qwen3.6-35b-a3b",            // 256k ctx, 64k out, 600 RPM
      "qwen3.6-27b",                // 256k ctx, 64k out, 600 RPM
      // ── Qwen3.5 ──
      "qwen3.5-plus",               // 1M ctx, 64k out, 30000 RPM
      "qwen3.5-plus-2026-04-20",
      "qwen3.5-plus-2026-02-15",
      "qwen3.5-flash",              // 1M ctx, 64k out, 30000 RPM
      "qwen3.5-flash-2026-02-23",
      "qwen3.5-397b-a17b",          // 256k ctx, 64k out, 600 RPM
      "qwen3.5-122b-a10b",          // 256k ctx, 64k out, 600 RPM
      "qwen3.5-35b-a3b",            // 256k ctx, 64k out, 600 RPM
      "qwen3.5-27b",                // 256k ctx, 64k out, 600 RPM
      // ── Qwen3 ──
      "qwen3-max",                  // 256k ctx, 64k out
      "qwen3-max-2026-01-23",
      "qwen3-max-preview",
      "qwen3-max-2025-09-23",
      "qwen3-235b-a22b",            // 128k ctx
      "qwen3-235b-a22b-instruct-2507",
      "qwen3-235b-a22b-thinking-2507",  // thinking-only
      "qwen3-next-80b-a3b-instruct",   // 128k ctx
      "qwen3-next-80b-a3b-thinking",   // thinking-only
      "qwen3-32b",                  // 128k ctx
      "qwen3-30b-a3b",              // 128k ctx
      "qwen3-30b-a3b-instruct-2507",
      "qwen3-30b-a3b-thinking-2507",    // thinking-only
      "qwen3-14b",                  // 128k ctx
      "qwen3-8b",                   // 128k ctx
      // ── Qwen3-Coder ──
      "qwen3-coder-plus",           // 1M ctx, 64k out
      "qwen3-coder-plus-2025-09-23",
      "qwen3-coder-plus-2025-07-22",
      "qwen3-coder-flash",          // 1M ctx, 64k out
      "qwen3-coder-flash-2025-07-28",
      "qwen3-coder-next",           // 256k ctx
      "qwen3-coder-480b-a35b-instruct", // 256k ctx
      "qwen3-coder-30b-a3b-instruct",   // 256k ctx
      // ── Qwen 旧版 ──
      "qwen-max",                   // 32k ctx
      "qwen-plus",                  // 1M ctx
      "qwen-plus-latest",
      "qwen-plus-2025-12-01",
      "qwen-plus-2025-09-11",
      "qwen-plus-2025-07-28",
      "qwen-plus-2025-07-14",
      "qwen-plus-2025-04-28",
      "qwen-plus-2025-01-25",
      "qwen-plus-0112",
      "qwen-plus-1220",
      "qwen-flash",                 // 1M ctx
      "qwen-flash-2025-07-28",
      "qwen-turbo",                 // 128k ctx
      "qwq-plus",                   // 128k ctx（仅支持 stream）
      "qwen-coder-plus",            // 旧版 coder
      "qwen-coder-turbo",
      "qwen-long",                  // 10M ctx
      "qwen-long-latest",
      "qwen-long-2025-01-25",
      "qwen-math-plus",             // 数学
      "qwen-math-plus-latest",
      "qwen-math-plus-0919",
      "qwen-math-plus-0816",
      "qwen-math-turbo",
      // ── DeepSeek ──
      "deepseek-v4-pro",            // 1M ctx, 384k out
      "deepseek-v4-flash",          // 1M ctx, 384k out
      "deepseek-v3.2",              // 128k ctx
      "deepseek-v3.2-exp",
      "deepseek-v3.1",              // 128k ctx
      "deepseek-v3",                // 128k ctx
      "deepseek-r1",                // 128k ctx（reasoning，仅 stream）
      "deepseek-r1-0528",           // 128k ctx（reasoning，仅 stream）
      "deepseek-r1-distill-qwen-32b",
      "deepseek-r1-distill-qwen-14b",
      "deepseek-r1-distill-qwen-7b",
      // ── GLM ──
      "glm-5.1",                    // 198k ctx, 128k out
      "glm-5",                      // 198k ctx
      "glm-4.7",                    // 198k ctx
      "glm-4.6",                    // 198k ctx
      // ── Kimi ──
      "kimi-k2.7-code",             // 256k ctx, 96k out
      "kimi-k2.6",                  // 256k ctx
      "kimi-k2.5",                  // 256k ctx
      "kimi-k2-thinking",           // 256k ctx
      "Moonshot-Kimi-K2-Instruct",  // 128k ctx
      // ── MiniMax ──
      "MiniMax-M2.5",               // 192k ctx, 32k out
    ];
  }
}

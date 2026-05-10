import { Router } from "express";
import { aiRunRequestSchema } from "../lib/schemas.js";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { sanitizeText } from "../security/sanitize.js";
import { logger } from "../lib/logger.js";
import type { AiRunResponse } from "@shared/types/api";
import type { ProviderId } from "@shared/types/agents";

export const aiRouter = Router();

aiRouter.post("/ai/run", async (req, res) => {
  const parseResult = aiRunRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      ok: false,
      error: {
        code: "invalid-request",
        message: `Schema validation failed: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        retryable: false
      }
    } satisfies AiRunResponse);
    return;
  }

  const request = parseResult.data;
  const startTime = Date.now();

  // Sanitize prompt if not already sanitized
  let prompt = request.prompt;
  if (!request.sanitized) {
    prompt = sanitizeText(prompt);
  }

  // Build chat messages
  const messages = [{ role: "user" as const, content: prompt }];

  // Get API keys for requested providers
  const providerKeys = new Map<string, string>();
  for (const providerId of request.providerPreference) {
    const key = getApiKey(providerId);
    if (key) {
      providerKeys.set(providerId, key);
    }
  }

  // Filter to providers with keys
  const availableProviders = request.providerPreference.filter((p) => providerKeys.has(p));

  if (availableProviders.length === 0) {
    res.status(400).json({
      ok: false,
      error: {
        code: "no-api-keys",
        message: "No API keys configured for requested providers",
        retryable: false
      }
    } satisfies AiRunResponse);
    return;
  }

  try {
    // Use first available provider's key for the request
    const firstProvider = availableProviders[0]!;
    const apiKey = providerKeys.get(firstProvider)!;

    const { response, attempts } = await registry.runWithFallback(
      availableProviders as string[],
      {
        modelId: request.modelId,
        messages,
        maxTokens: 4096,
        apiKey
      }
    );

    const durationMs = Date.now() - startTime;

    if (response.error) {
      logger.warn("AI run failed", { agent: request.agent, attempts });
      res.status(response.error.code === "auth-failed" ? 401 : 502).json({
        ok: false,
        error: response.error,
        attempts,
        durationMs
      } satisfies AiRunResponse);
      return;
    }

    // Try to parse as JSON if expectedSchemaName is set
    let outputJson: unknown = undefined;
    if (request.expectedSchemaName) {
      try {
        outputJson = JSON.parse(response.text);
      } catch {
        outputJson = undefined;
      }
    }

    logger.info("AI run succeeded", {
      agent: request.agent,
      provider: firstProvider,
      durationMs,
      tokenUsage: response.tokenUsage
    });

    const result = {
      ok: true,
      provider: firstProvider as ProviderId,
      modelId: request.modelId,
      outputJson,
      rawText: response.text,
      ...(response.tokenUsage ? { tokenUsage: response.tokenUsage } : {}),
      durationMs,
      attempts
    } satisfies AiRunResponse as AiRunResponse;
    res.json(result);
  } catch (error) {
    logger.error("AI run error", { error: String(error) });
    res.status(500).json({
      ok: false,
      error: {
        code: "internal-error",
        message: String(error),
        retryable: false
      }
    } satisfies AiRunResponse);
  }
});

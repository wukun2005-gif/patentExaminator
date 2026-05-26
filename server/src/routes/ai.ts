import { Router } from "express";
import { aiRunRequestSchema } from "../lib/schemas.js";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { sanitizeText } from "../security/sanitize.js";
import { extractJsonFromText } from "../lib/jsonExtractor.js";
import { logger } from "../lib/logger.js";
import { isStructuredAgent, validateAgentResponse } from "@shared/lib/responseValidator.js";
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

  // Mock mode: return fixture data without calling real AI
  if (request.mock) {
    try {
      const { loadFixture } = await import("../../../shared/src/fixtures/loadFixture.js");
      // Build mock key: for novelty, use "caseId:referenceId" format
      const mockKey = (request.metadata as Record<string, unknown>).mockKey as string
        || request.metadata.caseId;
      const fixture = loadFixture(request.agent, mockKey);
      const durationMs = Date.now() - startTime;
      res.json({
        ok: true,
        provider: "mock" as ProviderId,
        modelId: "mock",
        outputJson: fixture,
        rawText: typeof fixture === "string" ? fixture : JSON.stringify(fixture),
        durationMs,
        attempts: [{ providerId: "mock" as ProviderId, ok: true }]
      } satisfies AiRunResponse);
      return;
    } catch (mockErr) {
      res.status(400).json({
        ok: false,
        error: {
          code: "mock-fixture-not-found",
          message: `No mock fixture for agent=${request.agent} key=${request.metadata.caseId}`,
          retryable: false
        }
      } satisfies AiRunResponse);
      return;
    }
  }

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

  const availableProviders = request.providerPreference.filter((p) => providerKeys.has(p));
  logger.info("AI request received", {
    agent: request.agent,
    requestedProviders: request.providerPreference,
    providersWithKeys: availableProviders,
    providersMissingKeys: request.providerPreference.filter((p) => !providerKeys.has(p)),
    modelId: request.modelId
  });

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

    // Abort on client disconnect (listen on TCP socket, NOT req.on("close") which fires on body consumption)
    const controller = new AbortController();
    const onSocketClose = () => {
      if (!res.headersSent) {
        controller.abort();
        logger.info("Client disconnected, aborting AI request", { agent: request.agent });
      }
    };
    const socket = req.socket;
    socket?.on("close", onSocketClose);

    try {
    const { response, attempts } = await registry.runWithFallback(
      availableProviders as string[],
      {
        modelId: request.modelId,
        messages,
        maxTokens: 4096,
        apiKey,
        signal: controller.signal
      },
      undefined,
      request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
      request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
      request.providerBaseUrls,
      Object.fromEntries(providerKeys) as Partial<Record<string, string>>
    );

    const durationMs = Date.now() - startTime;

    if (response.error) {
      const allQuotaExhausted = attempts.every((a) => a.errorCode === "quota-exceeded");
      if (allQuotaExhausted || response.error.code === "quota-exceeded") {
        logger.info("AI quota exhausted", { agent: request.agent, attempts });
        res.status(429).json({
          ok: false,
          error: {
            code: "quota-exceeded",
            message: "所有 AI Provider 的额度均已用尽，请等待额度恢复或切换到演示模式。",
            retryable: true
          },
          attempts,
          durationMs
        } satisfies AiRunResponse);
        return;
      }
      logger.warn("AI run failed", { agent: request.agent, attempts });
      res.status(response.error.code === "auth-failed" ? 401 : 502).json({
        ok: false,
        error: response.error,
        attempts,
        durationMs
      } satisfies AiRunResponse);
      return;
    }

    // Try to parse as JSON with robust extraction
    let outputJson: unknown = undefined;
    const extracted = extractJsonFromText(response.text);
    if (extracted) {
      outputJson = extracted.parsed;
      if (extracted.raw !== response.text.trim()) {
        logger.info("JSON extracted from mixed text", {
          agent: request.agent,
          rawLen: response.text.length,
          extractedLen: extracted.raw.length
        });
      }
    }

    // Validate response structure for structured agents
    let structureErrors: string[] | undefined;
    if (outputJson != null && isStructuredAgent(request.agent)) {
      const validation = validateAgentResponse(request.agent, outputJson);
      if (!validation.valid) {
        logger.warn("AI response structure validation failed", {
          agent: request.agent,
          errors: validation.errors
        });
        structureErrors = validation.errors;
        outputJson = undefined;
      } else if (validation.data !== undefined) {
        outputJson = validation.data;
      }
    }

    // If structure errors exist but outputJson is still valid, log a warning
    if (structureErrors && outputJson) {
      logger.warn("AI response has structure errors but still valid", {
        agent: request.agent,
        errors: structureErrors
      });
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
      ...(structureErrors ? { structureErrors } : {}),
      durationMs,
      attempts
    } satisfies AiRunResponse as AiRunResponse;
    res.json(result);
    } finally {
      socket?.off("close", onSocketClose);
    }
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

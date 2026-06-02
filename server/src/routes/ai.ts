import { Router } from "express";
import { aiRunRequestSchema } from "../lib/schemas.js";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { sanitizeText } from "../security/sanitize.js";
import { validateProviderBaseUrls, BlockedUrlError } from "../lib/urlValidation.js";
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

  // SSRF protection
  validateProviderBaseUrls(request.providerBaseUrls as Record<string, string> | undefined);

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

  // MIGRATE-008: 知识库 Prompt 注入（后端执行）
  // 从 metadata 中获取知识库配置
  const knowledgeEnabled = (request.metadata as Record<string, unknown>).knowledgeEnabled as boolean | undefined;
  if (knowledgeEnabled) {
    try {
      const { getEmbedder } = await import("./knowledge.js");
      const { getAllChunks, getAllVectors } = await import("../lib/knowledgeDb.js");

      const emb = await getEmbedder();
      const queryVector = (await emb.embed([prompt]))[0]!;
      const allChunks = getAllChunks();
      const allVectors = getAllVectors();

      // 余弦相似度检索
      const chunkMap = new Map(allChunks.map((c) => [c.id, c]));
      const vectorMap = new Map(allVectors.map((v) => [v.chunkId, v]));
      const scores: Array<{ chunkId: string; score: number }> = [];

      for (const [chunkId, vec] of vectorMap) {
        const chunk = chunkMap.get(chunkId);
        if (!chunk) continue;

        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < queryVector.length; i++) {
          dot += queryVector[i]! * vec.vector[i]!;
          normA += queryVector[i]! * queryVector[i]!;
          normB += vec.vector[i]! * vec.vector[i]!;
        }
        const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
        if (score >= 0.3) {
          scores.push({ chunkId, score });
        }
      }

      scores.sort((a, b) => b.score - a.score);
      const topResults = scores.slice(0, 5).map((s) => {
        const chunk = chunkMap.get(s.chunkId)!;
        return {
          text: chunk.text,
          metadata: (() => { try { return JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { return {}; } })(),
          score: s.score,
        };
      });

      if (topResults.length > 0) {
        const citationBlock = topResults.map((r) => {
          const source = (r.metadata.sectionId ?? r.metadata.articleId ?? r.metadata.fileName) as string;
          return `[来源: ${source}] ${r.text.slice(0, 300)}`;
        }).join("\n\n");

        const injection = `## 参考法规（由知识库自动检索，作为回答的依据）

以下段落与当前分析内容相关，请在回答时参考但不仅限于此：

${citationBlock}

## 引用要求
- 回答时**必须引用上述参考法规的具体条文**作为依据
- 引用格式：在相关论述后标注【来源：文件名 章节/条文号】
- 如果参考法规中没有直接相关的内容，明确说明"参考法规中未找到直接依据"
- 不要编造参考法规中没有的内容`;

        prompt = `${prompt}\n\n${injection}`;
        logger.info(`Knowledge injection: ${topResults.length} chunks injected`);
      }
    } catch (knowledgeErr) {
      logger.warn(`Knowledge injection failed, proceeding without: ${knowledgeErr}`);
    }
  }

  // Build chat messages
  const messages = [{ role: "user" as const, content: prompt }];

  // Get API keys for requested providers (request.apiKey overrides keyStore)
  const providerKeys = new Map<string, string>();
  for (const providerId of request.providerPreference) {
    const key = request.apiKey ?? getApiKey(providerId);
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
        maxTokens: request.maxTokens ?? 4096,
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
    } else if (response.text.trim().length > 0) {
      logger.warn("extractJsonFromText returned null for non-empty response", {
        agent: request.agent,
        textLen: response.text.length,
        textPreview: response.text.slice(0, 200)
      });
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
    const status = error instanceof BlockedUrlError ? 400 : 500;
    const code = error instanceof BlockedUrlError ? "invalid-request" : "internal-error";
    const message = error instanceof BlockedUrlError ? error.message : "AI 请求处理失败，请稍后重试";
    res.status(status).json({
      ok: false,
      error: {
        code,
        message,
        retryable: false
      }
    } satisfies AiRunResponse);
  }
});

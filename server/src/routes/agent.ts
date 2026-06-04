/**
 * Agent 编排 API 路由 — B-035: 将 AgentClient 协调逻辑迁移到服务端
 *
 * POST /api/agent/run — 服务端编排入口
 * B-038: 支持 mock 模式（返回 fixture 数据）
 */
import { Router } from "express";
import express from "express";
import { runAgent } from "../lib/orchestrator.js";
import { logger } from "../lib/logger.js";
import { agentRunInputSchema } from "../../../shared/src/schemas/api-input.schema.js";

export const agentRouter = Router();

agentRouter.post("/agent/run", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const parsed = agentRunInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: { type: "validation", message: parsed.error.issues.map(i => i.message).join("; ") } });
      return;
    }

    const {
      agent,
      caseId,
      request: requestData,
      providerPreference,
      modelId,
      modelFallbacks,
      enableModelFallback,
      providerBaseUrls,
      maxTokens,
      knowledgeEnabled,
      knowledgeEmbedding,
      knowledgeReranker,
      apiKey,
      mock,
      mockKey,
    } = parsed.data;

    // B-038: Mock 模式 — 返回 fixture 数据，不调用真实 AI
    if (mock) {
      try {
        const { loadFixture } = await import("../../../shared/src/fixtures/loadFixture.js");
        const key = mockKey || caseId;
        const fixture = loadFixture(agent, key);
        logger.info(`Mock fixture loaded: agent=${agent}, key=${key}`);
        res.json({ ok: true, output: fixture });
        return;
      } catch (mockErr) {
        const msg = mockErr instanceof Error ? mockErr.message : String(mockErr);
        logger.warn(`Mock fixture not found: agent=${agent}, key=${mockKey || caseId}: ${msg}`);
        res.status(400).json({
          ok: false,
          error: { type: "mock-fixture-not-found", message: `No mock fixture for agent=${agent} key=${mockKey || caseId}` }
        });
        return;
      }
    }

    logger.info(`Agent run request: agent=${agent}, caseId=${caseId}, knowledgeEnabled=${knowledgeEnabled}`);

    const result = await runAgent({
      agent,
      caseId,
      request: requestData ?? {},
      providerPreference,
      modelId,
      modelFallbacks,
      enableModelFallback,
      providerBaseUrls,
      maxTokens,
      signal: (req as unknown as { signal?: AbortSignal }).signal,
      knowledgeEnabled,
      knowledgeEmbedding,
      knowledgeReranker,
      apiKey,
    });

    if (!result.ok) {
      const status = result.error?.type === "unsupported" ? 501
        : result.error?.type === "auth" ? 401
        : 500;
      res.status(status).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    logger.error("Agent run error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: { type: "server", message: "Internal server error" } });
  }
});

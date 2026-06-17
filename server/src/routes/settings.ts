import { Router } from "express";
import { registry } from "../providers/registry.js";
import { getModelCatalog } from "../providers/model-capabilities-registry.js";
import { settingsModelsQuerySchema, storeNameSchema } from "../../../shared/src/schemas/api-input.schema.js";
import { validateExternalUrl, BlockedUrlError } from "../lib/urlValidation.js";
import { logger } from "../lib/logger.js";

export const settingsRouter = Router();

// B-041: PUT /settings/providers/:providerId 已删除 — server 从 DB 直接读取 key，不再依赖 client sync

// bug9: 模型目录 — 返回所有 provider 的模型列表 + 能力元数据（无需 API Key）
settingsRouter.get("/providers/models", (_req, res) => {
  res.json(getModelCatalog());
});

// List available models for a provider
settingsRouter.get("/providers/:providerId/models", async (req, res) => {
  const idParsed = storeNameSchema.safeParse(req.params.providerId);
  if (!idParsed.success) {
    res.status(400).json({ error: idParsed.error.issues.map(i => i.message).join("; ") });
    return;
  }
  const providerId = idParsed.data;

  const parsed = settingsModelsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
    return;
  }
  const { apiKey, baseUrl } = parsed.data;

  if (baseUrl) {
    try {
      validateExternalUrl(baseUrl);
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  const adapter = registry.get(providerId);
  if (!adapter) {
    res.status(404).json({ error: `Unknown provider: ${providerId}` });
    return;
  }

  try {
    const models = await adapter.listModels(apiKey, baseUrl);
    res.json({ providerId, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

// Verify a single model is callable (lightweight chat test)
settingsRouter.post("/providers/:providerId/verify-model", async (req, res) => {
  const idParsed = storeNameSchema.safeParse(req.params.providerId);
  if (!idParsed.success) {
    res.status(400).json({ error: idParsed.error.issues.map(i => i.message).join("; ") });
    return;
  }
  const providerId = idParsed.data;

  const { apiKey, baseUrl, modelId } = req.body as { apiKey?: string; baseUrl?: string; modelId?: string };
  if (!apiKey || !modelId) {
    res.status(400).json({ error: "apiKey and modelId are required" });
    return;
  }

  const adapter = registry.get(providerId);
  if (!adapter) {
    res.status(404).json({ error: `Unknown provider: ${providerId}` });
    return;
  }

  const base = baseUrl || adapter.defaultBaseUrl;
  try {
    const res_ = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res_.ok) {
      logger.info(`[verify-model] ${providerId}/${modelId}: OK`);
      res.json({ ok: true, modelId });
    } else {
      const body = await res_.text().catch(() => "");
      logger.warn(`[verify-model] ${providerId}/${modelId}: HTTP ${res_.status} — ${body.slice(0, 200)}`);
      res.json({ ok: false, modelId, error: `HTTP ${res_.status}: ${body.slice(0, 200)}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[verify-model] ${providerId}/${modelId}: ${message}`);
    res.json({ ok: false, modelId, error: message });
  }
});

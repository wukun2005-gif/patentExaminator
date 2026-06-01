import { Router } from "express";
import { setApiKey, getApiKey, removeApiKey } from "../security/keyStore.js";
import { registry } from "../providers/registry.js";

export const settingsRouter = Router();

// B-026: GET /settings/providers 端点已删除（死代码，client 是 source of truth）

// Set provider API key
settingsRouter.put("/settings/providers/:providerId", (req, res) => {
  const { providerId } = req.params;
  if (!providerId) {
    res.status(400).json({ error: "providerId is required" });
    return;
  }
  const { apiKey } = req.body as { apiKey?: string };

  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  setApiKey(providerId, apiKey);
  res.json({ ok: true, providerId });
});

// B-026: DELETE /settings/providers/:providerId 端点已删除（死代码）
// B-026: GET /settings/providers/:providerId 端点已删除（死代码）

// List available models for a provider
settingsRouter.get("/providers/:providerId/models", async (req, res) => {
  const { providerId } = req.params;
  const apiKey = req.query.apiKey as string | undefined;
  const baseUrl = req.query.baseUrl as string | undefined;

  if (!apiKey) {
    res.status(400).json({ error: "apiKey query parameter is required" });
    return;
  }

  if (!providerId) {
    res.status(400).json({ error: "providerId is required" });
    return;
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

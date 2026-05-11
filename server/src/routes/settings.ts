import { Router } from "express";
import { setApiKey, getApiKey, removeApiKey, listProviders } from "../security/keyStore.js";
import { registry } from "../providers/registry.js";

export const settingsRouter = Router();

// Get configured providers
settingsRouter.get("/settings/providers", (_req, res) => {
  const providers = listProviders().map((id) => ({
    providerId: id,
    hasKey: true
  }));
  res.json({ providers });
});

// Set provider API key
settingsRouter.put("/settings/providers/:providerId", (req, res) => {
  const { providerId } = req.params;
  const { apiKey } = req.body as { apiKey?: string };

  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  setApiKey(providerId!, apiKey);
  res.json({ ok: true, providerId });
});

// Remove provider API key
settingsRouter.delete("/settings/providers/:providerId", (req, res) => {
  const { providerId } = req.params;
  const removed = removeApiKey(providerId!);
  res.json({ ok: removed, providerId });
});

// Check if provider has key
settingsRouter.get("/settings/providers/:providerId", (req, res) => {
  const { providerId } = req.params;
  const key = getApiKey(providerId!);
  res.json({ providerId, hasKey: !!key });
});

// List available models for a provider
settingsRouter.get("/providers/:providerId/models", async (req, res) => {
  const { providerId } = req.params;
  const apiKey = req.query.apiKey as string | undefined;

  if (!apiKey) {
    res.status(400).json({ error: "apiKey query parameter is required" });
    return;
  }

  const adapter = registry.get(providerId!);
  if (!adapter) {
    res.status(404).json({ error: `Unknown provider: ${providerId}` });
    return;
  }

  try {
    const models = await adapter.listModels(apiKey);
    res.json({ providerId, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

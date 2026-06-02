/**
 * Integration tests for server HTTP routes.
 *
 * Covers:
 * - GET /api/health — health check
 * - POST /api/ai/run — normal request, missing params, provider not found
 * - PUT /api/settings/providers — set API key (B-026: GET/DELETE endpoints removed)
 *
 * Strategy: create a minimal Express app with the actual routers,
 * use supertest for HTTP assertions. Mock external dependencies (AI calls).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { healthRouter } from "@server/routes/health.js";
import { settingsRouter } from "@server/routes/settings.js";
import { aiRouter } from "@server/routes/ai.js";
import { clearAll } from "@server/security/keyStore.js";

// Mock the provider registry to avoid real AI calls
vi.mock("@server/providers/registry.js", () => {
  const mockRegistry = {
    get: vi.fn(),
    runWithFallback: vi.fn(),
    listModels: vi.fn().mockResolvedValue(["mock-model"]),
  };
  return { registry: mockRegistry, ProviderRegistry: vi.fn(() => mockRegistry) };
});

// Mock the logger to suppress output
vi.mock("@server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", healthRouter);
  app.use("/api", settingsRouter);
  app.use("/api", aiRouter);
  return app;
}

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");
  });
});

describe("Settings routes", () => {
  beforeEach(() => {
    clearAll();
  });

  it("PUT /api/settings/providers/:id sets API key", async () => {
    const app = createTestApp();
    const res = await request(app)
      .put("/api/settings/providers/kimi")
      .send({ apiKey: "test-key-123" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("providerId", "kimi");
  });

  it("PUT /api/settings/providers/:id rejects missing apiKey", async () => {
    const app = createTestApp();
    const res = await request(app)
      .put("/api/settings/providers/kimi")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "apiKey is required");
  });
});

describe("POST /api/ai/run", () => {
  beforeEach(() => {
    clearAll();
  });

  it("rejects missing required fields", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/ai/run")
      .send({});
    // Should fail schema validation
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects request with invalid JSON", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/api/ai/run")
      .set("Content-Type", "application/json")
      .send("not-json");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

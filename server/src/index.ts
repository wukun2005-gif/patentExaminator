import dotenv from "dotenv";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { aiRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import { searchRouter } from "./routes/search.js";
import { syncRouter } from "./routes/sync.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { dataRouter } from "./routes/data.js";
import { ocrRouter } from "./routes/ocr.js";
import { documentsRouter } from "./routes/documents.js";
import { setApiKey } from "./security/keyStore.js";
import { logger } from "./lib/logger.js";
import { closeSyncDb } from "./lib/syncDb.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load .env file from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Load default API keys from environment variables
if (process.env.GEMINI_KEY) {
  setApiKey("gemini", process.env.GEMINI_KEY);
  logger.info("Loaded GEMINI_KEY from environment");
}
if (process.env.MiMo_KEY) {
  setApiKey("mimo", process.env.MiMo_KEY);
  logger.info("Loaded MiMo_KEY from environment");
}
if (process.env.Openrouter_KEY) {
  setApiKey("openrouter", process.env.Openrouter_KEY);
  logger.info("Loaded Openrouter_KEY from environment");
}


app.use(express.json({ limit: "1mb", charset: "utf-8" }));

// 确保所有响应使用 UTF-8 编码
app.use((_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// Simple rate limiter for expensive API endpoints (no external deps)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per window per IP

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ ok: false, error: "请求过于频繁，请稍后重试" });
    return;
  }
  next();
}

// API routes
app.use("/api", healthRouter);
app.use("/api", rateLimiter, aiRouter);
app.use("/api", settingsRouter);
app.use("/api", rateLimiter, searchRouter);
app.use("/api", syncRouter);
app.use("/api", knowledgeRouter);
app.use("/api", dataRouter);
app.use("/api", ocrRouter);
app.use("/api", documentsRouter);

// Serve client static files if dist exists
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`);
});

function shutdown() {
  closeSyncDb();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  // Force exit if graceful close stalls (e.g. keep-alive connections)
  setTimeout(() => process.exit(1), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  server.closeAllConnections?.();
});

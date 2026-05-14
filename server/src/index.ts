import dotenv from "dotenv";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { aiRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import { searchRouter } from "./routes/search.js";
import { setApiKey } from "./security/keyStore.js";
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
  console.log("Loaded GEMINI_KEY from environment");
}
if (process.env.QWEN_KEY) {
  setApiKey("qwen", process.env.QWEN_KEY);
  console.log("Loaded QWEN_KEY from environment");
}

app.use(express.json());

// API routes
app.use("/api", healthRouter);
app.use("/api", aiRouter);
app.use("/api", settingsRouter);
app.use("/api", searchRouter);

// Serve client static files if dist exists
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

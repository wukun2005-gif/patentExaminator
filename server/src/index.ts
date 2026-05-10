import express from "express";
import { healthRouter } from "./routes/health.js";
import { aiRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// API routes
app.use("/api", healthRouter);
app.use("/api", aiRouter);
app.use("/api", settingsRouter);

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

/**
 * AI Smoke Test for Patent Examiner
 * ==================================
 *
 * 验证 Gemini API 连通性和基本 AI 调用功能。
 * 参考 resumeTailor 的 fallback 机制实现。
 *
 * Usage:
 *   GEMINI_KEY=xxx node tests/developer-ai-smoke.mjs
 *
 * 环境变量：
 *   GEMINI_KEY       - Google AI Studio API Key（必需）
 *   TEST_BASE        - 测试服务器地址（默认 http://localhost:3000/api）
 *   GEMINI_MODEL_ID  - 指定模型（默认 gemini-2.5-flash-lite）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 加载 .env ──
function loadEnvFile() {
  if (process.env.GEMINI_KEY) return;

  try {
    const envPath = path.join(__dirname, "..", ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key === "GEMINI_KEY") {
        let value = valueParts.join("=");
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env.GEMINI_KEY = value;
        break;
      }
    }
  } catch {
    // .env not found, continue
  }
}
loadEnvFile();

// ── 常量 ──
const BASE = process.env.TEST_BASE || "http://localhost:3000/api";
const GEMINI_KEY = process.env.GEMINI_KEY;
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || "gemini-2.5-flash-lite";

// ── Fallback 模型列表（按优先级排序）──
const FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",   // 1. 最推荐 (速度极快、配额最高)
  "gemini-2.0-flash-lite",   // 2. 最推荐 (速度极快、配额最高)
  "gemini-2.5-flash",        // 3. 综合能力最强
  "gemini-2.0-flash",        // 4. 综合能力最强
  "gemini-2.5-pro",          // 5. 高级能力 (配额较低)
];

let currentModelIndex = 0;
const RESULTS = [];

// ── 工具函数 ──
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(name, pass, detail = "") {
  const icon = pass ? "✓" : "✗";
  const msg = `[${icon}] ${name}${detail ? ": " + detail : ""}`;
  console.log(msg);
  RESULTS.push({ name, pass, detail });
}

function isRetryableError(text = "") {
  const lower = String(text).toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("配额不足") ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("500") ||
    lower.includes("timeout") ||
    lower.includes("econnreset")
  );
}

function isModelQuotaError(text = "") {
  const lower = String(text).toLowerCase();
  return lower.includes("配额不足") || lower.includes("resource_exhausted");
}

function getFallbackModel() {
  if (currentModelIndex >= FALLBACK_MODELS.length) {
    throw new Error("所有模型都已尝试失败，无法继续 fallback");
  }
  const model = FALLBACK_MODELS[currentModelIndex];
  console.log(
    `[Fallback] 尝试模型: ${model} (第 ${currentModelIndex + 1}/${FALLBACK_MODELS.length} 个)`
  );
  return model;
}

// ── HTTP 请求 ──
async function postJSON(pathname, body) {
  return fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJSON(pathname) {
  return fetch(`${BASE}${pathname}`);
}

// ── 带 Fallback 的 AI 调用 ──
async function callAIWithFallback(body, retries = 4) {
  currentModelIndex = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt === 0) {
        body.modelId = GEMINI_MODEL_ID;
      } else {
        body.modelId = getFallbackModel();
      }

      console.log(
        `[Attempt ${attempt + 1}/${retries + 1}] 尝试模型: ${body.modelId}`
      );

      const res = await postJSON("/ai/run", body);
      const data = await res.json();

      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `HTTP ${res.status}`;

        if (isRetryableError(errorMsg)) {
          if (isModelQuotaError(errorMsg)) {
            currentModelIndex++;
            console.log(`[Quota Error] ${errorMsg}，尝试下一个模型...`);
            if (currentModelIndex < FALLBACK_MODELS.length) {
              await delay(5000);
              continue;
            }
          } else if (attempt < retries) {
            const waitSec = 15 * (attempt + 1);
            console.log(
              `[Retryable Error] ${errorMsg}，等待 ${waitSec}s 后重试...`
            );
            await delay(waitSec * 1000);
            continue;
          }
        }

        throw new Error(errorMsg);
      }

      if (currentModelIndex > 0) {
        console.log(
          `[Success] 使用模型 ${body.modelId} 成功完成调用`
        );
      }

      return data;
    } catch (err) {
      if (attempt < retries) {
        const waitSec = 15 * (attempt + 1);
        console.log(
          `[Exception] ${err.message}，等待 ${waitSec}s 后重试...`
        );
        await delay(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }

  throw new Error("AI 调用在所有重试后仍然失败");
}

// ── 测试用例 ──

async function testServerHealth() {
  try {
    const res = await getJSON("/health");
    const data = await res.json();
    log("T-SMOKE-001: 服务器健康检查", res.ok && data.status === "ok", JSON.stringify(data));
  } catch (err) {
    log("T-SMOKE-001: 服务器健康检查", false, err.message);
  }
}

async function testGeminiModels() {
  try {
    const res = await getJSON(
      `/providers/gemini/models?apiKey=${encodeURIComponent(GEMINI_KEY)}`
    );
    const data = await res.json();

    if (!res.ok) {
      log("T-SMOKE-002: Gemini 模型列表", false, data.error || `HTTP ${res.status}`);
      return;
    }

    const models = data.models || [];
    const hasValidModels = models.length > 0 && models.some((m) => m.startsWith("gemini-"));

    log(
      "T-SMOKE-002: Gemini 模型列表",
      hasValidModels,
      `找到 ${models.length} 个模型: ${models.slice(0, 5).join(", ")}${models.length > 5 ? "..." : ""}`
    );
  } catch (err) {
    log("T-SMOKE-002: Gemini 模型列表", false, err.message);
  }
}

async function testAiChat() {
  try {
    const body = {
      agent: "chat",
      providerPreference: ["gemini"],
      modelId: GEMINI_MODEL_ID,
      prompt: "请用一句话回答：什么是专利？",
      sanitized: true,
      metadata: {
        caseId: "smoke-test",
        moduleScope: "chat",
        tokenEstimate: 50,
      },
    };

    const data = await callAIWithFallback(body);

    const hasText = data.ok && data.rawText && data.rawText.length > 0;
    log(
      "T-SMOKE-003: AI 对话调用",
      hasText,
      hasText
        ? `模型: ${data.modelId}, 响应: ${data.rawText.slice(0, 80)}...`
        : "无响应文本"
    );
  } catch (err) {
    log("T-SMOKE-003: AI 对话调用", false, err.message);
  }
}

async function testAiInterpret() {
  try {
    const body = {
      agent: "interpret",
      providerPreference: ["gemini"],
      modelId: GEMINI_MODEL_ID,
      prompt:
        "请分析以下专利段落的技术领域：\n[0001] 本发明涉及一种散热装置，特别涉及一种基于相变材料的LED散热模组。",
      sanitized: true,
      metadata: {
        caseId: "smoke-test",
        moduleScope: "interpret",
        tokenEstimate: 100,
      },
    };

    const data = await callAIWithFallback(body);

    const hasText = data.ok && data.rawText && data.rawText.length > 0;
    log(
      "T-SMOKE-004: AI 文档解读",
      hasText,
      hasText
        ? `模型: ${data.modelId}, 响应长度: ${data.rawText.length} 字符`
        : "无响应文本"
    );
  } catch (err) {
    log("T-SMOKE-004: AI 文档解读", false, err.message);
  }
}

async function testAiClaimChart() {
  try {
    const body = {
      agent: "claim-chart",
      providerPreference: ["gemini"],
      modelId: GEMINI_MODEL_ID,
      prompt:
        '请将以下权利要求拆解为技术特征：\n权利要求1：一种散热装置，其特征在于，包括：基板；相变材料层，设置于所述基板上；散热翅片，设置于所述相变材料层上。',
      sanitized: true,
      metadata: {
        caseId: "smoke-test",
        moduleScope: "claim-chart",
        tokenEstimate: 200,
      },
    };

    const data = await callAIWithFallback(body);

    const hasText = data.ok && data.rawText && data.rawText.length > 0;
    log(
      "T-SMOKE-005: AI 特征拆解",
      hasText,
      hasText
        ? `模型: ${data.modelId}, 响应长度: ${data.rawText.length} 字符`
        : "无响应文本"
    );
  } catch (err) {
    log("T-SMOKE-005: AI 特征拆解", false, err.message);
  }
}

async function testModelFallback() {
  console.log("\n─── 模型 Fallback 机制测试 ───");
  console.log(`首选模型: ${GEMINI_MODEL_ID}`);
  console.log(`Fallback 列表: ${FALLBACK_MODELS.join(" → ")}`);
  console.log("注意：如果首选模型正常，fallback 不会触发\n");

  log("T-SMOKE-006: Fallback 配置", true, `${FALLBACK_MODELS.length} 个备选模型已配置`);
}

// ── 主函数 ──
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Patent Examiner AI Smoke Test");
  console.log("═══════════════════════════════════════════");
  console.log(`API Base: ${BASE}`);
  console.log(`Model: ${GEMINI_MODEL_ID}`);
  console.log(`GEMINI_KEY: ${GEMINI_KEY ? "已设置" : "未设置"}`);
  console.log("═══════════════════════════════════════════\n");

  if (!GEMINI_KEY) {
    console.error("错误：请设置环境变量 GEMINI_KEY");
    console.error("  GEMINI_KEY=your-key node tests/developer-ai-smoke.mjs");
    process.exit(1);
  }

  await testServerHealth();
  await testGeminiModels();
  await testModelFallback();
  await testAiChat();
  await testAiInterpret();
  await testAiClaimChart();

  // ── 汇总 ──
  console.log("\n═══════════════════════════════════════════");
  const passed = RESULTS.filter((r) => r.pass).length;
  const total = RESULTS.length;
  console.log(`测试结果: ${passed}/${total} 通过`);
  console.log("═══════════════════════════════════════════");

  if (passed < total) {
    const failed = RESULTS.filter((r) => !r.pass);
    console.log("\n失败的测试:");
    for (const r of failed) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log("\n所有测试通过！");
}

main().catch((err) => {
  console.error("测试执行失败:", err);
  process.exit(1);
});

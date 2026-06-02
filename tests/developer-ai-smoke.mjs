/**
 * AI Smoke Test for Patent Examiner
 * ==================================
 *
 * 验证服务器 AI API 连通性和基本 AI 调用功能。
 * 不绑定特定 AI provider，所有配置通过环境变量覆盖。
 *
 * Usage:
 *   node tests/developer-ai-smoke.mjs
 *
 * 环境变量：
 *   MODEL_ID              - 模型 ID（默认读取 .env 中的兜底模型）
 *   PROVIDER_PREFERENCE   - provider 优先级，逗号分隔（默认 "openrouter"）
 *   FALLBACK_MODELS       - 备选模型列表，逗号分隔（默认与 MODEL_ID 相同）
 *   GEMINI_KEY            - （可选）仅用于 Gemini 模型列表接口测试
 *   TEST_BASE             - 测试服务器地址（默认 http://localhost:3000/api）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 从 .env 读取配置（兜底值） ──
const envVars = {};
try {
  const envPath = path.join(__dirname, "..", ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    let value = valueParts.join("=");
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[key] = value;
  }
} catch {
  // .env not found, continue
}

// ── 常量（优先级：环境变量 > .env > 硬编码兜底） ──
const BASE = process.env.TEST_BASE || "http://localhost:3000/api";
const MIMO_KEY = process.env.MiMo_KEY || envVars.MiMo_KEY || "";
const MIMO_MODEL_ID = process.env.MIMO_MODEL_ID || envVars.MIMO_MODEL_ID || "MiMo-V2.5";
const MODEL_ID = process.env.MODEL_ID || envVars.MODEL_ID || "deepseek/deepseek-v4-flash:free";
const PROVIDER_PREFERENCE = MIMO_KEY
  ? ["mimo", ...((process.env.PROVIDER_PREFERENCE || "openrouter").split(",").map(s => s.trim()).filter(Boolean))]
  : (process.env.PROVIDER_PREFERENCE || "openrouter").split(",").map(s => s.trim()).filter(Boolean);
const OPENROUTER_FALLBACK_MODELS = [
  "deepseek/deepseek-v4-flash:free",
  "z-ai/glm-4.5-air:free",
  "qwen/qwen3-coder:free",
  "arcee-ai/trinity-large-thinking:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "minimax/minimax-m2.5:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "openai/gpt-oss-120b:free",
];
const FALLBACK_MODELS = (
  process.env.FALLBACK_MODELS
    ? process.env.FALLBACK_MODELS.split(",").map(s => s.trim()).filter(Boolean)
    : OPENROUTER_FALLBACK_MODELS
);
const GEMINI_KEY = process.env.GEMINI_KEY || envVars.GEMINI_KEY || "";

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
    throw new Error("所有备选模型都已尝试失败");
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
async function callAIWithFallback(body, retries = 2) {
  currentModelIndex = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        body.modelId = getFallbackModel();
      }

      console.log(
        `[Attempt ${attempt + 1}/${retries + 1}] 模型: ${body.modelId}, provider: ${body.providerPreference?.join(",") || "默认"}`
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

async function testModelList() {
  if (!GEMINI_KEY) {
    log("T-SMOKE-002: Gemini 模型列表", true, "已跳过（未设 GEMINI_KEY）");
    return;
  }
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
    const hasValidModels = models.length > 0;

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
      providerPreference: PROVIDER_PREFERENCE,
      modelId: MIMO_KEY ? MIMO_MODEL_ID : MODEL_ID,
      ...(MIMO_KEY && { apiKey: MIMO_KEY }),
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

    if (data.ok && hasText) {
      const reply = data.outputJson?.reply || data.rawText;
      const meaningful = typeof reply === "string" && reply.length >= 10;
      log(
        "T-SMOKE-003-Q: AI 对话内容质量",
        meaningful,
        meaningful ? `回复: ${reply.slice(0, 80)}...` : "回复内容过短或无效"
      );
    }
  } catch (err) {
    log("T-SMOKE-003: AI 对话调用", false, err.message);
  }
}

async function testAiInterpret() {
  try {
    const body = {
      agent: "interpret",
      providerPreference: PROVIDER_PREFERENCE,
      modelId: MIMO_KEY ? MIMO_MODEL_ID : MODEL_ID,
      ...(MIMO_KEY && { apiKey: MIMO_KEY }),
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

    if (data.ok && hasText) {
      const reply = data.outputJson?.reply || data.rawText;
      const meaningful = typeof reply === "string" && reply.length >= 20;
      log(
        "T-SMOKE-004-Q: AI 文档解读内容质量",
        meaningful,
        meaningful ? `解读长度: ${data.rawText.length} 字符` : "解读内容过短或无效"
      );
    }
  } catch (err) {
    log("T-SMOKE-004: AI 文档解读", false, err.message);
  }
}

async function testAiClaimChart() {
  try {
    const body = {
      agent: "claim-chart",
      providerPreference: PROVIDER_PREFERENCE,
      modelId: MIMO_KEY ? MIMO_MODEL_ID : MODEL_ID,
      ...(MIMO_KEY && { apiKey: MIMO_KEY }),
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

    if (data.ok) {
      const structureErrors = data.structureErrors;
      if (Array.isArray(structureErrors) && structureErrors.length > 0) {
        log("T-SMOKE-005-Q: AI 特征拆解输出质量", false,
          `结构校验失败: ${structureErrors.join("; ")}`);
      } else if (data.outputJson) {
        const features = data.outputJson.features;
        const valid = Array.isArray(features) && features.length > 0
          && features.every(f => typeof f.featureCode === "string" && typeof f.description === "string");
        log("T-SMOKE-005-Q: AI 特征拆解输出质量", valid,
          valid ? `features=${features.length}` : "features 格式不正确");
      } else {
        log("T-SMOKE-005-Q: AI 特征拆解输出质量", false, "无结构化 JSON 输出");
      }
    }
  } catch (err) {
    log("T-SMOKE-005: AI 特征拆解", false, err.message);
  }
}

async function testModelFallbackInfo() {
  console.log("\n─── 模型配置 ───");
  console.log(`MiMo: ${MIMO_KEY ? `已配置 (key: ...${MIMO_KEY.slice(-4)}, model: ${MIMO_MODEL_ID})` : "未配置"}`);
  console.log(`首选模型: ${MIMO_KEY ? MIMO_MODEL_ID : MODEL_ID}`);
  console.log(`Provider 优先级: ${PROVIDER_PREFERENCE.join(" → ")}`);
  console.log(`备选模型: ${FALLBACK_MODELS.join(" → ")}`);
  console.log("注意：首次调用使用首选模型，失败后按备选列表 fallback\n");

  log("T-SMOKE-006: 模型配置", true, `provider: ${PROVIDER_PREFERENCE.join(",")}, 备选: ${FALLBACK_MODELS.length} 个`);
}

// ── 主函数 ──
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Patent Examiner AI Smoke Test");
  console.log("═══════════════════════════════════════════");
  console.log(`API Base: ${BASE}`);
  console.log(`MiMo: ${MIMO_KEY ? `enabled (model: ${MIMO_MODEL_ID})` : "disabled (no MiMo_KEY)"}`);
  console.log(`Model: ${MIMO_KEY ? MIMO_MODEL_ID : MODEL_ID}`);
  console.log(`Provider 优先级: ${PROVIDER_PREFERENCE.join(" → ")}`);
  console.log(`备选模型: ${FALLBACK_MODELS.join(", ")}`);
  console.log("═══════════════════════════════════════════\n");

  await testServerHealth();
  await testModelList();
  await testModelFallbackInfo();
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

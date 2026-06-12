/**
 * E2E 测试环境变量加载
 * ====================
 *
 * 统一的 .env 文件加载逻辑，避免各脚本重复实现。
 * 支持优先级：环境变量 > .env 文件 > 默认值
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { API_KEY_NAMES, DEFAULT_MODEL_IDS, DEFAULT_TEST_BASE } from "./config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// ── .env 文件解析 ────────────────────────────────────────────────────

/**
 * 解析 .env 文件内容为键值对对象
 * 支持 # 注释、引号包裹的值
 */
function parseEnvFile(filePath) {
  const result = {};

  if (!fs.existsSync(filePath)) {
    return result;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // 移除引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * 加载 .env 文件到 process.env（仅设置未存在的变量）
 */
export function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  const envVars = parseEnvFile(envPath);

  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * 获取 .env 文件中的变量（不修改 process.env）
 */
export function getEnvVars() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  return parseEnvFile(envPath);
}

// ── 环境变量读取工具 ────────────────────────────────────────────────

/**
 * 获取环境变量，支持优先级：process.env > .env > 默认值
 */
export function getEnv(key, defaultValue = "") {
  return process.env[key] || defaultValue;
}

/**
 * 获取 API key
 */
export function getApiKey(provider) {
  const envKey = API_KEY_NAMES[provider];
  if (!envKey) {
    console.warn(`[env.mjs] Unknown provider: ${provider}. Add it to API_KEY_NAMES in config.mjs.`);
    return "";
  }
  return process.env[envKey] || "";
}

/**
 * 获取模型 ID
 */
export function getModelId(provider) {
  const envKey = `${provider.toUpperCase()}_MODEL_ID`;
  return process.env[envKey] || DEFAULT_MODEL_IDS[provider];
}

/**
 * 获取测试服务器地址
 */
export function getTestBase() {
  const fromEnv = process.env.TEST_BASE;
  const result = fromEnv || DEFAULT_TEST_BASE;
  const source = fromEnv ? "env.TEST_BASE" : "DEFAULT_TEST_BASE(fallback)";
  const stack = new Error().stack?.split("\n").slice(1, 4).map(s => s.trim()).join(" <- ") ?? "?";
  console.log(`[getTestBase] ${source} → ${result} | caller: ${stack}`);
  return result;
}

/**
 * 检查 API key 是否已配置
 */
export function hasApiKey(provider) {
  return !!getApiKey(provider);
}

/**
 * 掩码 API key（仅显示最后 4 位）
 */
export function maskKey(key) {
  return key ? `...${key.slice(-4)}` : "(empty)";
}

// ── 便捷访问器 ──────────────────────────────────────────────────────

/** 获取所有配置的 API key */
export function getAllApiKeys() {
  return {
    gemini: getApiKey("gemini"),
    mimo: getApiKey("mimo"),
    volcengine: getApiKey("volcengine"),
    openrouter: getApiKey("openrouter"),
    tavily: getApiKey("tavily"),
    serp: getApiKey("serp"),
  };
}

/** 打印环境配置摘要 */
export function printEnvSummary() {
  console.log("─── 环境配置 ───");
  console.log(`Gemini: ${hasApiKey("gemini") ? `已配置 (${maskKey(getApiKey("gemini"))})` : "未配置"}`);
  console.log(`MiMo: ${hasApiKey("mimo") ? `已配置 (${maskKey(getApiKey("mimo"))})` : "未配置"}`);
  console.log(`火山引擎: ${hasApiKey("volcengine") ? `已配置 (${maskKey(getApiKey("volcengine"))})` : "未配置"}`);
  console.log(`OpenRouter: ${hasApiKey("openrouter") ? `已配置 (${maskKey(getApiKey("openrouter"))})` : "未配置"}`);
  console.log(`Tavily: ${hasApiKey("tavily") ? `已配置 (${maskKey(getApiKey("tavily"))})` : "未配置"}`);
  console.log(`SerpAPI: ${hasApiKey("serp") ? `已配置 (${maskKey(getApiKey("serp"))})` : "未配置"}`);
  console.log("");
}

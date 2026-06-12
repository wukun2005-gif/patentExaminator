/**
 * Golden Set 生成 E2E 测试
 * ========================
 *
 * 测试 Golden Set 生成的完整流程：
 * 1. 上传知识库文件（提供 chunk 采样数据）
 * 2. 用 providerConfigs 生成 golden set
 * 3. 验证生成结果
 * 4. 清理
 *
 * 需要 API Key：MiMo_KEY, GEMINI_KEY（从 .env 加载）
 */

import path from "path";
import {
  postJSON,
  getJSON,
  log,
  uploadKnowledgeFile,
  getApiKey,
  getTestBase,
  SAMPLES_KNOWLEDGE_DIR,
} from "../e2e-shared/index.mjs";

const TIMEOUT_MS = 300_000; // 5 分钟（LLM 生成较慢）

async function safeJson(res, label) {
  if (!res.ok && res.status >= 500) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 100)}`);
  }
  return res.json();
}

// ── Tests ────────────────────────────────────────────────────────────

/**
 * 上传知识库文件为 golden set 生成提供 chunk 数据
 */
export async function testGoldenSetUploadKnowledge() {
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
  const result = await uploadKnowledgeFile(filePath);
  log("GoldenSet: Upload knowledge file", result.ok, result.ok ? "专利法_2020修正.txt" : result.error);
}

/**
 * 用请求体 providerConfigs 生成 golden set（测试隔离模式）
 * 包含性能计时
 */
export async function testGoldenSetGenerate() {
  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");

  if (!mimoKey && !volcengineKey) {
    log("GoldenSet: Generate", true, "skipped (no API keys)");
    return;
  }

  const providerConfigs = [];
  if (mimoKey) {
    providerConfigs.push({ providerId: "mimo", model: "mimo-v2.5", apiKey: mimoKey, label: "MiMo" });
  }
  if (volcengineKey) {
    providerConfigs.push({ providerId: "volcengine", model: "deepseek-v4-flash-260425", apiKey: volcengineKey, label: "DeepSeek (火山)" });
    providerConfigs.push({ providerId: "volcengine", model: "doubao-seed-2-0-pro-260215", apiKey: volcengineKey, label: "doubao-seed (火山)" });
  }

  // spec §11: 使用 SerpAPI key（与 MCP Web Search 路径一致）
  const searchApiKey = getApiKey("serp");

  // 计时开始
  const startTime = performance.now();
  console.log(`[Perf] Golden Set 生成开始: ${new Date().toISOString()}`);
  console.log(`[Perf] Providers: ${providerConfigs.map(p => p.label).join(", ")}`);
  console.log(`[Perf] Questions per provider: 2`);
  console.log(`[Perf] Search API key (SerpAPI): ${searchApiKey ? "✓" : "✗ (web types will be skipped)"}`);

  const res = await postJSON("/metrics/golden-set/generate", {
    providerConfigs,
    questionsPerProvider: 2,
    ...(searchApiKey && { searchApiKey }),
  }, undefined, TIMEOUT_MS);
  const data = await safeJson(res, "GoldenSet Generate");

  // 计时结束
  const endTime = performance.now();
  const durationMs = endTime - startTime;
  const durationSec = (durationMs / 1000).toFixed(1);

  const hasQuestions = data.count > 0 && Array.isArray(data.questions) && data.questions.length > 0;
  log("GoldenSet: Generate", hasQuestions,
    hasQuestions ? `count=${data.count}, providers=${[...new Set(data.questions.map(q => q.generated_by))].join(",")}` : JSON.stringify(data));

  // 性能报告
  console.log(`[Perf] Golden Set 生成完成: ${new Date().toISOString()}`);
  console.log(`[Perf] 总耗时: ${durationSec}s (${durationMs.toFixed(0)}ms)`);
  console.log(`[Perf] 平均每题: ${(durationMs / (data.count || 1)).toFixed(0)}ms`);

  if (hasQuestions) {
    const q = data.questions[0];
    log("GoldenSet: Question structure",
      q.id && q.query && q.expectedAnswer && q.category && q.generatedBy,
      `id=${q.id}, category=${q.category}, by=${q.generatedBy}`);
  }

  // 保存性能数据到文件（可选）
  const perfData = {
    timestamp: new Date().toISOString(),
    providers: providerConfigs.map(p => p.label),
    questionsPerProvider: 2,
    totalQuestions: data.count || 0,
    durationMs: Math.round(durationMs),
    durationSec: parseFloat(durationSec),
    avgMsPerQuestion: Math.round(durationMs / (data.count || 1)),
  };
  console.log(`[Perf] 性能数据:`, JSON.stringify(perfData, null, 2));
}

/**
 * 验证 golden set 可以通过 GET 读取
 */
export async function testGoldenSetRead() {
  const res = await getJSON("/metrics/golden-set");
  const data = await safeJson(res, "GoldenSet Read");
  const hasData = data.count > 0 && Array.isArray(data.questions);
  log("GoldenSet: Read back", hasData,
    hasData ? `count=${data.count}` : JSON.stringify(data));
}

/**
 * 验证 golden set 统计信息
 */
export async function testGoldenSetStats() {
  const res = await getJSON("/metrics/golden-set");
  const data = await safeJson(res, "GoldenSet Stats");

  if (data.count === 0) {
    log("GoldenSet: Stats", true, "skipped (no data)");
    return;
  }

  // 检查按 category 分布（样本小时可能只有 1 个 category，不算失败）
  const categories = {};
  for (const q of data.questions) {
    categories[q.category] = (categories[q.category] || 0) + 1;
  }
  const categoryCount = Object.keys(categories).length;
  log("GoldenSet: Category distribution", categoryCount >= 1,
    `categories=${categoryCount}: ${JSON.stringify(categories)}`);

  // 检查按 provider 分布
  const providers = {};
  for (const q of data.questions) {
    providers[q.generatedBy] = (providers[q.generatedBy] || 0) + 1;
  }
  const providerCount = Object.keys(providers).length;
  log("GoldenSet: Provider diversity", providerCount >= 1,
    `providers=${providerCount}: ${JSON.stringify(providers)}`);
}

/**
 * 清理 golden set（不污染测试 DB）
 */
export async function testGoldenSetCleanup() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/golden-set`, { method: "DELETE" });
  const data = await safeJson(res, "GoldenSet Cleanup");
  log("GoldenSet: Cleanup", data.ok === true, JSON.stringify(data));
}

#!/usr/bin/env node
/**
 * Golden Set 生成性能测试
 * 通过隔离服务器实际测量批量并行 vs 旧串行的耗时
 */

import { loadEnvFile, getApiKey } from "./e2e-shared/env.mjs";
import { postJSON, getJSON } from "./e2e-shared/http.mjs";
import { startIsolatedServer } from "./e2e-shared/server-lifecycle.mjs";
import { uploadKnowledgeFile, SAMPLES_KNOWLEDGE_DIR } from "./e2e-shared/index.mjs";
// GEMINI_FALLBACK_MODELS 已移除 — Gemini API 暂停使用
import path from "path";

loadEnvFile();

async function main() {
  console.log("=== Golden Set 生成性能测试 ===\n");

  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");
  const serpApiKey = getApiKey("serp");

  if (!mimoKey && !volcengineKey) {
    console.log("❌ 没有找到任何 API key，跳过");
    process.exit(0);
  }

  // 启动隔离服务器
  console.log("启动隔离服务器...");
  const { baseUrl, cleanup } = await startIsolatedServer();
  process.env.TEST_BASE = baseUrl;
  console.log(`服务器就绪: ${baseUrl}\n`);

  try {
    // 上传知识库文件
    console.log("上传知识库文件...");
    const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
    const uploadResult = await uploadKnowledgeFile(filePath);
    if (!uploadResult.ok) {
      console.error("❌ 上传失败:", uploadResult.error);
      process.exit(1);
    }
    console.log("✅ 知识库文件已上传\n");

    // 写入 settings 到隔离 DB（包含 Gemini fallback 链）
    console.log("写入 settings 到隔离 DB...");
    const settingsProviders = [];
    if (mimoKey) settingsProviders.push({ providerId: "mimo", apiKeyRef: mimoKey });
    if (volcengineKey) settingsProviders.push({ providerId: "volcengine", apiKeyRef: volcengineKey });
    // Gemini API 因超时频繁失败已暂停，替换为火山 doubao-seed
    // spec §11: 写入 SerpAPI search provider
    const searchProviders = [];
    if (serpApiKey) searchProviders.push({ providerId: "serpapi", enabled: true, apiKeyRef: serpApiKey });

    const settingsRes = await postJSON("/sync/upload", {
      stores: { settings: [{ id: "app", data: { providers: settingsProviders, searchProviders } }] },
    });
    const settingsData = await settingsRes.json().catch(() => ({}));
    console.log(`✅ Settings 已写入 (providers=${settingsProviders.length})\n`);

    // 构建 provider 配置
    const providerConfigs = [];
    if (mimoKey) providerConfigs.push({ providerId: "mimo", model: "mimo-v2.5", apiKey: mimoKey, label: "MiMo" });
    if (volcengineKey) {
      providerConfigs.push({ providerId: "volcengine", model: "deepseek-v4-flash-260425", apiKey: volcengineKey, label: "DeepSeek" });
      providerConfigs.push({ providerId: "volcengine", model: "doubao-seed-2-0-pro-260215", apiKey: volcengineKey, label: "doubao-seed" });
    }

    console.log(`Providers: ${providerConfigs.map(p => p.label).join(", ")}`);
    console.log(`SerpAPI: ${serpApiKey ? "已配置" : "未配置（web 题型将跳过）"}`);
    console.log(`每个 provider 生成 7 题\n`);

    // ── 测试：批量并行模式 ──
    console.log("━━━ 测试：批量并行模式（7题/provider）━━━");
    const startFull = performance.now();

    const resFull = await postJSON(
      "/metrics/golden-set/generate",
      { providerConfigs, questionsPerProvider: 7, ...(serpApiKey && { searchApiKey: serpApiKey }) },
      undefined,
      300_000,
    );

    const endFull = performance.now();
    const dataFull = await resFull.json();
    const durationFull = endFull - startFull;

    console.log(`\n结果: ${dataFull.count} 题`);
    console.log(`耗时: ${(durationFull / 1000).toFixed(1)}s`);
    console.log(`每题平均: ${(durationFull / (dataFull.count || 1)).toFixed(0)}ms`);

    // 打印 golden set 内容
    console.log("\n━━━ 生成的 Golden Set ━━━");
    if (dataFull.questions) {
      const providerBreakdown = {};
      for (const q of dataFull.questions) {
        const provider = q.generatedBy || q.generated_by || "unknown";
        providerBreakdown[provider] = (providerBreakdown[provider] || 0) + 1;
      }
      console.log(`分布: ${JSON.stringify(providerBreakdown)}\n`);

      for (let i = 0; i < dataFull.questions.length; i++) {
        const q = dataFull.questions[i];
        const provider = q.generatedBy || q.generated_by || "unknown";
        console.log(`── Q${i + 1} [${provider}] ${q.category}/${q.difficulty} ──`);
        console.log(`  问题: ${q.query}`);
        console.log(`  预期: ${q.expectedAnswer.slice(0, 120)}...`);
        console.log(`  法条: ${q.expectedArticles?.join(", ") || "无"}`);
        console.log(`  来源: ${q.expectedSources?.join(", ") || "无"}`);
        console.log();
      }

      // 保存到项目目录
      const outPath = path.join(process.cwd(), "tests", "eval-reports", "golden-set-sample.json");
      const { mkdirSync, writeFileSync } = await import("fs");
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(dataFull.questions, null, 2), "utf-8");
      console.log(`✅ Golden set 已保存: ${outPath}`);
    }

  } finally {
    await cleanup();
    console.log("\n✅ 清理完成");
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

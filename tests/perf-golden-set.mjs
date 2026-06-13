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
import { mkdirSync, writeFileSync } from "fs";

loadEnvFile();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

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
    await settingsRes.json().catch(() => ({}));
    console.log(`✅ Settings 已写入 (providers=${settingsProviders.length})\n`);

    // 构建 provider 配置
    const providerConfigs = [];
    if (mimoKey) providerConfigs.push({ providerId: "mimo", model: "mimo-v2.5", apiKey: mimoKey, label: "MiMo" });
    if (volcengineKey) {
      providerConfigs.push({ providerId: "volcengine", model: "deepseek-v3-2-251201", apiKey: volcengineKey, label: "DeepSeek" });
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
      { providerConfigs, ...(serpApiKey && { searchApiKey: serpApiKey }) },
      undefined,
      600_000,
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

      console.log(`✅ Golden set 题目已生成: ${dataFull.count} 题`);
    }

    // ── 测试：A.2 Relevance Grading ──
    console.log("\n━━━ A.2 Relevance Grading（2-judge: MiMo + DeepSeek）━━━");
    const judgeApiKeys = {};
    if (mimoKey) judgeApiKeys.mimo = mimoKey;
    if (volcengineKey) judgeApiKeys.volcengine = volcengineKey;

    if (Object.keys(judgeApiKeys).length > 0 && dataFull.count > 0) {
      const startGrade = performance.now();
      const resGrade = await postJSON(
        "/metrics/golden-set/grade",
        { judgeApiKeys },
        undefined,
        600_000,
      );
      const endGrade = performance.now();
      const dataGrade = await resGrade.json();
      const durationGrade = endGrade - startGrade;

      console.log(`结果: ${dataGrade.graded || 0} 题已 grading`);
      console.log(`耗时: ${(durationGrade / 1000).toFixed(1)}s`);

      // 统计 grade 分布
      if (dataGrade.results) {
        const gradeDistribution = { 0: 0, 1: 0, 2: 0, 3: 0 };
        let totalCandidates = 0;
        for (const r of dataGrade.results) {
          for (const g of (r.grading || [])) {
            gradeDistribution[g.grade] = (gradeDistribution[g.grade] || 0) + 1;
            totalCandidates++;
          }
        }
        console.log(`候选总数: ${totalCandidates}`);
        console.log(`Grade 分布: ${JSON.stringify(gradeDistribution)}`);
      }
    } else {
      console.log("⏭️ 跳过（无 judge API key 或无题目）");
    }

    // ── 保存 Golden Set 原始 JSON（A.2 之后，含 grading，调试用）──
    const ts2 = timestamp();
    const rawPath = path.join(process.cwd(), "tests", "eval-reports", `golden-set-raw-${ts2}.json`);
    try {
      const resExport = await getJSON("/metrics/golden-set");
      const dataExport = await resExport.json();
      if (dataExport.questions) {
        mkdirSync(path.dirname(rawPath), { recursive: true });
        writeFileSync(rawPath, JSON.stringify(dataExport.questions, null, 2), "utf-8");
        console.log(`\n✅ 原始 golden set 已保存（含 grading，调试用）: ${rawPath}`);
      }
    } catch (e) {
      console.warn(`\n⚠️ Golden set 导出失败: ${e}`);
    }

    // ── 测试：B Quality Check ──
    console.log("\n━━━ B Golden Set 质量评估（确定性检查，无 LLM 调用）━━━");
    const resQuality = await getJSON("/metrics/golden-set/quality");
    const dataQuality = await resQuality.json();
    console.log(`通过: ${dataQuality.passed ? "✅" : "❌"}`);
    console.log(`建议: ${dataQuality.recommendation}`);
    if (dataQuality.checks) {
      for (const [name, check] of Object.entries(dataQuality.checks)) {
        console.log(`  ${check.passed ? "✅" : "❌"} ${name}: ${check.detail}`);
      }
    }

    // 保存 B 质量报告到文件
    const qualityReportPath = path.join(process.cwd(), "tests", "eval-reports", `quality-report-${ts2}.json`);
    mkdirSync(path.dirname(qualityReportPath), { recursive: true });
    writeFileSync(qualityReportPath, JSON.stringify(dataQuality, null, 2), "utf-8");

    // ── C 阶段：清理不合格题目 ──
    console.log("\n━━━ C 清理不合格题目 ━━━");
    const resClean = await postJSON("/metrics/golden-set/clean", {});
    const dataClean = await resClean.json();
    console.log(`删除: ${dataClean.deleted?.length || 0} 题`);
    console.log(`保留: ${dataClean.kept || 0} 题`);
    if (dataClean.deleted?.length > 0) {
      console.log(`被删题目: ${dataClean.deleted.join(", ")}`);
    }

    // ── 保存清理后的 Golden Set JSON（clean 端点直接返回 questions）──
    const cleanPath = path.join(process.cwd(), "tests", "eval-reports", `golden-set-${ts2}.json`);
    if (dataClean.questions) {
      mkdirSync(path.dirname(cleanPath), { recursive: true });
      writeFileSync(cleanPath, JSON.stringify(dataClean.questions, null, 2), "utf-8");
      console.log(`\n✅ 清理后 golden set 已保存: ${cleanPath}`);
    }

    // 打印文件位置摘要
    console.log("\n━━━ 📁 生成文件位置 ━━━");
    console.log(`  原始 Golden Set: ${rawPath}`);
    console.log(`  清理 Golden Set: ${cleanPath}`);
    console.log(`  质量报告:        ${qualityReportPath}`);
    console.log(`  Golden Set DB:   ${dataQuality.goldenSetPath || "见服务器日志"}`);

  } finally {
    await cleanup();
    console.log("\n✅ 清理完成");
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

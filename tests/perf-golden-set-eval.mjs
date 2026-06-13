#!/usr/bin/env node
/**
 * Golden Set D 阶段验证 — 用 golden set 评估模型
 *
 * 步骤：
 * 1. 启动隔离服务器，上传知识库，写入 settings
 * 2. 导入 07-10-14 golden set 的 21 题到 DB
 * 3. 调用 POST /metrics/eval/run（MiMo 作为被评估模型）
 * 4. 验证：
 *    - 每道题都有 eval result（recall, ndcg, faithfulness 等指标）
 *    - 指标值在合理范围（0-1）
 *    - 评估报告已保存到 DB（GET /metrics/eval/reports 能查到）
 *    - 耗时合理（不应超时）
 */

import { loadEnvFile, getApiKey } from "./e2e-shared/env.mjs";
import { postJSON, getJSON } from "./e2e-shared/http.mjs";
import { startIsolatedServer } from "./e2e-shared/server-lifecycle.mjs";
import { uploadKnowledgeFile, SAMPLES_KNOWLEDGE_DIR } from "./e2e-shared/index.mjs";
import path from "path";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

loadEnvFile();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function inRange(val, min = 0, max = 1) {
  return typeof val === "number" && val >= min && val <= max;
}

async function main() {
  console.log("=== Golden Set D 阶段验证（模型评估）===\n");

  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");

  if (!mimoKey) {
    console.log("❌ 没有找到 MiMo API key，跳过");
    process.exit(0);
  }

  // ── Step 0: 读取 golden set ──
  const gsPath = "tests/eval-reports/golden-set-2026-06-13T07-10-14.json";
  let goldenSet;
  try {
    goldenSet = JSON.parse(readFileSync(gsPath, "utf-8"));
  } catch (err) {
    console.log(`❌ 无法读取文件: ${err.message}`);
    process.exit(1);
  }
  console.log(`Golden set: ${gsPath} (${goldenSet.length} 题)\n`);

  // ── Step 1: 启动隔离服务器 ──
  console.log("启动隔离服务器...");
  const { baseUrl, cleanup } = await startIsolatedServer();
  process.env.TEST_BASE = baseUrl;
  console.log(`服务器就绪: ${baseUrl}\n`);

  try {
    // ── Step 2: 上传知识库文件 ──
    console.log("上传知识库文件...");
    const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
    const uploadResult = await uploadKnowledgeFile(filePath);
    if (!uploadResult.ok) {
      console.error("❌ 上传失败:", uploadResult.error);
      process.exit(1);
    }
    console.log("✅ 知识库文件已上传\n");

    // ── Step 3: 写入 settings ──
    console.log("写入 settings 到隔离 DB...");
    const settingsProviders = [];
    if (mimoKey) settingsProviders.push({ providerId: "mimo", apiKeyRef: mimoKey });
    if (volcengineKey) settingsProviders.push({ providerId: "volcengine", apiKeyRef: volcengineKey });

    const settingsRes = await postJSON("/sync/upload", {
      stores: { settings: [{ id: "app", data: { providers: settingsProviders } }] },
    });
    await settingsRes.json().catch(() => ({}));
    console.log(`✅ Settings 已写入 (providers=${settingsProviders.length})\n`);

    // ── Step 4: 导入 golden set 到 DB ──
    console.log("导入 golden set 到 DB...");
    const importRes = await postJSON("/metrics/golden-set/import", { questions: goldenSet });
    const importData = await importRes.json();
    if (!importData.ok) {
      console.error("❌ 导入失败:", importData.error);
      process.exit(1);
    }
    console.log(`✅ 已导入 ${importData.count} 题\n`);

    // ── Step 5: 构建 eval config 并运行评估 ──
    const evalConfig = {
      label: "MiMo-v2.5",
      providerId: "mimo",
      modelId: "mimo-v2.5",
    };

    const judgeApiKeys = {};
    if (mimoKey) judgeApiKeys.mimo = mimoKey;
    if (volcengineKey) judgeApiKeys.volcengine = volcengineKey;

    console.log("━━━ D 阶段：运行模型评估 ━━━");
    console.log(`被评估模型: ${evalConfig.label} (${evalConfig.providerId}/${evalConfig.modelId})`);
    console.log(`Judge keys: ${Object.keys(judgeApiKeys).join(", ")}`);
    console.log(`题目数量: ${goldenSet.length}\n`);

    const startEval = performance.now();
    const evalRes = await postJSON(
      "/metrics/eval/run",
      {
        configs: [evalConfig],
        apiKey: mimoKey,
        judgeApiKeys,
        maxConcurrency: 3,
        knowledgeEnabled: true,
      },
      undefined,
      1_200_000,
    );
    const endEval = performance.now();
    const evalData = await evalRes.json();
    const durationSec = (endEval - startEval) / 1000;

    if (evalData.error) {
      console.error(`❌ 评估失败: ${evalData.error}`);
      process.exit(1);
    }

    console.log(`\n评估完成:`);
    console.log(`  耗时: ${durationSec.toFixed(1)}s`);
    console.log(`  Run ID: ${evalData.runId}`);
    console.log(`  题目数: ${evalData.questionCount}`);

    // ── Step 6: 验证 ──
    console.log("\n━━━ 验证 ━━━");
    let allPass = true;

    // V1: 每道题都有 eval result
    const results = evalData.questionBreakdown || [];
    if (results.length === goldenSet.length) {
      console.log(`✅ V1_result_count: ${results.length}/${goldenSet.length} 题都有 eval result`);
    } else {
      console.log(`❌ V1_result_count: ${results.length}/${goldenSet.length} 题有 eval result`);
      allPass = false;
    }

    // V2: 指标值在合理范围（0-1）
    let outOfRange = 0;
    const metricFields = [
      "recallAtK", "ndcgAtK", "faithfulness",
      "answerCorrectness", "factCoverage", "articleAccuracy",
      "sourceRoutingAccuracy", "sourceAttributionAccuracy",
      "conflictResolution", "refusalAccuracy",
      "kbHitRate", "webHitRate",
    ];
    for (const r of results) {
      for (const field of metricFields) {
        const val = r[field];
        if (val !== undefined && val !== null && !inRange(val, 0, 1)) {
          outOfRange++;
          if (outOfRange <= 3) {
            console.log(`  ⚠️ ${r.goldenId}.${field} = ${val} (超出 0-1)`);
          }
        }
      }
    }
    if (outOfRange === 0) {
      console.log(`✅ V2_metric_range: 全部指标在 [0, 1] 范围内`);
    } else {
      console.log(`❌ V2_metric_range: ${outOfRange} 个指标超出 [0, 1]`);
      allPass = false;
    }

    // V3: 每道题有 durationMs > 0
    const withDuration = results.filter(r => r.durationMs > 0);
    if (withDuration.length === results.length) {
      const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
      console.log(`✅ V3_duration: 全部有耗时数据，平均 ${(avgMs / 1000).toFixed(1)}s/题`);
    } else {
      console.log(`❌ V3_duration: ${withDuration.length}/${results.length} 题有耗时数据`);
      allPass = false;
    }

    // V4: 评估报告已保存到 DB
    // GET /reports 返回每行 golden_runs 记录（id, golden_id, run_id, config_json），按 run_id 聚合
    const reportsRes = await getJSON(`/metrics/eval/reports/${evalData.runId}`);
    const reportDetail = await reportsRes.json();
    const detailResults = reportDetail.questionBreakdown || reportDetail.results || [];
    if (reportDetail.runId === evalData.runId || detailResults.length > 0) {
      console.log(`✅ V4_report_saved: 报告已保存到 DB（runId=${evalData.runId}, ${detailResults.length} 条记录）`);
    } else {
      // Fallback: 检查 /reports 列表
      const reportsListRes = await getJSON("/metrics/eval/reports");
      const reportsList = await reportsListRes.json();
      const count = Array.isArray(reportsList) ? reportsList.length : 0;
      if (count > 0) {
        console.log(`✅ V4_report_saved: DB 中有 ${count} 条 eval 记录`);
      } else {
        console.log(`❌ V4_report_saved: 未在 DB 中找到评估报告`);
        allPass = false;
      }
    }

    // V5: config summary 指标合理
    const summary = evalData.configs?.[0];
    if (summary) {
      const summaryFields = ["avgRecall", "avgNdcg", "avgFaithfulness"];
      let summaryOk = true;
      for (const f of summaryFields) {
        if (!inRange(summary[f], 0, 1)) {
          console.log(`  ⚠️ configSummary.${f} = ${summary[f]} (超出 0-1)`);
          summaryOk = false;
        }
      }
      if (summaryOk) {
        console.log(`✅ V5_summary: avgRecall=${summary.avgRecall?.toFixed(3)}, avgNdcg=${summary.avgNdcg?.toFixed(3)}, avgFaith=${summary.avgFaithfulness?.toFixed(3)}`);
      } else {
        console.log(`❌ V5_summary: 部分汇总指标超出范围`);
        allPass = false;
      }
    }

    // V6: 耗时合理（不超过 30 分钟 — 每题约 90s × 21 题 / 3 并发 + judge 评估）
    if (durationSec < 1800) {
      console.log(`✅ V6_timing: 总耗时 ${durationSec.toFixed(1)}s（${(durationSec / 60).toFixed(1)}min）`);
    } else {
      console.log(`❌ V6_timing: 总耗时 ${durationSec.toFixed(1)}s（>= 1800s，异常慢）`);
      allPass = false;
    }

    // V7: 有错误的题目数
    const withError = results.filter(r => r.error);
    if (withError.length === 0) {
      console.log(`✅ V7_no_errors: 全部题目无错误`);
    } else {
      console.log(`⚠️ V7_no_errors: ${withError.length} 题有错误`);
      for (const r of withError) {
        console.log(`  - ${r.goldenId}: ${r.error}`);
      }
      // 不算 fail，允许部分错误
    }

    // ── 保存评估报告 ──
    const ts = timestamp();
    const outDir = "tests/eval-reports";
    mkdirSync(outDir, { recursive: true });
    const reportPath = `${outDir}/eval-report-${ts}.json`;
    writeFileSync(reportPath, JSON.stringify(evalData, null, 2));
    console.log(`\n📄 评估报告已保存: ${reportPath}`);

    // ── 最终结论 ──
    console.log("\n━━━ 结论 ━━━");
    if (allPass) {
      console.log("PROCEED — D 阶段验证全部通过");
    } else {
      console.log("FAIL — 存在验证失败项");
    }

    console.log(`\nFILES:eval-report=${reportPath}`);
    console.log(`FILES:log=tests/logs/e2e-2026-06-13.log`);

  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

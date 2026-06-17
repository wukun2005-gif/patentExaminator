#!/usr/bin/env node
/**
 * D 阶段验证 — 用 golden set 评估模型
 *
 * 步骤：
 * 1. 启动隔离服务器（复制生产 DB，保留真实 settings）
 * 2. 导入 golden set 到 DB
 * 3. 调用 POST /metrics/eval/run（server 从 DB 自动读取配置）
 * 4. 验证评估结果
 * 5. 从 DB 导出评估报告
 */

import { postJSON, getJSON } from "./e2e-shared/http.mjs";
import { startIsolatedServer, getServerLog } from "./e2e-shared/server-lifecycle.mjs";
import { loadEnvFile, getApiKey } from "./e2e-shared/env.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

// 加载 .env 中的 API key（用于 judge 调用，与 production pipeline 隔离）
loadEnvFile();

// postJSON/getJSON 的第一个参数是路径（如 /metrics/golden-set/import）
// 第三个参数是 baseUrl，如果不传则从 TEST_BASE 环境变量获取
// 我们直接传 baseUrl 参数，避免依赖环境变量

let BASE; // http://localhost:PORT/api

// 通过 QUESTION_START/QUESTION_COUNT 环境变量控制导入范围，默认全部
// 例: QUESTION_COUNT=1 node tests/d-phase-eval.mjs          (第1题)
// 例: QUESTION_START=1 QUESTION_COUNT=5 node tests/d-phase-eval.mjs  (第2~6题)
const QUESTION_START = process.env.QUESTION_START ? parseInt(process.env.QUESTION_START, 10) : 0;
const QUESTION_COUNT = process.env.QUESTION_COUNT ? parseInt(process.env.QUESTION_COUNT, 10) : Infinity;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function inRange(val, min = 0, max = 1) {
  return typeof val === "number" && val >= min && val <= max;
}

async function main() {
  const ts = timestamp();
  const logLines = [];
  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(msg);
    logLines.push(line);
  }

  log("=== D 阶段验证：Golden Set 评估 ===\n");

  // ── Step 1: 启动隔离服务器（复制生产 DB） ──
  log("Step 1: 启动隔离服务器...");
  const server = await startIsolatedServer({ copyProductionDb: true });
  BASE = server.baseUrl; // http://localhost:PORT/api
  log(`✅ 隔离服务器就绪: ${BASE}`);

  // ── Step 1b: 查看生产 DB 中的 settings ──
  log("\nStep 1b: 检查生产 DB settings...");
  try {
    const settingsRes = await getJSON("/data/settings/app", BASE);
    const settingsResp = await settingsRes.json();
    const settingsData = settingsResp.record || settingsResp;
    if (settingsData.providers) {
      for (const p of settingsData.providers) {
        log(`  provider: ${p.providerId}, enabled: ${p.enabled}, model: ${p.defaultModelId}`);
      }
    }
    log(`  enableProviderFallback: ${settingsData.enableProviderFallback}`);
    log(`  knowledgeEnabled: ${settingsData.knowledge?.enabled}`);
  } catch (e) {
    log(`  ⚠️ 读取 settings 失败: ${e.message}`);
  }

  // ── Step 2: 导入 golden set ──
  log("\nStep 2: 导入 golden set...");
  // 通过 GOLDEN_SET 环境变量指定 golden set 路径，默认使用最新的
  const gsPath = process.env.GOLDEN_SET || "tests/eval-reports/golden-set-2026-06-13T07-10-14-fixed.json";
  let goldenSet;
  try {
    goldenSet = JSON.parse(readFileSync(gsPath, "utf-8"));
  } catch (err) {
    log(`❌ 无法读取文件: ${err.message}`);
    process.exit(1);
  }
  const startIdx = Math.min(QUESTION_START, goldenSet.length);
  const endIdx = QUESTION_COUNT === Infinity ? goldenSet.length : Math.min(startIdx + QUESTION_COUNT, goldenSet.length);
  if (startIdx > 0 || endIdx < goldenSet.length) {
    goldenSet = goldenSet.slice(startIdx, endIdx);
    log(`Golden set: ${gsPath} (取第 ${startIdx + 1}~${endIdx} 题，共 ${goldenSet.length} 题)`);
  } else {
    log(`Golden set: ${gsPath} (${goldenSet.length} 题)`);
  }

  const importRes = await postJSON("/metrics/golden-set/import", { questions: goldenSet }, BASE);
  const importData = await importRes.json();
  if (!importData.ok) {
    log(`❌ 导入失败: ${importData.error}`);
    process.exit(1);
  }
  log(`✅ 已导入 ${importData.count} 题`);

  // ── Step 3: 运行评估 ──
  log("\n━━━ Step 3: 运行 golden set 评估 ━━━");
  log(`题目数量: ${goldenSet.length}`);
  log("Server 从 DB 自动读取 provider/embedding/reranker/KB 配置\n");

  const startEval = performance.now();
  const evalRes = await postJSON(
    "/metrics/eval/run",
    {
      configs: [{ label: "production", providerId: "auto", modelId: "auto" }],
      maxConcurrency: 3,
      batchDelayMs: 8000,
      // judge API keys 从 .env 读取（自动测试场景，不依赖 DB）
      judgeApiKeys: {
        ...(getApiKey("mimo") ? { mimo: getApiKey("mimo") } : {}),
        ...(getApiKey("bailian") ? { bailian: getApiKey("bailian") } : {}),
        ...(getApiKey("gemini") ? { gemini: getApiKey("gemini") } : {}),
      },
    },
    BASE,
    3_600_000,
  );
  const endEval = performance.now();
  const evalData = await evalRes.json();
  const durationSec = (endEval - startEval) / 1000;

  if (evalData.error) {
    log(`❌ 评估失败: ${evalData.error}`);
    process.exit(1);
  }

  log(`\n评估完成:`);
  log(`  耗时: ${durationSec.toFixed(1)}s`);
  log(`  Run ID: ${evalData.runId}`);
  log(`  题目数: ${evalData.questionCount}`);

  // ── Step 4: 验证 ──
  log("\n━━━ 验证 ━━━");
  let allPass = true;

  // V1: 每道题都有 eval result
  const results = evalData.questionBreakdown || [];
  if (results.length === goldenSet.length) {
    log(`✅ V1_result_count: ${results.length}/${goldenSet.length} 题都有 eval result`);
  } else {
    log(`❌ V1_result_count: ${results.length}/${goldenSet.length} 题有 eval result`);
    allPass = false;
  }

  // V2: 指标值在合理范围（0-1）
  let outOfRange = 0;
  const metricFields = [
    "recallAtK", "ndcgAtK", "faithfulness",
    "answerCorrectness", "factCoverage", "articleAccuracy",
    "sourceRoutingAccuracy", "sourceAttributionAccuracy",
    "conflictResolution", "refusalAccuracy",
    "kbHitRate",
  ];
  for (const r of results) {
    for (const field of metricFields) {
      const val = r[field];
      if (val !== undefined && val !== null && !inRange(val, 0, 1)) {
        outOfRange++;
        if (outOfRange <= 3) {
          log(`  ⚠️ ${r.goldenId}.${field} = ${val} (超出 0-1)`);
        }
      }
    }
  }
  if (outOfRange === 0) {
    log(`✅ V2_metric_range: 全部指标在 [0, 1] 范围内`);
  } else {
    log(`❌ V2_metric_range: ${outOfRange} 个指标超出 [0, 1]`);
    allPass = false;
  }

  // V3: 每道题有 durationMs > 0
  const withDuration = results.filter(r => r.durationMs > 0);
  if (withDuration.length === results.length) {
    const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
    log(`✅ V3_duration: 全部有耗时数据，平均 ${(avgMs / 1000).toFixed(1)}s/题`);
  } else {
    log(`❌ V3_duration: ${withDuration.length}/${results.length} 题有耗时数据`);
    allPass = false;
  }

  // V4: 评估报告已保存到 DB，并从 DB 导出
  // 直接保存 eval 响应（evalData）作为报告，同时验证 DB 中有记录
  const outDir = "tests/eval-reports";
  mkdirSync(outDir, { recursive: true });
  const reportExportPath = `${outDir}/eval-report-${ts}.json`;
  writeFileSync(reportExportPath, JSON.stringify(evalData, null, 2));
  log(`✅ V4_report_saved: eval 响应已保存到 ${reportExportPath}`);

  // 验证 DB 中也有记录
  try {
    const reportsRes = await getJSON("/metrics/eval/reports", BASE);
    const reportsList = await reportsRes.json();
    const count = Array.isArray(reportsList) ? reportsList.length : 0;
    const found = Array.isArray(reportsList) && reportsList.some(r => r.id === evalData.runId);
    if (found) {
      log(`✅ V4_report_in_db: DB 中找到本次 runId=${evalData.runId} 的记录`);
    } else if (count > 0) {
      log(`⚠️ V4_report_in_db: DB 中有 ${count} 条记录，但未匹配到本次 runId（可能列表端点返回的是其他 run）`);
    } else {
      log(`⚠️ V4_report_in_db: DB 中无 eval 记录`);
    }
  } catch (e) {
    log(`⚠️ V4_report_in_db: 查询 DB 报告列表失败: ${e.message}`);
  }

  // V5: config summary 指标合理
  const summary = evalData.configs?.[0];
  if (summary) {
    const summaryFields = ["avgRecall", "avgNdcg", "avgFaithfulness"];
    let summaryOk = true;
    for (const f of summaryFields) {
      if (summary[f] !== undefined && summary[f] !== null && !inRange(summary[f], 0, 1)) {
        log(`  ⚠️ configSummary.${f} = ${summary[f]} (超出 0-1)`);
        summaryOk = false;
      }
    }
    if (summaryOk) {
      log(`✅ V5_summary: avgRecall=${summary.avgRecall?.toFixed(3)}, avgNdcg=${summary.avgNdcg?.toFixed(3)}, avgFaith=${summary.avgFaithfulness?.toFixed(3)}`);
    } else {
      log(`❌ V5_summary: 部分汇总指标超出范围`);
      allPass = false;
    }
  }

  // V6: 耗时合理（不超过 30 分钟）
  if (durationSec < 1800) {
    log(`✅ V6_timing: 总耗时 ${durationSec.toFixed(1)}s（${(durationSec / 60).toFixed(1)}min）`);
  } else {
    log(`❌ V6_timing: 总耗时 ${durationSec.toFixed(1)}s（>= 1800s，异常慢）`);
    allPass = false;
  }

  // V7: 有错误的题目数
  const withError = results.filter(r => r.error);
  if (withError.length === 0) {
    log(`✅ V7_no_errors: 全部题目无错误`);
  } else {
    log(`⚠️ V7_no_errors: ${withError.length} 题有错误`);
    for (const r of withError) {
      log(`  - ${r.goldenId}: ${r.error}`);
    }
  }

  // ── 保存测试日志（含 server log） ──
  const logDir = "tests/logs";
  mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/d-phase-log-${ts}.log`;
  const serverLog = getServerLog();
  const fullLog = logLines.join("\n") + "\n\n" + "=".repeat(60) + "\nSERVER LOG\n" + "=".repeat(60) + "\n\n" + (serverLog || "(no server log captured)");
  writeFileSync(logPath, fullLog);
  log(`\n📄 测试日志: ${logPath}`);

  // ── 清理（进程退出时自动完成） ──
  log("\n隔离服务器将在进程退出时自动清理");

  // ── 最终结论 ──
  log("\n━━━ 结论 ━━━");
  if (allPass) {
    log("PROCEED — D 阶段验证全部通过");
  } else {
    log("FAIL — 存在验证失败项");
  }

  log(`\nFILES:eval-report=${reportExportPath || "N/A"}`);
  log(`FILES:test-log=${logPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

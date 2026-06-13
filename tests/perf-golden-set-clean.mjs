#!/usr/bin/env node
/**
 * Golden Set C 阶段验证 — 清理不合格题目
 *
 * 步骤：
 * 1. 启动隔离服务器，上传知识库，写入 settings
 * 2. 导入 05-38-53 golden set 的 21 题到 DB
 * 3. 调用 POST /metrics/golden-set/clean
 * 4. 验证：
 *    - 被删除的题目是 B7/B8 不合格的那 2 题
 *    - DB 中剩余 19 题
 *    - 再跑一次 GET /metrics/golden-set/quality，全部检查通过
 *    - 响应中的 questions 字段有 19 题，保存为 golden set JSON
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

// 从 quality report 中提取 B7/B8 不合格的题目 ID
function getFailingIds(qualityReport) {
  const ids = new Set();
  for (const key of ["B7_grading_distribution", "B8_min_grade", "B9_judge_consistency"]) {
    const check = qualityReport.checks?.[key];
    if (check && !check.passed && check.questions) {
      for (const id of check.questions) ids.add(id);
    }
  }
  // 也检查硬删除的检查项
  for (const key of ["B3_query_quality", "B4_answer_quality", "B5_facts_quality", "B10_no_duplicates"]) {
    const check = qualityReport.checks?.[key];
    if (check && !check.passed && check.questions) {
      for (const id of check.questions) ids.add(id);
    }
  }
  return ids;
}

async function main() {
  console.log("=== Golden Set C 阶段验证（清理不合格题目）===\n");

  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");

  if (!mimoKey && !volcengineKey) {
    console.log("❌ 没有找到任何 API key，跳过");
    process.exit(0);
  }

  // ── Step 0: 读取 05-38-53 golden set 和 quality report ──
  const gsPath = "tests/eval-reports/golden-set-2026-06-13T05-38-53.json";
  const qrPath = "tests/eval-reports/quality-report-2026-06-13T05-38-53.json";

  let goldenSet, qualityReport;
  try {
    goldenSet = JSON.parse(readFileSync(gsPath, "utf-8"));
    qualityReport = JSON.parse(readFileSync(qrPath, "utf-8"));
  } catch (err) {
    console.log(`❌ 无法读取文件: ${err.message}`);
    process.exit(1);
  }

  console.log(`Golden set: ${gsPath} (${goldenSet.length} 题)`);
  console.log(`Quality report: ${qrPath}`);

  const expectedFailingIds = getFailingIds(qualityReport);
  console.log(`预期不合格题目 (${expectedFailingIds.size} 题): ${[...expectedFailingIds].join(", ")}\n`);

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

    // ── Step 4: 导入 21 题到 DB ──
    console.log("导入 golden set 到 DB...");
    const importRes = await postJSON("/metrics/golden-set/import", { questions: goldenSet });
    const importData = await importRes.json();
    if (!importData.ok) {
      console.error("❌ 导入失败:", importData.error);
      process.exit(1);
    }
    console.log(`✅ 已导入 ${importData.count} 题\n`);

    // ── Step 5: 调用 clean ──
    console.log("━━━ C 阶段：清理不合格题目 ━━━");
    const cleanRes = await postJSON("/metrics/golden-set/clean", {});
    const cleanData = await cleanRes.json();

    console.log(`\n清理结果:`);
    console.log(`  删除: ${cleanData.deleted?.length || 0} 题`);
    console.log(`  保留: ${cleanData.kept || 0} 题`);

    if (cleanData.deleted?.length > 0) {
      console.log(`  删除的 ID: ${cleanData.deleted.join(", ")}`);
    }

    // ── Step 6: 验证删除的题目是否正确 ──
    console.log("\n━━━ 验证 ━━━");
    let allPass = true;

    // 检查 1: 删除的题目是否是预期的不合格题目
    const deletedSet = new Set(cleanData.deleted || []);
    if (deletedSet.size === expectedFailingIds.size) {
      let match = true;
      for (const id of deletedSet) {
        if (!expectedFailingIds.has(id)) {
          match = false;
          break;
        }
      }
      if (match) {
        console.log(`✅ V1_deleted_correct: 删除的 ${deletedSet.size} 题与 B7/B8 不合格题目完全匹配`);
      } else {
        console.log(`❌ V1_deleted_correct: 删除的题目不匹配`);
        console.log(`   预期: ${[...expectedFailingIds].join(", ")}`);
        console.log(`   实际: ${[...deletedSet].join(", ")}`);
        allPass = false;
      }
    } else {
      console.log(`❌ V1_deleted_correct: 预期删除 ${expectedFailingIds.size} 题，实际删除 ${deletedSet.size} 题`);
      console.log(`   预期: ${[...expectedFailingIds].join(", ")}`);
      console.log(`   实际: ${[...deletedSet].join(", ")}`);
      allPass = false;
    }

    // 检查 2: 保留 19 题
    const expectedKept = goldenSet.length - expectedFailingIds.size;
    if (cleanData.kept === expectedKept) {
      console.log(`✅ V2_kept_count: 保留 ${cleanData.kept} 题（预期 ${expectedKept}）`);
    } else {
      console.log(`❌ V2_kept_count: 保留 ${cleanData.kept} 题，预期 ${expectedKept}`);
      allPass = false;
    }

    // 检查 3: questions 字段有正确数量
    const questionsCount = cleanData.questions?.length || 0;
    if (questionsCount === expectedKept) {
      console.log(`✅ V3_questions_field: questions 字段有 ${questionsCount} 题`);
    } else {
      console.log(`❌ V3_questions_field: questions 字段有 ${questionsCount} 题，预期 ${expectedKept}`);
      allPass = false;
    }

    // 检查 4: 再跑一次 quality check，全部通过
    console.log("\n重新运行质量检查...");
    const qualityRes = await getJSON("/metrics/golden-set/quality");
    const qualityData = await qualityRes.json();

    const totalAfter = qualityData.totalQuestions || 0;
    if (totalAfter === expectedKept) {
      console.log(`✅ V4_quality_total: 质量检查显示 ${totalAfter} 题`);
    } else {
      console.log(`❌ V4_quality_total: 质量检查显示 ${totalAfter} 题，预期 ${expectedKept}`);
      allPass = false;
    }

    // 检查所有 B 项是否通过
    const checks = qualityData.checks || {};
    let checksPassed = 0;
    let checksFailed = 0;
    for (const [key, check] of Object.entries(checks)) {
      if (check.passed) {
        checksPassed++;
      } else {
        checksFailed++;
        console.log(`  ❌ ${key}: FAIL`);
        if (check.questions?.length) {
          console.log(`     问题题目: ${check.questions.join(", ")}`);
        }
      }
    }

    if (checksFailed === 0) {
      console.log(`✅ V5_quality_all_pass: 全部 ${checksPassed} 项检查通过`);
    } else {
      console.log(`❌ V5_quality_all_pass: ${checksFailed} 项检查失败`);
      allPass = false;
    }

    // ── 保存清理后的 golden set ──
    if (cleanData.questions?.length > 0) {
      const ts = timestamp();
      const outDir = "tests/eval-reports";
      mkdirSync(outDir, { recursive: true });
      const outPath = `${outDir}/golden-set-cleaned-${ts}.json`;
      writeFileSync(outPath, JSON.stringify(cleanData.questions, null, 2));
      console.log(`\n📄 清理后的 golden set 已保存: ${outPath}`);
    }

    // ── 最终结论 ──
    console.log("\n━━━ 结论 ━━━");
    if (allPass) {
      console.log("PROCEED — C 阶段验证全部通过");
    } else {
      console.log("FAIL — 存在验证失败项");
    }

    // 输出文件路径（供调用者解析）
    const ts = timestamp();
    const logPath = `tests/logs/c-phase-${ts}.log`;
    mkdirSync("tests/logs", { recursive: true });

    console.log(`\nFILES:golden-set=tests/eval-reports/golden-set-cleaned-${ts}.json`);
    console.log(`FILES:log=${logPath}`);

  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * nf5 E2E 证据生成脚本
 * =====================
 *
 * 独立运行，不依赖 E2E 测试框架，避免 withTimeout 干扰长运行评估。
 *
 * 生成三类证据：
 * 1. golden-set-<ts>.json     — 自动测试生成的 golden set
 * 2. golden-quality-<ts>.json — golden set 生成质量 evaluation report
 * 3. eval-report-<ts>.json    — 模型组合 evaluation report
 *
 * 所有结果持久化到 tests/eval-reports/ 目录。
 *
 * Usage: node tests/nf5-evidence.mjs
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { loadEnvFile, getApiKey } from "./e2e-shared/env.mjs";
import { postJSON, getJSON } from "./e2e-shared/http.mjs";
import { startIsolatedServer } from "./e2e-shared/server-lifecycle.mjs";
import { uploadKnowledgeFile, SAMPLES_KNOWLEDGE_DIR } from "./e2e-shared/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL_REPORTS_DIR = path.join(__dirname, "eval-reports");

// ── Helpers ──────────────────────────────────────────────────────────

function ensureReportsDir() {
  fs.mkdirSync(EVAL_REPORTS_DIR, { recursive: true });
}

function saveJsonFile(filename, data) {
  ensureReportsDir();
  const filePath = path.join(EVAL_REPORTS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[Evidence] Saved: ${filePath}`);
  return filePath;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function safeJson(res, label) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  loadEnvFile();

  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   nf5 E2E Evidence Generation                 ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");
  const serpApiKey = getApiKey("serp");

  const availableProviders = [];
  if (mimoKey) availableProviders.push("MiMo");
  if (volcengineKey) availableProviders.push("DeepSeek", "doubao-seed");

  console.log(`Available providers: ${availableProviders.join(", ") || "none"}`);

  if (availableProviders.length === 0) {
    console.log("❌ No API keys found. Set MiMo_KEY / volc-key in .env");
    process.exit(0);
  }

  // 1. Start isolated server
  console.log("\n━━━ Step 0: Starting isolated server ━━━");
  const { baseUrl, cleanup } = await startIsolatedServer();
  process.env.TEST_BASE = baseUrl;
  console.log(`Server ready: ${baseUrl}\n`);

  const evidenceFiles = [];
  const startTime = performance.now();

  try {
    // ── Step 1: Upload knowledge ──
    console.log("━━━ Step 1: Upload knowledge base ━━━");
    const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
    const uploadResult = await uploadKnowledgeFile(filePath);
    if (!uploadResult.ok) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }
    console.log("✅ Knowledge uploaded\n");

    // ── Step 2: Generate golden set ──
    console.log("━━━ Step 2: Generate golden set ━━━");
    const providerConfigs = [];
    if (mimoKey) providerConfigs.push({ providerId: "mimo", model: "mimo-v2.5", apiKey: mimoKey, label: "MiMo" });
    if (volcengineKey) {
      providerConfigs.push({ providerId: "volcengine", model: "deepseek-v4-flash-260425", apiKey: volcengineKey, label: "DeepSeek (火山)" });
      providerConfigs.push({ providerId: "volcengine", model: "doubao-seed-2-0-pro-260215", apiKey: volcengineKey, label: "doubao-seed (火山)" });
    }

    console.log(`Providers: ${providerConfigs.map(p => p.label).join(", ")}`);
    console.log(`Questions per provider: 2`);

    const genStart = performance.now();
    // spec §11: 传递 SerpAPI key 用于 web 题型生成
    const genRes = await postJSON("/metrics/golden-set/generate", {
      providerConfigs,
      questionsPerProvider: 2,
      ...(serpApiKey && { searchApiKey: serpApiKey }),
    }, undefined, 300_000);
    const genData = await safeJson(genRes, "Generate golden set");
    const genDuration = performance.now() - genStart;

    if (genData.count === 0) {
      throw new Error("Golden set generation returned 0 questions");
    }

    console.log(`✅ Generated ${genData.count} questions in ${(genDuration / 1000).toFixed(1)}s`);
    console.log(`   Providers: ${[...new Set(genData.questions.map(q => q.generatedBy))].join(", ")}`);
    console.log(`   Categories: ${[...new Set(genData.questions.map(q => q.category))].join(", ")}`);

    // Persist golden set
    const ts = timestamp();
    const gsFile = saveJsonFile(`golden-set-${ts}.json`, {
      timestamp: new Date().toISOString(),
      providerConfigs: providerConfigs.map(p => ({ providerId: p.providerId, model: p.model, label: p.label })),
      questionsPerProvider: 2,
      totalQuestions: genData.count,
      durationMs: Math.round(genDuration),
      questions: genData.questions,
    });
    evidenceFiles.push(gsFile);
    console.log();

    // ── Step 3: Quality evaluation ──
    console.log("━━━ Step 3: Golden set quality evaluation ━━━");
    const questions = genData.questions;

    // 3a. Structure completeness
    const requiredFields = ["id", "query", "expectedAnswer", "category", "difficulty", "generatedBy"];
    const nf5Fields = ["sourceType", "expectedSource", "mustIncludeFacts"];
    const structureResults = questions.map(q => {
      const missingRequired = requiredFields.filter(f => !q[f] || (typeof q[f] === "string" && q[f].trim() === ""));
      const missingNf5 = nf5Fields.filter(f => !q[f] || (Array.isArray(q[f]) && q[f].length === 0));
      return { id: q.id, requiredMissing: missingRequired, nf5Missing: missingNf5, complete: missingRequired.length === 0 };
    });
    const structureScore = structureResults.filter(r => r.complete).length / structureResults.length;

    // 3b. Content quality
    const contentResults = questions.map(q => ({
      id: q.id,
      answerLength: (q.expectedAnswer || "").length,
      answerValid: (q.expectedAnswer || "").length >= 50,
      factsCount: (q.mustIncludeFacts || []).length,
      factsValid: (q.mustIncludeFacts || []).length >= 2,
      articlesCount: (q.expectedArticles || []).length,
      hasSourceRouting: !!(q.sourceRoutingRationale || q.source_routing_rationale),
    }));
    const contentScore = contentResults.filter(r => r.answerValid && r.factsValid).length / contentResults.length;

    // 3c. Category diversity
    const categories = {};
    for (const q of questions) categories[q.category] = (categories[q.category] || 0) + 1;
    const categoryCount = Object.keys(categories).length;
    const categoryDiversityScore = Math.min(categoryCount / 3, 1);

    // 3d. Provider diversity
    const providers = {};
    for (const q of questions) providers[q.generatedBy] = (providers[q.generatedBy] || 0) + 1;
    const providerCount = Object.keys(providers).length;
    const providerDiversityScore = Math.min(providerCount / 2, 1);

    // 3e. Source type distribution
    const sourceTypes = {};
    for (const q of questions) {
      const st = q.sourceType || q.source_type || "unknown";
      sourceTypes[st] = (sourceTypes[st] || 0) + 1;
    }

    // 3f. Relevance grading
    const gradingResults = questions.map(q => ({
      id: q.id,
      gradingCount: (q.relevanceGrading || q.relevance_grading || []).length,
      hasGrading: (q.relevanceGrading || q.relevance_grading || []).length > 0,
    }));
    const gradingScore = gradingResults.filter(r => r.hasGrading).length / gradingResults.length;

    const overallScore = (
      structureScore * 0.25 +
      contentScore * 0.25 +
      categoryDiversityScore * 0.15 +
      providerDiversityScore * 0.10 +
      gradingScore * 0.25
    );

    const qualityReport = {
      timestamp: new Date().toISOString(),
      totalQuestions: questions.length,
      overallScore: Math.round(overallScore * 100) / 100,
      dimensions: {
        structure: { score: Math.round(structureScore * 100) / 100, weight: 0.25, details: structureResults },
        content: { score: Math.round(contentScore * 100) / 100, weight: 0.25, details: contentResults },
        categoryDiversity: { score: Math.round(categoryDiversityScore * 100) / 100, weight: 0.15, distribution: categories, uniqueCount: categoryCount },
        providerDiversity: { score: Math.round(providerDiversityScore * 100) / 100, weight: 0.10, distribution: providers, uniqueCount: providerCount },
        sourceTypeDistribution: sourceTypes,
        relevanceGrading: { score: Math.round(gradingScore * 100) / 100, weight: 0.25, details: gradingResults },
      },
    };

    const qualityFile = saveJsonFile(`golden-quality-${ts}.json`, qualityReport);
    evidenceFiles.push(qualityFile);

    console.log(`✅ Quality report generated`);
    console.log(`   Overall score: ${qualityReport.overallScore}`);
    console.log(`   Structure: ${structureScore === 1 ? "PASS" : "PARTIAL"} (${Math.round(structureScore * 100)}%)`);
    console.log(`   Content: ${contentScore === 1 ? "PASS" : "PARTIAL"} (${Math.round(contentScore * 100)}%)`);
    console.log(`   Categories: ${categoryCount} (${Object.keys(categories).join(", ")})`);
    console.log(`   Providers: ${providerCount} (${Object.keys(providers).join(", ")})`);
    console.log(`   Grading: ${gradingScore > 0 ? "PRESENT" : "MISSING"} (${Math.round(gradingScore * 100)}%)`);
    console.log();

    // ── Step 4: Model combination evaluation ──
    console.log("━━━ Step 4: Model combination evaluation ━━━");
    const evalConfigs = [];
    if (mimoKey) evalConfigs.push({ label: "MiMo-v2.5", providerId: "mimo", modelId: "mimo-v2.5" });
    else if (volcengineKey) evalConfigs.push({ label: "DeepSeek-v4-pro", providerId: "volcengine", modelId: "deepseek-v4-flash-260425" });

    const evalApiKey = mimoKey || volcengineKey;
    // 只评估 chat agent（最快，每个问题 ~2 分钟）
    const chatQuestions = questions.filter(q => q.agent === "chat");
    const evalAgent = chatQuestions.length > 0 ? "chat" : undefined;

    console.log(`Config: ${evalConfigs[0].label}`);
    console.log(`Agent filter: ${evalAgent || "all"} (${chatQuestions.length || questions.length} questions)`);
    console.log(`⚠️  Each question takes ~1-2 minutes (RAG + groundedness + multi-judge)`);
    console.log(`   Estimated time: ${((chatQuestions.length || questions.length) * 2).toFixed(0)} minutes\n`);

    const evalStart = performance.now();
    const evalRes = await postJSON("/metrics/eval/run", {
      configs: evalConfigs,
      apiKey: evalApiKey,
      ...(evalAgent && { agentFilter: evalAgent }),
    }, undefined, 900_000); // 15 分钟超时
    const evalData = await safeJson(evalRes, "Evaluation");
    const evalDuration = performance.now() - evalStart;

    console.log(`\n✅ Evaluation complete in ${(evalDuration / 1000).toFixed(1)}s`);
    console.log(`   Run ID: ${evalData.runId}`);
    console.log(`   Questions: ${evalData.questionCount}`);

    for (const cfg of (evalData.configs || [])) {
      console.log(`\n   Config: ${cfg.label}`);
      console.log(`   ├─ Recall@K:           ${cfg.avgRecall?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ NDCG@K:             ${cfg.avgNdcg?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Faithfulness:       ${cfg.avgFaithfulness?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Answer Correctness: ${cfg.avgAnswerCorrectness?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Fact Coverage:      ${cfg.avgFactCoverage?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Article Accuracy:   ${cfg.avgArticleAccuracy?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Routing Accuracy:   ${cfg.avgSourceRoutingAccuracy?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ KB Hit Rate:        ${cfg.avgKbHitRate?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Web Hit Rate:       ${cfg.avgWebHitRate?.toFixed(3) || "N/A"}`);
      console.log(`   ├─ Pass Rate:          ${(cfg.passRate * 100).toFixed(1)}%`);
      console.log(`   └─ Avg Duration:       ${cfg.avgDurationMs?.toFixed(0)}ms`);
    }

    // Persist eval report
    const evalFile = saveJsonFile(`eval-report-${ts}.json`, {
      ...evalData,
      _meta: {
        generatedAt: new Date().toISOString(),
        totalDurationMs: Math.round(evalDuration),
        configCount: evalConfigs.length,
        questionCount: evalData.questionCount,
        agentFilter: evalAgent || "all",
      },
    });
    evidenceFiles.push(evalFile);
    console.log();

    // ── Step 5: Cleanup ──
    console.log("━━━ Step 5: Cleanup ━━━");
    const delRes = await fetch(`${baseUrl}/metrics/golden-set`, { method: "DELETE" });
    const delData = await safeJson(delRes, "Cleanup");
    console.log(`✅ Golden set cleared: ${JSON.stringify(delData)}\n`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
  } finally {
    await cleanup();
  }

  // ── Summary ──
  const totalDuration = performance.now() - startTime;
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   Evidence Generation Summary                 ║");
  console.log("╠═══════════════════════════════════════════════╣");
  console.log(`║  Total time:  ${(totalDuration / 1000).toFixed(1)}s`.padEnd(47) + "║");
  console.log(`║  Files generated: ${evidenceFiles.length}`.padEnd(47) + "║");
  for (const f of evidenceFiles) {
    const name = path.basename(f);
    console.log(`║  📄 ${name}`.padEnd(47) + "║");
  }
  console.log("╚═══════════════════════════════════════════════╝");

  if (evidenceFiles.length >= 3) {
    console.log("\n✅ All 3 evidence files generated successfully.");
    console.log(`   Location: ${EVAL_REPORTS_DIR}/`);
  } else {
    console.log(`\n⚠️  Only ${evidenceFiles.length}/3 evidence files generated.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

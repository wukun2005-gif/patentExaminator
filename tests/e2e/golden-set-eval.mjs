/**
 * Golden Set E2E 证据生成测试
 * =============================
 *
 * 生成 nf5 所需的三类证据：
 * 1. Golden Set 自动测试生成
 * 2. Golden Set 生成质量 Evaluation Report
 * 3. 模型组合 Evaluation Report（用 golden set 对 LLM+Search+Embedding+Reranker 组合评测）
 *
 * 所有结果持久化到 tests/eval-reports/ 目录。
 *
 * 需要 API Key：MiMo_KEY / GEMINI_KEY / volc-key（从 .env 加载）
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  postJSON,
  getJSON,
  log,
  uploadKnowledgeFile,
  getApiKey,
  getTestBase,
  SAMPLES_KNOWLEDGE_DIR,
} from "../e2e-shared/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL_REPORTS_DIR = path.join(__dirname, "..", "eval-reports");
const TIMEOUT_MS = 2_700_000; // 45 分钟（21 题 × multi-judge grading + web 搜索，每题 20-90s × 3 judges）

// ── Helpers ───────────────────────────────────────────────────────────

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
  if (!res.ok && res.status >= 500) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Step 1: Upload Knowledge ──────────────────────────────────────────

export async function testGoldenEvalUploadKnowledge() {
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
  const result = await uploadKnowledgeFile(filePath);
  log("GoldenEval: Upload knowledge", result.ok, result.ok ? "专利法_2020修正.txt" : result.error);
}

// ── Step 1.5: Write Settings to Isolated DB (BUG-3 fix) ──────────────
// Judge fallback 配置从 DB settings 读取，隔离 DB 为空需要先写入

export async function testGoldenEvalWriteSettings() {
  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");
  const serpApiKey = getApiKey("serp");

  const providers = [];
  if (mimoKey) providers.push({ providerId: "mimo", apiKeyRef: mimoKey });
  if (volcengineKey) providers.push({ providerId: "volcengine", apiKeyRef: volcengineKey });
  // Gemini API 因超时频繁失败已暂停，替换为火山 doubao-seed（与 DeepSeek 共用 volcengine key）

  // spec §11: 写入 SerpAPI search provider（MCP Web Search 路径需要）
  const searchProviders = [];
  if (serpApiKey) {
    searchProviders.push({ providerId: "serpapi", enabled: true, apiKeyRef: serpApiKey });
  }

  if (providers.length === 0 && searchProviders.length === 0) {
    log("GoldenEval: Write settings", true, "skipped (no API keys)");
    return;
  }

  const res = await postJSON("/sync/upload", {
    stores: {
      settings: [
        { id: "app", data: { providers, searchProviders } },
      ],
    },
  });
  const data = await res.json().catch(() => ({}));
  log("GoldenEval: Write settings to isolated DB", data.ok === true,
    `providers=${providers.map(p => p.providerId).join(",")}, searchProviders=${searchProviders.map(p => p.providerId).join(",")}, fallbacks=${providers.filter(p => p.modelFallbacks).length}`);
}

// ── Step 2: Generate Golden Set ───────────────────────────────────────

export async function testGoldenEvalGenerate() {
  const mimoKey = getApiKey("mimo");
  const volcengineKey = getApiKey("volcengine");

  if (!mimoKey && !volcengineKey) {
    log("GoldenEval: Generate", true, "skipped (no API keys)");
    return null;
  }

  const providerConfigs = [];
  if (mimoKey) providerConfigs.push({ providerId: "mimo", model: "mimo-v2.5", apiKey: mimoKey, label: "MiMo" });
  if (volcengineKey) providerConfigs.push({ providerId: "volcengine", model: "deepseek-v4-flash-260425", apiKey: volcengineKey, label: "DeepSeek (火山)" });
  if (volcengineKey) providerConfigs.push({ providerId: "volcengine", model: "doubao-seed-2-0-pro-260215", apiKey: volcengineKey, label: "doubao-seed (火山)" });

  // Multi-judge keys: mimo + volcengine（DeepSeek + doubao-seed 共用 key，替换 Gemini）
  const judgeApiKeys = {};
  if (mimoKey) judgeApiKeys.mimo = mimoKey;
  if (volcengineKey) judgeApiKeys.volcengine = volcengineKey;

  // spec §11: 使用 SerpAPI key（与 MCP Web Search 路径一致）
  const searchApiKey = getApiKey("serp");

  console.log(`[GoldenEval] Providers: ${providerConfigs.map(p => p.label).join(", ")}`);
  console.log(`[GoldenEval] Questions per provider: 7 (matrix allocation)`);
  console.log(`[GoldenEval] Search API key: ${searchApiKey ? "✓" : "✗ (web types will be skipped)"}`);
  console.log(`[GoldenEval] Judge providers: ${Object.keys(judgeApiKeys).join(", ")} (${Object.keys(judgeApiKeys).length} judges)`);

  const startTime = performance.now();
  const res = await postJSON("/metrics/golden-set/generate", {
    providerConfigs,
    ...(searchApiKey && { searchApiKey }),
    ...(Object.keys(judgeApiKeys).length > 0 && { judgeApiKeys }),
  }, undefined, TIMEOUT_MS);
  const data = await safeJson(res, "GoldenEval Generate");
  const durationMs = performance.now() - startTime;

  const hasQuestions = data.count > 0 && Array.isArray(data.questions) && data.questions.length > 0;
  log("GoldenEval: Generate", hasQuestions,
    hasQuestions ? `count=${data.count}, duration=${(durationMs / 1000).toFixed(1)}s` : JSON.stringify(data));

  if (!hasQuestions) return null;

  // ── Spec compliance checks ──
  // 1. Multi-provider: 至少 2 个 provider 生成了题目
  const generatedBySet = new Set(data.questions.map(q => q.generatedBy));
  log("GoldenEval: Multi-provider generation", generatedBySet.size >= 2,
    `providers=[${[...generatedBySet].join(", ")}], count=${generatedBySet.size} (spec: ≥2)`);

  // 2. Multi-judge: relevanceGrading 非空（3 个 judge 打分了）
  const questionsWithGrading = data.questions.filter(q => (q.relevanceGrading || []).length > 0);
  const gradingRatio = questionsWithGrading.length / data.questions.length;
  log("GoldenEval: Multi-judge relevance grading", gradingRatio > 0,
    `${questionsWithGrading.length}/${data.questions.length} questions have grading (${(gradingRatio * 100).toFixed(0)}%)`);

  // 3. SourceType 分布：至少 3 种 sourceType
  const sourceTypeSet = new Set(data.questions.map(q => q.sourceType));
  log("GoldenEval: SourceType diversity", sourceTypeSet.size >= 3,
    `types=[${[...sourceTypeSet].join(", ")}], count=${sourceTypeSet.size} (spec: ≥3)`);

  if (!hasQuestions) return null;

  // 持久化 golden set
  const ts = timestamp();
  const goldenSetFile = saveJsonFile(`golden-set-${ts}.json`, {
    timestamp: new Date().toISOString(),
    providerConfigs: providerConfigs.map(p => ({ providerId: p.providerId, model: p.model, label: p.label })),
    totalQuestions: data.count,
    durationMs: Math.round(durationMs),
    questions: data.questions,
  });

  log("GoldenEval: Golden set persisted", true, goldenSetFile);
  return data;
}

// ── Step 3: Golden Set Quality Evaluation ─────────────────────────────

export async function testGoldenEvalQuality() {
  // 读取已生成的 golden set
  const res = await getJSON("/metrics/golden-set");
  const data = await safeJson(res, "GoldenEval Quality");

  if (data.count === 0) {
    log("GoldenEval: Quality report", true, "skipped (no golden set)");
    return;
  }

  const questions = data.questions;
  const ts = timestamp();

  // ── 质量检查维度 ──

  // 1. 结构完整性
  const requiredFields = ["id", "query", "expectedAnswer", "category", "difficulty", "generatedBy"];
  const nf5Fields = ["sourceType", "expectedSource", "mustIncludeFacts"];
  const structureResults = questions.map(q => {
    const missingRequired = requiredFields.filter(f => !q[f] || (typeof q[f] === "string" && q[f].trim() === ""));
    const missingNf5 = nf5Fields.filter(f => !q[f] || (Array.isArray(q[f]) && q[f].length === 0));
    return {
      id: q.id,
      requiredMissing: missingRequired,
      nf5Missing: missingNf5,
      complete: missingRequired.length === 0,
    };
  });
  const structureScore = structureResults.filter(r => r.complete).length / structureResults.length;

  // 2. 内容质量
  const contentResults = questions.map(q => {
    const answerLen = (q.expectedAnswer || "").length;
    const factsCount = (q.mustIncludeFacts || []).length;
    const articlesCount = (q.expectedArticles || []).length;
    return {
      id: q.id,
      answerLength: answerLen,
      answerValid: answerLen >= 50,
      factsCount,
      factsValid: factsCount >= 2,
      articlesCount,
      hasSourceRouting: !!(q.sourceRoutingRationale || q.source_routing_rationale),
    };
  });
  const contentScore = contentResults.filter(r => r.answerValid && r.factsValid).length / contentResults.length;

  // 3. Category 多样性
  const categories = {};
  for (const q of questions) {
    categories[q.category] = (categories[q.category] || 0) + 1;
  }
  const categoryCount = Object.keys(categories).length;
  const categoryDiversityScore = Math.min(categoryCount / 3, 1); // 至少 3 类为满分

  // 4. Provider 多样性
  const providers = {};
  for (const q of questions) {
    providers[q.generatedBy] = (providers[q.generatedBy] || 0) + 1;
  }
  const providerCount = Object.keys(providers).length;
  const providerDiversityScore = Math.min(providerCount / 2, 1); // 至少 2 provider 为满分

  // 5. Source Type 分布
  const sourceTypes = {};
  for (const q of questions) {
    const st = q.sourceType || q.source_type || "unknown";
    sourceTypes[st] = (sourceTypes[st] || 0) + 1;
  }

  // 6. Relevance Grading 完整性
  const gradingResults = questions.map(q => {
    const grading = q.relevanceGrading || q.relevance_grading || [];
    return {
      id: q.id,
      gradingCount: grading.length,
      hasGrading: grading.length > 0,
    };
  });
  const gradingScore = gradingResults.filter(r => r.hasGrading).length / gradingResults.length;

  // 综合分数
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
      structure: {
        score: Math.round(structureScore * 100) / 100,
        weight: 0.25,
        details: structureResults,
      },
      content: {
        score: Math.round(contentScore * 100) / 100,
        weight: 0.25,
        details: contentResults,
      },
      categoryDiversity: {
        score: Math.round(categoryDiversityScore * 100) / 100,
        weight: 0.15,
        distribution: categories,
        uniqueCount: categoryCount,
      },
      providerDiversity: {
        score: Math.round(providerDiversityScore * 100) / 100,
        weight: 0.10,
        distribution: providers,
        uniqueCount: providerCount,
      },
      sourceTypeDistribution: sourceTypes,
      relevanceGrading: {
        score: Math.round(gradingScore * 100) / 100,
        weight: 0.25,
        details: gradingResults,
      },
    },
  };

  const reportFile = saveJsonFile(`golden-quality-${ts}.json`, qualityReport);

  // 断言（spec compliance）
  log("GoldenEval: Quality overall score", overallScore >= 0.5,
    `score=${qualityReport.overallScore} (threshold: 0.5)`);
  log("GoldenEval: Structure completeness", structureScore >= 0.8,
    `${Math.round(structureScore * 100)}% questions have all required fields`);
  log("GoldenEval: Content quality", contentScore >= 0.5,
    `${Math.round(contentScore * 100)}% questions have valid answers & facts`);
  log("GoldenEval: Category diversity", categoryCount >= 2,
    `${categoryCount} categories: ${JSON.stringify(categories)} (spec: ≥2)`);
  log("GoldenEval: Provider diversity (multi-provider)", providerCount >= 2,
    `${providerCount} providers: ${JSON.stringify(providers)} (spec: ≥2)`);
  log("GoldenEval: Multi-judge relevance grading", gradingScore > 0,
    `${Math.round(gradingScore * 100)}% questions have relevanceGrading (spec: >0%)`);
  log("GoldenEval: Quality report persisted", true, reportFile);
}

// ── Step 4: Model Combination Evaluation ──────────────────────────────

export async function testGoldenEvalModelCombination() {
  const mimoKey = getApiKey("mimo");
  const geminiKey = getApiKey("gemini");
  const volcengineKey = getApiKey("volcengine");

  // 检查是否有 golden set
  const gsRes = await getJSON("/metrics/golden-set");
  const gsData = await safeJson(gsRes, "GoldenEval ModelCombination check");
  if (gsData.count === 0) {
    log("GoldenEval: Model combination eval", true, "skipped (no golden set)");
    return;
  }

  // 构建 eval configs — 使用主 LLM 作为 eval config（每个 question 需要 20-90s，太多 configs 会超时）
  const configs = [];
  if (mimoKey) configs.push({ label: "MiMo-v2.5", providerId: "mimo", modelId: "mimo-v2.5" });
  else if (volcengineKey) configs.push({ label: "DeepSeek-v4-flash", providerId: "volcengine", modelId: "deepseek-v4-flash-260425" });

  if (configs.length === 0) {
    log("GoldenEval: Model combination eval", true, "skipped (no API keys)");
    return;
  }

  // 使用第一个可用 key 作为主 LLM key
  const apiKey = mimoKey || volcengineKey;

  // Multi-judge keys: mimo + volcengine（DeepSeek + doubao-seed 共用 key，替换 Gemini）
  const judgeApiKeys = {};
  if (mimoKey) judgeApiKeys.mimo = mimoKey;
  if (volcengineKey) judgeApiKeys.volcengine = volcengineKey;

  console.log(`[GoldenEval] Running evaluation with ${configs.length} configs against ${gsData.count} questions`);
  console.log(`[GoldenEval] Configs: ${configs.map(c => c.label).join(", ")}`);
  console.log(`[GoldenEval] Judge providers: ${Object.keys(judgeApiKeys).join(", ")} (${Object.keys(judgeApiKeys).length} judges)`);

  const startTime = performance.now();
  // 每个 question 需要 20-90s（含 RAG + groundedness + multi-judge），maxConcurrency=3 并行
  const EVAL_API_TIMEOUT = 2_700_000; // 45 分钟
  const res = await postJSON("/metrics/eval/run", {
    configs,
    apiKey,
    maxConcurrency: 3,
    ...(Object.keys(judgeApiKeys).length > 0 && { judgeApiKeys }),
  }, undefined, EVAL_API_TIMEOUT);
  const report = await safeJson(res, "GoldenEval ModelCombination");
  const durationMs = performance.now() - startTime;

  const hasResults = report.questionCount > 0 && Array.isArray(report.questionBreakdown) && report.questionBreakdown.length > 0;
  log("GoldenEval: Model combination eval", hasResults,
    hasResults
      ? `runId=${report.runId}, questions=${report.questionCount}, configs=${report.configs?.length}, duration=${(durationMs / 1000).toFixed(1)}s`
      : JSON.stringify(report).slice(0, 200));

  if (!hasResults) return;

  // 打印 per-config 摘要
  for (const cfg of (report.configs || [])) {
    console.log(`[GoldenEval] Config "${cfg.label}":`);
    console.log(`  recall=${cfg.avgRecall?.toFixed(3)}, ndcg=${cfg.avgNdcg?.toFixed(3)}, faithfulness=${cfg.avgFaithfulness?.toFixed(3)}`);
    console.log(`  answerCorrectness=${cfg.avgAnswerCorrectness?.toFixed(3)}, factCoverage=${cfg.avgFactCoverage?.toFixed(3)}`);
    console.log(`  articleAccuracy=${cfg.avgArticleAccuracy?.toFixed(3)}, routingAccuracy=${cfg.avgSourceRoutingAccuracy?.toFixed(3)}`);
    console.log(`  kbHitRate=${cfg.avgKbHitRate?.toFixed(3)}, webHitRate=${cfg.avgWebHitRate?.toFixed(3)}`);
    console.log(`  passRate=${(cfg.passRate * 100).toFixed(1)}%, avgDuration=${cfg.avgDurationMs?.toFixed(0)}ms`);
  }

  // 持久化 evaluation report
  const ts = timestamp();
  const reportFile = saveJsonFile(`eval-report-${ts}.json`, {
    ...report,
    _meta: {
      generatedAt: new Date().toISOString(),
      totalDurationMs: Math.round(durationMs),
      configCount: configs.length,
      questionCount: report.questionCount,
    },
  });

  log("GoldenEval: Eval report persisted", true, reportFile);

  // 基本断言
  log("GoldenEval: Report has runId", !!report.runId, `runId=${report.runId}`);
  log("GoldenEval: Report has configs", (report.configs?.length || 0) > 0, `count=${report.configs?.length}`);
  log("GoldenEval: Question breakdown present", report.questionBreakdown?.length > 0, `count=${report.questionBreakdown?.length}`);

  // Spec compliance 断言（multi-judge metrics）
  for (const cfg of (report.configs || [])) {
    const hasRecall = cfg.avgRecall > 0;
    const hasNdcg = cfg.avgNdcg > 0;
    const hasFaithfulness = cfg.avgFaithfulness > 0;
    const hasFactCoverage = cfg.avgFactCoverage > 0;
    log(`GoldenEval: [${cfg.label}] recall > 0 (multi-judge grading)`, hasRecall, `avgRecall=${cfg.avgRecall?.toFixed(3)}`);
    log(`GoldenEval: [${cfg.label}] ndcg > 0 (multi-judge grading)`, hasNdcg, `avgNdcg=${cfg.avgNdcg?.toFixed(3)}`);
    log(`GoldenEval: [${cfg.label}] faithfulness > 0 (multi-judge)`, hasFaithfulness, `avgFaithfulness=${cfg.avgFaithfulness?.toFixed(3)}`);
    log(`GoldenEval: [${cfg.label}] factCoverage > 0 (multi-judge)`, hasFactCoverage, `avgFactCoverage=${cfg.avgFactCoverage?.toFixed(3)}`);
  }
}

// ── Step 5: Cleanup ───────────────────────────────────────────────────

export async function testGoldenEvalCleanup() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/golden-set`, { method: "DELETE" });
  const data = await safeJson(res, "GoldenEval Cleanup");
  log("GoldenEval: Cleanup", data.ok === true, JSON.stringify(data));
}

/**
 * E2E Functional Test Suite for Patent Examiner
 * ==============================================
 *
 * 测试分类指南（AI 开发者必读）：
 * 根据 git diff 变更文件选择对应测试，不要盲目全跑。
 *
 * 【基础连通性测试】任何非 UI 改动都必须跑
 * ├── testHealthCheck              - GET /api/health
 * └── testMockModeEnabled          - Mock 模式默认开启
 *
 * 【Claim Chart 测试】修改 claims/claim-chart Agent/claimChartSchema 时运行
 * ├── testMockClaimChart_G1        - G1 LED 散热 → 特征拆解 + Schema
 * ├── testMockClaimChart_G3        - G3 零对比文件 → 正常生成 + 待检索清单
 * └── testSchemaClaimChart         - Schema 校验
 *
 * 【Novelty 测试】修改 novelty/新颖性对照相关时运行
 * ├── testMockNovelty_G1           - G1 → 公开状态 + Citation
 * └── testSchemaNovelty            - Schema 校验
 *
 * 【Inventive 测试】修改 inventive/创造性三步法相关时运行
 * ├── testMockInventive_G2         - G2 锂电池 → 三步法结构
 * ├── testMockInventive_G3_NoRef   - G3 无对比文件 → 跳过创造
 * └── testSchemaInventive          - Schema 校验
 *
 * 【Interpret 测试】修改 interpret/文档解读相关时运行
 * └── testMockInterpret_G1         - G1 → 解读输出非空
 *
 * 【复审 Agent 测试】修改 opinion-analysis/argument-analysis/reexam-draft 时运行
 * ├── testMockOpinionAnalysis_G1   - G1 → 驳回理由解析
 * ├── testMockArgumentAnalysis_G1  - G1 → 答辩映射
 * ├── testMockReexamDraft_G1       - G1 → 复审意见草稿
 * └── testFullPipelineMock_Reexam_G1 - G1: 审查意见→答辩→复审草稿
 *
 * 【Search References 测试】修改 search/文献检索相关时运行
 * ├── testMockSearchReferences_G1  - G1 → 候选文献列表
 * └── testSchemaSearchReferences   - Schema 校验
 *
 * 【Search API 真实测试】修改搜索 Provider/webSearch 时运行（需 GEMINI_KEY + TAVILY_API_KEY）
 * ├── testRealSearchVerifyTavilyKey - Tavily Key 有效性
 * ├── testRealSearchVerifySerpKey   - SerpAPI Key 有效性
 * ├── testRealSearchReferences_G1   - 真实搜索流程
 * └── testRealSearchRateLimit       - 搜索频率限制验证
 *
 * 【Export 测试】修改 export/导出相关时运行
 * └── testMockExportHtml_G1        - G1 → HTML 结构 + legalCaution
 *
 * 【错误处理测试】修改 API Gateway/路由/错误处理时运行
 * ├── testInvalidAgent             - 非法 agent → 400
 * ├── testMissingRequiredFields    - 缺少必要字段 → 400
 * └── testEmptyClaimText           - 空权利要求 → 合理提示
 *
 * 【全量 Mock 回归】修改共享类型/Schema/核心基础设施时运行
 * → --only mock（运行所有 Mock 模式测试，秒级完成）
 *
 * 【Real 模式测试】修改 Provider/Gateway/Fallback 时运行（需 GEMINI_KEY）
 * ├── testRealProviderConnectivity - Gemini API 连通性
 * ├── testRealClaimChart_G1        - G1 Claim Chart 真实 AI 生成
 * ├── testRealNovelty_G1           - G1 新颖性对照真实 AI
 * ├── testRealInventive_G2         - G2 三步法真实 AI
 * ├── testRealFallbackMechanism    - 429 → fallback 切换
 * └── testRealTokenUsageReturned   - usage 字段验证
 *
 * 【完整流程测试】修改流程编排/AgentClient 时运行
 * ├── testFullPipelineMock_G1      - G1: 案件→Chart→Novelty→Export
 * └── testFullPipelineMock_G2      - G2: 案件→Chart→Inventive→Export
 *
 * 【UI 改动】跳过 E2E 自动测试，人类手工验证
 *
 * Usage:
 *   # 全量 Mock（默认，推荐日常开发）
 *   node tests/e2e-real.mjs
 *
 *   # 根据变更选择（开发时）
 *   node tests/e2e-real.mjs --only mock        # 所有 Mock 测试
 *   node tests/e2e-real.mjs --only claimChart  # claim chart 相关
 *   node tests/e2e-real.mjs --only schema      # Schema 校验
 *   node tests/e2e-real.mjs --only real        # Real 模式（需 Key）
 *   node tests/e2e-real.mjs --only realSearch  # 搜索 API（需 Key）
 *   node tests/e2e-real.mjs --only pipeline    # 全流程测试
 *
 *   # Real 模式
 *   GEMINI_KEY=xxx node tests/e2e-real.mjs --real
 *   GEMINI_KEY=xxx node tests/e2e-real.mjs --only realClaimChart
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Environment Loading ──────────────────────────────────────────────

function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

// ── Configuration ────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE || "http://localhost:3000/api";
const GEMINI_KEY = process.env.GEMINI_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const SERP_API_KEY = process.env.SerpAPI_KEY;
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || "gemini-3.1-flash-lite-preview";
const AI_RATE_LIMIT_DELAY = Number(process.env.GEMINI_RATE_LIMIT_DELAY) || 8000;
const SEARCH_RATE_LIMIT_DELAY = Number(process.env.SEARCH_RATE_LIMIT_DELAY) || 15000;

const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_MODEL_FALLBACKS || "")
  .split(",").map(s => s.trim()).filter(Boolean).length > 0
  ? process.env.GEMINI_MODEL_FALLBACKS.split(",").map(s => s.trim())
  : [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
    ];

const BANNED_MODEL_PATTERNS = [
  /\bimage\b/i, /\bimagen\b/i, /\bnano\s*banana\b/i, /\baudio\b/i,
  /\bspeech\b/i, /\btts\b/i, /\bembedding\b/i, /\bembed\b/i,
  /\bveo\b/i, /\bvideo\b/i, /\blyria\b/i, /\bmusic\b/i,
  /\bdeep[- ]?research\b/i, /\brobotics\b/i, /\bcomputer[- ]?use\b/i,
];

const RESULTS = [];
let currentModelIndex = 0;

// ── Test Utilities ───────────────────────────────────────────────────

function log(test, pass, detail = "") {
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${test}${detail ? " - " + detail : ""}`);
  if (!pass) {
    const stack = new Error().stack?.split("\n").slice(2, 5).map(l => l.trim()).join(" <- ");
    console.log(`       at: ${stack}`);
  }
  RESULTS.push({ test, pass, detail });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function maskKey(key) {
  return key ? `...${key.slice(-4)}` : "(empty)";
}

// ── HTTP Utilities ───────────────────────────────────────────────────

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

// ── Model Fallback ───────────────────────────────────────────────────

function getFallbackModel() {
  if (currentModelIndex >= GEMINI_FALLBACK_MODELS.length) {
    throw new Error("All Gemini fallback models exhausted");
  }
  const model = GEMINI_FALLBACK_MODELS[currentModelIndex];
  console.log(`  [Fallback] ${model} (${currentModelIndex + 1}/${GEMINI_FALLBACK_MODELS.length})`);
  return model;
}

function isRetryableErrorText(text = "") {
  const lower = String(text).toLowerCase();
  return lower.includes("配额不足")
    || lower.includes("resource_exhausted")
    || lower.includes("429")
    || lower.includes("503")
    || lower.includes("unavailable")
    || lower.includes("high demand")
    || lower.includes("rate limit")
    || lower.includes("quota");
}

function isAuthError(status) {
  return status === 401 || status === 403;
}

// ── Schema Validation Helpers ────────────────────────────────────────

function validateCitation(obj) {
  return typeof obj?.label === "string"
    && ["high", "medium", "low"].includes(obj?.confidence);
}

function validateClaimChartOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.claimNumber !== "number" || data.claimNumber < 1) errors.push("claimNumber must be positive int");
  if (!Array.isArray(data.features) || data.features.length < 1) errors.push("features must be non-empty array");
  else {
    for (const f of data.features) {
      if (!/^[A-Z]{1,2}$/.test(f.featureCode)) errors.push(`invalid featureCode: ${f.featureCode}`);
      if (typeof f.description !== "string" || f.description.length < 1) errors.push(`missing description for ${f.featureCode}`);
      if (!["confirmed", "needs-review", "not-found"].includes(f.citationStatus)) errors.push(`invalid citationStatus for ${f.featureCode}`);
      if (!Array.isArray(f.specificationCitations)) errors.push(`specificationCitations not array for ${f.featureCode}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateNoveltyOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.referenceId !== "string") errors.push("missing referenceId");
  if (typeof data.claimNumber !== "number" || data.claimNumber < 1) errors.push("claimNumber must be positive int");
  if (!Array.isArray(data.rows) || data.rows.length < 1) errors.push("rows must be non-empty array");
  else {
    for (const r of data.rows) {
      if (!["clearly-disclosed", "possibly-disclosed", "not-found", "not-applicable"].includes(r.disclosureStatus)) {
        errors.push(`invalid disclosureStatus for ${r.featureCode}: ${r.disclosureStatus}`);
      }
    }
  }
  if (!Array.isArray(data.differenceFeatureCodes)) errors.push("differenceFeatureCodes must be array");
  return { valid: errors.length === 0, errors };
}

function validateInventiveOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.claimNumber !== "number" || data.claimNumber < 1) errors.push("claimNumber must be positive int");
  if (!Array.isArray(data.sharedFeatureCodes)) errors.push("sharedFeatureCodes must be array");
  if (!Array.isArray(data.distinguishingFeatureCodes)) errors.push("distinguishingFeatureCodes must be array");
  const validAssessments = ["possibly-lacks-inventiveness", "possibly-inventive", "insufficient-evidence", "not-analyzed"];
  if (!validAssessments.includes(data.candidateAssessment)) errors.push(`invalid candidateAssessment: ${data.candidateAssessment}`);
  return { valid: errors.length === 0, errors };
}

function validateSearchReferencesOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.candidates)) errors.push("candidates must be array");
  else {
    for (const c of data.candidates) {
      if (typeof c.title !== "string") errors.push("candidate missing title");
      if (typeof c.publicationNumber !== "string") errors.push("candidate missing publicationNumber");
      if (typeof c.relevanceScore !== "number") errors.push("candidate missing relevanceScore");
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateOpinionAnalysisOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.rejectionGrounds)) errors.push("rejectionGrounds must be array");
  else {
    for (const g of data.rejectionGrounds) {
      if (typeof g.code !== "string") errors.push("ground missing code");
      if (!["novelty", "inventive", "clarity", "support", "amendment", "other"].includes(g.category)) {
        errors.push(`invalid category: ${g.category}`);
      }
      if (!Array.isArray(g.claimNumbers)) errors.push("claimNumbers must be array");
      if (typeof g.legalBasis !== "string") errors.push("ground missing legalBasis");
    }
  }
  if (!Array.isArray(data.citedReferences)) errors.push("citedReferences must be array");
  return { valid: errors.length === 0, errors };
}

function validateArgumentMappingOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.mappings)) errors.push("mappings must be array");
  else {
    for (const m of data.mappings) {
      if (typeof m.rejectionGroundCode !== "string") errors.push("mapping missing code");
      if (!["high", "medium", "low"].includes(m.confidence)) errors.push(`invalid confidence: ${m.confidence}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateReexamDraftOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.claimNumber !== "number") errors.push("missing claimNumber");
  if (!Array.isArray(data.responseItems)) errors.push("responseItems must be array");
  else {
    const validConclusions = ["argument-accepted", "argument-partially-accepted", "argument-rejected", "needs-further-review"];
    for (const item of data.responseItems) {
      if (!validConclusions.includes(item.conclusion)) errors.push(`invalid conclusion: ${item.conclusion}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateSummaryOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.body !== "string" || data.body.length === 0) errors.push("missing or empty body");
  if (typeof data.legalCaution !== "string") errors.push("missing legalCaution");
  return { valid: errors.length === 0, errors };
}

// ── Mock Request Builder ─────────────────────────────────────────────

function mockRequest(agent, caseId, moduleScope = "claim-chart", extra = {}) {
  const metadata = { caseId, moduleScope, tokenEstimate: 0 };
  // For novelty, build the mock key "caseId:referenceId"
  if (agent === "novelty" && extra.referenceId) {
    metadata.mockKey = `${caseId}:${extra.referenceId}`;
    delete extra.referenceId;
  }
  return {
    agent,
    providerPreference: ["gemini"],
    modelId: "mock",
    prompt: `[Mock E2E test] ${agent} for case ${caseId}`,
    sanitized: false,
    mock: true,
    metadata,
    ...extra,
  };
}

// ── Test: Health Check ───────────────────────────────────────────────

async function testHealthCheck() {
  const res = await getJSON("/health");
  const data = await res.json();
  log("GET /api/health returns 200", res.status === 200, `status=${res.status}`);
  log("GET /api/health has status:ok", data.status === "ok", JSON.stringify(data));
}

// ── Test: Mock Mode ──────────────────────────────────────────────────

async function testMockModeEnabled() {
  const res = await postJSON("/ai/run", mockRequest("claim-chart", "g1-led"));
  const data = await res.json();
  log("Mock /ai/run returns 200", res.status === 200, `status=${res.status}`);
  log("Mock /ai/run returns ok:true", data.ok === true, `ok=${data.ok}`);
}

// ── Mock: Claim Chart ────────────────────────────────────────────────

async function testMockClaimChart_G1() {
  const res = await postJSON("/ai/run", mockRequest("claim-chart", "g1-led"));
  const data = await res.json();
  log("Mock ClaimChart G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ClaimChart G1 has outputJson", data.outputJson != null);

  const result = validateClaimChartOutput(data.outputJson);
  log("Mock ClaimChart G1 schema valid", result.valid, result.errors.join("; "));

  const features = data.outputJson?.features;
  log("Mock ClaimChart G1 has features", Array.isArray(features) && features.length >= 2,
    `count=${features?.length}`);
  const codes = features?.map(f => f.featureCode) || [];
  log("Mock ClaimChart G1 has features A,B", codes.includes("A") && codes.includes("B"),
    `codes=${codes.join(",")}`);
}

async function testMockClaimChart_G3() {
  const res = await postJSON("/ai/run", mockRequest("claim-chart", "g3-sensor"));
  const data = await res.json();
  log("Mock ClaimChart G3 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ClaimChart G3 has outputJson", data.outputJson != null);

  const result = validateClaimChartOutput(data.outputJson);
  log("Mock ClaimChart G3 schema valid", result.valid, result.errors.join("; "));

  const questions = data.outputJson?.pendingSearchQuestions;
  log("Mock ClaimChart G3 has pendingSearchQuestions",
    Array.isArray(questions), `count=${questions?.length || 0}`);
}

// ── Mock: Novelty ────────────────────────────────────────────────────

async function testMockNovelty_G1() {
  const res = await postJSON("/ai/run", mockRequest("novelty", "g1-led", "novelty",
    { expectedSchemaName: "novelty", referenceId: "g1-ref-d1" }));
  const data = await res.json();
  log("Mock Novelty G1 ok", data.ok === true, `ok=${data.ok}`);

  const result = validateNoveltyOutput(data.outputJson);
  log("Mock Novelty G1 schema valid", result.valid, result.errors.join("; "));

  const rows = data.outputJson?.rows || [];
  const statuses = rows.map(r => `${r.featureCode}:${r.disclosureStatus}`);
  log("Mock Novelty G1 has rows", rows.length >= 2, `statuses=${statuses.join(",")}`);

  const diffCodes = data.outputJson?.differenceFeatureCodes || [];
  log("Mock Novelty G1 has differenceFeatureCodes", Array.isArray(diffCodes),
    `diff=${diffCodes.join(",")}`);
}

// ── Mock: Inventive ──────────────────────────────────────────────────

async function testMockInventive_G2() {
  const res = await postJSON("/ai/run", mockRequest("inventive", "g2-battery", "inventive"));
  const data = await res.json();
  log("Mock Inventive G2 ok", data.ok === true, `ok=${data.ok}`);

  const result = validateInventiveOutput(data.outputJson);
  log("Mock Inventive G2 schema valid", result.valid, result.errors.join("; "));

  const o = data.outputJson || {};
  log("Mock Inventive G2 has closestPriorArtId", typeof o.closestPriorArtId === "string",
    `id=${o.closestPriorArtId}`);
  log("Mock Inventive G2 has sharedFeatureCodes", Array.isArray(o.sharedFeatureCodes),
    `shared=${o.sharedFeatureCodes?.join(",")}`);
  log("Mock Inventive G2 has distinguishingFeatureCodes", Array.isArray(o.distinguishingFeatureCodes),
    `dist=${o.distinguishingFeatureCodes?.join(",")}`);
  log("Mock Inventive G2 has candidateAssessment", typeof o.candidateAssessment === "string",
    `assessment=${o.candidateAssessment}`);
}

async function testMockInventive_G3_NoRef() {
  const res = await postJSON("/ai/run", mockRequest("inventive", "g3-sensor", "inventive"));
  const data = await res.json();
  log("Mock Inventive G3 (no ref) ok", data.ok === true, `ok=${data.ok}`);
  const result = validateInventiveOutput(data.outputJson);
  log("Mock Inventive G3 schema valid", result.valid, result.errors.join("; "));
}

// ── Mock: Interpret ──────────────────────────────────────────────────

async function testMockInterpret_G1() {
  const res = await postJSON("/ai/run", mockRequest("interpret", "g1-led", "case"));
  const data = await res.json();
  log("Mock Interpret G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock Interpret G1 has outputJson", data.outputJson != null);

  const response = data.outputJson?.response;
  log("Mock Interpret G1 has response text", typeof response === "string" && response.length > 50,
    `length=${response?.length || 0}`);
}

// ── Mock: Reexamination Agents ───────────────────────────────────────

async function testMockOpinionAnalysis_G1() {
  const res = await postJSON("/ai/run", mockRequest("opinion-analysis", "g1-led", "opinion-analysis"));
  const data = await res.json();
  log("Mock OpinionAnalysis G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock OpinionAnalysis G1 has outputJson", data.outputJson != null);

  const result = validateOpinionAnalysisOutput(data.outputJson);
  log("Mock OpinionAnalysis G1 schema valid", result.valid, result.errors.join("; "));

  const grounds = data.outputJson?.rejectionGrounds;
  log("Mock OpinionAnalysis G1 has rejectionGrounds",
    Array.isArray(grounds) && grounds.length >= 1, `count=${grounds?.length}`);
}

async function testMockArgumentAnalysis_G1() {
  const res = await postJSON("/ai/run", mockRequest("argument-analysis", "g1-led", "argument-mapping"));
  const data = await res.json();
  log("Mock ArgumentAnalysis G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ArgumentAnalysis G1 has outputJson", data.outputJson != null);

  const result = validateArgumentMappingOutput(data.outputJson);
  log("Mock ArgumentAnalysis G1 schema valid", result.valid, result.errors.join("; "));

  const mappings = data.outputJson?.mappings;
  log("Mock ArgumentAnalysis G1 has mappings",
    Array.isArray(mappings) && mappings.length >= 1, `count=${mappings?.length}`);
}

async function testMockReexamDraft_G1() {
  const res = await postJSON("/ai/run", mockRequest("reexam-draft", "g1-led", "draft"));
  const data = await res.json();
  log("Mock ReexamDraft G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ReexamDraft G1 has outputJson", data.outputJson != null);

  const result = validateReexamDraftOutput(data.outputJson);
  log("Mock ReexamDraft G1 schema valid", result.valid, result.errors.join("; "));

  const items = data.outputJson?.responseItems;
  log("Mock ReexamDraft G1 has responseItems",
    Array.isArray(items) && items.length >= 1, `count=${items?.length}`);
}

async function testMockSummary_G1() {
  const res = await postJSON("/ai/run", mockRequest("summary", "g1-led", "summary"));
  const data = await res.json();
  log("Mock Summary G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock Summary G1 has outputJson", data.outputJson != null);

  const result = validateSummaryOutput(data.outputJson);
  log("Mock Summary G1 schema valid", result.valid, result.errors.join("; "));

  const body = data.outputJson?.body;
  log("Mock Summary G1 body non-empty", typeof body === "string" && body.length > 0);

  const aiNotes = data.outputJson?.aiNotes;
  log("Mock Summary G1 has aiNotes", typeof aiNotes === "string");
}

function validateTranslateOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.translatedText !== "string" || data.translatedText.length === 0) errors.push("missing or empty translatedText");
  return { valid: errors.length === 0, errors };
}

async function testMockTranslate_G1() {
  const res = await postJSON("/ai/run", mockRequest("translate", "g1-led", "translate"));
  const data = await res.json();
  log("Mock Translate G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock Translate G1 has outputJson", data.outputJson != null);

  const result = validateTranslateOutput(data.outputJson);
  log("Mock Translate G1 schema valid", result.valid, result.errors.join("; "));

  const translatedText = data.outputJson?.translatedText;
  log("Mock Translate G1 translatedText non-empty", typeof translatedText === "string" && translatedText.length > 0);
}

// ── Figure Extraction ────────────────────────────────────────────────

function testFigureCaptionExtraction() {
  const sampleText = `
附图说明
图1 是本发明实施例的结构示意图。
图2 是散热翅片间距示意图。
图3 是散热基板的俯视图。
`;

  const patterns = [/图\s*(\d+)\s*(?:是|为|示出了|表示|示出)?\s*(.{0,80})/g];
  const results = [];
  const seen = new Set();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(sampleText)) !== null) {
      const num = parseInt(match[1], 10);
      if (!seen.has(num) && num > 0 && num <= 200) {
        seen.add(num);
        results.push({ number: num, caption: (match[2] || "").trim() });
      }
    }
  }

  results.sort((a, b) => a.number - b.number);

  log("Figure caption extraction count", results.length === 3, `count=${results.length}`);
  log("Figure caption extraction Fig1", results[0]?.number === 1, `fig1=${results[0]?.number}`);
  log("Figure caption extraction Fig2", results[1]?.number === 2, `fig2=${results[1]?.number}`);
  log("Figure caption extraction Fig3", results[2]?.number === 3, `fig3=${results[2]?.number}`);
}

function testFigureSectionDetection() {
  const headers = ["附图说明", "说明书附图", "附图", "BRIEF DESCRIPTION OF THE DRAWINGS"];

  log("Figure section '附图说明'", headers.some(h => "附图说明".includes(h)));
  log("Figure section '说明书附图'", headers.some(h => "说明书附图".includes(h)));
  log("Figure section 'BRIEF DESCRIPTION'", headers.some(h => "BRIEF DESCRIPTION OF THE DRAWINGS".toLowerCase().includes(h.toLowerCase())));
}

function testLikelyFigurePage() {
  const emptyPage = "";
  const shortPage = "图1";
  const textPage = "本发明涉及一种LED散热装置，包括散热基板和散热翅片。散热基板通过压铸一体成型，散热翅片与散热基板一体成型，且散热翅片的间距为2-5mm。";

  const MIN_TEXT = 50;

  const isFigure1 = emptyPage.trim().length < MIN_TEXT;
  const isFigure2 = shortPage.trim().length < MIN_TEXT;
  const isFigure3 = textPage.trim().length < MIN_TEXT;

  log("Likely figure page (empty)", isFigure1);
  log("Likely figure page (short)", isFigure2);
  log("Likely figure page (text)", !isFigure3);
}

// ── Import Gate ──────────────────────────────────────────────────────

function testImportGateIncomplete() {
  const REQUIRED = ["reexam-request", "rejection-decision", "original-application"];

  const files = [
    { id: "1", fileType: "reexam-request", required: true },
  ];

  const hasAllRequired = REQUIRED.every((type) => files.some((f) => f.fileType === type));
  log("Import gate incomplete (missing files)", !hasAllRequired);

  const missing = REQUIRED.filter((type) => !files.some((f) => f.fileType === type));
  log("Import gate missing count", missing.length === 2, `missing=${missing.length}`);
  log("Import gate missing rejection-decision", missing.includes("rejection-decision"));
  log("Import gate missing original-application", missing.includes("original-application"));
}

function testImportGateReady() {
  const REQUIRED = ["reexam-request", "rejection-decision", "original-application"];

  const files = [
    { id: "1", fileType: "reexam-request", required: true },
    { id: "2", fileType: "rejection-decision", required: true },
    { id: "3", fileType: "original-application", required: true },
  ];

  const hasAllRequired = REQUIRED.every((type) => files.some((f) => f.fileType === type));
  log("Import gate ready (all required)", hasAllRequired);

  const hasOptional = files.some((f) => f.fileType === "comparison-document");
  log("Import gate warning (no optional)", !hasOptional);
}

function testImportGateWithOptional() {
  const REQUIRED = ["reexam-request", "rejection-decision", "original-application"];

  const files = [
    { id: "1", fileType: "reexam-request", required: true },
    { id: "2", fileType: "rejection-decision", required: true },
    { id: "3", fileType: "original-application", required: true },
    { id: "4", fileType: "comparison-document", required: false },
  ];

  const hasAllRequired = REQUIRED.every((type) => files.some((f) => f.fileType === type));
  const hasOptional = files.some((f) => f.fileType === "comparison-document");
  log("Import gate fully ready", hasAllRequired && hasOptional);
}

function testImportGateDeleteRestoresBlock() {
  const REQUIRED = ["reexam-request", "rejection-decision", "original-application"];

  let files = [
    { id: "1", fileType: "reexam-request", required: true },
    { id: "2", fileType: "rejection-decision", required: true },
    { id: "3", fileType: "original-application", required: true },
  ];

  let hasAllRequired = REQUIRED.every((type) => files.some((f) => f.fileType === type));
  log("Import gate before delete", hasAllRequired);

  files = files.filter((f) => f.fileType !== "original-application");
  hasAllRequired = REQUIRED.every((type) => files.some((f) => f.fileType === type));
  log("Import gate after delete (blocked)", !hasAllRequired);
}

// ── Schema Validation ────────────────────────────────────────────────

async function testSchemaClaimChart() {
  const res = await postJSON("/ai/run", mockRequest("claim-chart", "g1-led"));
  const data = await res.json();
  const result = validateClaimChartOutput(data.outputJson);
  log("Schema claimChart valid", result.valid, result.errors.join("; "));
}

async function testSchemaNovelty() {
  const res = await postJSON("/ai/run",
    mockRequest("novelty", "g1-led", "novelty", { expectedSchemaName: "novelty", referenceId: "g1-ref-d1" }));
  const data = await res.json();
  const result = validateNoveltyOutput(data.outputJson);
  log("Schema novelty valid", result.valid, result.errors.join("; "));
}

async function testSchemaInventive() {
  const res = await postJSON("/ai/run", mockRequest("inventive", "g2-battery", "inventive"));
  const data = await res.json();
  const result = validateInventiveOutput(data.outputJson);
  log("Schema inventive valid", result.valid, result.errors.join("; "));
}

// ── Error Handling ───────────────────────────────────────────────────

async function testInvalidAgent() {
  const res = await postJSON("/ai/run", {
    agent: "nonexistent-agent",
    providerPreference: ["gemini"],
    modelId: "gemini-2.5-flash-lite",
    prompt: "test",
    sanitized: false,
    mock: true,
    metadata: { caseId: "test", moduleScope: "test", tokenEstimate: 0 },
  });
  log("Invalid agent returns 400", res.status === 400, `status=${res.status}`);
  const data = await res.json();
  log("Invalid agent has error", data.ok === false && data.error, JSON.stringify(data.error));
}

async function testMissingRequiredFields() {
  const res = await postJSON("/ai/run", { agent: "claim-chart" });
  log("Missing fields returns 400", res.status === 400, `status=${res.status}`);
}

async function testEmptyClaimText() {
  const res = await postJSON("/ai/run", {
    agent: "claim-chart",
    providerPreference: ["gemini"],
    modelId: "gemini-2.5-flash-lite",
    prompt: "",
    sanitized: false,
    mock: true,
    metadata: { caseId: "test", moduleScope: "test", tokenEstimate: 0 },
  });
  log("Empty prompt returns 400", res.status === 400, `status=${res.status}`);
}

// ── Error: Mock Fixture Not Found ────────────────────────────────────

async function testMockFixtureNotFound() {
  // Use an agent that has no fixtures at all (search-references has no mock fixture)
  const res = await postJSON("/ai/run", mockRequest("search-references", "nonexistent-case", "search-references"));
  log("Unknown mock fixture returns 400", res.status === 400, `status=${res.status}`);
}

// ── Full Pipeline Mock ───────────────────────────────────────────────

async function testFullPipelineMock_G1() {
  console.log("  [Pipeline G1] Claim Chart → Novelty...");

  const chartRes = await postJSON("/ai/run", mockRequest("claim-chart", "g1-led"));
  const chartData = await chartRes.json();
  const chartOk = chartData.ok && validateClaimChartOutput(chartData.outputJson).valid;
  log("Pipeline G1 Claim Chart", chartOk);

  const noveltyRes = await postJSON("/ai/run",
    mockRequest("novelty", "g1-led", "novelty", { expectedSchemaName: "novelty", referenceId: "g1-ref-d1" }));
  const noveltyData = await noveltyRes.json();
  const noveltyOk = noveltyData.ok && validateNoveltyOutput(noveltyData.outputJson).valid;
  log("Pipeline G1 Novelty", noveltyOk);

  log("Pipeline G1 complete", chartOk && noveltyOk);
}

async function testFullPipelineMock_G2() {
  console.log("  [Pipeline G2] Claim Chart → Inventive...");

  const chartRes = await postJSON("/ai/run", mockRequest("claim-chart", "g2-battery"));
  const chartData = await chartRes.json();
  const chartOk = chartData.ok && validateClaimChartOutput(chartData.outputJson).valid;
  log("Pipeline G2 Claim Chart", chartOk);

  const invRes = await postJSON("/ai/run", mockRequest("inventive", "g2-battery", "inventive"));
  const invData = await invRes.json();
  const invOk = invData.ok && validateInventiveOutput(invData.outputJson).valid;
  log("Pipeline G2 Inventive", invOk);

  log("Pipeline G2 complete", chartOk && invOk);
}

async function testFullPipelineMock_Reexam_G1() {
  console.log("  [Pipeline Reexam G1] OpinionAnalysis → ArgumentAnalysis → ReexamDraft...");

  const oaRes = await postJSON("/ai/run", mockRequest("opinion-analysis", "g1-led", "opinion-analysis"));
  const oaData = await oaRes.json();
  const oaOk = oaData.ok && validateOpinionAnalysisOutput(oaData.outputJson).valid;
  log("Pipeline Reexam G1 OpinionAnalysis", oaOk);

  const argRes = await postJSON("/ai/run", mockRequest("argument-analysis", "g1-led", "argument-mapping"));
  const argData = await argRes.json();
  const argOk = argData.ok && validateArgumentMappingOutput(argData.outputJson).valid;
  log("Pipeline Reexam G1 ArgumentAnalysis", argOk);

  const draftRes = await postJSON("/ai/run", mockRequest("reexam-draft", "g1-led", "draft"));
  const draftData = await draftRes.json();
  const draftOk = draftData.ok && validateReexamDraftOutput(draftData.outputJson).valid;
  log("Pipeline Reexam G1 ReexamDraft", draftOk);

  log("Pipeline Reexam G1 complete", oaOk && argOk && draftOk);
}

// ── Real Mode: Provider Connectivity ─────────────────────────────────

async function testRealProviderConnectivity() {
  if (!GEMINI_KEY) { log("Real provider connectivity", false, "GEMINI_KEY not set"); return; }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const models = data.models || [];
    const textModels = models.filter(m =>
      !BANNED_MODEL_PATTERNS.some(p => p.test(m.name || ""))
    );
    log("Gemini API connectivity", res.ok && textModels.length > 0,
      `text_models=${textModels.length}, total=${models.length}`);
  } catch (err) {
    log("Gemini API connectivity", false, err.message);
  }
}

// ── Real Mode: Claim Chart ───────────────────────────────────────────

async function testRealClaimChart_G1() {
  if (!GEMINI_KEY) { log("Real ClaimChart G1", false, "GEMINI_KEY not set"); return; }

  const prompt = `你是一位专利审查员。请分析以下权利要求并生成Claim Chart（权利要求特征拆解表）。

权利要求1：一种LED灯具用复合散热装置，其特征在于，包括：
散热基板(A)，由铝合金材料制成，表面设有均匀分布的散热翅片；
导热界面层(B)，设置在散热基板与LED芯片之间，为石墨烯复合导热膜，厚度0.1mm-0.5mm；
风冷模块(C)，与散热翅片配合，包含离心风扇及导风罩。

请严格输出以下JSON格式（不要输出其他内容）：
{"claimNumber":1,"features":[{"featureCode":"A","description":"特征描述","specificationCitations":[{"label":"[0001]","confidence":"high"}],"citationStatus":"confirmed"},{"featureCode":"B","description":"特征描述","specificationCitations":[{"label":"[0002]","confidence":"high"}],"citationStatus":"confirmed"},{"featureCode":"C","description":"特征描述","specificationCitations":[{"label":"[0003]","confidence":"high"}],"citationStatus":"confirmed"}],"warnings":[],"pendingSearchQuestions":[],"legalCaution":"以上为候选事实整理，不构成法律结论。"}`;

  const body = {
    agent: "claim-chart",
    providerPreference: ["gemini"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    sanitized: false,
    metadata: { caseId: "g1-led", moduleScope: "claim-chart", tokenEstimate: 200 },
  };

  currentModelIndex = 0;
  for (let attempt = 0; attempt < GEMINI_FALLBACK_MODELS.length; attempt++) {
    body.modelId = attempt === 0 ? GEMINI_MODEL_ID : getFallbackModel();
    console.log(`  [Real ClaimChart] attempt ${attempt + 1}, model=${body.modelId}`);

    try {
      const res = await postJSON("/ai/run", body);
      if (isAuthError(res.status)) {
        log("Real ClaimChart G1", false, `Auth failed (401), check GEMINI_KEY`);
        return;
      }

      const data = await res.json();
      if (!data.ok && data.error && isRetryableErrorText(data.error.message)) {
        currentModelIndex++;
        console.log(`  [Retryable] ${data.error.message}, switching model...`);
        await delay(5000);
        continue;
      }

      log("Real ClaimChart G1 ok", data.ok === true, `ok=${data.ok}`);
      if (data.outputJson) {
        const result = validateClaimChartOutput(data.outputJson);
        log("Real ClaimChart G1 schema", result.valid, result.errors.join("; "));
        const features = data.outputJson.features || [];
        log("Real ClaimChart G1 has features A,B,C",
          features.some(f => f.featureCode === "A") &&
          features.some(f => f.featureCode === "B") &&
          features.some(f => f.featureCode === "C"),
          `codes=${features.map(f => f.featureCode).join(",")}`);
      }
      if (data.tokenUsage) {
        log("Real ClaimChart G1 token usage", typeof data.tokenUsage.input === "number",
          `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
      }
      return;
    } catch (err) {
      if (attempt < GEMINI_FALLBACK_MODELS.length - 1) {
        currentModelIndex++;
        await delay(15000);
        continue;
      }
      log("Real ClaimChart G1", false, err.message);
    }
  }
}

// ── Real Mode: Novelty ───────────────────────────────────────────────

async function testRealNovelty_G1() {
  if (!GEMINI_KEY) { log("Real Novelty G1", false, "GEMINI_KEY not set"); return; }

  const prompt = `你是一位专利审查员。请对权利要求1进行新颖性对照分析。

权利要求1：一种LED灯具用复合散热装置，特征A：铝合金散热基板+散热翅片；特征B：石墨烯复合导热膜(0.1-0.5mm)；特征C：离心风扇+导风罩。

对比文件D1（CN201510012345A，公开日2015-06-20）：公开了铝合金散热基板+散热翅片（对应特征A），使用导热硅脂连接（非石墨烯膜），采用自然对流散热（无风扇）。

请严格输出JSON格式（不要输出其他内容）：
{"referenceId":"g1-ref-d1","claimNumber":1,"rows":[{"featureCode":"A","disclosureStatus":"clearly-disclosed","citations":[{"label":"D1","confidence":"high"}],"mismatchNotes":""},{"featureCode":"B","disclosureStatus":"not-found","citations":[],"mismatchNotes":"D1使用硅脂非石墨烯"},{"featureCode":"C","disclosureStatus":"not-found","citations":[],"mismatchNotes":"D1为自然对流非风扇"}],"differenceFeatureCodes":["B","C"],"pendingSearchQuestions":[],"legalCaution":"以上为候选事实整理，不构成新颖性法律结论。"}`;

  const body = {
    agent: "novelty",
    providerPreference: ["gemini"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    expectedSchemaName: "novelty",
    sanitized: false,
    metadata: { caseId: "g1-led", moduleScope: "novelty", tokenEstimate: 250 },
  };

  currentModelIndex = 0;
  for (let attempt = 0; attempt < GEMINI_FALLBACK_MODELS.length; attempt++) {
    body.modelId = attempt === 0 ? GEMINI_MODEL_ID : getFallbackModel();

    try {
      const res = await postJSON("/ai/run", body);
      if (isAuthError(res.status)) { log("Real Novelty G1", false, "Auth failed"); return; }

      const data = await res.json();
      if (!data.ok && data.error && isRetryableErrorText(data.error.message)) {
        currentModelIndex++;
        await delay(5000);
        continue;
      }

      log("Real Novelty G1 ok", data.ok === true, `ok=${data.ok}`);
      if (data.outputJson) {
        const result = validateNoveltyOutput(data.outputJson);
        log("Real Novelty G1 schema", result.valid, result.errors.join("; "));
      }
      if (data.tokenUsage) {
        log("Real Novelty G1 token usage", typeof data.tokenUsage.input === "number",
          `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
      }
      return;
    } catch (err) {
      if (attempt < GEMINI_FALLBACK_MODELS.length - 1) {
        currentModelIndex++;
        await delay(15000);
        continue;
      }
      log("Real Novelty G1", false, err.message);
    }
  }
}

// ── Real Mode: Inventive ─────────────────────────────────────────────

async function testRealInventive_G2() {
  if (!GEMINI_KEY) { log("Real Inventive G2", false, "GEMINI_KEY not set"); return; }

  const prompt = `你是一位专利审查员。请对以下权利要求进行创造性三步法分析。

权利要求1：一种锂离子电池快速充电控制方法：步骤a(A)以1C-3C恒流预充电至4.0V；步骤b(B)根据内阻实时检测动态调整充电电压，内阻每增10mΩ则充电电压降0.05V；步骤c(C)温度超45°C自动停充并警报。

对比文件D1(CN201910056789A，2019-11-30)：公开恒流恒压充电(步骤A+C)，不含步骤B动态调压。
对比文件D2(US20200123456A1，2020-05-15)：公开与步骤B参数一致的动态调压技术(内阻10mΩ→降0.05V)。

请严格输出JSON格式：
{"claimNumber":1,"closestPriorArtId":"D1","sharedFeatureCodes":["A","C"],"distinguishingFeatureCodes":["B"],"objectiveTechnicalProblem":"提高充电效率并降低极化损耗","motivationEvidence":[{"referenceId":"D2","label":"D2","confidence":"high"}],"candidateAssessment":"possibly-lacks-inventiveness","cautions":[],"legalCaution":"以上为候选事实整理，不构成创造性法律结论。"}`;

  const body = {
    agent: "inventive",
    providerPreference: ["gemini"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    sanitized: false,
    metadata: { caseId: "g2-battery", moduleScope: "inventive", tokenEstimate: 300 },
  };

  currentModelIndex = 0;
  for (let attempt = 0; attempt < GEMINI_FALLBACK_MODELS.length; attempt++) {
    body.modelId = attempt === 0 ? GEMINI_MODEL_ID : getFallbackModel();

    try {
      const res = await postJSON("/ai/run", body);
      if (isAuthError(res.status)) { log("Real Inventive G2", false, "Auth failed"); return; }

      const data = await res.json();
      if (!data.ok && data.error && isRetryableErrorText(data.error.message)) {
        currentModelIndex++;
        await delay(5000);
        continue;
      }

      log("Real Inventive G2 ok", data.ok === true, `ok=${data.ok}`);
      if (data.outputJson) {
        const result = validateInventiveOutput(data.outputJson);
        log("Real Inventive G2 schema", result.valid, result.errors.join("; "));
        log("Real Inventive G2 candidateAssessment",
          typeof data.outputJson.candidateAssessment === "string",
          `assessment=${data.outputJson.candidateAssessment}`);
      }
      if (data.tokenUsage) {
        log("Real Inventive G2 token usage", typeof data.tokenUsage.input === "number",
          `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
      }
      return;
    } catch (err) {
      if (attempt < GEMINI_FALLBACK_MODELS.length - 1) {
        currentModelIndex++;
        await delay(15000);
        continue;
      }
      log("Real Inventive G2", false, err.message);
    }
  }
}

// ── Real Mode: Token Usage ───────────────────────────────────────────

async function testRealTokenUsageReturned() {
  if (!GEMINI_KEY) { log("Real token usage", false, "GEMINI_KEY not set"); return; }

  const prompt = "请返回JSON：{\"ok\":true,\"test\":\"token-usage-smoke-test\"}";
  const body = {
    agent: "chat",
    providerPreference: ["gemini"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    sanitized: false,
    metadata: { caseId: "token-test", moduleScope: "chat", tokenEstimate: 50 },
  };

  try {
    const res = await postJSON("/ai/run", body);
    if (isAuthError(res.status)) { log("Real token usage", false, "Auth failed"); return; }
    const data = await res.json();
    log("Real token usage ok", data.ok === true);
    log("Real token usage has tokenUsage", data.tokenUsage != null,
      data.tokenUsage ? `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}` : "missing");
    log("Real token usage input > 0", data.tokenUsage?.input > 0);
  } catch (err) {
    log("Real token usage", false, err.message);
  }
}

// ── Search: Verify API Keys ──────────────────────────────────────────

async function testRealSearchVerifyTavilyKey() {
  if (!TAVILY_API_KEY) { log("Tavily key verify", false, "TAVILY_API_KEY not set"); return; }
  try {
    const res = await postJSON("/verify-search-key", {
      providerId: "tavily",
      apiKey: TAVILY_API_KEY,
    });
    const data = await res.json();
    log("Tavily key valid", data.ok === true, data.ok ? data.message : data.error);
  } catch (err) {
    log("Tavily key verify", false, err.message);
  }
}

async function testRealSearchVerifySerpKey() {
  if (!SERP_API_KEY) { log("SerpAPI key verify", false, "SerpAPI_KEY not set"); return; }
  try {
    const res = await postJSON("/verify-search-key", {
      providerId: "serpapi",
      apiKey: SERP_API_KEY,
    });
    const data = await res.json();
    log("SerpAPI key valid", data.ok === true, data.ok ? data.message : data.error);
  } catch (err) {
    log("SerpAPI key verify", false, err.message);
  }
}

// ── Search: Real Search References ───────────────────────────────────

async function testRealSearchReferences_G1() {
  if (!GEMINI_KEY && !TAVILY_API_KEY) {
    log("Real search G1", false, "GEMINI_KEY and TAVILY_API_KEY required");
    return;
  }

  const body = {
    caseId: "g1-led-search",
    claimText: "一种LED灯具用复合散热装置，包括铝合金散热基板、石墨烯导热膜、离心风扇",
    features: [
      { featureCode: "A", description: "铝合金散热基板+散热翅片" },
      { featureCode: "B", description: "石墨烯复合导热膜0.1-0.5mm" },
      { featureCode: "C", description: "离心风扇+导风罩" },
    ],
    maxResults: 3,
    providerPreference: ["gemini"],
    modelId: GEMINI_MODEL_ID,
    searchProviderId: "tavily",
    searchApiKey: TAVILY_API_KEY,
    llmApiKey: GEMINI_KEY,
  };

  try {
    const res = await postJSON("/search-references", body);
    const data = await res.json();

    if (res.status === 503) {
      log("Real search G1 search unavailable", true, `msg: ${data.error}`);
      return;
    }

    log("Real search G1 ok", data.ok === true, `ok=${data.ok}`);
    log("Real search G1 has candidates", Array.isArray(data.candidates),
      `count=${data.candidates?.length || 0}`);
    log("Real search G1 has searchQuery", typeof data.searchQuery === "string",
      `query=${data.searchQuery?.slice(0, 80)}`);

    const result = validateSearchReferencesOutput(data);
    log("Real search G1 schema valid", result.valid, result.errors.join("; "));

    if (data.candidates?.length > 0) {
      const c = data.candidates[0];
      log("Real search G1 candidate has title", typeof c.title === "string", c.title?.slice(0, 60));
      log("Real search G1 candidate has publicationNumber", typeof c.publicationNumber === "string",
        c.publicationNumber);
    }
  } catch (err) {
    log("Real search G1", false, err.message);
  }
}

// ── Search: Rate Limit Handling ──────────────────────────────────────

async function testRealSearchRateLimit() {
  if (!TAVILY_API_KEY) { log("Search rate limit", false, "TAVILY_API_KEY not set"); return; }
  // Quick consecutive verify calls to ensure rate limiting doesn't break
  try {
    const res1 = await postJSON("/verify-search-key", {
      providerId: "tavily",
      apiKey: TAVILY_API_KEY,
    });
    const d1 = await res1.json();
    log("Search rate limit call 1", res1.ok, `status=${res1.status}`);

    await delay(2000);

    const res2 = await postJSON("/verify-search-key", {
      providerId: "tavily",
      apiKey: TAVILY_API_KEY,
    });
    const d2 = await res2.json();
    log("Search rate limit call 2", res2.ok, `status=${res2.status}`);

    log("Search rate limit no ban", d1.ok !== false || d2.ok !== false,
      "Both calls completed without persistent ban");
  } catch (err) {
    log("Search rate limit", false, err.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const onlyReal = args.includes("--real");
  const onlyIdx = args.indexOf("--only");
  const onlyPattern = onlyIdx !== -1 ? (args[onlyIdx + 1] || "").toLowerCase() : "";

  console.log("\n=== Patent Examiner E2E Functional Tests ===\n");

  if (onlyReal) {
    console.log("Mode: Real (requires GEMINI_KEY + search keys)\n");
  } else if (onlyPattern) {
    console.log(`Mode: Filtered by "${onlyPattern}"\n`);
  } else {
    console.log("Mode: Mock (default, no keys needed)\n");
    console.log("提示：根据 git diff 选择测试组，详见文件顶部注释\n");
  }

  // --only filter
  function maybe(fn, ...args) {
    if (!onlyPattern) return Reflect.apply(fn, null, args);
    const name = fn.name.toLowerCase();
    if (name.includes(onlyPattern)) return Reflect.apply(fn, null, args);
    console.log(`  ⏭ skipped ${fn.name}`);
    return undefined;
  }

  try {
    if (onlyReal) {
      // ========== Real Mode Tests ==========
      console.log("--- Key Validation ---");
      console.log(`  GEMINI_KEY: ${maskKey(GEMINI_KEY)}`);
      console.log(`  TAVILY_API_KEY: ${maskKey(TAVILY_API_KEY)}`);
      console.log(`  SerpAPI_KEY: ${maskKey(SERP_API_KEY)}\n`);

      if (!GEMINI_KEY) {
        console.log("ERROR: GEMINI_KEY not set. Required for real mode.\n");
        console.log("  export GEMINI_KEY=xxx node tests/e2e-real.mjs --real");
        console.log("  or add GEMINI_KEY to .env file\n");
        process.exit(1);
      }

      console.log("--- Provider Connectivity ---");
      await maybe(testRealProviderConnectivity);
      await delay(2000);

      console.log("\n--- Real Agent Tests ---");
      await maybe(testRealClaimChart_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealNovelty_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealInventive_G2);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealTokenUsageReturned);
      await delay(2000);

      console.log("\n--- Search API Tests ---");
      await maybe(testRealSearchVerifyTavilyKey);
      await delay(2000);
      await maybe(testRealSearchVerifySerpKey);
      await delay(2000);
      await maybe(testRealSearchRateLimit);
      await delay(SEARCH_RATE_LIMIT_DELAY);
      await maybe(testRealSearchReferences_G1);

    } else {
      // ========== Mock Mode Tests (Default) ==========

      // Health check first
      console.log("--- Health Check ---");
      await maybe(testHealthCheck);

      // Mock foundational tests
      console.log("\n--- Mock Basic ---");
      await maybe(testMockModeEnabled);

      // Claim Chart
      console.log("\n--- Claim Chart (Mock) ---");
      await maybe(testMockClaimChart_G1);
      await maybe(testMockClaimChart_G3);

      // Novelty
      console.log("\n--- Novelty (Mock) ---");
      await maybe(testMockNovelty_G1);

      // Inventive
      console.log("\n--- Inventive (Mock) ---");
      await maybe(testMockInventive_G2);
      await maybe(testMockInventive_G3_NoRef);

      // Interpret
      console.log("\n--- Interpret (Mock) ---");
      await maybe(testMockInterpret_G1);

      // Reexamination Agents
      console.log("\n--- Reexamination Agents (Mock) ---");
      await maybe(testMockOpinionAnalysis_G1);
      await maybe(testMockArgumentAnalysis_G1);
      await maybe(testMockReexamDraft_G1);
      await maybe(testMockSummary_G1);
      await maybe(testMockTranslate_G1);

      // Figure Extraction
      console.log("\n--- Figure Extraction ---");
      testFigureCaptionExtraction();
      testFigureSectionDetection();
      testLikelyFigurePage();

      // Import Gate
      console.log("\n--- Import Gate ---");
      testImportGateIncomplete();
      testImportGateReady();
      testImportGateWithOptional();
      testImportGateDeleteRestoresBlock();

      // Schema
      console.log("\n--- Schema Validation ---");
      await maybe(testSchemaClaimChart);
      await maybe(testSchemaNovelty);
      await maybe(testSchemaInventive);

      // Error handling
      console.log("\n--- Error Handling ---");
      await maybe(testInvalidAgent);
      await maybe(testMissingRequiredFields);
      await maybe(testEmptyClaimText);
      await maybe(testMockFixtureNotFound);

      // Full pipeline
      console.log("\n--- Full Pipeline ---");
      await maybe(testFullPipelineMock_G1);
      await maybe(testFullPipelineMock_G2);
      await maybe(testFullPipelineMock_Reexam_G1);

      // Real mode tests (optional, auto-skip if no key)
      if (GEMINI_KEY) {
        console.log("\n--- Real Mode (GEMINI_KEY detected) ---");
        console.log(`  GEMINI_KEY: ${maskKey(GEMINI_KEY)}`);
        console.log(`  TAVILY_API_KEY: ${maskKey(TAVILY_API_KEY)}`);
        console.log(`  SerpAPI_KEY: ${maskKey(SERP_API_KEY)}\n`);

        await maybe(testRealProviderConnectivity);
        await delay(2000);

        if (TAVILY_API_KEY) {
          await maybe(testRealSearchVerifyTavilyKey);
          await delay(2000);
          await maybe(testRealSearchVerifySerpKey);
          await delay(2000);
        }
      } else {
        console.log("\n--- Real Mode (skipped, no GEMINI_KEY) ---");
        console.log("  Set GEMINI_KEY to run real AI tests, or use --real flag\n");
      }
    }
  } catch (err) {
    console.error("\nFATAL:", err.message);
    RESULTS.push({ test: "FATAL", pass: false, detail: err.message });
  }

  // ── Summary ──
  console.log("\n=== Summary ===");
  const passed = RESULTS.filter(item => item.pass).length;
  const failed = RESULTS.filter(item => !item.pass).length;
  console.log(`Total: ${RESULTS.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const item of RESULTS.filter(entry => !entry.pass)) {
      console.log(`  - ${item.test}: ${item.detail}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();

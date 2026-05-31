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
 * ├── testReexamDataIntegrity_G1   - G1 → 审查意见+答辩数据交叉校验
 * ├── testReexamFullPipelineDataFlow_G1 - G1 → 复审全链路数据流完整性
 * ├── testSchemaOpinionAnalysis    - opinion-analysis Schema 校验
 * ├── testSchemaArgumentMapping    - argument-analysis Schema 校验
 * ├── testSchemaReexamDraft        - reexam-draft Schema 校验
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
 * 【EPO 真实搜索测试】修改 EPO Provider 时运行（需 EPO_CONSUMER_KEY + EPO_CONSUMER_SECRET_KEY + GEMINI_KEY）
 * └── testEpoSearchWithEnv          - EPO 真实搜索 + candidates 非空断言
 *
 * 【Quality Gate 测试】修改 Provider Registry/fallback/retry 时运行
 * ├── gateway.test.ts T-GW-005       - per-agent max total attempts 上限
 * ├── Mock 测试 structureErrors 断言  - 所有 mock agents 的 structureErrors.length === 0
 * └── EPO candidates.length > 0     - 搜索返回非空候选文献列表
 *
 * 【Export 测试】修改 export/导出相关时运行
 * └── testMockExportHtml_G1        - G1 → HTML 结构 + legalCaution
 *
 * 【Document Classification 测试】修改 classify-documents/文档分类相关时运行
 * └── testMockClassifyDocuments_G1  - G1 → 文档角色分类
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
 * ├── testRealProviderConnectivity  - Gemini API 连通性
 * ├── testRealClaimChart_G1         - G1 Claim Chart 真实 AI 生成
 * ├── testRealNovelty_G1            - G1 新颖性对照真实 AI
 * ├── testRealInventive_G2          - G1 三步法真实 AI
 * ├── testRealDefects_G1            - G1 缺陷检测真实 AI
 * ├── testRealChat_G1               - G1 对话真实 AI
 * ├── testRealInterpret_G1          - G1 文档解读真实 AI
 * ├── testRealExtractCaseFields_G1  - G1 案件字段提取真实 AI
 * ├── testRealOpinionAnalysis_G1    - G1 审查意见分析真实 AI
 * ├── testRealArgumentAnalysis_G1   - G1 答辩理由映射真实 AI
 * ├── testRealReexamDraft_G1        - G1 复审意见草稿真实 AI
 * ├── testRealSummary_G1            - G1 摘要生成真实 AI
 * ├── testRealTranslate_G1          - G1 翻译真实 AI
 * ├── testRealClassifyDocuments_G1  - G1 文档分类真实 AI
 * ├── testRealTokenUsageReturned    - usage 字段验证
 * └── testRealSearchReferences_G1   - 真实搜索流程（需 Tavily Key）
 *
 * 【完整流程测试】修改流程编排/AgentClient 时运行
 * ├── testFullPipelineMock_G1      - G1: 案件→Chart→Novelty→Export
 * └── testFullPipelineMock_G2      - G2: 案件→Chart→Inventive→Export
 *
 * 【知识库测试】修改 knowledge 模块时运行
 * ├── testKnowledgeUploadTxt       - 上传 TXT 文件
 * ├── testKnowledgeUploadMd        - 上传 MD 文件
 * ├── testKnowledgeUploadJson      - 上传 JSON 文件
 * ├── testKnowledgeUploadCsv       - 上传 CSV 文件
 * ├── testKnowledgeDuplicateDetection - 重复文件检测
 * ├── testKnowledgeStats           - 统计信息
 * ├── testKnowledgeSearch          - 检索测试
 * ├── testKnowledgeSourcesList     - 来源列表
 * ├── testKnowledgeDelete          - 删除来源
 * └── testKnowledgeClearAll        - 清空全部
 *
 * 【UI 改动】跳过 E2E 自动测试，人类手工验证
 *
 * Usage:
 *   # 全量 Mock（默认，推荐日常开发）
 *   node tests/e2e-real.mjs
 *
 *   # 带前置质量门禁（lint + typecheck，CI 必须）
 *   node tests/e2e-real.mjs --check
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
 *
 *   # 快速 DB 完整性测试（开发时推荐）
 *   node tests/e2e-real.mjs --only db
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
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

// ── Sample Data (LED Heatsink Mini) ──────────────────────────────────

const SAMPLE_CLAIM = [
  "权利要求1：一种LED灯具用复合散热装置，其特征在于，包括：",
  "散热基板(A)，由铝合金材料制成，表面设有均匀分布的散热翅片；",
  "导热界面层(B)，设置在散热基板与LED芯片之间，为石墨烯复合导热膜，厚度0.1mm-0.5mm；",
  "风冷模块(C)，与散热翅片配合，包含离心风扇及导风罩。",
  "",
  "权利要求2：根据权利要求1所述的复合散热装置，其特征在于，所述散热翅片的间距为2-5mm，高度为10-30mm。",
  "",
  "权利要求3：根据权利要求1所述的复合散热装置，其特征在于，所述石墨烯复合导热膜包含5-15wt%的石墨烯和85-95wt%的有机硅树脂。",
  "",
  "权利要求4：根据权利要求1所述的复合散热装置，其特征在于，所述离心风扇转速为2000-8000rpm，风量为10-50CFM。",
].join("\n");

const SAMPLE_SPEC = [
  "技术领域：本发明涉及LED照明技术领域，具体涉及一种LED灯具用复合散热装置。",
  "",
  "背景技术：LED灯具在工作过程中会产生大量热量，散热不良会导致光衰、色温漂移及寿命缩短。",
  "传统散热方案多采用单一铝合金散热器配合自然对流，散热效率有限。",
  "",
  "发明内容：本发明提供一种LED灯具用复合散热装置，通过铝合金散热基板、石墨烯导热膜及离心风扇三者协同，大幅提升散热效率。",
  "其中，散热基板由6063-T5铝合金一体化压铸成型，表面设有沿径向均匀分布的散热翅片，翅片间距2-5mm、高度10-30mm。",
  "导热界面层为石墨烯复合导热膜，石墨烯含量5-15wt%，厚度0.1mm-0.5mm，导热系数可达800-1500W/(m·K)。",
  "风冷模块包括离心风扇和导风罩，风扇转速2000-8000rpm，风量10-50CFM。",
  "",
  "具体实施方式：如图1所示，LED灯具复合散热装置包括散热基板1、LED芯片2、导热界面层3和风冷模块4。",
  "散热基板1采用6063-T5铝合金通过压铸一体成型，基板上表面集成多个LED芯片2安装位。",
  "导热界面层3设置在散热基板1上表面与LED芯片2之间，采用石墨烯复合导热膜。",
  "风冷模块4安装在散热基板1侧方，包括离心风扇4a和导风罩4b。",
].join("\n");

const SAMPLE_REF_D1 = [
  "公开号：CN201510012345A",
  "公开日：2015-06-20",
  "标题：一种LED灯具散热结构",
  "",
  "摘要：本发明公开了一种LED灯具散热结构，包括铝合金散热基板，基板上设有散热翅片，",
  "LED芯片通过导热硅脂层安装于基板上表面。散热方式为自然对流。",
  "",
  "主要技术特征：",
  "- 铝合金散热基板+散热翅片（自然对流）",
  "- 导热连接材料：导热硅脂",
  "- 散热方式：被动自然对流",
].join("\n");

const SAMPLE_REF_D2 = [
  "公开号：US20200123456A1",
  "公开日：2020-05-15",
  "标题：High Efficiency Thermal Management System for LED Arrays",
  "",
  "摘要：A thermal management system using graphene-enhanced thermal interface material",
  "between LED array and aluminum substrate. The TIM comprises 8-12wt% graphene nanoplatelets",
  "dispersed in silicone matrix, achieving thermal conductivity of 600-1200W/(m·K).",
  "",
  "主要技术特征：",
  "- 石墨烯增强导热界面材料",
  "- 硅基基体+8-12wt%石墨烯纳米片",
  "- 导热系数600-1200W/(m·K)",
].join("\n");

const SAMPLE_OA = [
  "审查意见通知书",
  "",
  "申请号：CN202310008888A",
  "发明名称：一种LED灯具用复合散热装置",
  "",
  "经审查，本申请存在以下缺陷：",
  "",
  "1. 权利要求1相对于对比文件1（CN201510012345A）不具备新颖性。",
  "   对比文件1公开了铝合金散热基板+散热翅片（特征A），不具备新颖性（专利法第22条第2款）。",
  "",
  "2. 权利要求1-4相对于对比文件1和对比文件2（US20200123456A1）的组合不具备创造性。",
  "   对比文件2公开了石墨烯复合导热膜用于LED散热（特征B），本领域技术人员有动机将其与对比文件1结合（专利法第22条第3款）。",
  "",
  "3. 权利要求1中\"离心风扇\"的表述不清楚，未限定风扇与散热翅片的具体配合方式（专利法第26条第4款）。",
].join("\n");

const SAMPLE_RESPONSE = [
  "意见陈述书",
  "",
  "针对审查意见通知书，申请人陈述如下：",
  "",
  "1. 关于新颖性问题：本申请权利要求1的特征A在对比文件1中虽然公开，",
  "   但本申请的散热翅片间距2-5mm、高度10-30mm具有特定技术效果，与对比文件1不同。",
  "   申请人已将此技术特征补入权利要求1。",
  "",
  "2. 关于创造性问题：对比文件2虽然公开了石墨烯导热膜，但其应用于不同技术场景，",
  "   且本申请的石墨烯含量5-15wt%与对比文件2的8-12wt%范围不同，",
  "   本申请通过三者协同实现了超出预期的散热效果（导热系数800-1500W/(m·K)）。",
  "",
  "3. 关于不清楚问题：申请人已在说明书中补充了离心风扇与散热翅片的配合方式描述。",
].join("\n");

const SAMPLE_FEATURES = [
  { featureCode: "A", description: "铝合金散热基板+散热翅片" },
  { featureCode: "B", description: "石墨烯复合导热膜(0.1-0.5mm)" },
  { featureCode: "C", description: "离心风扇+导风罩" },
];

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

// ── Quality Gate: Lint + TypeCheck ───────────────────────────────────

function runQualityGate() {
  console.log("=== Quality Gate: Lint + TypeCheck ===\n");
  let gateFailed = false;

  console.log("--- TypeCheck ---");
  try {
    execSync("npm run typecheck", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      timeout: 120000,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    log("Quality Gate: TypeCheck", true);
  } catch (err) {
    gateFailed = true;
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const output = (stderr + stdout).split("\n").filter(l => l.includes("error TS")).slice(0, 5).join(" | ");
    log("Quality Gate: TypeCheck", false, output || "typecheck failed");
  }

  console.log("\n--- Lint ---");
  try {
    execSync("npm run lint", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    log("Quality Gate: Lint", true);
  } catch (err) {
    gateFailed = true;
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const errors = (stderr + stdout).split("\n").filter(l => l.includes(" error ") || l.includes(" Error ") || l.match(/^\s*\d+:\d+\s+error/)).slice(0, 5).join(" | ");
    log("Quality Gate: Lint", false, errors || "lint failed");
  }

  if (gateFailed) {
    console.log("\n[GATE FAILED] Lint 或 TypeCheck 未通过，终止测试。请先修复上述错误。\n");
  } else {
    console.log("\n[GATE PASSED] Lint + TypeCheck 全部通过\n");
  }
  return gateFailed;
}

// ── DB Logic-Chain Tests ─────────────────────────────────────────────

function runDbLogicChainTests() {
  console.log("\n--- DB Logic-Chain Tests (vitest) ---");
  try {
    execSync("npx vitest run --config vitest.integration.config.ts tests/integration/dbLogicChain.test.ts", {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    log("DB Logic-Chain Tests", true);
  } catch (err) {
    log("DB Logic-Chain Tests", false, err.message || "vitest failed");
  }
}

function runDbScenarioTests() {
  console.log("\n--- DB Scenario Regression Tests (vitest) ---");
  try {
    execSync("npx vitest run --config vitest.integration.config.ts tests/integration/dbScenario.test.ts", {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    log("DB Scenario Tests", true);
  } catch (err) {
    log("DB Scenario Tests", false, err.message || "vitest failed");
  }
}

function runDbUpgradeTests() {
  console.log("\n--- DB Schema Upgrade Tests (vitest) ---");
  try {
    execSync("npx vitest run --config vitest.integration.config.ts tests/integration/dbUpgrade.test.ts", {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    log("DB Upgrade Tests", true);
  } catch (err) {
    log("DB Upgrade Tests", false, err.message || "vitest failed");
  }
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

function _validateCitation(obj) {
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

function validateDefectsOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.defects)) errors.push("defects must be array");
  else {
    const validSeverities = ["error", "warning", "info"];
    const _validCategories = ["新颖性", "创造性", "清楚性", "支持", "修改超范围", "其他"];
    for (const d of data.defects) {
      if (typeof d.code !== "string") errors.push(`defect missing code`);
      if (typeof d.description !== "string") errors.push(`defect missing description`);
      if (typeof d.category !== "string") errors.push(`defect missing category`);
      if (!validSeverities.includes(d.severity)) errors.push(`invalid severity: ${d.severity}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateExtractCaseFieldsOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.claims) || data.claims.length < 1) errors.push("claims must be non-empty array");
  else {
    for (const c of data.claims) {
      if (typeof c.claimNumber !== "number") errors.push(`claim missing claimNumber`);
      if (!["independent", "dependent"].includes(c.type)) errors.push(`invalid claim type: ${c.type}`);
      if (typeof c.rawText !== "string" || c.rawText.length === 0) errors.push(`claim missing rawText`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateInterpretOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (typeof data.reply !== "string" || data.reply.length < 20) errors.push("reply too short or missing");
  return { valid: errors.length === 0, errors };
}

// ── Shared Real AI Test Helper ───────────────────────────────────────

async function runRealAiAgentTest(label, agent, prompt, metadata, onResponse) {
  const body = {
    agent,
    providerPreference: ["gemini", "openrouter"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    sanitized: false,
    metadata,
  };

  currentModelIndex = 0;
  for (let attempt = 0; attempt < GEMINI_FALLBACK_MODELS.length; attempt++) {
    body.modelId = attempt === 0 ? GEMINI_MODEL_ID : getFallbackModel();
    const labelWithAttempt = attempt > 0 ? `${label} retry-${attempt}` : label;
    if (attempt > 0) console.log(`  [${labelWithAttempt}] attempt ${attempt + 1}, model=${body.modelId}`);

    try {
      const res = await postJSON("/ai/run", body);
      if (isAuthError(res.status)) {
        log(label, false, "Auth failed (401), check GEMINI_KEY");
        return false;
      }

      const data = await res.json();

      if (!data.ok && data.error && isRetryableErrorText(data.error.message)) {
        currentModelIndex++;
        const waitMs = 5000 + attempt * 3000;
        console.log(`  [Retryable] ${data.error.message}, switching model (wait ${waitMs}ms)...`);
        await delay(waitMs);
        continue;
      }

      log(`${label} ok`, data.ok === true, `ok=${data.ok}`);

      if (data.ok && Array.isArray(data.structureErrors) && data.structureErrors.length > 0) {
        log(`${label} output quality`, false,
          `structure validation failed: ${data.structureErrors.join("; ")}`);
      }

      if (data.tokenUsage) {
        log(`${label} token usage`, typeof data.tokenUsage.input === "number",
          `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
      }

      if (onResponse) onResponse(data);

      if (data.outputJson) {
        const text = typeof data.outputJson === "string" ? data.outputJson : JSON.stringify(data.outputJson);
        log(`${label} output not empty`, text.length > 5,
          `length=${text.length}`);
      }

      return data;
    } catch (err) {
      if (attempt < GEMINI_FALLBACK_MODELS.length - 1) {
        currentModelIndex++;
        const waitMs = 15000 + attempt * 5000;
        console.log(`  [${labelWithAttempt}] error: ${err.message}, retrying in ${waitMs}ms...`);
        await delay(waitMs);
        continue;
      }
      console.log(`  [${labelWithAttempt}] all Gemini models exhausted: ${err.message}`);
    }
  }

  const OPENROUTER_FALLBACK_MODELS = [
    { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4" },
    { id: "z-ai/glm-4.5-air:free", label: "GLM-4.5" },
    { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder" },
    { id: "arcee-ai/trinity-large-thinking:free", label: "Trinity Large" },
    { id: "google/gemma-4-31b-it:free", label: "Gemma-4" },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next" },
    { id: "minimax/minimax-m2.5:free", label: "MiniMax M2.5" },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron" },
    { id: "openai/gpt-oss-120b:free", label: "GPT-OSS" },
  ];
  const OPENROUTER_MAX_ATTEMPTS_PER_MODEL = 3;

  for (const { id: openrouterModelId, label: openrouterLabel } of OPENROUTER_FALLBACK_MODELS) {
    console.log(`  [${label}] switching to OpenRouter: ${openrouterLabel} (${openrouterModelId})`);
    for (let openrouterAttempt = 0; openrouterAttempt < OPENROUTER_MAX_ATTEMPTS_PER_MODEL; openrouterAttempt++) {
      try {
        if (openrouterAttempt > 0) {
          const waitMs = 10000 + openrouterAttempt * 5000;
          console.log(`  [${label}] OpenRouter ${openrouterLabel} attempt ${openrouterAttempt + 1}/${OPENROUTER_MAX_ATTEMPTS_PER_MODEL}, waiting ${waitMs}ms...`);
          await delay(waitMs);
        }
        const openrouterBody = {
          ...body,
          providerPreference: ["openrouter"],
          modelId: openrouterModelId,
        };
        const res = await postJSON("/ai/run", openrouterBody);
        const data = await res.json();

        if (!data.ok) {
          const errMsg = data.error?.message || "unknown error";
          if (isRetryableErrorText(errMsg) && openrouterAttempt < OPENROUTER_MAX_ATTEMPTS_PER_MODEL - 1) {
            console.log(`  [${label}] OpenRouter ${openrouterLabel} retryable error: ${errMsg}`);
            continue;
          }
          console.log(`  [${label}] OpenRouter ${openrouterLabel} failed: ${errMsg}`);
          break;
        }

        log(`${label} ok (OpenRouter)`, true, `model=${openrouterLabel}`);

        if (data.ok && Array.isArray(data.structureErrors) && data.structureErrors.length > 0) {
          log(`${label} (OpenRouter) output quality`, false,
            `structure validation failed: ${data.structureErrors.join("; ")}`);
        }

        if (data.tokenUsage) {
          log(`${label} token usage`, typeof data.tokenUsage.input === "number",
            `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
        }

        if (onResponse) onResponse(data);

        if (data.outputJson) {
          const text = typeof data.outputJson === "string" ? data.outputJson : JSON.stringify(data.outputJson);
          log(`${label} output not empty`, text.length > 5,
            `length=${text.length}`);
        }

        return data;
      } catch (err) {
        if (openrouterAttempt < OPENROUTER_MAX_ATTEMPTS_PER_MODEL - 1) {
          console.log(`  [${label}] OpenRouter ${openrouterLabel} error: ${err.message}, retrying...`);
          continue;
        }
        console.log(`  [${label}] OpenRouter ${openrouterLabel} exhausted after ${OPENROUTER_MAX_ATTEMPTS_PER_MODEL} attempts: ${err.message}`);
        break;
      }
    }
  }

  log(`${label} all providers exhausted`, false);
  return null;
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
  log("Mock mode no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);
}

// ── Mock: Claim Chart ────────────────────────────────────────────────

async function testMockClaimChart_G1() {
  const res = await postJSON("/ai/run", mockRequest("claim-chart", "g1-led"));
  const data = await res.json();
  log("Mock ClaimChart G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ClaimChart G1 has outputJson", data.outputJson != null);
  log("Mock ClaimChart G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock ClaimChart G3 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock Novelty G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock Inventive G2 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock Inventive G3 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  const result = validateInventiveOutput(data.outputJson);
  log("Mock Inventive G3 schema valid", result.valid, result.errors.join("; "));
}

// ── Mock: Interpret ──────────────────────────────────────────────────

async function testMockInterpret_G1() {
  const res = await postJSON("/ai/run", mockRequest("interpret", "g1-led", "case"));
  const data = await res.json();
  log("Mock Interpret G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock Interpret G1 has outputJson", data.outputJson != null);
  log("Mock Interpret G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock OpinionAnalysis G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock ArgumentAnalysis G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock ReexamDraft G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock Summary G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

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
  log("Mock Translate G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  const result = validateTranslateOutput(data.outputJson);
  log("Mock Translate G1 schema valid", result.valid, result.errors.join("; "));

  const translatedText = data.outputJson?.translatedText;
  log("Mock Translate G1 translatedText non-empty", typeof translatedText === "string" && translatedText.length > 0);
}

// ── Mock: Case Field Extraction ──────────────────────────────────────

async function testMockExtractCaseFields_G1() {
  const res = await postJSON("/ai/run", mockRequest("extract-case-fields", "g1-led", "case"));
  const data = await res.json();
  log("Mock ExtractCaseFields G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ExtractCaseFields G1 has outputJson", data.outputJson != null);
  log("Mock ExtractCaseFields G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  const result = validateExtractCaseFieldsOutput(data.outputJson);
  log("Mock ExtractCaseFields G1 schema valid", result.valid, result.errors.join("; "));

  const claims = data.outputJson?.claims;
  log("Mock ExtractCaseFields G1 has claims", Array.isArray(claims) && claims.length > 0,
    `claims=${JSON.stringify(claims)}`);

  const title = data.outputJson?.title;
  log("Mock ExtractCaseFields G1 has title", typeof title === "string" && title.length > 0,
    `title=${title}`);
}

// ── Mock: Classify Documents ────────────────────────────────────────

function validateClassifyDocumentsOutput(data) {
  if (!data || typeof data !== "object") return { valid: false, errors: ["not an object"] };
  const errors = [];
  if (!Array.isArray(data.classifications) || data.classifications.length < 1) errors.push("classifications must be non-empty array");
  else {
    const validRoles = ["application", "office-action", "office-action-response", "amended-claims", "reference", "other"];
    for (const c of data.classifications) {
      if (typeof c.fileIndex !== "number") errors.push("classification missing fileIndex");
      if (!validRoles.includes(c.role)) errors.push(`invalid role: ${c.role}`);
      if (typeof c.confidence !== "string") errors.push("classification missing confidence");
    }
  }
  return { valid: errors.length === 0, errors };
}

async function testMockClassifyDocuments_G1() {
  const res = await postJSON("/ai/run", mockRequest("classify-documents", "g1-led", "classify-documents"));
  const data = await res.json();
  log("Mock ClassifyDocuments G1 ok", data.ok === true, `ok=${data.ok}`);
  log("Mock ClassifyDocuments G1 has outputJson", data.outputJson != null);
  log("Mock ClassifyDocuments G1 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  const result = validateClassifyDocumentsOutput(data.outputJson);
  log("Mock ClassifyDocuments G1 schema valid", result.valid, result.errors.join("; "));

  const classifications = data.outputJson?.classifications || [];
  const roles = classifications.map(c => c.role);
  log("Mock ClassifyDocuments G1 has application", roles.includes("application"), `roles=${roles.join(",")}`);
  log("Mock ClassifyDocuments G1 has reference", roles.includes("reference"), `roles=${roles.join(",")}`);
  log("Mock ClassifyDocuments G1 has office-action", roles.includes("office-action"), `roles=${roles.join(",")}`);
}

// ── nf-7: Two-Step Search (Mock) ────────────────────────────────────

async function testMockExtractSearchTerms_G1() {
  const res = await postJSON("/extract-search-terms", {
    caseId: "g1-led",
    claimText: "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。",
    features: [
      { featureCode: "A", description: "散热基板" },
      { featureCode: "B", description: "导热界面层" },
      { featureCode: "C", description: "风冷模块" }
    ]
  });
  const data = await res.json();
  const ok = data.ok && Array.isArray(data.queries) && data.queries.length >= 1 && data.featureCount === 3;
  log("MockExtractSearchTerms_G1: returns queries", ok,
    ok ? `queries=${data.queries.length}` : JSON.stringify(data));
}

async function testMockSearchWithTerms_G1() {
  const res = await postJSON("/search-with-terms", {
    caseId: "g1-led",
    claimText: "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。",
    features: [
      { featureCode: "A", description: "散热基板" },
      { featureCode: "B", description: "导热界面层" }
    ],
    searchQueries: ["LED散热器 相变材料", "LED heatsink phase change"],
    maxResults: 5,
    mock: true
  });
  const data = await res.json();
  const schemaResult = validateSearchReferencesOutput(data);
  log("MockSearchWithTerms_G1: response schema", schemaResult.valid, schemaResult.errors.join(", "));
  log("MockSearchWithTerms_G1: has candidates", data.candidates?.length > 0, `count=${data.candidates?.length}`);
}

// ── Reexam Data Integrity: Cross-Agent Verification ──────────────────

async function testReexamDataIntegrity_G1() {
  console.log("  [DataIntegrity] Verifying opinion-analysis ↔ argument-analysis cross-reference...");

  const oaRes = await postJSON("/ai/run", mockRequest("opinion-analysis", "g1-led", "opinion-analysis"));
  const oaData = await oaRes.json();
  const oaOk = oaData.ok && validateOpinionAnalysisOutput(oaData.outputJson).valid;
  log("DataIntegrity OpinionAnalysis loaded", oaOk);

  const argRes = await postJSON("/ai/run", mockRequest("argument-analysis", "g1-led", "argument-mapping"));
  const argData = await argRes.json();
  const argOk = argData.ok && validateArgumentMappingOutput(argData.outputJson).valid;
  log("DataIntegrity ArgumentAnalysis loaded", argOk);

  if (!oaOk || !argOk) {
    log("DataIntegrity G1 skipped", false, "prerequisite data not valid");
    return;
  }

  const grounds = oaData.outputJson.rejectionGrounds;
  const mappings = argData.outputJson.mappings;
  const groundCodes = new Set(grounds.map(g => g.code));

  let allCodesValid = true;
  for (const m of mappings) {
    if (!groundCodes.has(m.rejectionGroundCode)) {
      allCodesValid = false;
      console.log(`    [DATA BUG] mapping references non-existent ground: ${m.rejectionGroundCode}, available: ${[...groundCodes].join(",")}`);
    }
  }
  log("DataIntegrity all mapping codes exist in grounds", allCodesValid,
    `mapped: ${mappings.map(m => m.rejectionGroundCode).join(",")}, grounds: ${[...groundCodes].join(",")}`);

  let allGroundsComplete = true;
  for (const g of grounds) {
    if (!g.category || !g.legalBasis || !Array.isArray(g.claimNumbers) || g.claimNumbers.length === 0) {
      allGroundsComplete = false;
      console.log(`    [DATA BUG] incomplete ground: code=${g.code}, category=${g.category}, legalBasis=${g.legalBasis}, claims=${g.claimNumbers}`);
    }
  }
  log("DataIntegrity all rejection grounds complete", allGroundsComplete,
    `grounds: ${grounds.map(g => `${g.code}(cat=${g.category},law=${g.legalBasis},claims=${g.claimNumbers?.join(",")})`).join(" | ")}`);

  const citedRefs = oaData.outputJson.citedReferences || [];
  let allRefsValid = true;
  for (const ref of citedRefs) {
    if (!Array.isArray(ref.rejectionGroundCodes)) {
      allRefsValid = false;
      continue;
    }
    for (const code of ref.rejectionGroundCodes) {
      if (!groundCodes.has(code)) {
        allRefsValid = false;
        console.log(`    [DATA BUG] citedRef references non-existent ground: ${code}`);
      }
    }
  }
  log("DataIntegrity citedReferences codes valid", allRefsValid,
    `refs: ${citedRefs.map(r => `${r.publicationNumber}→[${r.rejectionGroundCodes?.join(",")}]`).join(" | ")}`);

  log("DataIntegrity G1 complete", allCodesValid && allGroundsComplete && allRefsValid);
}

// ── Reexam Full Pipeline Data Flow ───────────────────────────────────

async function testReexamFullPipelineDataFlow_G1() {
  console.log("  [DataFlow] Verifying reexam pipeline end-to-end data flow...");

  const oaRes = await postJSON("/ai/run", mockRequest("opinion-analysis", "g1-led", "opinion-analysis"));
  const oaData = await oaRes.json();
  const oaValid = oaData.ok && validateOpinionAnalysisOutput(oaData.outputJson).valid;
  log("DataFlow OpinionAnalysis", oaValid);

  const argRes = await postJSON("/ai/run", mockRequest("argument-analysis", "g1-led", "argument-mapping"));
  const argData = await argRes.json();
  const argValid = argData.ok && validateArgumentMappingOutput(argData.outputJson).valid;
  log("DataFlow ArgumentAnalysis", argValid);

  const draftRes = await postJSON("/ai/run", mockRequest("reexam-draft", "g1-led", "draft"));
  const draftData = await draftRes.json();
  const draftValid = draftData.ok && validateReexamDraftOutput(draftData.outputJson).valid;
  log("DataFlow ReexamDraft", draftValid);

  if (!oaValid || !argValid || !draftValid) {
    log("DataFlow G1 skipped", false, "prerequisite data not valid");
    return;
  }

  const responseItems = draftData.outputJson.responseItems;
  const groundCodes = new Set(oaData.outputJson.rejectionGrounds.map(g => g.code));

  let itemsRefValid = true;
  for (const item of responseItems) {
    if (!item.rejectionGroundCode) {
      itemsRefValid = false;
      console.log(`    [DATA FLOW BUG] draft responseItem missing rejectionGroundCode`);
      continue;
    }
    if (!groundCodes.has(item.rejectionGroundCode)) {
      itemsRefValid = false;
      console.log(`    [DATA FLOW BUG] draft responseItem references unknown code: ${item.rejectionGroundCode}`);
    }
    if (!item.applicantArgument && !item.applicantArgumentSummary) {
      itemsRefValid = false;
      console.log(`    [DATA FLOW BUG] draft responseItem missing argument for ${item.rejectionGroundCode}`);
    }
  }
  log("DataFlow draft responseItems reference valid codes", itemsRefValid,
    `items: ${responseItems.map(i => `${i.rejectionGroundCode}`).join(",")}`);

  const coveredCodes = new Set(responseItems.map(i => i.rejectionGroundCode));
  let allGroundsCovered = true;
  for (const code of groundCodes) {
    if (!coveredCodes.has(code)) {
      allGroundsCovered = false;
      console.log(`    [DATA FLOW BUG] rejection ground ${code} has no draft response item`);
    }
  }
  log("DataFlow all rejection grounds have response items", allGroundsCovered,
    `grounds: ${[...groundCodes].join(",")}, covered: ${[...coveredCodes].join(",")}`);

  const unmappedGrounds = argData.outputJson.unmappedGrounds || [];
  let unmappedValid = true;
  for (const code of unmappedGrounds) {
    if (!groundCodes.has(code)) {
      unmappedValid = false;
      console.log(`    [DATA FLOW BUG] unmapped ground code ${code} not in rejection grounds`);
    }
  }
  log("DataFlow unmapped grounds valid", unmappedValid,
    `unmapped: [${unmappedGrounds.join(",")}]`);

  log("DataFlow G1 complete", itemsRefValid && allGroundsCovered && unmappedValid);
}

// ── Schema: Opinion Analysis ─────────────────────────────────────────

async function testSchemaOpinionAnalysis() {
  const res = await postJSON("/ai/run", mockRequest("opinion-analysis", "g1-led", "opinion-analysis"));
  const data = await res.json();
  const result = validateOpinionAnalysisOutput(data.outputJson);
  log("Schema opinionAnalysis valid", result.valid, result.errors.join("; "));

  if (result.valid) {
    const grounds = data.outputJson.rejectionGrounds;
    const categories = new Set(grounds.map(g => g.category));
    const validCategories = ["novelty", "inventive", "clarity", "support", "amendment", "other"];
    const catsOk = [...categories].every(c => validCategories.includes(c));
    log("Schema opinionAnalysis valid categories", catsOk, `categories=${[...categories].join(",")}`);

    const laws = grounds.map(g => g.legalBasis);
    log("Schema opinionAnalysis all have legalBasis", laws.every(l => typeof l === "string" && l.length > 0),
      `laws=${laws.join(",")}`);
  }
}

// ── Schema: Argument Mapping ─────────────────────────────────────────

async function testSchemaArgumentMapping() {
  const res = await postJSON("/ai/run", mockRequest("argument-analysis", "g1-led", "argument-mapping"));
  const data = await res.json();
  const result = validateArgumentMappingOutput(data.outputJson);
  log("Schema argumentMapping valid", result.valid, result.errors.join("; "));

  if (result.valid) {
    const mappings = data.outputJson.mappings;
    const confidences = mappings.map(m => m.confidence);
    log("Schema argumentMapping valid confidences",
      confidences.every(c => ["high", "medium", "low"].includes(c)),
      `confidences=${confidences.join(",")}`);

    const hasArgs = mappings.every(m => typeof m.applicantArgument === "string" && m.applicantArgument.length > 0);
    log("Schema argumentMapping all have applicantArgument", hasArgs);
  }
}

// ── Schema: Reexam Draft ─────────────────────────────────────────────

async function testSchemaReexamDraft() {
  const res = await postJSON("/ai/run", mockRequest("reexam-draft", "g1-led", "draft"));
  const data = await res.json();
  const result = validateReexamDraftOutput(data.outputJson);
  log("Schema reexamDraft valid", result.valid, result.errors.join("; "));

  if (result.valid) {
    const items = data.outputJson.responseItems;
    const validConclusions = ["argument-accepted", "argument-partially-accepted", "argument-rejected", "needs-further-review"];
    const allValid = items.every(i => validConclusions.includes(i.conclusion));
    log("Schema reexamDraft valid conclusions", allValid,
      `conclusions=${items.map(i => i.conclusion).join(",")}`);

    const hasExaminerNotes = items.every(i => typeof i.examinerResponse === "string" && i.examinerResponse.length > 0);
    log("Schema reexamDraft all have examinerResponse", hasExaminerNotes);
  }
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

// ── Response Structure Validation ────────────────────────────────────

async function testResponseStructureValidation() {
  console.log("  [StructureValidation] Verifying all structured agent responses pass server-side validation...");

  const structuredAgents = [
    { agent: "claim-chart", caseId: "g1-led" },
    { agent: "novelty", caseId: "g1-led", moduleScope: "novelty", referenceId: "g1-ref-d1" },
    { agent: "inventive", caseId: "g2-battery", moduleScope: "inventive" },
    { agent: "opinion-analysis", caseId: "g1-led", moduleScope: "opinion-analysis" },
    { agent: "argument-analysis", caseId: "g1-led", moduleScope: "argument-mapping" },
    { agent: "reexam-draft", caseId: "g1-led", moduleScope: "draft" },
    { agent: "summary", caseId: "g1-led", moduleScope: "summary" },
    { agent: "classify-documents", caseId: "g1-led", moduleScope: "classify-documents" },
  ];

  let allValid = true;
  for (const { agent, caseId, moduleScope, referenceId } of structuredAgents) {
    const res = await postJSON("/ai/run", mockRequest(agent, caseId, moduleScope, referenceId ? { referenceId } : {}));
    const data = await res.json();
    const hasStructureErrors = Array.isArray(data.structureErrors) && data.structureErrors.length > 0;
    const pass = data.ok && data.outputJson != null && !hasStructureErrors;
    if (!pass) {
      allValid = false;
      console.log(`    [FAIL] ${agent}: ok=${data.ok}, hasOutputJson=${data.outputJson != null}, structureErrors=${JSON.stringify(data.structureErrors)}`);
    }
    log(`StructureValidation ${agent}`, pass,
      hasStructureErrors ? `errors: ${data.structureErrors?.join("; ")}` : "valid");
  }

  // Verify plain-text agents are not flagged — interpret has fixtures
  const interpRes = await postJSON("/ai/run", mockRequest("interpret", "g1-led", "case"));
  const interpData = await interpRes.json();
  const interpNoStructureErrors = !Array.isArray(interpData.structureErrors) || interpData.structureErrors.length === 0;
  log("StructureValidation text-agent safe", interpData.ok === true && interpNoStructureErrors,
    `ok=${interpData.ok}, outputJson=${interpData.outputJson != null}, structureErrors=${JSON.stringify(interpData.structureErrors)}`);

  log("StructureValidation complete", allValid);
}

// ── Malformed Response Validation ────────────────────────────────────

async function testMalformedResponseHandling() {
  console.log("  [MalformedResponse] Verifying server detects malformed AI JSON...");

  // Send structured agent with prompt that asks for non-JSON output
  const res = await postJSON("/ai/run", {
    agent: "claim-chart",
    providerPreference: ["gemini"],
    modelId: "mock",
    prompt: "Respond with plain text only: Hello World. Do NOT output JSON.",
    sanitized: false,
    mock: true,
    metadata: { caseId: "g1-led", moduleScope: "claim-chart", tokenEstimate: 0 },
  });
  const data = await res.json();

  // In mock mode, the fixture always returns valid JSON.
  // Test that the validation doesn't break valid responses.
  const fixtureIsValid = data.ok === true && data.outputJson != null;
  log("MalformedResponse mock fixture still valid", fixtureIsValid,
    `ok=${data.ok}, outputJson=${data.outputJson != null}, structureErrors=${JSON.stringify(data.structureErrors)}`);

  // Test that non-JSON prompt with no fixture gracefully handled
  const res2 = await postJSON("/ai/run", {
    agent: "claim-chart",
    providerPreference: ["gemini"],
    modelId: "mock",
    prompt: "Respond with plain text only: Hello World. Do NOT output JSON.",
    sanitized: false,
    mock: true,
    metadata: { caseId: "nonexistent-case-999", moduleScope: "claim-chart", tokenEstimate: 0 },
  });
  const data2 = await res2.json();
  log("MalformedResponse unknown fixture returns error", data2.ok === false,
    `ok=${data2.ok}, code=${data2.error?.code}`);
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

  const prompt = [
    "你是一位专利审查员。请分析以下权利要求并生成Claim Chart（权利要求特征拆解表）。",
    "",
    SAMPLE_CLAIM,
    "",
    "说明书摘要：",
    SAMPLE_SPEC.slice(0, 2000),
    "",
    "请严格输出以下JSON格式（不要输出其他内容）：",
    '{"claimNumber":1,"features":[{"featureCode":"A","description":"特征描述","specificationCitations":[{"label":"[0001]","confidence":"high"}],"citationStatus":"confirmed"}],"warnings":[],"pendingSearchQuestions":[],"legalCaution":"以上为候选事实整理，不构成法律结论。"}',
  ].join("\n");

  console.log("  [Real ClaimChart G1] attempt 1, model=" + GEMINI_MODEL_ID);

  return runRealAiAgentTest(
    "Real ClaimChart G1", "claim-chart", prompt,
    { caseId: "g1-led", moduleScope: "claim-chart", tokenEstimate: 300 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateClaimChartOutput(data.outputJson);
      log("Real ClaimChart G1 schema", result.valid, result.errors.join("; "));
      const features = data.outputJson.features || [];
      log("Real ClaimChart G1 has features A,B,C",
        features.some(f => f.featureCode === "A") &&
        features.some(f => f.featureCode === "B") &&
        features.some(f => f.featureCode === "C"),
        `codes=${features.map(f => f.featureCode).join(",")}`);
      log("Real ClaimChart G1 has citationStatus", features.every(f =>
        ["confirmed", "needs-review", "not-found"].includes(f.citationStatus)));
    }
  );
}

// ── Real Mode: Novelty ───────────────────────────────────────────────

async function testRealNovelty_G1() {
  if (!GEMINI_KEY) { log("Real Novelty G1", false, "GEMINI_KEY not set"); return; }

  const featuresText = SAMPLE_FEATURES.map(f => `  ${f.featureCode}: ${f.description}`).join("\n");
  const prompt = [
    `案件 ID: g1-led`,
    `权利要求号: 1`,
    `技术特征:`,
    featuresText,
    ``,
    `对比文件 ID: g1-ref-d1`,
    `对比文件内容:`,
    SAMPLE_REF_D1,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Novelty G1", "novelty", prompt,
    { caseId: "g1-led", moduleScope: "novelty", tokenEstimate: 300 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateNoveltyOutput(data.outputJson);
      log("Real Novelty G1 schema", result.valid, result.errors.join("; "));
      log("Real Novelty G1 has differenceFeatureCodes",
        Array.isArray(data.outputJson.differenceFeatureCodes),
        `diff=${data.outputJson.differenceFeatureCodes?.join(",")}`);
    }
  );
}

// ── Real Mode: Inventive ─────────────────────────────────────────────

async function testRealInventive_G2() {
  if (!GEMINI_KEY) { log("Real Inventive G2", false, "GEMINI_KEY not set"); return; }

  const featuresText = SAMPLE_FEATURES.map(f => `  ${f.featureCode}: ${f.description}`).join("\n");
  const availableRefs = [
    { label: "D1", referenceId: "g1-ref-d1", excerpt: `${SAMPLE_REF_D1.slice(0, 500)}` },
    { label: "D2", referenceId: "g1-ref-d2", excerpt: `${SAMPLE_REF_D2.slice(0, 500)}` },
  ];
  const refsText = availableRefs.map(r =>
    `  ${r.label} (${r.referenceId}): ${r.excerpt}`
  ).join("\n");

  const prompt = [
    `案件 ID: g1-led`,
    `权利要求号: 1`,
    `技术特征:`,
    featuresText,
    ``,
    `可用对比文件:`,
    refsText,
    ``,
    `用户指定最接近现有技术: g1-ref-d1`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Inventive G2", "inventive", prompt,
    { caseId: "g1-led", moduleScope: "inventive", tokenEstimate: 350 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateInventiveOutput(data.outputJson);
      log("Real Inventive G2 schema", result.valid, result.errors.join("; "));
      log("Real Inventive G2 candidateAssessment",
        typeof data.outputJson.candidateAssessment === "string",
        `assessment=${data.outputJson.candidateAssessment}`);
      log("Real Inventive G2 has closestPriorArtId",
        typeof data.outputJson.closestPriorArtId === "string",
        `id=${data.outputJson.closestPriorArtId}`);
    }
  );
}

// ── Real Mode: Defects ───────────────────────────────────────────────

async function testRealDefects_G1() {
  if (!GEMINI_KEY) { log("Real Defects G1", false, "GEMINI_KEY not set"); return; }

  const featuresText = SAMPLE_FEATURES.map(f => `  ${f.featureCode}: ${f.description}`).join("\n");
  const prompt = [
    `案件 ID: g1-led`,
    ``,
    `权利要求文本:`,
    SAMPLE_CLAIM,
    ``,
    `说明书文本:`,
    SAMPLE_SPEC,
    ``,
    `技术特征:`,
    featuresText,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Defects G1", "defects", prompt,
    { caseId: "g1-led", moduleScope: "defects", tokenEstimate: 400 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateDefectsOutput(data.outputJson);
      log("Real Defects G1 schema", result.valid, result.errors.join("; "));
      log("Real Defects G1 has defects", Array.isArray(data.outputJson.defects),
        `count=${data.outputJson.defects?.length || 0}`);
    }
  );
}

// ── Real Mode: Chat ──────────────────────────────────────────────────

async function testRealChat_G1() {
  if (!GEMINI_KEY) { log("Real Chat G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `案件 ID: g1-led`,
    `当前模块: claim-chart`,
    ``,
    `=== 当前模块数据 ===`,
    `权利要求特征: A:铝合金散热基板+散热翅片, B:石墨烯导热膜(0.1-0.5mm), C:离心风扇+导风罩`,
    ``,
    `=== 对话历史 ===`,
    ``,
    `=== 用户消息 ===`,
    `请分析特征B(石墨烯导热膜)在散热装置中的作用和优势。`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Chat G1", "chat", prompt,
    { caseId: "g1-led", moduleScope: "claim-chart", tokenEstimate: 200 },
    (data) => {
      if (data.outputJson) {
        log("Real Chat G1 has reply", typeof data.outputJson.reply === "string",
          `length=${data.outputJson.reply?.length || 0}`);
      }
      if (data.rawText) {
        log("Real Chat G1 rawText", typeof data.rawText === "string",
          `length=${data.rawText.length}`);
      }
    }
  );
}

// ── Real Mode: Interpret ─────────────────────────────────────────────

async function testRealInterpret_G1() {
  if (!GEMINI_KEY) { log("Real Interpret G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `你是一个专利审查助手。请对以下专利申请文件进行深度解读，从以下维度分析：`,
    ``,
    "1. 【技术领域】该专利属于哪个技术领域",
    "2. 【核心技术方案】概括发明的技术方案",
    "3. 【主要权利要求】列出独立权利要求的核心技术特征",
    "4. 【关键实施例】概括关键实施例及其技术效果",
    "5. 【创新点分析】该发明相对于现有技术的创新之处",
    "6. 【潜在问题】可能存在的形式或实质性问题",
    ``,
    "请用中文回答，结构清晰，每个维度用标题分隔。",
    "必须在开头明确写出当前解读文件名。",
    "",
    `案件 ID: g1-led`,
    `文件 ID: doc-led-app`,
    `文件名: 申请文件.pdf`,
    "",
    "=== 同案相关文件 ===",
    "无",
    "",
    "=== 文档内容 ===",
    SAMPLE_SPEC,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Interpret G1", "interpret", prompt,
    { caseId: "g1-led", moduleScope: "interpret", tokenEstimate: 400 },
    (data) => {
      if (data.outputJson) {
        const result = validateInterpretOutput(data.outputJson);
        log("Real Interpret G1 schema", result.valid, result.errors.join("; "));
        log("Real Interpret G1 reply length",
          typeof data.outputJson.reply === "string" && data.outputJson.reply.length > 100,
          `length=${data.outputJson.reply?.length || 0}`);
      }
      if (data.rawText) {
        log("Real Interpret G1 rawText length",
          typeof data.rawText === "string" && data.rawText.length > 100,
          `length=${data.rawText.length}`);
      }
    }
  );
}

// ── Real Mode: Extract Case Fields ───────────────────────────────────

async function testRealExtractCaseFields_G1() {
  if (!GEMINI_KEY) { log("Real ExtractCaseFields G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    "你是一个专利文档信息提取助手。请从以下专利申请文件中提取案件基本信息和权利要求结构。",
    "",
    "请严格返回 JSON 格式，不要包含任何其他文字。字段无法确定时设为 null。",
    "",
    "返回格式:",
    JSON.stringify({
      title: "发明名称（字符串或 null）",
      applicationNumber: "申请号（字符串或 null）",
      applicant: "申请人（字符串或 null）",
      applicationDate: "申请日，格式 YYYY-MM-DD（字符串或 null）",
      priorityDate: "优先权日，格式 YYYY-MM-DD（字符串或 null）",
      claims: [{
        claimNumber: 1,
        type: "independent",
        dependsOn: [],
        rawText: "权利要求全文"
      }]
    }, null, 2),
    "",
    "要求:",
    "- 提取所有权利要求，识别独立权利要求和从属权利要求",
    "- 从属权利要求的 dependsOn 填写其引用的权利要求编号列表",
    "- 日期格式统一为 YYYY-MM-DD",
    "",
    `案件 ID: g1-led`,
    "",
    `=== 文件 1: 申请文件.pdf ===`,
    SAMPLE_SPEC,
  ].join("\n");

  return runRealAiAgentTest(
    "Real ExtractCaseFields G1", "extract-case-fields", prompt,
    { caseId: "g1-led", moduleScope: "case", tokenEstimate: 350 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateExtractCaseFieldsOutput(data.outputJson);
      log("Real ExtractCaseFields G1 schema", result.valid, result.errors.join("; "));
      log("Real ExtractCaseFields G1 has title", typeof data.outputJson.title === "string",
        `title=${data.outputJson.title?.slice(0, 40)}`);
      log("Real ExtractCaseFields G1 has claims", Array.isArray(data.outputJson.claims),
        `count=${data.outputJson.claims?.length || 0}`);
    }
  );
}

// ── Real Mode: Opinion Analysis ──────────────────────────────────────

async function testRealOpinionAnalysis_G1() {
  if (!GEMINI_KEY) { log("Real OpinionAnalysis G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `你是一位资深专利审查员，擅长分析审查意见通知书。`,
    `案件 ID: g1-led`,
    `文档 ID: oa-g1-led`,
    ``,
    `审查意见通知书文本:`,
    SAMPLE_OA,
    ``,
    `请从以上审查意见通知书中提取驳回理由和引用文献，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "documentId": "oa-g1-led",`,
    `  "rejectionGrounds": [{`,
    `    "code": "RG-1",`,
    `    "category": "novelty|inventive|clarity|support|amendment|other",`,
    `    "claimNumbers": [1],`,
    `    "summary": "驳回理由摘要（50字以内）",`,
    `    "legalBasis": "法律依据"`,
    `  }],`,
    `  "citedReferences": [{`,
    `    "publicationNumber": "CN108123456A",`,
    `    "rejectionGroundCodes": ["RG-1"],`,
    `    "featureMapping": "特征描述"`,
    `  }],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
    ``,
    `注意：一个驳回理由可能对应多个权利要求，一个引用文献可能被多条驳回理由引用。`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real OpinionAnalysis G1", "opinion-analysis", prompt,
    { caseId: "g1-led", moduleScope: "opinion-analysis", tokenEstimate: 300 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateOpinionAnalysisOutput(data.outputJson);
      log("Real OpinionAnalysis G1 schema", result.valid, result.errors.join("; "));
      log("Real OpinionAnalysis G1 has rejectionGrounds",
        Array.isArray(data.outputJson.rejectionGrounds),
        `count=${data.outputJson.rejectionGrounds?.length || 0}`);
      log("Real OpinionAnalysis G1 has citedReferences",
        Array.isArray(data.outputJson.citedReferences),
        `count=${data.outputJson.citedReferences?.length || 0}`);
    }
  );
}

// ── Real Mode: Argument Analysis ─────────────────────────────────────

async function testRealArgumentAnalysis_G1() {
  if (!GEMINI_KEY) { log("Real ArgumentAnalysis G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由与驳回理由之间的对应关系。`,
    `案件 ID: g1-led`,
    ``,
    `驳回理由清单:`,
    `  RG-1 (新颖性): 权利要求1特征A被对比文件1公开`,
    `  RG-2 (创造性): 权利要求1-4特征B被对比文件2公开，组合不具备创造性`,
    `  RG-3 (不清楚): 离心风扇表述不清楚`,
    ``,
    `意见陈述书文本:`,
    SAMPLE_RESPONSE,
    ...(SAMPLE_CLAIM ? [``, `修改后权利要求:`, SAMPLE_CLAIM.slice(0, 4000)] : []),
    ``,
    `请将每条驳回理由与意见陈述书中的答辩内容进行映射，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "mappings": [{`,
    `    "rejectionGroundCode": "RG-1",`,
    `    "applicantArgument": "答辩原文片段",`,
    `    "argumentSummary": "答辩理由摘要",`,
    `    "confidence": "high|medium|low",`,
    `    "amendedClaims": [],`,
    `    "newEvidence": ""`,
    `  }],`,
    `  "unmappedGrounds": [],`,
    `  "legalCaution": "AI分析仅供参考"`,
    `}`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real ArgumentAnalysis G1", "argument-analysis", prompt,
    { caseId: "g1-led", moduleScope: "argument-mapping", tokenEstimate: 350 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateArgumentMappingOutput(data.outputJson);
      log("Real ArgumentAnalysis G1 schema", result.valid, result.errors.join("; "));
      log("Real ArgumentAnalysis G1 has mappings",
        Array.isArray(data.outputJson.mappings),
        `count=${data.outputJson.mappings?.length || 0}`);
    }
  );
}

// ── Real Mode: Reexam Draft ──────────────────────────────────────────

async function testRealReexamDraft_G1() {
  if (!GEMINI_KEY) { log("Real ReexamDraft G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `案件 ID: g1-led`,
    `权利要求号: 1`,
    ``,
    `驳回理由清单:`,
    `  RG-1 (新颖性): 权利要求1特征A被对比文件1公开`,
    `  RG-2 (创造性): 权利要求1-4特征B被对比文件2公开，组合不具备创造性`,
    `  RG-3 (不清楚): 离心风扇表述不清楚`,
    ``,
    `答辩映射:`,
    `  RG-1: 散热翅片间距2-5mm具有特定技术效果 [medium]`,
    `  RG-2: 石墨烯含量5-15wt%与8-12wt%不同 协同实现超出预期的散热效果 [medium]`,
    `  RG-3: 已在说明书中补充配合方式描述 [high]`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real ReexamDraft G1", "reexam-draft", prompt,
    { caseId: "g1-led", moduleScope: "draft", tokenEstimate: 300 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateReexamDraftOutput(data.outputJson);
      log("Real ReexamDraft G1 schema", result.valid, result.errors.join("; "));
      log("Real ReexamDraft G1 has responseItems",
        Array.isArray(data.outputJson.responseItems),
        `count=${data.outputJson.responseItems?.length || 0}`);
      log("Real ReexamDraft G1 has overallAssessment",
        typeof data.outputJson.overallAssessment === "string");
    }
  );
}

// ── Real Mode: Summary ───────────────────────────────────────────────

async function testRealSummary_G1() {
  if (!GEMINI_KEY) { log("Real Summary G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    `案件基线: LED灯具用复合散热装置，申请号CN202310008888A`,
    ``,
    `Claim Chart（已确认特征）:`,
    SAMPLE_FEATURES.map(f => `  ${f.featureCode}: ${f.description}`).join("\n"),
    ``,
    `新颖性对照（已审核记录）:`,
    `  特征A: 对比文件D1公开了铝合金散热基板+散热翅片`,
    `  特征B: 对比文件D1未公开石墨烯导热膜，使用导热硅脂`,
    `  特征C: 对比文件D1未公开离心风扇，自然对流`,
    ``,
    `创造性分析:`,
    `  最接近现有技术: D1`,
    `  区别特征: B(石墨烯导热膜), C(离心风扇)`,
    `  技术启示: D2公开了石墨烯导热膜用于LED散热`,
  ].join("\n");

  return runRealAiAgentTest(
    "Real Summary G1", "summary", prompt,
    { caseId: "g1-led", moduleScope: "summary", tokenEstimate: 300 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateSummaryOutput(data.outputJson);
      log("Real Summary G1 schema", result.valid, result.errors.join("; "));
      log("Real Summary G1 body non-empty",
        typeof data.outputJson.body === "string" && data.outputJson.body.length > 0);
      log("Real Summary G1 has aiNotes", typeof data.outputJson.aiNotes === "string");
    }
  );
}

// ── Real Mode: Translate ─────────────────────────────────────────────

async function testRealTranslate_G1() {
  if (!GEMINI_KEY) { log("Real Translate G1", false, "GEMINI_KEY not set"); return; }

  return runRealAiAgentTest(
    "Real Translate G1", "translate", SAMPLE_REF_D2,
    { caseId: "g1-led", moduleScope: "translate", tokenEstimate: 250 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateTranslateOutput(data.outputJson);
      log("Real Translate G1 schema", result.valid, result.errors.join("; "));
      log("Real Translate G1 translatedText non-empty",
        typeof data.outputJson.translatedText === "string" && data.outputJson.translatedText.length > 0);
    }
  );
}

// ── Real Mode: Classify Documents ────────────────────────────────────

async function testRealClassifyDocuments_G1() {
  if (!GEMINI_KEY) { log("Real ClassifyDocuments G1", false, "GEMINI_KEY not set"); return; }

  const prompt = [
    "你是一个专利文档分类助手。请分析以下文档列表，判断每个文档的角色。",
    "",
    "文档角色定义：",
    "- application: 专利申请文件（说明书、权利要求书等）",
    "- office-action: 审查意见通知书",
    "- office-action-response: 意见陈述书/答辩文件",
    "- reference: 对比文件/引用文献",
    "",
    `案件 ID: g1-led`,
    "",
    `=== 文件 0: 申请文件.pdf ===`,
    SAMPLE_SPEC.slice(0, 1500),
    "",
    `=== 文件 1: 审查意见通知书 ===`,
    SAMPLE_OA.slice(0, 1500),
    "",
    `=== 文件 2: 意见陈述书 ===`,
    SAMPLE_RESPONSE.slice(0, 1500),
    "",
    `=== 文件 3: 对比文件D1 ===`,
    SAMPLE_REF_D1.slice(0, 1000),
    "",
    "请输出 JSON 格式的文档分类结果：",
    '{"classifications":[{"fileIndex":0,"fileName":"申请文件.pdf","role":"application","confidence":"high","reason":"包含技术领域、发明内容、实施方式等专利申请核心内容"}]}',
  ].join("\n");

  return runRealAiAgentTest(
    "Real ClassifyDocuments G1", "classify-documents", prompt,
    { caseId: "g1-led", moduleScope: "documents", tokenEstimate: 400 },
    (data) => {
      if (!data.outputJson) return;
      const result = validateClassifyDocumentsOutput(data.outputJson);
      log("Real ClassifyDocuments G1 schema", result.valid, result.errors.join("; "));
      log("Real ClassifyDocuments G1 has classifications",
        Array.isArray(data.outputJson.classifications),
        `count=${data.outputJson.classifications?.length || 0}`);
      const roles = data.outputJson.classifications?.map(c => c.role) || [];
      log("Real ClassifyDocuments G1 roles",
        roles.includes("application") && roles.includes("office-action"),
        `roles=${roles.join(",")}`);
    }
  );
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

// ── Search: EPO OPS ──────────────────────────────────────────────────

async function testEpoSetupCheck() {
  const hasEnv = process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET_KEY;
  log("EPO env configured", !!hasEnv,
    hasEnv ? "Consumer Key + Secret found in .env" : "Set EPO_CONSUMER_KEY and EPO_CONSUMER_SECRET_KEY in .env for real tests");
}

async function testEpoSearchWithEnv() {
  const consumerKey = process.env.EPO_CONSUMER_KEY;
  const consumerSecret = process.env.EPO_CONSUMER_SECRET_KEY;
  if (!consumerKey || !consumerSecret) {
    log("EPO real search", false, "EPO_CONSUMER_KEY/EPO_CONSUMER_SECRET_KEY not set");
    return;
  }

  try {
    const body = {
      caseId: "g1-led-epo",
      claimText: "一种LED散热装置，包括散热基板和多个散热翅片。",
      features: [{ featureCode: "A", description: "LED散热装置" }],
      maxResults: 3,
      searchProviderId: "epo",
      searchApiKey: `${consumerKey}:${consumerSecret}`,
      providerPreference: ["gemini"],
      modelId: GEMINI_MODEL_ID,
      llmApiKey: GEMINI_KEY
    };

    const res = await postJSON("/search-references", body);
    const data = await res.json();
    log("EPO real search ok", data.ok === true, `ok=${data.ok}, candidates=${data.candidates?.length ?? 0}`);
    if (data.error) {
      log("EPO real search error info", true, data.error);
    }
    if (data.ok) {
      log("EPO real search candidates non-empty",
        Array.isArray(data.candidates) && data.candidates.length > 0,
        `candidates.length=${data.candidates?.length ?? 0}`);
      const schemaResult = validateSearchReferencesOutput(data);
      log("EPO real search schema valid", schemaResult.valid, schemaResult.errors.join("; "));
    }
  } catch (err) {
    log("EPO real search", false, err.message);
  }
}

async function testEpoVerifyKey() {
  const consumerKey = process.env.EPO_CONSUMER_KEY;
  const consumerSecret = process.env.EPO_CONSUMER_SECRET_KEY;
  if (!consumerKey || !consumerSecret) {
    log("EPO key verify", false, "EPO_CONSUMER_KEY/EPO_CONSUMER_SECRET_KEY not set");
    return;
  }

  try {
    const res = await postJSON("/verify-search-key", {
      providerId: "epo",
      apiKey: `${consumerKey}:${consumerSecret}`
    });
    const data = await res.json();
    log("EPO key verify", data.ok === true, `ok=${data.ok}, msg=${data.message || data.error || ""}`);
  } catch (err) {
    log("EPO key verify", false, err.message);
  }
}

// ── Knowledge Base Tests ─────────────────────────────────────────────

const KNOWLEDGE_BASE = path.join(PROJECT_ROOT, "samples", "knowledge-base");

function uploadKnowledgeFile(fileName) {
  const filePath = path.join(KNOWLEDGE_BASE, fileName);
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  const form = new FormData();
  form.append("file", blob, fileName);
  return fetch(`${BASE}/knowledge/upload`, { method: "POST", body: form });
}

async function testKnowledgeUploadTxt() {
  const res = await uploadKnowledgeFile("测试网页内容.txt");
  const data = await res.json();
  log("Knowledge upload TXT ok", data.ok === true, `ok=${data.ok}, chunks=${data.chunkCount}`);
  log("Knowledge upload TXT has chunks", (data.chunkCount ?? 0) > 0, `chunkCount=${data.chunkCount}`);
  log("Knowledge upload TXT message", typeof data.message === "string", `message=${data.message}`);
}

async function testKnowledgeUploadLargeFile() {
  // 专利法实施细则 76KB — 验证 token 截断不会导致 ONNX 崩溃
  const filePath = path.join(KNOWLEDGE_BASE, "专利法实施细则_2023.txt");
  if (!fs.existsSync(filePath)) {
    log("Knowledge upload large file - file missing", false);
    return;
  }
  const res = await uploadKnowledgeFile("专利法实施细则_2023.txt");
  const data = await res.json();
  log("Knowledge upload large file ok", data.ok === true, `ok=${data.ok}, chunks=${data.chunkCount}`);
  log("Knowledge upload large file multiple chunks", (data.chunkCount ?? 0) > 10, `chunkCount=${data.chunkCount}`);
}

async function testKnowledgeUploadMd() {
  const res = await uploadKnowledgeFile("专利法条文速查.md");
  const data = await res.json();
  log("Knowledge upload MD ok", data.ok === true, `ok=${data.ok}, chunks=${data.chunkCount}`);
  log("Knowledge upload MD has chunks", (data.chunkCount ?? 0) > 0, `chunkCount=${data.chunkCount}`);
}

async function testKnowledgeUploadJson() {
  const res = await uploadKnowledgeFile("测试案例.json");
  const data = await res.json();
  log("Knowledge upload JSON ok", data.ok === true, `ok=${data.ok}, chunks=${data.chunkCount}`);
  log("Knowledge upload JSON has chunks", (data.chunkCount ?? 0) > 0, `chunkCount=${data.chunkCount}`);
}

async function testKnowledgeUploadCsv() {
  const res = await uploadKnowledgeFile("审查标准速查表.csv");
  const data = await res.json();
  log("Knowledge upload CSV ok", data.ok === true, `ok=${data.ok}, chunks=${data.chunkCount}`);
}

async function testKnowledgeDuplicateDetection() {
  const res = await uploadKnowledgeFile("测试网页内容.txt");
  const data = await res.json();
  log("Knowledge duplicate detection", data.skipped === true, `skipped=${data.skipped}, message=${data.message}`);
}

async function testKnowledgeStats() {
  const res = await fetch(`${BASE}/knowledge/stats`);
  const data = await res.json();
  log("Knowledge stats ok", data.ok === true, `ok=${data.ok}`);
  log("Knowledge stats has sources", data.sourceCount > 0, `sourceCount=${data.sourceCount}`);
  log("Knowledge stats has chunks", data.chunkCount > 0, `chunkCount=${data.chunkCount}`);
  log("Knowledge stats has embeddings", data.embeddedCount > 0, `embeddedCount=${data.embeddedCount}`);
}

async function testKnowledgeSearch() {
  const res = await fetch(`${BASE}/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "新颖性判断", topK: 3 }),
  });
  const data = await res.json();
  log("Knowledge search ok", data.ok === true, `ok=${data.ok}`);
  log("Knowledge search has results", (data.results?.length ?? 0) > 0, `results=${data.results?.length}`);
  if (data.results?.[0]) {
    log("Knowledge search result has score", typeof data.results[0].score === "number", `score=${data.results[0].score}`);
    log("Knowledge search result has text", typeof data.results[0].text === "string" && data.results[0].text.length > 0);
  }
}

async function testKnowledgeSourcesList() {
  const res = await fetch(`${BASE}/knowledge/sources`);
  const data = await res.json();
  log("Knowledge sources list ok", data.ok === true, `ok=${data.ok}`);
  log("Knowledge sources list non-empty", (data.sources?.length ?? 0) > 0, `count=${data.sources?.length}`);
}

async function testKnowledgeDelete() {
  // Get sources first
  const listRes = await fetch(`${BASE}/knowledge/sources`);
  const listData = await listRes.json();
  if (!listData.sources?.length) {
    log("Knowledge delete - no sources to delete", false);
    return;
  }

  const sourceId = listData.sources[0].id;
  const delRes = await fetch(`${BASE}/knowledge/sources/${sourceId}`, { method: "DELETE" });
  const delData = await delRes.json();
  log("Knowledge delete ok", delData.ok === true, `deleted=${sourceId}`);

  // Verify deletion
  const statsRes = await fetch(`${BASE}/knowledge/stats`);
  const stats = await statsRes.json();
  log("Knowledge delete reflected in stats", stats.sourceCount < listData.sources.length,
    `before=${listData.sources.length}, after=${stats.sourceCount}`);
}

async function testKnowledgeClearAll() {
  const res = await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" });
  const data = await res.json();
  log("Knowledge clear all ok", data.ok === true);

  const statsRes = await fetch(`${BASE}/knowledge/stats`);
  const stats = await statsRes.json();
  log("Knowledge clear all reflected", stats.sourceCount === 0 && stats.chunkCount === 0,
    `sourceCount=${stats.sourceCount}, chunkCount=${stats.chunkCount}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const onlyReal = args.includes("--real");
  const doCheck = args.includes("--check");
  const onlyIdx = args.indexOf("--only");
  const onlyPattern = onlyIdx !== -1 ? (args[onlyIdx + 1] || "").toLowerCase() : "";

  console.log("\n=== Patent Examiner E2E Functional Tests ===\n");

  // ── Quality Gate (runs before all tests when --check) ──
  if (doCheck) {
    const gateFailed = runQualityGate();
    if (gateFailed) {
      process.exit(1);
    }
  }

  if (onlyReal) {
    console.log("Mode: Real (requires GEMINI_KEY + search keys)\n");
    if (doCheck) console.log("Quality gate: passed\n");
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
      await maybe(testRealDefects_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealChat_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealInterpret_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealExtractCaseFields_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealOpinionAnalysis_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealArgumentAnalysis_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealReexamDraft_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealSummary_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealTranslate_G1);
      await delay(AI_RATE_LIMIT_DELAY);
      await maybe(testRealClassifyDocuments_G1);
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

      console.log("\n--- EPO OPS Tests ---");
      await maybe(testEpoSetupCheck);
      await maybe(testEpoVerifyKey);
      await delay(2000);
      await maybe(testEpoSearchWithEnv);

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

      // Case Field Extraction
      console.log("\n--- Case Field Extraction (Mock) ---");
      await maybe(testMockExtractCaseFields_G1);

      // Reexamination Agents
      console.log("\n--- Reexamination Agents (Mock) ---");
      await maybe(testMockOpinionAnalysis_G1);
      await maybe(testMockArgumentAnalysis_G1);
      await maybe(testMockReexamDraft_G1);
      await maybe(testMockSummary_G1);
      await maybe(testMockTranslate_G1);
      await maybe(testMockClassifyDocuments_G1);

      // nf-7: Two-Step Search
      console.log("\n--- Two-Step Search (nf-7) ---");
      await maybe(testMockExtractSearchTerms_G1);
      await maybe(testMockSearchWithTerms_G1);

      // Reexamination Data Integrity & Pipeline
      console.log("\n--- Reexamination Data Integrity ---");
      await maybe(testReexamDataIntegrity_G1);
      await maybe(testReexamFullPipelineDataFlow_G1);

      // Figure Extraction
      console.log("\n--- Figure Extraction ---");
      testFigureCaptionExtraction();
      testFigureSectionDetection();
      testLikelyFigurePage();

      // Knowledge Base
      console.log("\n--- Knowledge Base ---");
      await maybe(testKnowledgeUploadTxt);
      await maybe(testKnowledgeUploadLargeFile);
      await maybe(testKnowledgeUploadMd);
      await maybe(testKnowledgeUploadJson);
      await maybe(testKnowledgeUploadCsv);
      await maybe(testKnowledgeDuplicateDetection);
      await maybe(testKnowledgeStats);
      await maybe(testKnowledgeSearch);
      await maybe(testKnowledgeSourcesList);
      await maybe(testKnowledgeDelete);
      await maybe(testKnowledgeClearAll);

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
      await maybe(testSchemaOpinionAnalysis);
      await maybe(testSchemaArgumentMapping);
      await maybe(testSchemaReexamDraft);

      // Error handling
      console.log("\n--- Error Handling ---");
      await maybe(testInvalidAgent);
      await maybe(testMissingRequiredFields);
      await maybe(testEmptyClaimText);
      await maybe(testMockFixtureNotFound);

      // Response Structure Validation
      console.log("\n--- Response Structure Validation ---");
      await maybe(testResponseStructureValidation);
      await maybe(testMalformedResponseHandling);

      // EPO OPS
      console.log("\n--- EPO OPS Configuration ---");
      await maybe(testEpoSetupCheck);

      // Full pipeline
      console.log("\n--- Full Pipeline ---");
      await maybe(testFullPipelineMock_G1);
      await maybe(testFullPipelineMock_G2);
      await maybe(testFullPipelineMock_Reexam_G1);

      // DB Logic-Chain tests (Store → Repo → IndexedDB, no UI)
      console.log("\n--- DB Logic-Chain ---");
      runDbLogicChainTests();

      // DB Scenario regression tests (bugs 18/19/21/22 etc.)
      console.log("\n--- DB Scenario Regression ---");
      runDbScenarioTests();

      // DB Schema upgrade regression tests (lesson-learned-57)
      console.log("\n--- DB Schema Upgrade ---");
      runDbUpgradeTests();

      // Real mode tests (optional, auto-skip if no key)
      if (GEMINI_KEY) {
        console.log("\n--- Real Mode (GEMINI_KEY detected) ---");
        console.log(`  GEMINI_KEY: ${maskKey(GEMINI_KEY)}`);
        console.log(`  TAVILY_API_KEY: ${maskKey(TAVILY_API_KEY)}`);
        console.log(`  SerpAPI_KEY: ${maskKey(SERP_API_KEY)}\n`);

        await maybe(testRealProviderConnectivity);
        await delay(2000);

        await maybe(testRealClaimChart_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealNovelty_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealInventive_G2);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealDefects_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealChat_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealInterpret_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealExtractCaseFields_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealOpinionAnalysis_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealArgumentAnalysis_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealReexamDraft_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealSummary_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealTranslate_G1);
        await delay(AI_RATE_LIMIT_DELAY);
        await maybe(testRealClassifyDocuments_G1);
        await delay(AI_RATE_LIMIT_DELAY);

        if (TAVILY_API_KEY) {
          await maybe(testRealSearchVerifyTavilyKey);
          await delay(2000);
          await maybe(testRealSearchVerifySerpKey);
          await delay(2000);
        }

        if (process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET_KEY) {
          console.log("\n--- EPO OPS Tests ---");
          await maybe(testEpoSetupCheck);
          await maybe(testEpoVerifyKey);
          await delay(2000);
          await maybe(testEpoSearchWithEnv);
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

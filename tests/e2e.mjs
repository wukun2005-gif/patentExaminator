#!/usr/bin/env node
/**
 * E2E 测试入口文件
 * ================
 *
 * 替代原来的 e2e-real.mjs，使用拆分后的模块。
 * 保持原有的命令行接口和测试流程。
 *
 * Usage:
 *   # 全量 Mock（默认，推荐日常开发）
 *   node tests/e2e.mjs
 *
 *   # 带前置质量门禁（lint + typecheck，CI 必须）
 *   node tests/e2e.mjs --check
 *
 *   # 根据变更选择（开发时）
 *   node tests/e2e.mjs --only mock        # 所有 Mock 测试
 *   node tests/e2e.mjs --only claimChart  # claim chart 相关
 *   node tests/e2e.mjs --only schema      # Schema 校验
 *   node tests/e2e.mjs --only real        # Real 模式（需 Key）
 *   node tests/e2e.mjs --only pipeline    # 全流程测试
 *
 *   # Real 模式
 *   GEMINI_KEY=xxx node tests/e2e.mjs --real
 */

import { execSync } from "child_process";
import {
  loadEnvFile,
  getApiKey,
  maskKey,
  delay,
  AI_RATE_LIMIT_DELAY,
  SEARCH_RATE_LIMIT_DELAY,
  FILE_TO_TEST_MAP,
  resetResults,
  printSummary,
  allPassed,
} from "./e2e-shared/index.mjs";

// 导入所有测试函数
import {
  testHealthCheck,
  testMockModeEnabled,
  testMockClaimChart_G1,
  testMockClaimChart_G3,
  testMockNovelty_G1,
  testMockInventive_G2,
  testMockInventive_G3_NoRef,
  testMockInterpret_G1,
  testMockOpinionAnalysis_G1,
  testMockArgumentAnalysis_G1,
  testMockReexamDraft_G1,
  testMockSummary_G1,
  testMockTranslate_G1,
  testMockExtractCaseFields_G1,
  testMockClassifyDocuments_G1,
  testMockExtractSearchTerms_G1,
  testMockSearchWithTerms_G1,
  testReexamDataIntegrity_G1,
  testReexamFullPipelineDataFlow_G1,
  testRealProviderConnectivity,
  testRealClaimChart_G1,
  testRealNovelty_G1,
  testRealInventive_G2,
  testRealDefects_G1,
  testRealChat_G1,
  testRealInterpret_G1,
  testRealExtractCaseFields_G1,
  testRealOpinionAnalysis_G1,
  testRealArgumentAnalysis_G1,
  testRealReexamDraft_G1,
  testRealSummary_G1,
  testRealTranslate_G1,
  testRealClassifyDocuments_G1,
  testRealTokenUsageReturned,
  testRealGeminiModelList,
  testRealEpoSearchCandidates,
  testSchemaClaimChart,
  testSchemaNovelty,
  testSchemaInventive,
  testSchemaOpinionAnalysis,
  testSchemaArgumentMapping,
  testSchemaReexamDraft,
  testInvalidAgent,
  testMissingRequiredFields,
  testEmptyClaimText,
  testMockFixtureNotFound,
  testResponseStructureValidation,
  testMalformedResponseHandling,
  testKnowledgeUploadTxt,
  testKnowledgeUploadLargeFile,
  testKnowledgeUploadMd,
  testKnowledgeUploadJson,
  testKnowledgeUploadCsv,
  testKnowledgeDuplicateDetection,
  testKnowledgeStats,
  testKnowledgeSearch,
  testKnowledgeSourcesList,
  testKnowledgeDelete,
  testKnowledgeClearAll,
  testKnowledgeUploadAndSearchChain,
  testKnowledgeSearchResultMetadata,
  testKnowledgeMultiFileUploadAndSearch,
  testKnowledgeProviderTestEndpoint,
  testKnowledgeRerankerIntegration,
  testSampleDataIntegrity,
  testPdfValidity,
  testTxtContent,
  testMdStructure,
  testJsonValidity,
  testCsvContent,
  testXlsxValidity,
  testPngValidity,
  testEmbedderCodeExists,
  testRetrieverCodeExists,
  testPromptInjectorCodeExists,
  testTypeDefinitions,
  testIndexedDbSchema,
  testAgentIntegration,
  testSettingsUI,
  testKnowledgeRepo,
  testNormalizerCodeExists,
  testFileHashField,
  testDocumentCategoryField,
  testFullPipelineMock_G1,
  testFullPipelineMock_G2,
  testFullPipelineMock_Reexam_G1,
} from "./e2e/index.mjs";

// ── 初始化 ──────────────────────────────────────────────────────────

// 加载环境变量
loadEnvFile();

// 获取 API key
const GEMINI_KEY = getApiKey("gemini");
const MIMO_KEY = getApiKey("mimo");
const OPENROUTER_KEY = getApiKey("openrouter");
const TAVILY_API_KEY = getApiKey("tavily");
const SERP_API_KEY = getApiKey("serp");

// ── Quality Gate ────────────────────────────────────────────────────

function runQualityGate() {
  console.log("=== Quality Gate: Lint + TypeCheck ===\n");
  let gateFailed = false;

  console.log("--- TypeCheck ---");
  try {
    execSync("npm run typecheck", {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120000,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    console.log("[PASS] Quality Gate: TypeCheck");
  } catch (err) {
    gateFailed = true;
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const output = (stderr + stdout).split("\n").filter(l => l.includes("error TS")).slice(0, 5).join(" | ");
    console.log(`[FAIL] Quality Gate: TypeCheck - ${output || "typecheck failed"}`);
  }

  console.log("\n--- Lint ---");
  try {
    execSync("npm run lint", {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    console.log("[PASS] Quality Gate: Lint");
  } catch (err) {
    gateFailed = true;
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const errors = (stderr + stdout).split("\n").filter(l => l.includes(" error ") || l.includes(" Error ") || l.match(/^\s*\d+:\d+\s+error/)).slice(0, 5).join(" | ");
    console.log(`[FAIL] Quality Gate: Lint - ${errors || "lint failed"}`);
  }

  if (gateFailed) {
    console.log("\n[GATE FAILED] Lint 或 TypeCheck 未通过，终止测试。请先修复上述错误。\n");
  } else {
    console.log("\n[GATE PASSED] Lint + TypeCheck 全部通过\n");
  }
  return gateFailed;
}

// ── DB 测试（调用 vitest）────────────────────────────────────────────

function runDbLogicChainTests() {
  console.log("\n--- DB Logic-Chain Tests (vitest) ---");
  try {
    execSync("npx vitest run --config vitest.integration.config.ts tests/integration/dbLogicChain.test.ts", {
      cwd: process.cwd(),
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    console.log("[PASS] DB Logic-Chain Tests");
  } catch (err) {
    console.log(`[FAIL] DB Logic-Chain Tests - ${err.message || "vitest failed"}`);
  }
}

function runDbScenarioTests() {
  console.log("\n--- DB Scenario Regression Tests (vitest) ---");
  try {
    execSync("npx vitest run --config vitest.integration.config.ts tests/integration/dbScenario.test.ts", {
      cwd: process.cwd(),
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    console.log("[PASS] DB Scenario Tests");
  } catch (err) {
    console.log(`[FAIL] DB Scenario Tests - ${err.message || "vitest failed"}`);
  }
}

// ── 主函数 ──────────────────────────────────────────────────────────

/**
 * 根据 git diff 变更文件自动选择测试组
 */
function getAutoTestGroups() {
  try {
    const diff = execSync("git diff --name-only HEAD", {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    if (!diff) {
      console.log("  No changed files detected, running all tests\n");
      return null;
    }

    const files = diff.split("\n");
    const groups = new Set();

    for (const file of files) {
      for (const { pattern, groups: fileGroups } of FILE_TO_TEST_MAP) {
        if (pattern.test(file)) {
          fileGroups.forEach((g) => groups.add(g));
        }
      }
    }

    if (groups.size === 0) {
      console.log("  Changed files don't match any test groups, running all tests\n");
      return null;
    }

    console.log(`  Changed files: ${files.length}`);
    console.log(`  Matched groups: ${[...groups].join(", ")}\n`);
    return [...groups];
  } catch {
    console.log("  Failed to get git diff, running all tests\n");
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const onlyReal = args.includes("--real");
  const doCheck = args.includes("--check");
  const doAuto = args.includes("--auto");
  const onlyIdx = args.indexOf("--only");
  const onlyPattern = onlyIdx !== -1 ? (args[onlyIdx + 1] || "").toLowerCase() : "";

  // --auto 模式：根据 git diff 自动选择测试组
  let autoGroups = null;
  if (doAuto && !onlyPattern) {
    autoGroups = getAutoTestGroups();
  }

  console.log("\n=== Patent Examiner E2E Functional Tests ===\n");

  // 重置测试结果
  resetResults();

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
  } else if (doAuto && autoGroups) {
    console.log(`Mode: Auto (${autoGroups.join(", ")})\n`);
  } else if (onlyPattern) {
    console.log(`Mode: Filtered by "${onlyPattern}"\n`);
  } else {
    console.log("Mode: Mock (default, no keys needed)\n");
    console.log("提示：根据 git diff 选择测试组，详见文件顶部注释\n");
  }

  // --only / --auto filter
  // group 参数用于 --auto 模式，标识该测试属于哪个组
  function maybe(fn, ...fnArgs) {
    // --only 模式：按函数名过滤
    if (onlyPattern) {
      const name = fn.name.toLowerCase();
      if (name.includes(onlyPattern)) return fn(...fnArgs);
      console.log(`  ⏭ skipped ${fn.name}`);
      return undefined;
    }
    // --auto 模式：检查函数是否属于匹配的测试组
    if (doAuto && autoGroups) {
      const name = fn.name.toLowerCase();
      const isInGroup = autoGroups.some((g) => {
        // 简单的名称匹配：检查函数名是否包含组名关键词
        if (g === "knowledge") return name.includes("knowledge") && !name.includes("integrity") && !name.includes("pdf") && !name.includes("txt") && !name.includes("md") && !name.includes("json") && !name.includes("csv") && !name.includes("xlsx") && !name.includes("png") && !name.includes("embedder") && !name.includes("retriever") && !name.includes("promptinjector") && !name.includes("typedefinitions") && !name.includes("indexeddb") && !name.includes("agentintegration") && !name.includes("settingsui") && !name.includes("knowledgerepo") && !name.includes("normalizer") && !name.includes("filehash") && !name.includes("documentcategory");
        if (g === "knowledgeIntegration") return name.includes("uploadandsearch") || name.includes("searchresultmetadata") || name.includes("multifile") || name.includes("providertest") || name.includes("reranker");
        if (g === "knowledgeCodeStructure") return name.includes("integrity") || name.includes("pdfvalidity") || name.includes("txtcontent") || name.includes("mdstructure") || name.includes("jsonvalidity") || name.includes("csvcontent") || name.includes("xlsxvalidity") || name.includes("pngvalidity") || name.includes("embedder") || name.includes("retriever") || name.includes("promptinjector") || name.includes("typedefinitions") || name.includes("indexeddb") || name.includes("agentintegration") || name.includes("settingsui") || name.includes("knowledgerepo") || name.includes("normalizer") || name.includes("filehash") || name.includes("documentcategory");
        if (g === "mock") return name.includes("mock") || name.includes("reexam") || name.includes("pipeline");
        if (g === "real") return name.includes("real");
        if (g === "schema") return name.includes("schema") || name.includes("malformed") || name.includes("invalid") || name.includes("missing") || name.includes("empty") || name.includes("fixture") || name.includes("structure");
        if (g === "pipeline") return name.includes("pipeline");
        if (g === "health") return name.includes("health");
        return false;
      });
      if (isInGroup) return fn(...fnArgs);
      console.log(`  ⏭ skipped ${fn.name}`);
      return undefined;
    }
    // 默认模式：运行所有测试
    return fn(...fnArgs);
  }

  try {
    if (onlyReal) {
      // ========== Real Mode Tests ==========
      console.log("--- Key Validation ---");
      console.log(`  MiMo_KEY: ${maskKey(MIMO_KEY)}`);
      console.log(`  GEMINI_KEY: ${maskKey(GEMINI_KEY)}`);
      console.log(`  TAVILY_API_KEY: ${maskKey(TAVILY_API_KEY)}`);
      console.log(`  SerpAPI_KEY: ${maskKey(SERP_API_KEY)}\n`);

      if (!GEMINI_KEY) {
        console.log("ERROR: GEMINI_KEY not set. Required for real mode.\n");
        console.log("  export GEMINI_KEY=xxx node tests/e2e.mjs --real");
        console.log("  or add GEMINI_KEY to .env file\n");
        process.exit(1);
      }

      console.log("--- Provider Connectivity ---");
      await maybe(testRealProviderConnectivity);
      await delay(2000);

      console.log("\n--- Gemini Model List ---");
      await maybe(testRealGeminiModelList);
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

      console.log("\n--- EPO Search ---");
      await maybe(testRealEpoSearchCandidates);

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

      // Knowledge Base (先清空确保干净环境)
      console.log("\n--- Knowledge Base ---");
      const BASE = process.env.TEST_BASE || "http://localhost:3000/api";
      await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" }).catch(() => {});
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

      // Knowledge Integration Tests
      console.log("\n--- Knowledge Integration ---");
      await maybe(testKnowledgeUploadAndSearchChain);
      await maybe(testKnowledgeSearchResultMetadata);
      await maybe(testKnowledgeMultiFileUploadAndSearch);
      await maybe(testKnowledgeProviderTestEndpoint);
      await maybe(testKnowledgeRerankerIntegration);

      // Knowledge Code Structure (不需要服务器)
      console.log("\n--- Knowledge Code Structure ---");
      await maybe(testSampleDataIntegrity);
      await maybe(testPdfValidity);
      await maybe(testTxtContent);
      await maybe(testMdStructure);
      await maybe(testJsonValidity);
      await maybe(testCsvContent);
      await maybe(testXlsxValidity);
      await maybe(testPngValidity);
      await maybe(testEmbedderCodeExists);
      await maybe(testRetrieverCodeExists);
      await maybe(testPromptInjectorCodeExists);
      await maybe(testTypeDefinitions);
      await maybe(testIndexedDbSchema);
      await maybe(testAgentIntegration);
      await maybe(testSettingsUI);
      await maybe(testKnowledgeRepo);
      await maybe(testNormalizerCodeExists);
      await maybe(testFileHashField);
      await maybe(testDocumentCategoryField);

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

      // Full pipeline
      console.log("\n--- Full Pipeline ---");
      await maybe(testFullPipelineMock_G1);
      await maybe(testFullPipelineMock_G2);
      await maybe(testFullPipelineMock_Reexam_G1);

      // DB Logic-Chain tests (Store → Repo → IndexedDB, no UI)
      console.log("\n--- DB Logic-Chain ---");
      await maybe(runDbLogicChainTests);

      // DB Scenario regression tests (bugs 18/19/21/22 etc.)
      console.log("\n--- DB Scenario Regression ---");
      await maybe(runDbScenarioTests);

      // Real mode tests (optional, auto-skip if no key)
      if (GEMINI_KEY) {
        console.log("\n--- Real Mode (GEMINI_KEY detected) ---");
        console.log(`  MiMo_KEY: ${maskKey(MIMO_KEY)}`);
        console.log(`  GEMINI_KEY: ${maskKey(GEMINI_KEY)}`);
        console.log(`  TAVILY_API_KEY: ${maskKey(TAVILY_API_KEY)}`);
        console.log(`  SerpAPI_KEY: ${maskKey(SERP_API_KEY)}\n`);

        await maybe(testRealProviderConnectivity);
        await delay(2000);

        await maybe(testRealGeminiModelList);
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

        await maybe(testRealEpoSearchCandidates);
      } else {
        console.log("\n--- Real Mode (skipped, no GEMINI_KEY) ---");
        console.log("  Set GEMINI_KEY to run real AI tests, or use --real flag\n");
      }
    }
  } catch (err) {
    console.error("\nFATAL:", err.message);
  }

  // ── Summary ──
  const duration = 0;
  printSummary(duration);

  process.exit(allPassed() ? 0 : 1);
}

main().catch((err) => {
  console.error("测试执行失败:", err);
  process.exit(1);
});

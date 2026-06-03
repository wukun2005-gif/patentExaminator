/**
 * Mock 模式 AI Agent 测试
 * =======================
 *
 * 测试 Mock 模式下的各种 AI Agent 功能。
 */

import {
  postJSON,
  log,
  buildMockRequest,
  validateClaimChartOutput,
  validateNoveltyOutput,
  validateInventiveOutput,
  validateOpinionAnalysisOutput,
  validateArgumentMappingOutput,
  validateReexamDraftOutput,
  validateSummaryOutput,
  validateTranslateOutput,
  validateExtractCaseFieldsOutput,
  validateClassifyDocumentsOutput,
  validateSearchReferencesOutput,
  getApiKey,
} from "../e2e-shared/index.mjs";

// ── Mock Mode 基础测试 ──────────────────────────────────────────────

/**
 * 测试 Mock 模式是否启用
 */
export async function testMockModeEnabled() {
  const res = await postJSON("/ai/run", buildMockRequest({ agent: "claim-chart", caseId: "g1-led" }));
  const data = await res.json();
  log("Mock /ai/run returns 200", res.status === 200, `status=${res.status}`);
  log("Mock /ai/run returns ok:true", data.ok === true, `ok=${data.ok}`);
  log("Mock mode no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);
}

// ── Mock: Claim Chart ────────────────────────────────────────────────

export async function testMockClaimChart_G1() {
  const res = await postJSON("/ai/run", buildMockRequest({ agent: "claim-chart", caseId: "g1-led" }));
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

export async function testMockClaimChart_G3() {
  const res = await postJSON("/ai/run", buildMockRequest({ agent: "claim-chart", caseId: "g3-sensor" }));
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

export async function testMockNovelty_G1() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "novelty",
    caseId: "g1-led",
    moduleScope: "novelty",
    extra: { expectedSchemaName: "novelty", referenceId: "g1-ref-d1" },
  }));
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

export async function testMockInventive_G2() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "inventive",
    caseId: "g2-battery",
    moduleScope: "inventive",
  }));
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

export async function testMockInventive_G3_NoRef() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "inventive",
    caseId: "g3-sensor",
    moduleScope: "inventive",
  }));
  const data = await res.json();
  log("Mock Inventive G3 (no ref) ok", data.ok === true, `ok=${data.ok}`);
  log("Mock Inventive G3 no structureErrors",
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  const result = validateInventiveOutput(data.outputJson);
  log("Mock Inventive G3 schema valid", result.valid, result.errors.join("; "));
}

// ── Mock: Interpret ──────────────────────────────────────────────────

export async function testMockInterpret_G1() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "interpret",
    caseId: "g1-led",
    moduleScope: "case",
  }));
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

// ── Mock: Reexamination Agents（表驱动）────────────────────────────

// 通用 mock agent 测试辅助函数
async function runMockAgentTest(label, agent, moduleScope, validator, extraChecks) {
  const res = await postJSON("/ai/run", buildMockRequest({ agent, caseId: "g1-led", moduleScope }));
  const data = await res.json();
  log(`Mock ${label} ok`, data.ok === true, `ok=${data.ok}`);
  log(`Mock ${label} has outputJson`, data.outputJson != null);
  log(`Mock ${label} no structureErrors`,
    !Array.isArray(data.structureErrors) || data.structureErrors.length === 0,
    `structureErrors=${JSON.stringify(data.structureErrors)}`);

  if (validator && data.outputJson) {
    const result = validator(data.outputJson);
    log(`Mock ${label} schema valid`, result.valid, result.errors.join("; "));
  }

  if (extraChecks && data.outputJson) {
    extraChecks(data.outputJson, label);
  }
}

// 复审 agent 测试定义
const REEXAM_TESTS = [
  { label: "OpinionAnalysis", agent: "opinion-analysis", moduleScope: "opinion-analysis", validator: validateOpinionAnalysisOutput,
    extra: (o, l) => { const g = o.rejectionGrounds; log(`Mock ${l} has rejectionGrounds`, Array.isArray(g) && g.length >= 1, `count=${g?.length}`); }},
  { label: "ArgumentAnalysis", agent: "argument-analysis", moduleScope: "argument-mapping", validator: validateArgumentMappingOutput,
    extra: (o, l) => { const m = o.mappings; log(`Mock ${l} has mappings`, Array.isArray(m) && m.length >= 1, `count=${m?.length}`); }},
  { label: "ReexamDraft", agent: "reexam-draft", moduleScope: "draft", validator: validateReexamDraftOutput,
    extra: (o, l) => { const i = o.responseItems; log(`Mock ${l} has responseItems`, Array.isArray(i) && i.length >= 1, `count=${i?.length}`); }},
  { label: "Summary", agent: "summary", moduleScope: "summary", validator: validateSummaryOutput,
    extra: (o, l) => { log(`Mock ${l} body non-empty`, typeof o.body === "string" && o.body.length > 0); log(`Mock ${l} has aiNotes`, typeof o.aiNotes === "string"); }},
  { label: "Translate", agent: "translate", moduleScope: "translate", validator: validateTranslateOutput,
    extra: (o, l) => { log(`Mock ${l} translatedText non-empty`, typeof o.translatedText === "string" && o.translatedText.length > 0); }},
  { label: "ExtractCaseFields", agent: "extract-case-fields", moduleScope: "case", validator: validateExtractCaseFieldsOutput,
    extra: (o, l) => { log(`Mock ${l} has claims`, Array.isArray(o.claims) && o.claims.length > 0, `count=${o.claims?.length}`); log(`Mock ${l} has title`, typeof o.title === "string" && o.title.length > 0); }},
  { label: "ClassifyDocuments", agent: "classify-documents", moduleScope: "classify-documents", validator: validateClassifyDocumentsOutput,
    extra: (o, l) => { const r = (o.classifications || []).map(c => c.role); log(`Mock ${l} has application`, r.includes("application")); log(`Mock ${l} has reference`, r.includes("reference")); log(`Mock ${l} has office-action`, r.includes("office-action")); }},
];

// 生成导出函数
for (const t of REEXAM_TESTS) {
  const fn = async () => runMockAgentTest(`${t.label} G1`, t.agent, t.moduleScope, t.validator, t.extra);
  Object.defineProperty(fn, "name", { value: `testMock${t.label}_G1` });
  // 动态导出需要通过全局对象
  globalThis[`testMock${t.label}_G1`] = fn;
}

export const testMockOpinionAnalysis_G1 = globalThis.testMockOpinionAnalysis_G1;
export const testMockArgumentAnalysis_G1 = globalThis.testMockArgumentAnalysis_G1;
export const testMockReexamDraft_G1 = globalThis.testMockReexamDraft_G1;
export const testMockSummary_G1 = globalThis.testMockSummary_G1;
export const testMockTranslate_G1 = globalThis.testMockTranslate_G1;
export const testMockExtractCaseFields_G1 = globalThis.testMockExtractCaseFields_G1;
export const testMockClassifyDocuments_G1 = globalThis.testMockClassifyDocuments_G1;

// ── Mock: Two-Step Search ────────────────────────────────────────────

export async function testMockExtractSearchTerms_G1() {
  const res = await postJSON("/extract-search-terms", {
    caseId: "g1-led",
    claimText: "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。",
    features: [
      { featureCode: "A", description: "散热基板" },
      { featureCode: "B", description: "导热界面层" },
      { featureCode: "C", description: "风冷模块" }
    ],
    mock: true,
  });
  const data = await res.json();
  const ok = data.ok && Array.isArray(data.queries) && data.queries.length >= 1 && data.featureCount === 3;
  log("MockExtractSearchTerms_G1: returns queries", ok,
    ok ? `queries=${data.queries.length}` : JSON.stringify(data));
}

export async function testMockSearchWithTerms_G1() {
  const GEMINI_KEY = getApiKey("gemini");
  if (!GEMINI_KEY) { log("MockSearchWithTerms_G1: response schema", true, "skipped (no GEMINI_KEY)"); log("MockSearchWithTerms_G1: has candidates", true, "skipped"); return; }
  const res = await postJSON("/search-with-terms", {
    caseId: "g1-led",
    claimText: "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。",
    features: [
      { featureCode: "A", description: "散热基板" },
      { featureCode: "B", description: "导热界面层" }
    ],
    searchQueries: ["LED散热器 相变材料", "LED heatsink phase change"],
    maxResults: 5,
    mock: true,
    llmApiKey: GEMINI_KEY,
  });
  const data = await res.json();
  const schemaResult = validateSearchReferencesOutput(data);
  log("MockSearchWithTerms_G1: response schema", schemaResult.valid, schemaResult.errors.join(", "));
  log("MockSearchWithTerms_G1: has candidates", data.candidates?.length > 0, `count=${data.candidates?.length}`);
}

// ── Mock: Reexam Data Integrity ──────────────────────────────────────

export async function testReexamDataIntegrity_G1() {
  console.log("  [DataIntegrity] Verifying opinion-analysis ↔ argument-analysis cross-reference...");

  const oaRes = await postJSON("/ai/run", buildMockRequest({
    agent: "opinion-analysis",
    caseId: "g1-led",
    moduleScope: "opinion-analysis",
  }));
  const oaData = await oaRes.json();
  const oaOk = oaData.ok && validateOpinionAnalysisOutput(oaData.outputJson).valid;
  log("DataIntegrity OpinionAnalysis loaded", oaOk);

  const argRes = await postJSON("/ai/run", buildMockRequest({
    agent: "argument-analysis",
    caseId: "g1-led",
    moduleScope: "argument-mapping",
  }));
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
}

export async function testReexamFullPipelineDataFlow_G1() {
  console.log("  [Pipeline] Testing full reexam pipeline data flow...");

  // Step 1: Opinion Analysis
  const oaRes = await postJSON("/ai/run", buildMockRequest({
    agent: "opinion-analysis",
    caseId: "g1-led",
    moduleScope: "opinion-analysis",
  }));
  const oaData = await oaRes.json();
  const oaValid = oaData.ok && validateOpinionAnalysisOutput(oaData.outputJson).valid;
  log("Pipeline Step 1: OpinionAnalysis", oaValid);

  if (!oaValid) {
    log("Pipeline G1 skipped", false, "OpinionAnalysis failed");
    return;
  }

  // Step 2: Argument Analysis
  const argRes = await postJSON("/ai/run", buildMockRequest({
    agent: "argument-analysis",
    caseId: "g1-led",
    moduleScope: "argument-mapping",
  }));
  const argData = await argRes.json();
  const argValid = argData.ok && validateArgumentMappingOutput(argData.outputJson).valid;
  log("Pipeline Step 2: ArgumentAnalysis", argValid);

  if (!argValid) {
    log("Pipeline G1 skipped", false, "ArgumentAnalysis failed");
    return;
  }

  // Step 3: Reexam Draft
  const draftRes = await postJSON("/ai/run", buildMockRequest({
    agent: "reexam-draft",
    caseId: "g1-led",
    moduleScope: "draft",
  }));
  const draftData = await draftRes.json();
  const draftValid = draftData.ok && validateReexamDraftOutput(draftData.outputJson).valid;
  log("Pipeline Step 3: ReexamDraft", draftValid);

  // Verify data flow integrity
  const grounds = oaData.outputJson.rejectionGrounds;
  const mappings = argData.outputJson.mappings;
  const items = draftData.outputJson?.responseItems || [];

  log("Pipeline data flow: grounds → mappings → items",
    grounds.length > 0 && mappings.length > 0 && items.length > 0,
    `grounds=${grounds.length}, mappings=${mappings.length}, items=${items.length}`);
}

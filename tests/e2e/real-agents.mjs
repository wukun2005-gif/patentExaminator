/**
 * Real 模式 AI Agent 测试
 * =======================
 *
 * 测试真实 AI Provider 调用，需要 API key。
 */

import {
  postJSON,
  getJSONWithParams,
  log,
  delay,
  isRetryableError,
  isAuthError,
  FallbackModelManager,
  OpenRouterModelManager,
  getApiKey,
  getModelId,
  validateClaimChartOutput,
  validateNoveltyOutput,
  validateInventiveOutput,
  validateOpinionAnalysisOutput,
  validateArgumentMappingOutput,
  validateReexamDraftOutput,
  validateSummaryOutput,
  validateTranslateOutput,
  validateExtractCaseFieldsOutput,
  validateInterpretOutput,
  validateClassifyDocumentsOutput,
  validateSearchReferencesOutput,
  GEMINI_FALLBACK_MODELS,
  AI_RATE_LIMIT_DELAY,
  SEARCH_RATE_LIMIT_DELAY,
  SAMPLE_CLAIM_G1,
  SAMPLE_SPEC_G1,
  SAMPLE_REF_D1,
  SAMPLE_REF_D2,
  SAMPLE_OA_G1,
  SAMPLE_RESPONSE_G1,
} from "../e2e-shared/index.mjs";

// ── Real AI 测试辅助函数 ────────────────────────────────────────────

/**
 * 运行 Real 模式的 AI Agent 测试
 */
async function runRealAiAgentTest(label, agent, prompt, metadata, onResponse) {
  const GEMINI_KEY = getApiKey("gemini");
  const MIMO_KEY = getApiKey("mimo");
  const OPENROUTER_KEY = getApiKey("openrouter");
  const MIMO_MODEL_ID = getModelId("mimo");
  const GEMINI_MODEL_ID = getModelId("gemini");

  const body = {
    agent,
    providerPreference: ["gemini", "openrouter"],
    modelId: GEMINI_MODEL_ID,
    prompt,
    sanitized: false,
    metadata,
    ...(GEMINI_KEY && { apiKey: GEMINI_KEY }),
  };

  // ── MiMo Stage (first priority) ──
  if (MIMO_KEY) {
    console.log(`  [${label}] trying MiMo first (model=${MIMO_MODEL_ID}, key: ...${MIMO_KEY.slice(-4)})`);
    try {
      const mimoBody = {
        ...body,
        providerPreference: ["mimo"],
        modelId: MIMO_MODEL_ID,
        apiKey: MIMO_KEY,
      };
      const res = await postJSON("/ai/run", mimoBody);
      if (isAuthError(res.status)) {
        console.log(`  [${label}] MiMo auth failed (401/403), falling back to Gemini`);
      } else {
        const data = await res.json();

        if (!data.ok && data.error && isRetryableError(data.error.message)) {
          console.log(`  [${label}] MiMo retryable: ${data.error.message}, falling back to Gemini`);
        } else if (data.ok) {
          log(`${label} ok (MiMo)`, true, `model=${MIMO_MODEL_ID}`);
          if (Array.isArray(data.structureErrors) && data.structureErrors.length > 0) {
            log(`${label} (MiMo) output quality`, false,
              `structure validation failed: ${data.structureErrors.join("; ")}`);
          }
          if (data.tokenUsage) {
            log(`${label} token usage`, typeof data.tokenUsage.input === "number",
              `in=${data.tokenUsage.input}, out=${data.tokenUsage.output}`);
          }
          if (onResponse) onResponse(data);
          if (data.outputJson) {
            const text = typeof data.outputJson === "string" ? data.outputJson : JSON.stringify(data.outputJson);
            log(`${label} output not empty`, text.length > 5, `length=${text.length}`);
          }
          return data;
        } else {
          console.log(`  [${label}] MiMo failed: ${data.error?.message || "unknown"}, falling back to Gemini`);
        }
      }
    } catch (err) {
      console.log(`  [${label}] MiMo error: ${err.message}, falling back to Gemini`);
    }
  } else {
    console.log(`  [${label}] [skip] MiMo_KEY not set, falling back to Gemini`);
  }

  // ── Gemini Stage ──
  const geminiManager = new FallbackModelManager(GEMINI_FALLBACK_MODELS);
  for (let attempt = 0; attempt < GEMINI_FALLBACK_MODELS.length; attempt++) {
    body.modelId = attempt === 0 ? GEMINI_MODEL_ID : geminiManager.getNext();
    const labelWithAttempt = attempt > 0 ? `${label} retry-${attempt}` : label;
    if (attempt > 0) console.log(`  [${labelWithAttempt}] attempt ${attempt + 1}, model=${body.modelId}`);

    try {
      const res = await postJSON("/ai/run", body);
      if (isAuthError(res.status)) {
        log(label, false, "Auth failed (401), check GEMINI_KEY");
        return false;
      }

      const data = await res.json();

      if (!data.ok && data.error && isRetryableError(data.error.message)) {
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
        const waitMs = 15000 + attempt * 5000;
        console.log(`  [${labelWithAttempt}] error: ${err.message}, retrying in ${waitMs}ms...`);
        await delay(waitMs);
        continue;
      }
      console.log(`  [${labelWithAttempt}] all Gemini models exhausted: ${err.message}`);
    }
  }

  // ── OpenRouter Stage ──
  if (OPENROUTER_KEY) {
    const openrouterManager = new OpenRouterModelManager();
    let openrouterResult;
    while ((openrouterResult = openrouterManager.getNext())) {
      const { id: openrouterModelId, label: openrouterLabel, attempt: openrouterAttempt } = openrouterResult;
      console.log(`  [${label}] trying OpenRouter: ${openrouterLabel} (attempt ${openrouterAttempt + 1})`);

      try {
        if (openrouterAttempt > 0) {
          const waitMs = 10000 + openrouterAttempt * 5000;
          await delay(waitMs);
        }

        const openrouterBody = {
          ...body,
          providerPreference: ["openrouter"],
          modelId: openrouterModelId,
          apiKey: OPENROUTER_KEY,
        };
        const res = await postJSON("/ai/run", openrouterBody);
        const data = await res.json();

        if (!data.ok) {
          const errMsg = data.error?.message || "unknown error";
          if (isRetryableError(errMsg)) {
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
        console.log(`  [${label}] OpenRouter ${openrouterLabel} error: ${err.message}`);
      }
    }
  }

  log(`${label} all providers exhausted`, false);
  return null;
}

// ── Real Mode Tests ─────────────────────────────────────────────────

export async function testRealProviderConnectivity() {
  const GEMINI_KEY = getApiKey("gemini");
  if (!GEMINI_KEY) {
    log("Real Provider Connectivity", false, "GEMINI_KEY not set");
    return;
  }

  const res = await postJSON("/ai/run", {
    agent: "claim-chart",
    providerPreference: ["gemini"],
    modelId: getModelId("gemini"),
    prompt: "Test connectivity",
    sanitized: false,
    metadata: { caseId: "connectivity-test", moduleScope: "test", tokenEstimate: 10 },
    apiKey: GEMINI_KEY,
  });

  const data = await res.json();
  log("Real Provider Connectivity", data.ok === true, `ok=${data.ok}`);
}

export async function testRealClaimChart_G1() {
  const prompt = `请将以下权利要求拆解为技术特征：\n${SAMPLE_CLAIM_G1}`;
  const result = await runRealAiAgentTest(
    "Real ClaimChart G1",
    "claim-chart",
    prompt,
    { caseId: "g1-led", moduleScope: "claim-chart", tokenEstimate: 500 },
    (data) => {
      if (data.outputJson) {
        const validation = validateClaimChartOutput(data.outputJson);
        log("Real ClaimChart G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealNovelty_G1() {
  const prompt = `请分析以下对比文件相对于权利要求1的新颖性：\n\n权利要求：\n${SAMPLE_CLAIM_G1}\n\n对比文件：\n${SAMPLE_REF_D1}`;
  const result = await runRealAiAgentTest(
    "Real Novelty G1",
    "novelty",
    prompt,
    { caseId: "g1-led", moduleScope: "novelty", tokenEstimate: 800, mockKey: "g1-led:g1-ref-d1" },
    (data) => {
      if (data.outputJson) {
        const validation = validateNoveltyOutput(data.outputJson);
        log("Real Novelty G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealInventive_G2() {
  const prompt = `请基于三步法分析以下权利要求的创造性：\n${SAMPLE_CLAIM_G1}\n\n对比文件1：\n${SAMPLE_REF_D1}\n\n对比文件2：\n${SAMPLE_REF_D2}`;
  const result = await runRealAiAgentTest(
    "Real Inventive G1",
    "inventive",
    prompt,
    { caseId: "g1-led", moduleScope: "inventive", tokenEstimate: 1000 },
    (data) => {
      if (data.outputJson) {
        const validation = validateInventiveOutput(data.outputJson);
        log("Real Inventive G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealDefects_G1() {
  const prompt = `请检查以下权利要求是否存在形式缺陷：\n${SAMPLE_CLAIM_G1}`;
  const result = await runRealAiAgentTest(
    "Real Defects G1",
    "defects",
    prompt,
    { caseId: "g1-led", moduleScope: "defects", tokenEstimate: 500 }
  );
}

export async function testRealChat_G1() {
  const prompt = "请简要解释LED散热装置的技术原理。";
  const result = await runRealAiAgentTest(
    "Real Chat G1",
    "chat",
    prompt,
    { caseId: "g1-led", moduleScope: "chat", tokenEstimate: 300 }
  );
}

export async function testRealInterpret_G1() {
  const prompt = `请解读以下专利说明书：\n${SAMPLE_SPEC_G1.slice(0, 500)}`;
  const result = await runRealAiAgentTest(
    "Real Interpret G1",
    "interpret",
    prompt,
    { caseId: "g1-led", moduleScope: "interpret", tokenEstimate: 600 },
    (data) => {
      if (data.outputJson) {
        const validation = validateInterpretOutput(data.outputJson);
        log("Real Interpret G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealExtractCaseFields_G1() {
  const prompt = `请从以下文本中提取案件字段：\n申请号：CN202310008888A\n发明名称：一种LED灯具用复合散热装置\n${SAMPLE_CLAIM_G1}`;
  const result = await runRealAiAgentTest(
    "Real ExtractCaseFields G1",
    "extract-case-fields",
    prompt,
    { caseId: "g1-led", moduleScope: "case", tokenEstimate: 400 },
    (data) => {
      if (data.outputJson) {
        const validation = validateExtractCaseFieldsOutput(data.outputJson);
        log("Real ExtractCaseFields G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealOpinionAnalysis_G1() {
  const prompt = `请分析以下审查意见通知书：\n${SAMPLE_OA_G1}`;
  const result = await runRealAiAgentTest(
    "Real OpinionAnalysis G1",
    "opinion-analysis",
    prompt,
    { caseId: "g1-led", moduleScope: "opinion-analysis", tokenEstimate: 800 },
    (data) => {
      if (data.outputJson) {
        const validation = validateOpinionAnalysisOutput(data.outputJson);
        log("Real OpinionAnalysis G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealArgumentAnalysis_G1() {
  const prompt = `请分析以下意见陈述书：\n${SAMPLE_RESPONSE_G1}`;
  const result = await runRealAiAgentTest(
    "Real ArgumentAnalysis G1",
    "argument-analysis",
    prompt,
    { caseId: "g1-led", moduleScope: "argument-mapping", tokenEstimate: 600 },
    (data) => {
      if (data.outputJson) {
        const validation = validateArgumentMappingOutput(data.outputJson);
        log("Real ArgumentAnalysis G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealReexamDraft_G1() {
  const prompt = `请生成复审意见草稿：\n审查意见：\n${SAMPLE_OA_G1}\n\n申请人答辩：\n${SAMPLE_RESPONSE_G1}`;
  const result = await runRealAiAgentTest(
    "Real ReexamDraft G1",
    "reexam-draft",
    prompt,
    { caseId: "g1-led", moduleScope: "draft", tokenEstimate: 1000 },
    (data) => {
      if (data.outputJson) {
        const validation = validateReexamDraftOutput(data.outputJson);
        log("Real ReexamDraft G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealSummary_G1() {
  const prompt = `请生成案件摘要：\n发明名称：一种LED灯具用复合散热装置\n${SAMPLE_CLAIM_G1}`;
  const result = await runRealAiAgentTest(
    "Real Summary G1",
    "summary",
    prompt,
    { caseId: "g1-led", moduleScope: "summary", tokenEstimate: 500 },
    (data) => {
      if (data.outputJson) {
        const validation = validateSummaryOutput(data.outputJson);
        log("Real Summary G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealTranslate_G1() {
  const prompt = "请将以下英文翻译为中文：A thermal management system using graphene-enhanced thermal interface material between LED array and aluminum substrate.";
  const result = await runRealAiAgentTest(
    "Real Translate G1",
    "translate",
    prompt,
    { caseId: "g1-led", moduleScope: "translate", tokenEstimate: 200 },
    (data) => {
      if (data.outputJson) {
        const validation = validateTranslateOutput(data.outputJson);
        log("Real Translate G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealClassifyDocuments_G1() {
  const prompt = `请对以下文档进行分类：\n1. ${SAMPLE_CLAIM_G1.slice(0, 100)}\n2. ${SAMPLE_OA_G1.slice(0, 100)}\n3. ${SAMPLE_REF_D1.slice(0, 100)}`;
  const result = await runRealAiAgentTest(
    "Real ClassifyDocuments G1",
    "classify-documents",
    prompt,
    { caseId: "g1-led", moduleScope: "classify-documents", tokenEstimate: 400 },
    (data) => {
      if (data.outputJson) {
        const validation = validateClassifyDocumentsOutput(data.outputJson);
        log("Real ClassifyDocuments G1 schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  );
}

export async function testRealTokenUsageReturned() {
  const GEMINI_KEY = getApiKey("gemini");
  if (!GEMINI_KEY) {
    log("Real TokenUsage", false, "GEMINI_KEY not set");
    return;
  }

  const res = await postJSON("/ai/run", {
    agent: "chat",
    providerPreference: ["gemini"],
    modelId: getModelId("gemini"),
    prompt: "Hello",
    sanitized: false,
    metadata: { caseId: "token-test", moduleScope: "chat", tokenEstimate: 10 },
    apiKey: GEMINI_KEY,
  });

  const data = await res.json();
  if (data.ok) {
    const hasUsage = data.tokenUsage && typeof data.tokenUsage.input === "number" && typeof data.tokenUsage.output === "number";
    log("Real TokenUsage returned", hasUsage,
      hasUsage ? `input=${data.tokenUsage.input}, output=${data.tokenUsage.output}` : "missing tokenUsage");
  } else {
    log("Real TokenUsage returned", false, `request failed: ${data.error?.message}`);
  }
}

// ── Real: Gemini Model List ─────────────────────────────────────────

export async function testRealGeminiModelList() {
  const GEMINI_KEY = getApiKey("gemini");
  if (!GEMINI_KEY) {
    log("Real GeminiModelList", true, "skipped (no GEMINI_KEY)");
    return;
  }

  try {
    const res = await getJSONWithParams("/providers/gemini/models", { apiKey: GEMINI_KEY });
    const data = await res.json();

    if (!res.ok) {
      log("Real GeminiModelList", false, data.error || `HTTP ${res.status}`);
      return;
    }

    const models = data.models || [];
    const hasValidModels = models.length > 0;
    log("Real GeminiModelList", hasValidModels,
      hasValidModels
        ? `found ${models.length} models: ${models.slice(0, 5).join(", ")}${models.length > 5 ? "..." : ""}`
        : "no models returned");
  } catch (err) {
    log("Real GeminiModelList", false, err.message);
  }
}

// ── Real: EPO Search Candidates ─────────────────────────────────────

export async function testRealEpoSearchCandidates() {
  const epoKey = getApiKey("epo");
  const epoSecret = getApiKey("epoSecret");
  const GEMINI_KEY = getApiKey("gemini");

  if (!epoKey || !epoSecret) {
    log("Real EPO Search", true, "skipped (no EPO_CONSUMER_KEY / EPO_CONSUMER_SECRET_KEY)");
    return;
  }
  if (!GEMINI_KEY) {
    log("Real EPO Search", true, "skipped (no GEMINI_KEY)");
    return;
  }

  try {
    const res = await postJSON("/search-references", {
      caseId: "g1-led-epo",
      claimText: SAMPLE_CLAIM_G1.slice(0, 300),
      features: [{ featureCode: "A", description: "LED散热装置" }],
      maxResults: 3,
      searchProviderId: "epo",
      searchApiKey: `${epoKey}:${epoSecret}`,
      providerPreference: ["gemini"],
      modelId: getModelId("gemini"),
      llmApiKey: GEMINI_KEY,
    });
    const data = await res.json();

    const ok = data.ok === true;
    log("Real EPO Search ok", ok, ok ? "success" : data.error?.message || "failed");

    if (ok) {
      const candidates = data.candidates || [];
      // EPO 搜索可能返回空结果（取决于查询词和数据库匹配度）
      log("Real EPO Search candidates", true,
        `count=${candidates.length}${candidates.length === 0 ? " (no matches in EPO)" : ""}`);

      if (candidates.length > 0) {
        const validation = validateSearchReferencesOutput(data);
        log("Real EPO Search schema valid", validation.valid, validation.errors.join("; "));
      }
    }
  } catch (err) {
    log("Real EPO Search", false, err.message);
  }
}

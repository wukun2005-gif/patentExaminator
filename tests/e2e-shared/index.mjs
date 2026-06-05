/**
 * E2E 测试共享模块索引
 * ====================
 *
 * 统一导出所有共享模块，方便使用。
 */

// 配置模块
export {
  GEMINI_FALLBACK_MODELS,
  AI_RATE_LIMIT_DELAY,
  SEARCH_RATE_LIMIT_DELAY,
  REAL_MODE_TEST_TIMEOUT,
  RETRY_BASE_DELAY,
  RETRY_DELAY_INCREMENT,
  GEMINI_FALLBACK_BASE_DELAY,
  GEMINI_FALLBACK_DELAY_INCREMENT,
  OPENROUTER_FALLBACK_BASE_DELAY,
  OPENROUTER_FALLBACK_DELAY_INCREMENT,
  FILE_TO_TEST_MAP,
  SAMPLES_KNOWLEDGE_DIR,
  SILICONFLOW_BASE_URL,
} from "./config.mjs";

// 环境变量模块
export {
  loadEnvFile,
  getApiKey,
  getModelId,
  getTestBase,
  maskKey,
} from "./env.mjs";

// HTTP 工具模块
export {
  postJSON,
  getJSON,
  getJSONWithParams,
  parseSSEResponse,
} from "./http.mjs";

// 重试逻辑模块
export {
  delay,
  isRetryableError,
  isAuthError,
  FallbackModelManager,
  OpenRouterModelManager,
} from "./retry.mjs";

// Schema 验证模块
export {
  validateClaimChartOutput,
  validateNoveltyOutput,
  validateInventiveOutput,
  validateSearchReferencesOutput,
  validateOpinionAnalysisOutput,
  validateArgumentMappingOutput,
  validateReexamDraftOutput,
  validateSummaryOutput,
  validateExtractCaseFieldsOutput,
  validateInterpretOutput,
  validateTranslateOutput,
  validateClassifyDocumentsOutput,
  validateDefectsOutput,
} from "./schema-validators.mjs";

// 文件上传模块
export {
  uploadKnowledgeFile,
} from "./upload.mjs";

// 测试数据模块
export {
  SAMPLE_CLAIM_G1,
  SAMPLE_SPEC_G1,
  SAMPLE_REF_D1,
  SAMPLE_REF_D2,
  SAMPLE_OA_G1,
  SAMPLE_RESPONSE_G1,
  SAMPLE_CLAIM_G2,
  buildMockRequest,
} from "./sample-data.mjs";

// 测试运行器模块
export {
  resetResults,
  log,
  getSummary,
  printSummary,
  allPassed,
  assert,
  printSkipped,
} from "./test-runner.mjs";

// 服务器生命周期模块（B-042: E2E 数据库隔离）
export {
  startIsolatedServer,
} from "./server-lifecycle.mjs";

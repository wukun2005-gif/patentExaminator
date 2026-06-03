/**
 * E2E 测试共享模块索引
 * ====================
 *
 * 统一导出所有共享模块，方便使用。
 */

// 配置模块
export {
  API_KEY_NAMES,
  DEFAULT_MODEL_IDS,
  GEMINI_FALLBACK_MODELS,
  OPENROUTER_FALLBACK_MODELS,
  OPENROUTER_MAX_ATTEMPTS_PER_MODEL,
  RETRYABLE_ERROR_KEYWORDS,
  BANNED_MODEL_PATTERNS,
  AI_RATE_LIMIT_DELAY,
  SEARCH_RATE_LIMIT_DELAY,
  REAL_MODE_TEST_TIMEOUT,
  RETRY_BASE_DELAY,
  RETRY_DELAY_INCREMENT,
  DEFAULT_TEST_BASE,
  KNOWLEDGE_TEST_PORT,
  KNOWLEDGE_TEST_BASE,
  FILE_TO_TEST_MAP,
} from "./config.mjs";

// 环境变量模块
export {
  loadEnvFile,
  getEnvVars,
  getEnv,
  getApiKey,
  getModelId,
  getTestBase,
  hasApiKey,
  maskKey,
  getAllApiKeys,
  printEnvSummary,
} from "./env.mjs";

// HTTP 工具模块
export {
  postJSON,
  getJSON,
  getJSONWithParams,
  uploadFile,
  parseJsonResponse,
  parseSSEResponse,
} from "./http.mjs";

// 重试逻辑模块
export {
  delay,
  getExponentialBackoff,
  isRetryableError,
  isAuthError,
  isQuotaError,
  FallbackModelManager,
  OpenRouterModelManager,
  withRetry,
} from "./retry.mjs";

// Schema 验证模块
export {
  validateCitation,
  validateClaimChartOutput,
  validateNoveltyOutput,
  validateInventiveOutput,
  validateSearchReferencesOutput,
  validateOpinionAnalysisOutput,
  validateArgumentMappingOutput,
  validateReexamDraftOutput,
  validateSummaryOutput,
  validateDefectsOutput,
  validateExtractCaseFieldsOutput,
  validateInterpretOutput,
  validateTranslateOutput,
  validateClassifyDocumentsOutput,
  SCHEMA_VALIDATORS,
  getValidator,
} from "./schema-validators.mjs";

// 文件上传模块
export {
  uploadKnowledgeFile,
  uploadMultipleFiles,
  uploadDirectory,
} from "./upload.mjs";

// 测试数据模块
export {
  SAMPLE_CLAIM_G1,
  SAMPLE_SPEC_G1,
  SAMPLE_REF_D1,
  SAMPLE_REF_D2,
  SAMPLE_OA_G1,
  SAMPLE_RESPONSE_G1,
  SAMPLE_FEATURES_G1,
  SAMPLE_CLAIM_G2,
  SAMPLE_CLAIM_G3,
  buildMockRequest,
  TEST_CASE_IDS,
  SAMPLE_SEARCH_QUERIES_G1,
  SAMPLE_SEARCH_REQUEST_G1,
} from "./sample-data.mjs";

// 测试运行器模块
export {
  resetResults,
  setSuiteName,
  log,
  runTest,
  runTests,
  getSummary,
  printSummary,
  allPassed,
  getFailures,
  assert,
  assertEqual,
  assertIncludes,
  assertNotEmpty,
  assertMinLength,
  printGroupTitle,
  printSeparator,
  printSkipped,
} from "./test-runner.mjs";

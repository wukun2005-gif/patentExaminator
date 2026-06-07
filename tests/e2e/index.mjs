/**
 * E2E 测试模块索引
 * ================
 *
 * 统一导出所有 E2E 测试函数。
 */

// 健康检查测试
export { testHealthCheck } from "./health.mjs";

// Mock 模式 AI Agent 测试
export {
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
} from "./mock-agents.mjs";

// Real 模式 AI Agent 测试
export {
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
  testRealEpoSearchCandidates,
} from "./real-agents.mjs";

// Schema 验证测试
export {
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
  testExtractFromUrlValidation,
} from "./schema-validation.mjs";

// 知识库测试
export {
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
} from "./knowledge.mjs";

// 知识库代码结构测试
export {
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
  testKnowledgeDbSchema,
  testAgentIntegration,
  testSettingsUI,
  testKnowledgeRepo,
  testNormalizerCodeExists,
  testFileHashField,
  testDocumentCategoryField,
} from "./knowledge-code-structure.mjs";

// 全链路流水线测试
export {
  testFullPipelineMock_G1,
  testFullPipelineMock_G2,
  testFullPipelineMock_Reexam_G1,
} from "./pipeline.mjs";

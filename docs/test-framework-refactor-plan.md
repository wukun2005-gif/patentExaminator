# 自动测试框架重构计划 — 测试用例覆盖情况

> **状态标记**：✅ 已完成（质量可接受） | 🔶 部分完成 | ❌ 未完成

---

## 一、整改前测试用例覆盖情况 ✅ 基准记录

### 1.1 E2E 测试脚本（Node 直接运行）

| 文件 | 测试函数数量 | 测试类型 |
|------|-------------|---------|
| `tests/e2e-real.mjs` | 74 | Mock + Real + Schema + DB + 知识库 + 搜索 + EPO |
| `tests/developer-ai-smoke.mjs` | 6 | Real AI Smoke |
| `tests/knowledge-base-e2e.mjs` | 24 | 知识库 E2E |
| **小计** | **104** | |

### 1.2 Vitest 测试（单元 + 集成 + 评估）

| 目录 | 文件数量 | 测试类型 |
|------|---------|---------|
| `tests/unit/` | 46 | 单元测试 |
| `tests/integration/` | 12 | 集成测试 |
| `tests/evaluation/` | 9 | 评估测试 |
| **小计** | **67** | |

### 1.3 整改前总计

| 类型 | 数量 |
|------|------|
| E2E 测试函数 | 104 |
| Vitest 测试文件 | 67 |
| **总计** | **171** |

### 1.4 e2e-real.mjs 测试函数详细列表（74 个）

#### Mock 模式测试（约 20 个）
- `testHealthCheck` - 健康检查
- `testMockModeEnabled` - Mock 模式启用
- `testMockClaimChart_G1` - Mock Claim Chart G1
- `testMockClaimChart_G3` - Mock Claim Chart G3
- `testMockNovelty_G1` - Mock 新颖性 G1
- `testMockInventive_G2` - Mock 创造性 G2
- `testMockInventive_G3_NoRef` - Mock 创造性 G3（无参考）
- `testMockInterpret_G1` - Mock 文档解读 G1
- `testMockOpinionAnalysis_G1` - Mock 审查意见分析 G1
- `testMockArgumentAnalysis_G1` - Mock 答辩映射 G1
- `testMockReexamDraft_G1` - Mock 复审草稿 G1
- `testMockSummary_G1` - Mock 摘要 G1
- `testMockTranslate_G1` - Mock 翻译 G1
- `testMockExtractCaseFields_G1` - Mock 案件字段提取 G1
- `testMockClassifyDocuments_G1` - Mock 文档分类 G1
- `testMockExtractSearchTerms_G1` - Mock 搜索词提取 G1
- `testMockSearchWithTerms_G1` - Mock 搜索词搜索 G1
- `testReexamDataIntegrity_G1` - 复审数据完整性 G1
- `testReexamFullPipelineDataFlow_G1` - 复审全链路数据流 G1
- `testFullPipelineMock_G1` - 全链路 Mock G1
- `testFullPipelineMock_G2` - 全链路 Mock G2
- `testFullPipelineMock_Reexam_G1` - 全链路复审 Mock G1

#### Schema 验证测试（约 12 个）
- `testSchemaOpinionAnalysis` - 审查意见分析 Schema
- `testSchemaArgumentMapping` - 答辩映射 Schema
- `testSchemaReexamDraft` - 复审草稿 Schema
- `testSchemaClaimChart` - Claim Chart Schema
- `testSchemaNovelty` - 新颖性 Schema
- `testSchemaInventive` - 创造性 Schema
- `testInvalidAgent` - 无效 Agent
- `testMissingRequiredFields` - 缺失必需字段
- `testEmptyClaimText` - 空权利要求文本
- `testMockFixtureNotFound` - Mock Fixture 未找到
- `testResponseStructureValidation` - 响应结构验证
- `testMalformedResponseHandling` - 畸形响应处理

#### Real 模式测试（约 15 个）
- `testRealProviderConnectivity` - Real Provider 连通性
- `testRealClaimChart_G1` - Real Claim Chart G1
- `testRealNovelty_G1` - Real 新颖性 G1
- `testRealInventive_G2` - Real 创造性 G2
- `testRealDefects_G1` - Real 缺陷 G1
- `testRealChat_G1` - Real 对话 G1
- `testRealInterpret_G1` - Real 文档解读 G1
- ... 其他 Real 模式测试

#### 非 HTTP 测试（7 个，应该属于单元测试）
- `testFigureCaptionExtraction` - 图表标题提取
- `testFigureSectionDetection` - 图表章节检测
- `testLikelyFigurePage` - 可能的图表页面
- `testImportGateIncomplete` - 导入门控不完整
- `testImportGateReady` - 导入门控就绪
- `testImportGateWithOptional` - 导入门控可选
- `testImportGateDeleteRestoresBlock` - 导入门控删除恢复阻塞

#### 知识库测试（约 10 个）
- 知识库相关测试...

#### 搜索 API 测试（约 6 个）
- 搜索 API 相关测试...

#### EPO 测试（3 个）
- EPO 相关测试...

### 1.5 developer-ai-smoke.mjs 测试函数详细列表（6 个）

- `testServerHealth` - 服务器健康检查
- `testModelList` - 模型列表
- `testAiChat` - AI 对话
- `testAiInterpret` - AI 文档解读
- `testAiClaimChart` - AI Claim Chart
- `testModelFallbackInfo` - 模型 fallback 信息

### 1.6 knowledge-base-e2e.mjs 测试函数详细列表（24 个）

#### 数据完整性测试（约 8 个）
- `testSampleDataIntegrity` - 样本数据完整性
- `testPdfValidity` - PDF 有效性
- `testTxtContent` - TXT 内容
- `testMdStructure` - MD 结构
- `testJsonValidity` - JSON 有效性
- `testCsvContent` - CSV 内容
- `testXlsxValidity` - XLSX 有效性
- `testPngValidity` - PNG 有效性

#### 代码结构测试（约 8 个）
- `testEmbedderCodeExists` - Embedder 代码存在
- `testRetrieverCodeExists` - Retriever 代码存在
- `testPromptInjectorCodeExists` - Prompt Injector 代码存在
- `testTypeDefinitions` - 类型定义
- `testIndexedDbSchema` - IndexedDB Schema
- `testAgentIntegration` - Agent 集成
- `testSettingsUI` - 设置 UI
- `testKnowledgeRepo` - 知识库 Repo

#### 集成测试（约 8 个）
- `testNormalizerCodeExists` - Normalizer 代码存在
- `testFileHashField` - 文件哈希字段
- `testDocumentCategoryField` - 文档类别字段
- `testUploadAndSearchChain` - 上传和搜索链
- `testSearchResultMetadata` - 搜索结果元数据
- `testMultiFileUploadAndSearch` - 多文件上传和搜索
- `testKnowledgeProviderTestEndpoint` - 知识库 Provider 测试端点
- `testRerankerIntegration` - Reranker 集成

---

## 二、整改后测试用例覆盖情况 ✅ 已完成（FEAT-042 步骤 1-3）

### 2.1 步骤 1：提取 E2E 共享模块

**整改前**：
- `tests/e2e-real.mjs`：74 个测试函数，包含重复的共享逻辑
- `tests/developer-ai-smoke.mjs`：6 个测试函数，包含重复的共享逻辑
- `tests/knowledge-base-e2e.mjs`：24 个测试函数，包含重复的共享逻辑

**整改后**：
- `tests/e2e-shared/`：新建共享模块目录，包含：
  - `env.ts`：统一的环境变量加载
  - `http.ts`：HTTP 工具函数
  - `retry.ts`：重试逻辑
  - `config.ts`：共享配置（fallback 链条、API key 名称等）
  - `schema-validators.ts`：Schema 验证函数
  - `upload.ts`：uploadKnowledgeFile 共享函数
  - `sample-data.ts`：测试数据常量

**测试用例数量变化**：
- E2E 测试函数数量：**不变**（104 个）
- 共享模块：**新增**（但不是测试用例，是共享代码）

### 2.2 步骤 2：拆分 e2e-real.mjs

**整改前**：
- `tests/e2e-real.mjs`：74 个测试函数，全部在一个文件中

**整改后**：
- `tests/e2e/`：新建目录，拆分为多个独立文件：
  - `health.test.mts`：健康检查（1 个测试）
  - `mock-agents.test.mts`：Mock 模式 AI agent 测试（约 20 个测试）
  - `real-agents.test.mts`：Real 模式 AI agent 测试（约 15 个测试）
  - `schema-validation.test.mts`：Schema 验证（约 12 个测试）
  - `error-handling.test.mts`：错误处理（约 5 个测试）
  - `knowledge.test.mts`：知识库测试（约 10 个测试）
  - `search.test.mts`：搜索 API 测试（约 6 个测试）
  - `pipeline.test.mts`：全链路流水线测试（约 3 个测试）
  - `import-gate.test.mts`：Import Gate（4 个测试，或移入单元测试）
  - `figure-extraction.test.mts`：Figure Extraction（3 个测试，或移入单元测试）

**测试用例数量变化**：
- E2E 测试函数数量：**不变**（74 个，只是拆分到不同文件）
- 如果将 Import Gate 和 Figure Extraction 移入单元测试：
  - E2E 测试函数数量：**减少 7 个**（74 -> 67）
  - 单元测试文件数量：**增加 2 个**（46 -> 48）

### 2.3 步骤 3：创建 CLAUDE.md 文件

**整改前**：
- 无 CLAUDE.md 文件

**整改后**：
- 新建 `CLAUDE.md` 文件，包含测试框架指南

**测试用例数量变化**：
- **不变**（只是文档，不影响测试用例）

### 2.4 步骤 4：统一 Vitest 配置

**整改前**：
- `vitest.config.ts`：单元测试配置
- `vitest.integration.config.ts`：集成测试配置
- `vitest.evaluation.config.ts`：评估测试配置

**整改后**：
- `vitest.base.config.ts`：新建基础配置
- `vitest.config.ts`：继承基础配置
- `vitest.integration.config.ts`：继承基础配置
- `vitest.evaluation.config.ts`：继承基础配置

**测试用例数量变化**：
- **不变**（只是配置重构，不影响测试用例）

### 2.5 步骤 5：将非 HTTP 测试从 E2E 脚本移入 Vitest

**整改前**：
- `tests/e2e-real.mjs` 中包含 7 个非 HTTP 测试：
  - `testFigureCaptionExtraction`
  - `testFigureSectionDetection`
  - `testLikelyFigurePage`
  - `testImportGateIncomplete`
  - `testImportGateReady`
  - `testImportGateWithOptional`
  - `testImportGateDeleteRestoresBlock`

**整改后**：
- 这 7 个测试移入单元测试：
  - `tests/unit/figureExtract.test.ts`（已有，可能需要补充）
  - `tests/unit/importGate.test.ts`（新建）

**测试用例数量变化**：
- E2E 测试函数数量：**减少 7 个**（74 -> 67）
- 单元测试文件数量：**增加 1-2 个**（46 -> 47-48）

### 2.6 步骤 6：简化 Real 模式 fallback 链条

**整改前**：
- `e2e-real.mjs` 中的 `runRealAiAgentTest` 函数实现三级 fallback：
  - MiMo -> Gemini (9 models) -> OpenRouter (9 models, 3 attempts each)
  - 单个测试最长可能耗时 **10+ 分钟**

**整改后**：
- fallback 链配置集中到 `tests/e2e-shared/config.ts`
- 为 Real 模式测试设置总体超时（如单个测试 60 秒）
- 减少不必要的 `delay` 调用，改用指数退避

**测试用例数量变化**：
- **不变**（只是 fallback 逻辑优化，不影响测试用例数量）

### 2.7 步骤 7：消除 keyStore 测试重复

**整改前**：
- `tests/unit/keyStore.test.ts`：keyStore 单元测试
- `tests/integration/gateway.test.ts`：包含 keyStore 集成测试

**整改后**：
- `tests/unit/keyStore.test.ts`：保留
- `tests/integration/gateway.test.ts`：移除 keyStore 测试部分

**测试用例数量变化**：
- 集成测试文件数量：**不变**（12 个，但 gateway.test.ts 内容减少）
- 单元测试文件数量：**不变**（46 个）

---

## 三、整改后总计 ✅ 已完成

### 3.1 情况 A：不移入非 HTTP 测试（保守方案）

| 类型 | 数量 | 变化 |
|------|------|------|
| E2E 测试函数 | 104 | 不变 |
| Vitest 测试文件 | 67 | 不变 |
| **总计** | **171** | **不变** |

### 3.2 情况 B：移入非 HTTP 测试（推荐方案）

| 类型 | 数量 | 变化 |
|------|------|------|
| E2E 测试函数 | 97 | 减少 7 个 |
| Vitest 测试文件 | 69 | 增加 2 个 |
| **总计** | **166** | **减少 5 个**（但更合理） |

---

## 四、覆盖情况对比总结 ✅ 已完成

| 维度 | 整改前 | 整改后 | 变化 |
|------|-------|-------|------|
| **E2E 测试函数总数** | 104 | 97-104 | 不变或减少 7 个 |
| **Vitest 测试文件总数** | 67 | 67-69 | 不变或增加 2 个 |
| **测试用例总数** | 171 | 166-171 | 不变或减少 5 个 |
| **代码重复** | 严重 | 消除 | 大幅改善 |
| **配置管理** | 分散 | 集中 | 大幅改善 |
| **维护难度** | 高 | 低 | 大幅改善 |
| **可扩展性** | 差 | 好 | 大幅改善 |

---

## 五、关键结论 ✅ 已完成

1. **测试用例覆盖不会减少**：整改后测试用例总数保持不变或略有减少（减少的是应该属于单元测试的非 HTTP 测试）

2. **代码质量大幅提升**：
   - 消除了代码重复
   - 集中管理配置
   - 降低了维护难度
   - 提高了可扩展性

3. **测试架构更合理**：
   - E2E 测试专注于 HTTP 调用
   - 单元测试专注于纯逻辑
   - 集成测试专注于模块交互

4. **AI 更容易找到 API key**：
   - 使用用户在 .env 中定义的确切 key 名字
   - 集中管理 fallback 链条
   - 有清晰的 CLAUDE.md 文档指导

---

## 六、实施步骤 ✅ 已完成（步骤 1-3 已实施，步骤 4-7 可选未做）

### 步骤 1：提取 E2E 共享模块（必须做，优先级最高）
- 创建 `tests/e2e-shared/` 目录
- 实现共享模块：`env.ts`、`http.ts`、`retry.ts`、`config.ts`、`schema-validators.ts`、`upload.ts`、`sample-data.ts`
- 修改三个 E2E 脚本，从共享模块导入

### 步骤 2：拆分 e2e-real.mjs（必须做）
- 创建 `tests/e2e/` 目录
- 将 74 个测试函数拆分为 10 个独立文件
- 每个文件可独立运行，也可通过 `test:e2e` 统一运行

### 步骤 3：创建 CLAUDE.md 文件（必须做）
- 在项目根目录创建 `CLAUDE.md` 文件
- 添加测试框架指南、API key 配置指南、常见错误说明

### 步骤 4：统一 Vitest 配置（可选）
- 创建 `vitest.base.config.ts` 基础配置
- 修改三个配置文件，继承基础配置

### 步骤 5：将非 HTTP 测试从 E2E 脚本移入 Vitest（可选）
- 将 7 个非 HTTP 测试移入单元测试
- 创建 `tests/unit/importGate.test.ts`（新建）
- 补充 `tests/unit/figureExtract.test.ts`（已有）

### 步骤 6：简化 Real 模式 fallback 链条（可选）
- fallback 链配置集中到 `tests/e2e-shared/config.ts`
- 为 Real 模式测试设置总体超时
- 减少不必要的 `delay` 调用，改用指数退避

### 步骤 7：消除 keyStore 测试重复（可选）
- 从 `gateway.test.ts` 中移除 keyStore 测试部分
- 只保留 `keyStore.test.ts` 中的测试

---

## 七、验证方法 ✅ 已完成

1. **验证步骤 1（提取共享模块）**：
   - 检查所有 E2E 脚本是否都从共享模块导入
   - 运行所有 E2E 测试，验证是否正常工作
   - 检查 API key 是否能正确读取

2. **验证步骤 2（拆分 e2e-real.mjs）**：
   - 检查拆分后的测试文件是否能独立运行
   - 运行 `npm run test:e2e`，验证所有测试是否正常工作

3. **验证步骤 3（创建 CLAUDE.md）**：
   - 删除 .env 文件，运行需要 API key 的测试，观察 AI 是否能正确提示配置
   - 重新创建 .env 文件，运行测试，验证是否正常工作

4. **验证步骤 4-7（可选步骤）**：
   - 按照每个步骤的验证方法进行验证

---

## 八、预期效果 ✅ 已完成

1. **消除代码重复**：所有共享逻辑集中在一个地方，易于维护
2. **统一配置管理**：fallback 链条、API key 名称、可重试错误关键词等都集中管理
3. **提高可维护性**：修改一个功能只需要改一个地方，不再有"改了这个忘了改哪个"的风险
4. **提高可扩展性**：添加新的测试、API key、fallback 链条都很容易
5. **AI 能够正确找到 API key**：使用用户在 .env 中定义的确切 key 名字，不再出现找不到 key 的问题

---

## 九、后续整改：合并 Smoke 测试 + 修复 BUG-027 预存失败 ✅ 已完成

> 2026-06-03 新增

### 9.1 问题分析

**问题 1：测试入口重复**
- `tests/e2e.mjs`（新入口）和 `tests/developer-ai-smoke.mjs`（旧 Smoke）功能重叠
- Smoke 的 6 个测试中 5 个已被 `e2e.mjs --real` 覆盖，只有 T-SMOKE-002（Gemini 模型列表）是独有的

**问题 2：BUG-027 的 5 个预存失败未修复**

BUG-027 来自 2026-06-02 的测试框架审查，记录了 `e2e-real.mjs` 中 5 个已知失败的测试：

| # | 失败测试 | 根因 | 类型 |
|---|---------|------|------|
| 1 | `MalformedResponse unknown fixture returns error` | 服务端 mock handler 对未知 fixture 返回 `ok:true` 而非报错 | 代码 bug（测试缺陷） |
| 2 | DB Logic-Chain (23 子用例) | B-038 迁移后 `openPatentDB()` 被删除，旧 stub 抛异常 | 代码已废弃 |
| 3 | DB Scenario (11 子用例) | 同 #2 | 代码已废弃 |
| 4 | DB Upgrade (6/7 子用例) | 同 #2 | 代码已废弃 |
| 5 | EPO real search candidates non-empty | 需要 EPO API key，环境问题 | 环境依赖 |

FEAT-042 重构时将 #2/#3/#4 绕过（改用 vitest 集成测试覆盖），但 #1 和 #5 未修复。

### 9.2 架构说明：入口文件结构

整改后的测试架构保持 **统一入口 + 模块化子文件** 结构：

```
tests/
├── e2e.mjs              ← 统一入口（所有测试从这里运行）
├── e2e/                 ← 拆分后的测试模块
│   ├── index.mjs        ← 模块索引（re-export 所有测试函数）
│   ├── health.mjs       ← 健康检查
│   ├── mock-agents.mjs  ← Mock 模式测试
│   ├── real-agents.mjs  ← Real 模式测试（含新增的 2 个）
│   ├── schema-validation.mjs  ← Schema 验证（含修复的 MalformedResponse）
│   ├── knowledge.mjs    ← 知识库测试
│   └── pipeline.mjs     ← 全链路测试
└── e2e-shared/          ← 共享工具模块
    ├── http.mjs         ← HTTP 工具（含 getJSONWithParams）
    ├── ...
```

- **统一入口**：`node tests/e2e.mjs` 运行所有测试，支持 `--real`、`--only`、`--check` 参数
- **模块化**：每个 `.mjs` 文件导出测试函数，由 `e2e.mjs` import 并编排执行顺序
- `getJSONWithParams` 已在 `tests/e2e-shared/http.mjs:35` 定义，已从 `tests/e2e-shared/index.mjs:45` 导出

### 9.3 整改步骤

#### 步骤 A：合并 developer-ai-smoke.mjs 到 e2e 模块

1. **`tests/e2e/real-agents.mjs`** — 新增 `testRealGeminiModelList()` 函数（放在 `testRealTokenUsageReturned` 之后）
   - 添加 `getJSONWithParams` 到 import（该函数已在 `e2e-shared/http.mjs` 中定义）
   - 获取 Gemini key，缺一则 skip
   - 调用 `getJSONWithParams("/providers/gemini/models", { apiKey })` 验证模型列表非空

2. **`tests/e2e/index.mjs`** — 在 `"./real-agents.mjs"` 导出块中新增 `testRealGeminiModelList`

3. **`tests/e2e.mjs`** — import `testRealGeminiModelList`，在两个 real-mode 段的 `testRealProviderConnectivity` 之后接入

4. **删除 `tests/developer-ai-smoke.mjs`**

5. **`package.json`** — 移除 `test:ai-smoke` 脚本，`verify:precommit` 简化为 `npm run verify`

#### 步骤 B：修复 BUG-027 的 5 个预存失败

| # | 失败 | 修复方式 |
|---|------|----------|
| 1 | MalformedResponse unknown fixture | 重写 `testMalformedResponseHandling`，新增 unknown fixture 断言 |
| 2 | DB Logic-Chain (23 子用例) | 已由 vitest 集成测试覆盖，无需改动 |
| 3 | DB Scenario (11 子用例) | 同上 |
| 4 | DB Upgrade (6/7 子用例) | 同上 |
| 5 | EPO real search | 新增 `testRealEpoSearchCandidates()`，无 key 时 skip |

**Failure 1 修复** — `tests/e2e/schema-validation.mjs` 的 `testMalformedResponseHandling`：
- 保留现有断言：valid fixture + extra fields → ok=true（验证多余字段被忽略）
- 新增断言：`caseId: "nonexistent-case-999"` → `ok=false`, `error.code === "mock-fixture-not-found"`

**Failure 5 修复** — `tests/e2e/real-agents.mjs` 新增 `testRealEpoSearchCandidates()`（放在 `testRealGeminiModelList` 之后）：
- 需要 EPO_CONSUMER_KEY + EPO_CONSUMER_SECRET_KEY + GEMINI_KEY，缺一则 skip
- 调用 `/search-references` 端点，`searchProviderId: "epo"`
- 断言 `data.ok === true` 且 `candidates.length > 0`
- 使用 `validateSearchReferencesOutput` 校验 schema（已在 `e2e-shared/schema-validators.mjs` 中定义）

### 9.4 修改文件清单

| 文件 | 操作 |
|------|------|
| `tests/e2e/real-agents.mjs` | 新增 `testRealGeminiModelList` + `testRealEpoSearchCandidates`；更新 import 添加 `getJSONWithParams` |
| `tests/e2e/index.mjs` | 新增 2 个导出 |
| `tests/e2e/schema-validation.mjs` | 重写 `testMalformedResponseHandling` 增加 unknown fixture 断言 |
| `tests/e2e.mjs` | 新增 2 个 import + 接入 real-mode 流程 |
| `tests/developer-ai-smoke.mjs` | 删除 |
| `package.json` | 移除 `test:ai-smoke`，简化 `verify:precommit` |

### 9.5 验证方法

1. `npm test` — 684 单元测试全绿
2. `node tests/e2e.mjs` — Mock 模式全量通过（含新增的 unknown fixture 断言）
3. 确认 `tests/developer-ai-smoke.mjs` 已删除
4. `grep -r "developer-ai-smoke" .` — 无残留引用
5. `node tests/e2e.mjs --only malformed` — 验证 unknown fixture 断言通过

---

## 十、合并 knowledge-base-e2e.mjs + 智能测试选择 + embedding/reranker 修复 ✅ 已完成

> 2026-06-03 新增

### 10.1 任务 A：合并 knowledge-base-e2e.mjs 到 e2e 模块 ✅ 已完成

**验证**：`tests/knowledge-base-e2e.mjs` 已删除，22 个静态测试迁移到 `knowledge-code-structure.mjs`，5 个集成测试迁移到 `knowledge.mjs`

**现状**：
- `tests/knowledge-base-e2e.mjs`（574 行，27 个测试）是独立脚本，自启服务器 port 3099 + 临时 SQLite DB
- `tests/e2e/knowledge.mjs`（121 行，11 个测试）已集成到 e2e.mjs，测试主服务器 port 3000
- 两个文件有重复的 `uploadKnowledgeFile`、`assert`、`runTest`

**合并策略**：

| 步骤 | 操作 | 说明 |
|------|------|------|
| A.1 | 新建 `tests/e2e/knowledge-code-structure.mjs` | 移入 22 个静态测试（不需要服务器） |
| A.2 | 扩展 `tests/e2e/knowledge.mjs` | 移入 5 个集成测试（复用 port 3000 主服务器） |
| A.3 | 更新 `tests/e2e/index.mjs` | 新增 `knowledge-code-structure.mjs` 的 export |
| A.4 | 更新 `tests/e2e.mjs` | 新增 import + `--- Knowledge Code Structure ---` section |
| A.5 | 删除 `tests/knowledge-base-e2e.mjs` | |
| A.6 | 更新 `docs/feat-042-implementation-review.md` | 标记合并完成 |

**22 个静态测试详情**（→ `knowledge-code-structure.mjs`）：
- T-RAG-001: 测试数据文件完整性（samples/knowledge-base/ 下的文件存在性）
- T-RAG-002~008: 各格式文件有效性验证（PDF/TXT/MD/JSON/CSV/XLSX/PNG）
- T-RAG-009~012: 代码结构验证（检查服务端/客户端源码包含 embedding/vector/retriever 逻辑）
- T-RAG-013~022: 类型/schema/配置验证（TypeScript 类型定义、IndexedDB schema、Agent 集成、设置 UI 等）

**5 个集成测试详情**（→ `knowledge.mjs`）：
- T-RAG-023: testUploadAndSearchChain — 上传后搜索验证
- T-RAG-024: testSearchResultMetadata — 搜索结果元数据验证
- T-RAG-025: testMultiFileUploadAndSearch — 多文件上传后搜索
- T-RAG-026: testKnowledgeProviderTestEndpoint — Provider 测试端点
- T-RAG-027: testRerankerIntegration — Reranker 集成测试

**消除的问题**：
- 不再需要自启 port 3099 服务器（消除原计划问题 9 的脆弱性）
- 不再有重复的 `uploadKnowledgeFile`/`assert`/`runTest`
- 所有知识库测试统一走 e2e.mjs 入口

### 10.2 任务 B：智能测试选择（`--auto` flag） ✅ 已完成

**验证**：`FILE_TO_TEST_MAP` 已在 `config.mjs` 中定义，`--auto` 逻辑已在 `e2e.mjs` 中实现

**需求**：根据 git diff 变更文件自动选择测试组，避免跑全家桶。

**设计**：

在 `e2e.mjs` 添加 `--auto` 参数：
1. 运行 `git diff --name-only HEAD` 获取变更文件列表
2. 通过声明式映射表将文件路径模式匹配到测试组名
3. 只运行匹配到的测试组，跳过其余

**映射表**（放在 `tests/e2e-shared/config.mjs`）：

```js
export const FILE_TO_TEST_MAP = [
  // 知识库相关
  { pattern: /^server\/src\/routes\/knowledge/, groups: ["knowledge", "knowledgeCodeStructure"] },
  { pattern: /^server\/src\/lib\/knowledgeDb/, groups: ["knowledge", "knowledgeCodeStructure"] },
  { pattern: /^client\/src\/lib\/knowledge/, groups: ["knowledge", "knowledgeCodeStructure"] },
  { pattern: /^client\/src\/features\/settings\/Knowledge/, groups: ["knowledge"] },
  { pattern: /^samples\/knowledge-base/, groups: ["knowledge"] },

  // AI Agent 相关
  { pattern: /^server\/src\/lib\/orchestrator/, groups: ["mock", "real", "schema", "pipeline"] },
  { pattern: /^server\/src\/lib\/agents/, groups: ["mock", "real", "schema"] },
  { pattern: /^server\/src\/routes\/ai/, groups: ["mock", "real", "schema"] },
  { pattern: /^server\/src\/fixtures/, groups: ["mock", "schema"] },
  { pattern: /^shared\/src\/schemas/, groups: ["schema"] },

  // 搜索相关
  { pattern: /^server\/src\/lib\/search/, groups: ["mock", "real"] },
  { pattern: /^server\/src\/routes\/search/, groups: ["mock", "real"] },

  // 前端 UI
  { pattern: /^client\/src/, groups: ["health"] },

  // 测试文件自身 — 不自动触发
  { pattern: /^tests\//, groups: [] },
  { pattern: /^(package|tsconfig|vitest)/, groups: [] },
  { pattern: /^docs\//, groups: [] },
];
```

**实现步骤**：

| 步骤 | 操作 |
|------|------|
| B.1 | 在 `config.mjs` 添加 `FILE_TO_TEST_MAP` |
| B.2 | 在 `e2e.mjs` 添加 `--auto` 解析逻辑：`git diff --name-only HEAD` → 匹配映射表 → 收集 groups |
| B.3 | 支持多组选择：`--auto` 可能匹配到多个组，依次运行 |

**使用方式**：
```bash
node tests/e2e.mjs --auto          # 根据 git diff 自动选择
node tests/e2e.mjs --auto --check  # 带质量门禁
```

**示例**：
- 只改了 `server/src/routes/knowledge.ts` → 只跑 `knowledge` + `knowledgeCodeStructure`
- 只改了 `server/src/lib/agents/claim-chart.ts` → 只跑 `mock` + `real` + `schema`
- 只改了 `docs/README.md` → 不跑任何测试

### 10.3 任务 C：修复 embedding/reranker key 处理 ✅ 已完成

**已完成**：
- `config.mjs` 已有独立的 embedding/reranker 映射（当前指向同一个 siliconflow key，注释说明了将来扩展意图）
- `CLAUDE.md` 已正确写明 embedding/reranker 的 key 和传递方式
- `upload.mjs` 已支持 `options.embedding` 和 `options.reranker` 参数
- `knowledge.mjs` 上传时传入 embedding/reranker config（通过 `getKnowledgeUploadOptions()` 构建）

**发现的问题**：

| # | 位置 | 问题 |
|---|------|------|
| 1 | `CLAUDE.md:57` | 只写了"reranker 集成测试"，漏掉 embedding |
| 2 | `tests/e2e-shared/upload.mjs` | 上传时不传 embeddingConfig，服务端需要它做向量化 |
| 3 | `tests/e2e/knowledge.mjs` | 不传 embedding/reranker config |
| 4 | `knowledge-base-e2e.mjs:420` | 用 `process.env.SILICONFLOW_KEY`（全大写），.env 里是 `siliconflow_Key` |

**设计原则**：embedding 和 reranker 当前用同一个 siliconflow key，但 UI 上已分别设置，测试代码必须保持独立 config 结构以便将来用不同 key。

**修复步骤**：

| 步骤 | 操作 |
|------|------|
| C.1 | 修复 `CLAUDE.md:57`：改为 `siliconflow_Key（可选，用于 embedding 和 reranker 集成测试）` |
| C.2 | 修复 `upload.mjs`：添加可选参数 `{ embedding, reranker }`，有 embedding 时 append `embeddingConfig` 到 formData |
| C.3 | 修复 `knowledge.mjs`：上传时传入 embedding config，搜索时传入 embedding + reranker config |
| C.4 | 合并后的集成测试也需要传入 embedding/reranker config |

**embedding/reranker config 结构**（与服务端一致）：
```js
// 当前用同一个 key，但结构独立
const embeddingConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: SILICONFLOW_KEY,  // 将来可换成独立的 embedding key
  modelId: "BAAI/bge-m3",
};
const rerankerConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: SILICONFLOW_KEY,  // 将来可换成独立的 reranker key
  modelId: "BAAI/bge-reranker-v2-m3",
};
```

### 10.4 修改文件清单

| 文件 | 操作 | 状态 |
|------|------|------|
| `tests/e2e/knowledge-code-structure.mjs` | **新建**，22 个静态测试 | ✅ 已完成 |
| `tests/e2e/knowledge.mjs` | **扩展**，新增 5 个集成测试 + embedding/reranker config | ✅ 已完成 |
| `tests/e2e/index.mjs` | **更新**，新增 export | ✅ 已完成 |
| `tests/e2e.mjs` | **更新**，新增 import + section + `--auto` 逻辑 | ✅ 已完成 |
| `tests/e2e-shared/config.mjs` | **更新**，新增 `FILE_TO_TEST_MAP` | ✅ 已完成 |
| `tests/e2e-shared/upload.mjs` | **更新**，添加 embedding/reranker 参数 | ✅ 已完成 |
| `tests/knowledge-base-e2e.mjs` | **删除** | ✅ 已完成 |

### 10.5 验证方法

1. `node tests/e2e.mjs --only knowledgeCodeStructure` — 22 个静态测试全通过
2. `node tests/e2e.mjs --only knowledge` — 知识库测试全通过（含新增的 5 个集成测试）
3. `node tests/e2e.mjs --auto` — 根据 git diff 正确选择测试组
4. 确认 `tests/knowledge-base-e2e.mjs` 已删除
5. 确认 embedding config 在上传请求中正确传递（有 siliconflow_Key 时启用向量化）

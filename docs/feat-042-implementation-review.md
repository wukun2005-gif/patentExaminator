# FEAT-042 实现 Review 报告

**Review 时间**: 2026-06-03
**Review 范围**: 自动测试框架全面重构计划的实现细节
**计划文档**: `docs/test-framework-refactor-plan.md`

---

## 一、Review 总结

FEAT-042 计划要求对自动测试框架进行全面重构，消除代码重复、统一配置管理、修复 API key 找不到的问题。

**总体完成度**: 约 60%（必须步骤）

| 步骤 | 计划内容 | 实现状态 | 完成度 | 质量评估 |
|------|---------|---------|--------|---------|
| 步骤 1 | 提取 E2E 共享模块 | ✅ 完成 | 100% | ⭐⭐⭐⭐⭐ 优秀 |
| 步骤 2 | 拆分 e2e-real.mjs | ⚠️ 部分完成 | 70% | ⭐⭐⭐ 良好 |
| 步骤 3 | 创建 CLAUDE.md | ✅ 完成 | 100% | ⭐⭐ 不合格 |
| 步骤 4 | 统一 Vitest 配置 | ⏭️ 可选，未做 | 0% | N/A |
| 步骤 5 | 移入非 HTTP 测试 | ⏭️ 可选，未做 | 0% | N/A |
| 步骤 6 | 简化 fallback 链条 | ⏭️ 可选，未做 | 0% | N/A |
| 步骤 7 | 消除 keyStore 重复 | ⏭️ 可选，未做 | 0% | N/A |
| 第九节 | 合并 Smoke + 修复 BUG-027 | ✅ 完成 | 100% | ⭐⭐⭐⭐ 良好 |

**关键发现**: 步骤 3（CLAUDE.md）虽然文件已创建，但内容质量不合格，没有实现计划中的核心要求。

---

## 二、实现质量深度 Review

### 2.1 步骤 1：提取 E2E 共享模块

#### 2.1.1 文件清单

| 文件 | 大小 | 功能 |
|------|------|------|
| `tests/e2e-shared/config.mjs` | 4355B | API key 名称映射、fallback 模型列表、超时配置 |
| `tests/e2e-shared/env.mjs` | 4234B | 统一的环境变量加载，支持优先级 |
| `tests/e2e-shared/http.mjs` | 2846B | postJSON、getJSON、getJSONWithParams 等工具函数 |
| `tests/e2e-shared/retry.mjs` | 4972B | isRetryableError、FallbackModelManager、OpenRouterModelManager |
| `tests/e2e-shared/schema-validators.mjs` | 13588B | 所有 validate*Output 函数 |
| `tests/e2e-shared/upload.mjs` | 2834B | uploadKnowledgeFile 共享函数 |
| `tests/e2e-shared/sample-data.mjs` | 9285B | 所有 SAMPLE_* 常量 |
| `tests/e2e-shared/index.mjs` | 2351B | 统一导出所有共享模块 |
| `tests/e2e-shared/test-runner.mjs` | 5727B | 测试运行器工具 |

#### 2.1.2 config.mjs 质量评估

**质量**: ⭐⭐⭐⭐ 良好

**优点**:
- ✅ API key 名称映射集中管理
- ✅ Fallback 模型列表完整（Gemini 9 个，OpenRouter 9 个）
- ✅ 可重试错误关键词全面
- ✅ 超时和延迟配置合理

**问题**:
- ❌ **缺少 siliconflow key 映射** — 这是 BUG-028 的根因
```javascript
// 当前配置
export const API_KEY_NAMES = {
  gemini: "GEMINI_KEY",
  mimo: "MiMo_KEY",
  openrouter: "Openrouter_KEY",
  tavily: "TAVILY_API_KEY",
  serp: "SerpAPI_KEY",
  epo: "EPO_CONSUMER_KEY",
  epoSecret: "EPO_CONSUMER_SECRET_KEY",
  // ❌ 缺少：siliconflow: "siliconflow_Key"
};
```

#### 2.1.3 env.mjs 质量评估

**质量**: ⭐⭐⭐⭐ 良好

**优点**:
- ✅ 统一的 .env 文件解析
- ✅ 支持优先级：环境变量 > .env 文件
- ✅ 提供便捷的 API key 访问函数
- ✅ 提供环境配置摘要打印

**问题**:
- ⚠️ 使用自定义 .env 解析器，而非项目已有的 `dotenv` 包
  - 项目 `package.json` 已依赖 `dotenv`
  - 自定义解析器增加了维护成本
  - 但功能上是正确的

**代码质量**:
```javascript
// getApiKey 函数设计合理
export function getApiKey(provider) {
  const envKey = API_KEY_NAMES[provider];
  return process.env[envKey] || "";
}

// 但没有处理 provider 不存在的情况
// 如果传入 "siliconflow"（未在 API_KEY_NAMES 中定义），会返回 undefined
```

#### 2.1.4 http.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 函数设计清晰，职责单一
- ✅ `getJSONWithParams` 支持带参数的 GET 请求
- ✅ `parseJsonResponse` 自动处理错误
- ✅ `parseSSEResponse` 支持 SSE 流式响应解析
- ✅ 注释完整，易于理解

**无明显问题**

#### 2.1.5 retry.mjs 质量评估

**质量**: ⭐⭐⭐⭐ 良好

**优点**:
- ✅ `FallbackModelManager` 类设计合理
- ✅ `OpenRouterModelManager` 支持每个模型多次重试
- ✅ `withRetry` 函数支持指数退避
- ✅ 错误判断函数（isRetryableError、isAuthError、isQuotaError）实用

**问题**:
- ⚠️ **共享模块中的类未被实际使用**
  - `tests/e2e/real-agents.mjs` 中的 `runRealAiAgentTest` 函数自己实现了 fallback 逻辑
  - 没有使用 `FallbackModelManager` 类
  - 这导致代码重复，违背了"消除代码重复"的目标

#### 2.1.6 schema-validators.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 覆盖所有 AI Agent 输出类型
- ✅ 验证函数结构统一
- ✅ 提供详细的错误信息
- ✅ 导出 `SCHEMA_VALIDATORS` 映射和 `getValidator` 函数

**无明显问题**

#### 2.1.7 upload.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ `uploadKnowledgeFile` 函数实现完整
- ✅ 支持 SSE 响应解析
- ✅ 提供批量上传和目录上传功能

**无明显问题**

#### 2.1.8 sample-data.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 测试数据集中管理
- ✅ 覆盖 G1/G2/G3 三个测试案例
- ✅ 包含权利要求、说明书、对比文件等完整数据

**无明显问题**

#### 2.1.9 index.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 统一导出所有共享模块
- ✅ 分类清晰（配置、环境、HTTP、重试、Schema、上传、数据、测试运行器）
- ✅ 方便使用

**无明显问题**

#### 2.1.10 knowledge.mjs（测试文件）质量评估

**质量**: ⭐⭐⭐ 良好（有改进空间）

**优点**:
- ✅ 从共享模块导入 `uploadKnowledgeFile`、`postJSON`、`getJSON`、`log`、`assert`
- ✅ 使用 `uploadKnowledgeFile` 函数（4 次）
- ✅ 测试逻辑清晰

**问题**:
- ❌ **没有从共享模块导入 `getTestBase`、`loadEnvFile`、`getApiKey` 等函数**
- ❌ **第 105 行和第 114 行直接使用 `process.env.TEST_BASE`**，而非共享模块的 `getTestBase()` 函数
```javascript
// 第 105 行
const res = await fetch(`${process.env.TEST_BASE || "http://localhost:3000/api"}/knowledge/sources/...`);

// 第 114 行
const res = await fetch(`${process.env.TEST_BASE || "http://localhost:3000/api"}/knowledge/clear`);
```

**建议**:
```javascript
// 修改为使用共享模块的 getTestBase 函数
import { getTestBase, uploadKnowledgeFile, postJSON, getJSON, log, assert } from "../e2e-shared/index.mjs";

const BASE = getTestBase();
const res = await fetch(`${BASE}/knowledge/sources/...`);
```

**验证**: 其他测试文件都没有直接访问 `process.env`，都正确使用了共享模块：
- ✅ `health.mjs`（18 行）：导入 `getJSON`, `log`
- ✅ `mock-agents.mjs`（473 行）：导入 `postJSON`, `log`, `buildMockRequest`, 多个 `validate*Output` 函数, `getApiKey`
- ✅ `pipeline.mjs`（145 行）：导入 `postJSON`, `log`, `buildMockRequest`, 多个 `validate*Output` 函数
- ✅ `schema-validation.mjs`（239 行）：导入 `postJSON`, `log`, `buildMockRequest`, 多个 `validate*Output` 函数
- ✅ `real-agents.mjs`（547 行）：导入 `postJSON`, `getJSONWithParams`, `log`, `delay`, `isRetryableError`, `isAuthError`, `FallbackModelManager`, `OpenRouterModelManager`, `getApiKey`, `getModelId`, 多个 `validate*Output` 函数, `GEMINI_FALLBACK_MODELS`, `AI_RATE_LIMIT_DELAY`, `SEARCH_RATE_LIMIT_DELAY`, 多个 `SAMPLE_*` 常量

**统计**: 所有 e2e 测试文件总计 1633 行，除 `index.mjs`（模块索引）外，所有文件都从 `e2e-shared` 导入共享模块。

---

### 2.2 步骤 2：拆分 e2e-real.mjs

#### 2.2.1 拆分后的文件结构

```
tests/e2e/
├── health.mjs           # 健康检查（1 个测试）
├── mock-agents.mjs      # Mock 模式测试（约 20 个测试）
├── real-agents.mjs      # Real 模式测试（约 17 个测试）
├── schema-validation.mjs # Schema 验证（约 12 个测试）
├── knowledge.mjs        # 知识库测试（约 11 个测试）
├── pipeline.mjs         # 全链路测试（约 3 个测试）
└── index.mjs            # 模块索引
```

#### 2.2.2 real-agents.mjs 质量评估

**质量**: ⭐⭐⭐⭐ 良好

**优点**:
- ✅ 从共享模块导入所有需要的函数和类
- ✅ 测试函数职责清晰
- ✅ 新增的 `testRealGeminiModelList` 和 `testRealEpoSearchCandidates` 实现正确
- ✅ **`runRealAiAgentTest` 函数使用了共享模块中的类**：
  - 第 110 行：`const geminiManager = new FallbackModelManager(GEMINI_FALLBACK_MODELS);`
  - 第 166 行：`const openrouterManager = new OpenRouterModelManager();`
- ✅ 使用了 `getApiKey`、`getModelId`、`postJSON`、`isAuthError`、`isRetryableError`、`delay`、`log` 等共享函数

**问题**:
- ⚠️ **`runRealAiAgentTest` 函数仍然较长**（第 47-226 行，约 180 行）
  - 这是由于 fallback 逻辑本身复杂（MiMo → Gemini 9 个模型 → OpenRouter 9 个模型 × 3 次重试）
  - 但已经使用了共享模块中的类，代码重复已消除
  - 可以考虑进一步提取，但不是必须的

#### 2.2.3 schema-validation.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 从共享模块导入验证函数
- ✅ `testMalformedResponseHandling` 已修复，添加了 unknown fixture 断言
- ✅ 测试逻辑清晰

**修复验证**:
```javascript
// 测试 2：unknown fixture → ok=false, error.code === "mock-fixture-not-found"
const res2 = await postJSON("/ai/run", {
  agent: "claim-chart",
  providerPreference: ["gemini"],
  modelId: "mock",
  prompt: "[Mock E2E test] claim-chart for case nonexistent-case-999",
  sanitized: false,
  mock: true,
  metadata: { caseId: "nonexistent-case-999", moduleScope: "claim-chart", tokenEstimate: 0 },
});
const data2 = await res2.json();
log("Malformed Response: unknown fixture returns error", data2.ok === false,
  `ok=${data2.ok}, code=${data2.error?.code}`);
if (!data2.ok) {
  log("Malformed Response: error code is mock-fixture-not-found",
    data2.error?.code === "mock-fixture-not-found",
    `code=${data2.error?.code}`);
}
```
✅ 实现正确，代码质量良好

#### 2.2.4 index.mjs 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**优点**:
- ✅ 统一导出所有测试函数
- ✅ 分类清晰（健康检查、Mock、Real、Schema、知识库、流水线）
- ✅ 方便使用

**无明显问题**

#### 2.2.5 e2e.mjs（统一入口）质量评估

**质量**: ⭐⭐⭐⭐ 良好

**优点**:
- ✅ 从共享模块导入
- ✅ 支持 `--check`、`--only`、`--real` 参数
- ✅ Quality Gate 设计合理
- ✅ DB 测试调度清晰

**问题**:
- ⚠️ **未集成 knowledge-base-e2e.mjs 的测试**
  - 知识库测试仍然是独立运行的脚本
  - 无法通过统一入口运行所有测试

---

### 2.3 第九节：合并 Smoke 测试 + 修复 BUG-027

#### 2.3.1 testRealGeminiModelList 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**代码**:
```javascript
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
```

**优点**:
- ✅ 使用 `getApiKey("gemini")` 获取 key（共享模块）
- ✅ 使用 `getJSONWithParams` 调用 API（共享模块）
- ✅ 有 skip 逻辑（key 不存在时跳过）
- ✅ 错误处理完整
- ✅ 日志输出清晰

**无明显问题**

#### 2.3.2 testRealEpoSearchCandidates 质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**代码**:
```javascript
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
      const hasCandidates = Array.isArray(data.candidates) && data.candidates.length > 0;
      log("Real EPO Search candidates non-empty", hasCandidates,
        `count=${data.candidates?.length || 0}`);

      const validation = validateSearchReferencesOutput(data);
      log("Real EPO Search schema valid", validation.valid, validation.errors.join("; "));
    }
  } catch (err) {
    log("Real EPO Search", false, err.message);
  }
}
```

**优点**:
- ✅ 使用 `getApiKey` 获取多个 key（共享模块）
- ✅ 使用 `postJSON` 调用 API（共享模块）
- ✅ 使用 `getModelId` 获取模型 ID（共享模块）
- ✅ 使用 `validateSearchReferencesOutput` 校验 schema（共享模块）
- ✅ 有完整的 skip 逻辑
- ✅ API 请求体结构正确（`searchApiKey` 用于搜索，`llmApiKey` 用于 LLM）
- ✅ 断言完整（ok、candidates、schema）

**无明显问题**

#### 2.3.3 testMalformedResponseHandling 修复质量评估

**质量**: ⭐⭐⭐⭐⭐ 优秀

**修复内容**:
```javascript
// 测试 2：unknown fixture → ok=false, error.code === "mock-fixture-not-found"
const res2 = await postJSON("/ai/run", {
  agent: "claim-chart",
  providerPreference: ["gemini"],
  modelId: "mock",
  prompt: "[Mock E2E test] claim-chart for case nonexistent-case-999",
  sanitized: false,
  mock: true,
  metadata: { caseId: "nonexistent-case-999", moduleScope: "claim-chart", tokenEstimate: 0 },
});
const data2 = await res2.json();
log("Malformed Response: unknown fixture returns error", data2.ok === false,
  `ok=${data2.ok}, code=${data2.error?.code}`);
if (!data2.ok) {
  log("Malformed Response: error code is mock-fixture-not-found",
    data2.error?.code === "mock-fixture-not-found",
    `code=${data2.error?.code}`);
}
```

**优点**:
- ✅ 测试逻辑清晰
- ✅ 断言准确（ok=false, error.code === "mock-fixture-not-found"）
- ✅ 修复了 BUG-027 的 Failure 1

**无明显问题**

---

### 2.4 步骤 3：CLAUDE.md 质量评估

**质量**: ⭐⭐ 不合格

**详细分析见第三节**

---

## 三、步骤 3：CLAUDE.md 质量深度 Review

### 3.1 计划中的要求

根据计划文档，CLAUDE.md 应该包含以下核心内容：

```markdown
## 开发测试框架指南

### 核心原则：两类 Key 严格隔离（ADR-007 + B-041）

1. **APP 用户 Key**：用户在 APP 设置页配置，存入 server 内存/可选加密 keystore
2. **开发者自动测试 Key**：只来自 `.env`，通过请求体字段传递给服务端
3. **绝对不能交叉/fallback/优先/混合使用**

### .env 文件位置
项目根目录的 `.env` 文件包含所有 API key。

### 测试脚本和 API Key 映射

#### E2E 测试（tests/e2e-real.mjs）
- **命令**：`npm run test:e2e`（mock 模式）或 `npm run test:e2e:real`（真实模式）
- **前提**：服务器已在 localhost:3000 运行
- **需要的 API Key**：
  - LLM API（fallback 顺序）：`MiMo_KEY` -> `GEMINI_KEY` -> `Openrouter_KEY`
  - 搜索 API：`TAVILY_API_KEY`、`SerpAPI_KEY`、`EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET_KEY`

#### AI Smoke 测试（tests/developer-ai-smoke.mjs）
- **命令**：`npm run test:ai-smoke`
- **前提**：服务器已在 localhost:3000 运行
- **需要的 API Key**：
  - LLM API（fallback 顺序）：`MiMo_KEY` -> `GEMINI_KEY` -> `Openrouter_KEY`
  - `GEMINI_KEY`（可选，仅用于 Gemini 模型列表测试）

#### 知识库 E2E 测试（tests/knowledge-base-e2e.mjs）
- **命令**：`node tests/knowledge-base-e2e.mjs`
- **前提**：自启动服务器（port 3099），无需手动启动
- **需要的 API Key**：
  - `siliconflow_Key`（可选，用于 reranker 集成测试）

#### 单元/集成测试
- **命令**：`npm test`（单元）或 `npm run test:integration`（集成）
- **需要的 API Key**：无（全部 mock）

### API Key 传递方式（开发测试专用）

所有 API key 都通过请求体传递，不通过 header，不通过 keyStore：

1. **LLM API key**：POST body 中的 `apiKey` 字段
2. **搜索 API key**：POST body 中的 `searchApiKey` 字段
3. **知识库 API key**：POST body 中的 `reranker.apiKey` 或 `embedding.apiKey` 字段

### 常见错误

❌ **错误做法**：尝试将 .env 中的 key 加载到 keyStore
✅ **正确做法**：测试脚本从 .env 读取 key，通过请求体字段传递给服务端

❌ **错误做法**：让 APP 读取 .env 中的 key
✅ **正确做法**：APP 只使用用户在设置页配置的 key

❌ **错误做法**：混淆 LLM API key 和搜索 API key
✅ **正确做法**：LLM API key 用 `apiKey` 字段，搜索 API key 用 `searchApiKey` 字段

❌ **错误做法**：测试脚本使用自己想当然的 key 名字，不尊重用户在 .env 中定义的名字
✅ **正确做法**：测试脚本使用用户在 .env 中定义的确切 key 名字
```

### 3.2 实际 CLAUDE.md 的内容

实际 CLAUDE.md 包含以下内容：

1. ✅ 项目概述和技术栈
2. ✅ 项目结构说明
3. ✅ 常用命令（开发、测试、代码质量）
4. ✅ API Key 读取方式（重要区分）
5. ✅ E2E 测试架构说明
6. ✅ 测试数据说明（G1/G2/G3 案例）
7. ✅ 常见问题解决方案
8. ✅ 开发规范
9. ✅ 相关文档

### 3.3 质量对比分析

| 计划要求 | 实际实现 | 状态 | 质量评估 |
|---------|---------|------|---------|
| **核心原则：两类 Key 严格隔离** | 有提到，但不够详细 | ⚠️ 部分实现 | ⭐⭐⭐ |
| **.env 文件位置** | 有提到 | ✅ 实现 | ⭐⭐⭐⭐ |
| **测试脚本和 API Key 映射** | ❌ 缺失 | ❌ 未实现 | ⭐ |
| **API Key 传递方式** | ❌ 缺失 | ❌ 未实现 | ⭐ |
| **常见错误（详细）** | 有"常见问题"，但不是计划中的内容 | ⚠️ 部分实现 | ⭐⭐ |

### 3.4 关键缺失内容

#### ❌ 缺失 1：测试脚本和 API Key 映射

**计划要求**:
```markdown
#### E2E 测试（tests/e2e-real.mjs）
- **命令**：`npm run test:e2e`（mock 模式）或 `npm run test:e2e:real`（真实模式）
- **前提**：服务器已在 localhost:3000 运行
- **需要的 API Key**：
  - LLM API（fallback 顺序）：`MiMo_KEY` -> `GEMINI_KEY` -> `Openrouter_KEY`
  - 搜索 API：`TAVILY_API_KEY`、`SerpAPI_KEY`、`EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET_KEY`
```

**实际 CLAUDE.md**:
- 只在第 103-111 行列出了 key 名字，但没有说明：
  - 每个测试脚本需要哪些 key
  - key 的 fallback 顺序
  - 缺少 key 时会发生什么

**影响**:
- AI 仍然不知道具体需要配置哪些 key
- AI 不知道 key 的优先级和 fallback 机制

#### ❌ 缺失 2：API Key 传递方式

**计划要求**:
```markdown
### API Key 传递方式（开发测试专用）

所有 API key 都通过请求体传递，不通过 header，不通过 keyStore：

1. **LLM API key**：POST body 中的 `apiKey` 字段
2. **搜索 API key**：POST body 中的 `searchApiKey` 字段
3. **知识库 API key**：POST body 中的 `reranker.apiKey` 或 `embedding.apiKey` 字段
```

**实际 CLAUDE.md**:
- 完全没有提到 API key 的传递方式
- 没有说明 `apiKey`、`searchApiKey`、`reranker.apiKey` 等字段

**影响**:
- **这是 BUG-028 的根本原因**：AI 不知道应该用哪个字段传递 key
- AI 可能会尝试通过 header 或 keyStore 传递 key（错误做法）

#### ❌ 缺失 3：常见错误的详细说明

**计划要求**:
```markdown
### 常见错误

❌ **错误做法**：尝试将 .env 中的 key 加载到 keyStore
✅ **正确做法**：测试脚本从 .env 读取 key，通过请求体字段传递给服务端

❌ **错误做法**：让 APP 读取 .env 中的 key
✅ **正确做法**：APP 只使用用户在设置页配置的 key

❌ **错误做法**：混淆 LLM API key 和搜索 API key
✅ **正确做法**：LLM API key 用 `apiKey` 字段，搜索 API key 用 `searchApiKey` 字段

❌ **错误做法**：测试脚本使用自己想当然的 key 名字，不尊重用户在 .env 中定义的名字
✅ **正确做法**：测试脚本使用用户在 .env 中定义的确切 key 名字
```

**实际 CLAUDE.md**:
- 有"常见问题"部分，但内容是：
  - API Key 找不到（通用故障排除）
  - 测试超时
  - Schema 验证失败
- 这些是技术问题，不是"常见错误做法"

**影响**:
- AI 不知道哪些做法是错误的
- AI 可能会重复犯同样的错误

#### ❌ 缺失 4：siliconflow key 的说明

**计划要求**:
```markdown
#### 知识库 E2E 测试（tests/knowledge-base-e2e.mjs）
- **命令**：`node tests/knowledge-base-e2e.mjs`
- **前提**：自启动服务器（port 3099），无需手动启动
- **需要的 API Key**：
  - `siliconflow_Key`（可选，用于 reranker 集成测试）
```

**实际 CLAUDE.md**:
- 完全没有提到 siliconflow key
- 没有说明知识库测试需要这个 key

**影响**:
- AI 不知道知识库测试需要 siliconflow key
- 这是 BUG-028 的另一个原因

### 3.5 内容质量问题

#### 问题 1：过于通用

实际 CLAUDE.md 包含很多通用的开发指南内容：
- 项目概述（通用）
- 技术栈（通用）
- 项目结构（通用）
- 常用命令（通用）
- 开发规范（通用）

这些内容虽然有用，但**不是针对"解决 AI 找不到 API key 问题"的具体指导**。

#### 问题 2：缺乏可操作性

AI 读完 CLAUDE.md 后，仍然不知道：
1. 具体应该如何获取 API key（从哪里读取）
2. 应该如何传递 API key（用哪个字段）
3. 缺少 key 时应该如何处理（skip 还是报错）
4. 不同测试需要哪些 key

#### 问题 3：信息分散

关键信息分散在多个部分：
- API key 读取方式在第 88-119 行
- E2E 测试架构在第 121-166 行
- 常见问题在第 178-206 行

AI 需要自己整合这些信息，容易遗漏关键点。

#### 问题 4：缺少代码示例

计划中要求提供具体的代码示例，说明如何传递 API key。实际 CLAUDE.md 没有任何代码示例。

### 3.6 质量评估总结

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| **内容完整性** | ⭐⭐⭐ | 覆盖了基本内容，但缺少关键细节 |
| **准确性** | ⭐⭐⭐⭐ | 信息基本正确 |
| **实用性** | ⭐⭐ | 过于通用，缺乏可操作性 |
| **清晰度** | ⭐⭐⭐ | 结构清晰，但关键信息不突出 |
| **与计划的一致性** | ⭐⭐ | 没有实现计划中的核心要求 |
| **总体质量** | ⭐⭐ | **不合格** |

### 3.7 结论

**CLAUDE.md 的内容质量不可接受**，主要原因：

1. **没有实现计划中的核心要求**：
   - ❌ 缺少"测试脚本和 API Key 映射"
   - ❌ 缺少"API Key 传递方式"
   - ❌ 缺少"常见错误"的详细说明
   - ❌ 缺少 siliconflow key 的说明

2. **过于通用**：
   - 更像是一个通用的项目文档
   - 不是针对"解决 AI 找不到 API key 问题"的具体指南

3. **缺乏可操作性**：
   - AI 读完后仍然不知道具体应该如何做
   - 没有代码示例和具体步骤

4. **信息分散**：
   - 关键信息分散在多个部分
   - AI 需要自己整合，容易遗漏

**这个 CLAUDE.md 无法有效解决"AI 找不到 API key"的问题**，需要重写。

---

## 四、质量问题汇总

### 4.1 共享模块设计问题

#### 问题 1：共享模块使用情况验证

**严重程度**: ✅ 已解决（之前的评估是错误的）

**验证结果**:
- ✅ `tests/e2e/real-agents.mjs` **确实使用了**共享模块中的类
  - 第 15 行：`import { FallbackModelManager } from "../e2e-shared/index.mjs";`
  - 第 16 行：`import { OpenRouterModelManager } from "../e2e-shared/index.mjs";`
  - 第 110 行：`const geminiManager = new FallbackModelManager(GEMINI_FALLBACK_MODELS);`
  - 第 166 行：`const openrouterManager = new OpenRouterModelManager();`

- ✅ 使用了共享模块中的 HTTP 函数（9 次）
  - `postJSON`、`getJSON`、`getJSONWithParams`

- ✅ 使用了共享模块中的重试函数（11 次）
  - `isRetryableError`、`isAuthError`、`delay`

- ✅ 使用了共享模块中的 schema 验证函数（6 次）
  - `validateClaimChartOutput`、`validateNoveltyOutput`、`validateInventiveOutput` 等

**结论**: 共享模块被正确使用，代码重复已消除。

#### 问题 2：env.mjs 使用自定义 .env 解析器

**严重程度**: 🟢 低

**现状**:
- `tests/e2e-shared/env.mjs` 使用自定义的 .env 文件解析器
- 项目 `package.json` 已依赖 `dotenv` 包
- 自定义解析器增加了维护成本

**代码对比**:
```javascript
// 自定义解析器（env.mjs:24-54）
function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) {
    return result;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// 使用 dotenv 包（更简洁）
import dotenv from "dotenv";
const envVars = dotenv.config({ path: envPath });
```

**影响**:
- 功能上是正确的
- 但增加了维护成本
- 可能遗漏 dotenv 的一些边界情况处理

**建议**:
- 考虑使用 `dotenv` 包替代自定义解析器
- 或者在注释中说明为什么选择自定义解析器

#### 问题 3：getApiKey 函数未处理 provider 不存在的情况

**严重程度**: 🟡 中等

**现状**:
```javascript
// env.mjs:90-93
export function getApiKey(provider) {
  const envKey = API_KEY_NAMES[provider];
  return process.env[envKey] || "";
}
```

**问题**:
- 如果传入的 `provider` 不在 `API_KEY_NAMES` 中，`envKey` 为 `undefined`
- `process.env[undefined]` 返回 `undefined`
- 函数返回空字符串 `""`
- 没有警告或错误提示

**影响**:
- 如果在 `config.mjs` 中忘记添加某个 key 的映射（如 siliconflow），调用 `getApiKey("siliconflow")` 会静默返回空字符串
- 难以调试

**建议**:
```javascript
export function getApiKey(provider) {
  const envKey = API_KEY_NAMES[provider];
  if (!envKey) {
    console.warn(`[env.mjs] Unknown provider: ${provider}. Add it to API_KEY_NAMES in config.mjs.`);
    return "";
  }
  return process.env[envKey] || "";
}
```

---

### 4.2 测试文件问题

#### 问题 4：`e2e-real.mjs` 未删除

**严重程度**: 🟡 中等

**现状**:
- `tests/e2e-real.mjs` 仍然存在（2852 行）
- 没有从共享模块导入（`grep` 无输出）
- `package.json` 中保留了 `test:e2e:legacy` 脚本指向它

**影响**:
- 代码重复仍然存在
- 可能导致混淆（新旧入口并存）
- 维护成本高（修改需要同步两个文件）

**建议**:
```bash
# 选项 A：完全删除
rm tests/e2e-real.mjs
# 移除 package.json 中的 test:e2e:legacy

# 选项 B：保留但添加废弃警告
# 在文件开头添加：
# ⚠️ DEPRECATED: 请使用 tests/e2e.mjs 代替
# 此文件仅保留用于向后兼容，将在未来版本删除
```

#### 问题 5：`knowledge-base-e2e.mjs` 未使用共享模块

**严重程度**: 🔴 高（导致 BUG-028）

**现状**:
- `knowledge-base-e2e.mjs` 没有从 `e2e-shared` 导入任何模块
- 仍然使用自己的环境变量加载逻辑
- 仍然有自己的测试辅助函数

**关键 Bug**:
```javascript
// 第 420 行
const apiKey = process.env.SILICONFLOW_KEY ?? "";  // ❌ 全大写

// .env 文件中
siliconflow_Key=sk-xxx  // ✅ 实际名字
```

**影响**:
- 知识库 reranker 集成测试永远跳过（因为 key 名字不匹配）
- 代码重复未消除
- **这就是 BUG-028 的根因**

**建议**:
```javascript
// 1. 在 tests/e2e-shared/config.mjs 中添加映射
export const API_KEY_NAMES = {
  // ... 其他 key
  siliconflow: "siliconflow_Key",  // ✅ 添加这行
};

// 2. 修改 tests/knowledge-base-e2e.mjs
import { loadEnvFile, getApiKey } from "./e2e-shared/env.mjs";

// 加载环境变量
loadEnvFile();

// 第 420 行修改为：
const apiKey = getApiKey("siliconflow");
```

#### 问题 6：`config.mjs` 中缺少 siliconflow key 映射

**严重程度**: 🔴 高（导致功能缺失）

**现状**:
```javascript
// tests/e2e-shared/config.mjs
export const API_KEY_NAMES = {
  gemini: "GEMINI_KEY",
  mimo: "MiMo_KEY",
  openrouter: "Openrouter_KEY",
  tavily: "TAVILY_API_KEY",
  serp: "SerpAPI_KEY",
  epo: "EPO_CONSUMER_KEY",
  epoSecret: "EPO_CONSUMER_SECRET_KEY",
  // ❌ 缺少：siliconflow: "siliconflow_Key"
};
```

**影响**:
- 知识库测试无法正确读取 siliconflow API key
- `getApiKey("siliconflow")` 返回空字符串
- reranker 集成测试被跳过

**建议**:
```javascript
// tests/e2e-shared/config.mjs
export const API_KEY_NAMES = {
  gemini: "GEMINI_KEY",
  mimo: "MiMo_KEY",
  openrouter: "Openrouter_KEY",
  tavily: "TAVILY_API_KEY",
  serp: "SerpAPI_KEY",
  epo: "EPO_CONSUMER_KEY",
  epoSecret: "EPO_CONSUMER_SECRET_KEY",
  siliconflow: "siliconflow_Key",  // ✅ 添加这行
};
```

#### 问题 7：`knowledge-base-e2e.mjs` 未集成到统一入口

**严重程度**: 🟡 中等（架构不完整）

**现状**:
- `tests/e2e.mjs` 没有导入 `knowledge-base-e2e.mjs` 的测试函数
- 知识库测试仍然是独立运行的脚本
- CLAUDE.md 中提到知识库测试是"自启动服务器"，但未说明如何集成

**影响**:
- 无法通过统一入口运行所有测试
- 测试架构不统一
- 知识库测试需要单独运行

**建议**:
```javascript
// 1. 创建 tests/e2e/knowledge-base.mjs
// 提取 knowledge-base-e2e.mjs 中的测试函数

// 2. 在 tests/e2e/index.mjs 中导出
export {
  testKnowledgeUploadTxt,
  testKnowledgeUploadMd,
  // ... 其他测试
} from "./knowledge-base.mjs";

// 3. 在 tests/e2e.mjs 中集成
import {
  testKnowledgeUploadTxt,
  testKnowledgeUploadMd,
  // ... 其他测试
} from "./e2e/index.mjs";
```

---

### 4.3 文档质量问题

#### 问题 8：CLAUDE.md 内容质量不合格

**严重程度**: 🔴 高（无法有效解决"AI 找不到 API key"的问题）

**详细分析见第三节**

---

## 五、质量评估总结

### 5.1 各部分质量评分

| 实现部分 | 完成度 | 质量评分 | 主要问题 |
|---------|--------|---------|---------|
| **步骤 1：共享模块** | 100% | ⭐⭐⭐⭐ 良好 | 共享类未被使用、缺少 siliconflow 映射 |
| **步骤 2：拆分 e2e-real.mjs** | 70% | ⭐⭐⭐ 良好 | 旧文件未删除、runRealAiAgentTest 仍复杂 |
| **步骤 3：CLAUDE.md** | 100% | ⭐⭐ 不合格 | 缺少关键内容、过于通用 |
| **第九节：合并 Smoke + 修复 BUG-027** | 100% | ⭐⭐⭐⭐⭐ 优秀 | 无明显问题 |

### 5.2 关键发现

1. **共享模块设计良好，但未被完全使用**
   - `FallbackModelManager` 和 `OpenRouterModelManager` 类已定义
   - 但 `runRealAiAgentTest` 函数自己实现了 fallback 逻辑
   - 违背了"消除代码重复"的目标

2. **第九节实现质量优秀**
   - `testRealGeminiModelList` 和 `testRealEpoSearchCandidates` 实现正确
   - `testMalformedResponseHandling` 修复完整
   - 代码质量良好

3. **CLAUDE.md 内容质量不合格**
   - 缺少"测试脚本和 API Key 映射"
   - 缺少"API Key 传递方式"
   - 缺少"常见错误"的详细说明
   - 无法有效解决"AI 找不到 API key"的问题

4. **知识库测试未集成**
   - `knowledge-base-e2e.mjs` 未使用共享模块
   - 未集成到统一入口
   - 这是 BUG-028 的根因

---

## 六、修复优先级

### P0（立即修复）— ✅ 已全部修复

1. **✅ 重写 CLAUDE.md，实现计划中的核心要求**
   - 已添加"测试脚本和 API Key 映射"、"API Key 传递方式"、"常见错误"等部分
   - 包含 siliconflow key 说明、代码示例、do/don't 对照

2. **✅ 在 `config.mjs` 中添加 siliconflow key 映射**
   - 已在 `API_KEY_NAMES` 中添加 `siliconflow: "siliconflow_Key"`

3. **✅ 修改 `knowledge.mjs` 使用共享模块**
   - 已导入 `getTestBase`，替换 `process.env.TEST_BASE` 直接访问

4. **✅ 删除 `tests/e2e-real.mjs`**
   - 已删除 2852 行旧文件
   - 已移除 `package.json` 中的 `test:e2e:legacy` 脚本

5. **✅ `getApiKey` 添加未知 provider 警告**
   - 传入未在 `API_KEY_NAMES` 中定义的 provider 时，输出 `console.warn`

### P1（尽快修复）

**影响**: 架构完整性、代码质量

5. **重构 `runRealAiAgentTest` 函数，使用共享模块中的类**
   - 文件: `tests/e2e/real-agents.mjs`
   - 修改: 使用 `FallbackModelManager` 和 `OpenRouterModelManager`
   - 预期: 消除代码重复

6. **将 `knowledge-base-e2e.mjs` 集成到统一入口**
   - 文件: `tests/e2e/knowledge-base.mjs`（新建）
   - 修改: 提取测试函数，集成到 `e2e.mjs`
   - 预期: 所有测试可通过统一入口运行

7. **运行测试验证修复效果**
   - 命令: `node tests/e2e.mjs --only knowledge`
   - 预期: 知识库测试全部通过

### P2（可选优化）

**影响**: 代码质量、维护性

8. **步骤 4：统一 Vitest 配置**（可选）
9. **步骤 5：将非 HTTP 测试移入 Vitest**（可选）
10. **步骤 6：简化 Real 模式 fallback 链条**（可选）
11. **步骤 7：消除 keyStore 测试重复**（可选）
12. **env.mjs 考虑使用 dotenv 包**（可选）

---

## 七、验证方法

### 7.1 验证共享模块质量

```bash
# 检查共享模块是否完整
ls -la tests/e2e-shared/

# 检查是否有遗漏的导出
grep -n "export" tests/e2e-shared/index.mjs

# 检查 config.mjs 中的 key 映射
grep -n "siliconflow" tests/e2e-shared/config.mjs

# 检查 FallbackModelManager 是否被使用
grep -rn "FallbackModelManager" tests/e2e/
```

### 7.2 验证拆分质量

```bash
# 检查拆分后的测试文件
ls -la tests/e2e/

# 检查统一入口是否正常工作
node tests/e2e.mjs --only mock

# 检查旧文件是否已删除或废弃
ls -la tests/e2e-real.mjs

# 检查 runRealAiAgentTest 是否使用共享模块
grep -n "FallbackModelManager\|OpenRouterModelManager" tests/e2e/real-agents.mjs
```

### 7.3 验证 CLAUDE.md 质量

```bash
# 检查是否包含关键内容
grep -n "测试脚本和 API Key 映射" CLAUDE.md
grep -n "API Key 传递方式" CLAUDE.md
grep -n "常见错误" CLAUDE.md
grep -n "siliconflow" CLAUDE.md

# 检查是否有代码示例
grep -n "apiKey" CLAUDE.md
grep -n "searchApiKey" CLAUDE.md
```

### 7.4 验证第九节质量

```bash
# 检查新增测试函数
grep -n "testRealGeminiModelList" tests/e2e/real-agents.mjs
grep -n "testRealEpoSearchCandidates" tests/e2e/real-agents.mjs

# 检查旧文件是否已删除
ls -la tests/developer-ai-smoke.mjs

# 运行测试验证
node tests/e2e.mjs --only malformed
node tests/e2e.mjs --only real
```

### 7.5 验证知识库测试集成

```bash
# 检查 knowledge-base-e2e.mjs 是否使用共享模块
grep -n "import.*e2e-shared" tests/knowledge-base-e2e.mjs

# 运行知识库测试
node tests/knowledge-base-e2e.mjs

# 检查是否集成到统一入口
grep -n "knowledge" tests/e2e/index.mjs
```

---

## 八、预期效果

修复上述问题后，预期达到以下效果：

1. **消除代码重复**：所有共享逻辑集中在 `tests/e2e-shared/`，且被实际使用
2. **统一配置管理**：API key 名称、fallback 模型链条等集中管理，包含所有需要的 key
3. **修复 BUG-028**：知识库测试可以正确读取 siliconflow API key
4. **架构统一**：所有 E2E 测试可通过统一入口运行
5. **AI 能够正确找到 API key**：
   - 从 CLAUDE.md 中了解需要哪些 key
   - 知道应该用哪个字段传递 key
   - 知道缺少 key 时应该如何处理
   - 使用用户在 `.env` 中定义的确切 key 名字
6. **代码质量提升**：
   - 共享模块中的类被实际使用
   - fallback 逻辑集中在一处
   - 维护成本降低

---

## 九、相关文档

- **计划文档**: `docs/test-framework-refactor-plan.md`
- **Backlog**: `backlog.md` — FEAT-042
- **设计决策**: `DESIGN.md` — ADR-007、B-041
- **Bug 记录**: `backlog.md` — BUG-027、BUG-028

---

## 十、第十节实现 Review（合并 knowledge-base-e2e + 智能测试选择 + embedding/reranker 修复）

**Review 时间**: 2026-06-03
**Review 范围**: `docs/test-framework-refactor-plan.md` 第十节的三个任务

### 10.1 Review 总结

| 任务 | 计划内容 | 实现状态 | 完成度 | 质量评估 |
|------|---------|---------|--------|---------|
| 任务 A | 合并 knowledge-base-e2e.mjs 到 e2e 模块 | ✅ 完成 | 100% | ⭐⭐⭐⭐ 良好 |
| 任务 B | 智能测试选择 `--auto` flag | ✅ 完成 | 100% | ⭐⭐⭐ 良好（有质量问题） |
| 任务 C | 修复 embedding/reranker key 处理 | ✅ 完成 | 95% | ⭐⭐⭐⭐ 良好（有 latent bug） |

### 10.2 任务 A：合并 knowledge-base-e2e.mjs

**完成情况**：
- ✅ `tests/knowledge-base-e2e.mjs` 已删除
- ✅ `tests/e2e/knowledge-code-structure.mjs` 新建，22 个静态测试（T-RAG-001~022）
- ✅ `tests/e2e/knowledge.mjs` 扩展，新增 5 个集成测试（T-RAG-023~027）
- ✅ `tests/e2e/index.mjs` 更新，新增所有 export
- ✅ `tests/e2e.mjs` 更新，新增 import + dispatch sections

**质量评估**：
- 测试代码结构清晰，使用 shared 模块的 `log`/`assert`/`uploadKnowledgeFile`
- 无代码重复
- 集成测试复用 port 3000 主服务器，消除了原来自启 port 3099 的脆弱性

**无问题**。

### 10.3 任务 B：智能测试选择 `--auto`

**完成情况**：
- ✅ `tests/e2e-shared/config.mjs` 新增 `FILE_TO_TEST_MAP` 声明式映射表
- ✅ `tests/e2e-shared/index.mjs` 导出 `FILE_TO_TEST_MAP`
- ✅ `tests/e2e.mjs` 新增 `getAutoTestGroups()` 函数（`git diff --name-only HEAD` → 匹配映射表 → 收集 groups）
- ✅ `tests/e2e.mjs` 的 `maybe()` 函数支持 `--auto` 组匹配
- ✅ fallback 逻辑：无变更文件或无匹配组时运行全量测试

**质量问题 #1（中等）**：`e2e.mjs:320` 的 `--auto` 组匹配逻辑极度脆弱

```js
if (g === "knowledge") return name.includes("knowledge") && !name.includes("integrity") && !name.includes("pdf") && !name.includes("txt") && !name.includes("md") && !name.includes("json") && !name.includes("csv") && !name.includes("xlsx") && !name.includes("png") && !name.includes("embedder") && !name.includes("retriever") && !name.includes("promptinjector") && !name.includes("typedefinitions") && !name.includes("indexeddb") && !name.includes("agentintegration") && !name.includes("settingsui") && !name.includes("knowledgerepo") && !name.includes("normalizer") && !name.includes("filehash") && !name.includes("documentcategory");
```

这段代码用一长串 `!name.includes(...)` 排除来区分 `knowledge` 组和 `knowledgeCodeStructure` 组。问题：
- 新增测试函数时必须同步更新这个排除列表，否则会被错误分类
- 可读性极差，难以维护
- 建议改为在测试函数上打标签（如 `testKnowledgeUploadTxt.group = "knowledge"`），或在 `FILE_TO_TEST_MAP` 中直接列出函数名

### 10.4 任务 C：修复 embedding/reranker key 处理

**完成情况**：
- ✅ `tests/e2e-shared/upload.mjs` 的 `uploadKnowledgeFile` 新增 `options.embedding`/`options.reranker` 参数
- ✅ `tests/e2e/knowledge.mjs` 的 `getKnowledgeUploadOptions()` 构建独立的 embedding/reranker config
- ✅ config.mjs:25-26 已有独立映射（`embedding: "siliconflow_Key"`, `reranker: "siliconflow_Key"`）
- ✅ 所有上传测试调用 `uploadKnowledgeFile(filePath, getKnowledgeUploadOptions())`
- ✅ `testKnowledgeRerankerIntegration` 测试无 reranker / 无效 reranker / 有效 reranker 三种场景

**Latent Bug #2（低）**：`upload.mjs:78` 的 `uploadMultipleFiles` 和 `uploadDirectory` 仍用旧签名

```js
// 当前代码（有 bug）
export async function uploadMultipleFiles(filePaths, baseUrl) {
  for (const filePath of filePaths) {
    const result = await uploadKnowledgeFile(filePath, baseUrl);  // baseUrl 是 string，但新签名期望 options 对象
  }
}

// 应改为
export async function uploadMultipleFiles(filePaths, options = {}) {
  for (const filePath of filePaths) {
    const result = await uploadKnowledgeFile(filePath, options);
  }
}
```

当前没有测试用到这两个函数所以不会崩，但接口不一致。

**小问题 #3（低）**：`upload.mjs:5` 注释还写着"用于 knowledge-base-e2e.mjs 和 e2e-real.mjs"，knowledge-base-e2e.mjs 已删除。

**小问题 #4（低）**：`e2e.mjs:449` 直接用 `process.env.TEST_BASE || "http://localhost:3000/api"` 而非 shared 模块的 `getTestBase()`，不一致。

### 10.5 修复建议优先级

| # | 问题 | 严重度 | 建议 |
|---|------|--------|------|
| 1 | `--auto` 组匹配逻辑脆弱 | 中等 | 改为函数标签或映射表直接列函数名 |
| 2 | `uploadMultipleFiles`/`uploadDirectory` 签名不一致 | 低 | 更新签名匹配 `uploadKnowledgeFile` |
| 3 | upload.mjs 注释过时 | 低 | 删除对已删除文件的引用 |
| 4 | e2e.mjs 直接用 process.env | 低 | 改用 `getTestBase()` |

---

## 十一、全面 Gap 修复实现 Review（P0 + P1 + 测试数据集中管理）

**Review 时间**: 2026-06-03
**Review 范围**: 计划文档第十一节（测试数据路径）+ 第十二节 P0/P1 问题修复

### 11.1 Review 总结

| 问题 | 优先级 | 实现状态 | 质量评估 |
|------|--------|---------|---------|
| FATAL handler exit code bug | P0 #1 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| Duration 硬编码为 0 | P0 #2 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| 无服务器启动检查 | P0 #3 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| `REAL_MODE_TEST_TIMEOUT` 未使用 | P0 #4 | ✅ 完成 | ⭐⭐⭐⭐ 良好 |
| `--auto` 组匹配脆弱 | P1 #5 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| 重复的 real-mode 代码块 | P1 #6 | ⚠️ 部分完成 | ⭐⭐⭐ 良好（遗留差异） |
| 跳过测试不可见 | P1 #8 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| `withRetry()` 死代码 | P1 #10 | ❌ 未修复 | N/A |
| HTTP helper 无超时 | P1 #12 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| 测试数据路径未集中管理 | 第十一节 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |
| `process.env.TEST_BASE` 不一致 | 小问题 #4 | ✅ 完成 | ⭐⭐⭐⭐⭐ 优秀 |

### 11.2 详细 Review

#### P0 #1：FATAL handler exit code bug ✅ 优秀

**修复前**：`e2e.mjs:575-577` — FATAL 错误后 `allPassed()` 返回 true（空结果），exit code 为 0。

**修复后**：`e2e.mjs:615-617` — 直接 `process.exit(1)`，不再依赖 `allPassed()`。

质量好，简洁直接。

#### P0 #2：Duration 测量 ✅ 优秀

**修复前**：`const duration = 0` 硬编码。

**修复后**：`e2e.mjs:283` 记录 `startTime`，`621` 计算 `Date.now() - startTime`。

质量好，标准做法。

#### P0 #3：服务器启动检查 ✅ 优秀

**修复后**：`e2e.mjs:297-311` —
- `fetch(\`${BASE}/health\`, { signal: AbortSignal.timeout(5000) })` 带 5 秒超时
- 失败时输出清晰错误信息："Please start the server first: npm run dev:server"
- `process.exit(1)` 立即退出

质量好，超时合理，错误信息清晰。

#### P0 #4：`REAL_MODE_TEST_TIMEOUT` 使用 ✅ 良好

**修复后**：`e2e.mjs:333-345` — `withTimeout()` 函数使用 `Promise.race` 实现超时，所有 real-mode 测试调用都包裹了 `withTimeout()`。

有一个小瑕疵：超时时通过 `log(fn.name, false, err.message)` 记录为 FAIL，但没有区分"超时"和"执行失败"。不过不影响正确性。

#### P1 #5：`--auto` 组匹配重构 ✅ 优秀

**修复前**：`maybe()` 中 15+ 个 `!name.includes(...)` 排除条件。

**修复后**：
- `e2e.mjs:327-330` — `setGroup(group)` 函数设置当前组
- `e2e.mjs:356-357` — `maybe()` 检查 `autoGroups.includes(currentGroup)`
- dispatch 中每个 section 前调用 `setGroup("xxx")`（14 处）

质量优秀。从"脆弱的字符串匹配"改为"声明式的组标签"，新增测试只需在正确的 section 中添加，无需修改匹配逻辑。

#### P1 #6：重复的 real-mode 代码块 ⚠️ 部分完成

**现状**：`--real` 路径（381-425）和自动检测 GEMINI_KEY 路径（568-608）仍然有两份几乎相同的代码。

**遗留差异**：`testRealTokenUsageReturned` 只在 `--real` 路径（417 行），自动检测路径缺失。两处 real-mode 代码仍有 40+ 行重复。

建议：提取为 `runRealModeTests()` 函数复用。

#### P1 #8：跳过测试独立计数 ✅ 优秀

**修复后**：`test-runner.mjs:38` — `options.skipped` 参数区分跳过和通过，`99-107` 行独立统计 skipped 数，`123` 行 summary 显示。

质量好，`printSkipped()` 也被正确使用。

#### P1 #10：`withRetry()` 死代码 ❌ 未修复

`retry.mjs` 中的 `withRetry()` 仍未被 E2E 测试使用。`runRealAiAgentTest` 仍自己实现重试循环。

#### P1 #12：HTTP helper 超时 ✅ 优秀

**修复后**：`http.mjs:28` — `signal: AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS)`。

质量好，支持自定义超时和默认超时。

#### 测试数据路径集中管理 ✅ 优秀

**修复后**：
- `config.mjs:22-25` — 导出 `SAMPLES_CASE_DIR` 和 `SAMPLES_KNOWLEDGE_DIR`
- `knowledge.mjs` — 所有 `path.join(SAMPLES_DIR, ...)` 改为 `path.join(SAMPLES_KNOWLEDGE_DIR, ...)`
- `knowledge-code-structure.mjs` — 同上

质量好，单一数据源。

### 11.3 发现的新问题

#### Bug #1（中等）：`FILE_TO_TEST_MAP` 引用了不存在的 `knowledgeIntegration` 组

`config.mjs:141-143` 的映射表引用了 `knowledgeIntegration` 组：
```js
{ pattern: /^server\/src\/routes\/knowledge/, groups: ["knowledge", "knowledgeIntegration"] },
```

但 `e2e.mjs` 的 dispatch 中从未调用 `setGroup("knowledgeIntegration")`。集成测试（uploadAndSearch、reranker 等）实际被设为 `setGroup("knowledge")`（478 行）。

**后果**：`--auto` 匹配到 `knowledgeIntegration` 时，`autoGroups` 包含 `"knowledgeIntegration"`，但 `currentGroup` 只有 `"knowledge"`，所以集成测试会被跳过。

**修复方案**：要么在 dispatch 中为集成测试添加 `setGroup("knowledgeIntegration")`，要么从 `FILE_TO_TEST_MAP` 中移除 `knowledgeIntegration` 并入 `knowledge`。

#### 遗留 #2（低）：real-mode 代码块重复

两处 40+ 行几乎相同的代码，且 `testRealTokenUsageReturned` 只在 `--real` 路径中。

#### 遗留 #3（低）：`withRetry()` 未使用

#### 遗留 #4（低）：死代码未清理

以下函数仍被导出但从未被调用：
- `testSchemaSearchReferences`（index.mjs:62）
- `runTests()`（test-runner.mjs）
- `parseJsonResponse()`/`parseSSEResponse()`（http.mjs）
- `uploadMultipleFiles()`/`uploadDirectory()`（upload.mjs）
- `KNOWLEDGE_TEST_PORT`/`KNOWLEDGE_TEST_BASE`（config.mjs）

### 11.4 修复建议优先级

| # | 问题 | 严重度 | 建议 |
|---|------|--------|------|
| 1 | `FILE_TO_TEST_MAP` 引用不存在的 `knowledgeIntegration` 组 | 中等 | dispatch 中添加 `setGroup("knowledgeIntegration")` 或合并到 `knowledge` |
| 2 | real-mode 代码块重复 + `testRealTokenUsageReturned` 缺失 | 低 | 提取 `runRealModeTests()` 函数 |
| 3 | `withRetry()` 未使用 | 低 | 保持现状或在 real-agents 中使用 |
| 4 | 6 个死代码函数仍被导出 | 低 | 移除未使用的导出 |

---

## 十二、第十一节遗留问题修复 Review

**Review 时间**: 2026-06-03
**Review 范围**: 第十一节 review 中发现的 4 个遗留问题

### 12.1 Review 总结

| 问题 | 严重度 | 实现状态 | 质量评估 |
|------|--------|---------|---------|
| `FILE_TO_TEST_MAP` 引用不存在的 `knowledgeIntegration` 组 | 中等 | ✅ 已修复 | ⭐⭐⭐⭐⭐ 优秀 |
| real-mode 代码块重复 + `testRealTokenUsageReturned` 缺失 | 低 | ✅ 已修复 | ⭐⭐⭐⭐⭐ 优秀 |
| `withRetry()` 未使用 | 低 | ❌ 未修复 | N/A（低优先级） |
| 6 个死代码函数仍被导出 | 低 | ✅ 已修复 | ⭐⭐⭐⭐⭐ 优秀 |

### 12.2 详细 Review

#### Bug #1：`knowledgeIntegration` 幽灵组 ✅ 优秀

**修复前**：`config.mjs` 的 `FILE_TO_TEST_MAP` 引用 `knowledgeIntegration` 组，但 dispatch 从未 `setGroup("knowledgeIntegration")`，导致 `--auto` 匹配时集成测试被跳过。

**修复后**：`config.mjs:155-156` — 映射表简化为 `groups: ["knowledge"]`，消除了不存在的组引用。所有知识库测试（基础 + 集成 + 代码结构）统一归入对应组，与 dispatch 中的 `setGroup()` 调用一致。

质量好，简洁正确。

#### Real-mode 代码重复 ✅ 优秀

**修复前**：`--real` 路径和自动检测 GEMINI_KEY 路径有 40+ 行重复代码，且 `testRealTokenUsageReturned` 只在 `--real` 路径中。

**修复后**：
- `e2e.mjs:348-390` — 提取 `runRealModeTests()` 函数，包含所有 real-mode 测试
- `e2e.mjs:426` — `--real` 路径调用 `runRealModeTests()`
- `e2e.mjs:578` — 自动检测路径调用 `runRealModeTests()`
- `testRealTokenUsageReturned`（385 行）在函数内，两条路径共享

质量优秀。消除重复，保证一致性。

#### 死代码清理 ✅ 优秀

**清理前**（index.mjs 导出但从未调用）：
- `testSchemaSearchReferences`
- `runTests()`
- `parseJsonResponse()` / `parseSSEResponse()`
- `uploadMultipleFiles()` / `uploadDirectory()`

**清理后**：全部从 `e2e/index.mjs` 和 `e2e-shared/index.mjs` 的导出中移除。

质量好，干净利落。

#### `withRetry()` 未使用 ❌ 未修复（低优先级）

`retry.mjs` 中的 `withRetry()` 仍未被 `real-agents.mjs` 使用。重试逻辑在 `runRealAiAgentTest` 中内联实现，功能等价但代码不统一。

建议：保持现状，不影响正确性。

### 12.3 遗留项

仅剩 2 个低优先级遗留：
1. `KNOWLEDGE_TEST_PORT` / `KNOWLEDGE_TEST_BASE` 仍被 `config.mjs` 定义并从 `index.mjs` 导出，但无代码使用（无害死代码）
2. `withRetry()` 未被 E2E 测试使用（功能等价的内联实现已存在）

### 12.4 总体评估

第十一节 review 发现的 4 个问题中，3 个已修复且质量优秀，1 个低优先级问题保持现状。至此，计划文档中所有 P0 问题和大部分 P1 问题均已解决，测试框架质量显著提升。

---

## 十三、代码质量深度审计

**Review 时间**: 2026-06-03
**Review 范围**: 全部 14 个测试框架源文件，逐行审查代码质量
**Review 方法**: 不再走 checklist，逐文件读代码找质量问题

> 之前的第一轮 review（第十一、十二节）只检查了"有没有做"，没有检查"做得怎么样"。本节是真正的代码质量审计。

### 13.1 审计总览

| 严重度 | 数量 | 说明 |
|--------|------|------|
| CRITICAL | 2 | 运行时 crash 或测试形同虚设 |
| HIGH | 7 | 大量复制粘贴 + 静默吞错 |
| MEDIUM | 16 | 代码异味、不一致、脆弱模式 |
| LOW | 8 | cosmetic、unused imports |

**之前的 review 给了多处 ⭐⭐⭐⭐⭐ 优秀，实际代码质量远达不到。** 这暴露了 review 方法论的问题：只做 checklist 检查会掩盖代码质量问题。

---

### 13.2 CRITICAL — 运行时 crash（2 项）

#### Issue #1：`testSampleDataIntegrity` 硬编码 12 个文件名

**文件**：`tests/e2e/knowledge-code-structure.mjs:33-46`
**之前的 review**：给了 ✅ ⭐⭐⭐⭐⭐ 优秀 — **错误评价**

```javascript
// 当前代码：硬编码 12 个文件名
const expected = [
  "专利审查指南.pdf",
  "专利法_2020修正.txt",
  // ... 共 12 个
];
for (const file of expected) {
  assert(fileExists(filePath), `Missing: ${file}`);
}
```

**问题**：实际目录有 21 个文件，测试只检查 12 个。新增的 9 个文件即使被删除也不会被发现。测试形同虚设——它永远"通过"，但不保证任何东西。

**为什么之前的 review 没发现**：review 只检查了"测试是否存在"、"是否使用了 SAMPLES_KNOWLEDGE_DIR"，没有检查测试的实际逻辑是否正确。

**修复方案**：改为 `fs.readdirSync(SAMPLES_KNOWLEDGE_DIR)` 读取实际目录。

#### Issue #2：`validateInterpretOutput` 缺失 import

**文件**：`tests/e2e/real-agents.mjs:328`
**之前的 review**：未发现

```javascript
// 第 328 行调用了 validateInterpretOutput
const validation = validateInterpretOutput(data.outputJson);

// 但 import 列表（第 8-40 行）中没有导入该函数
import {
  validateClaimChartOutput,
  validateNoveltyOutput,
  // ... 没有 validateInterpretOutput
} from "../e2e-shared/index.mjs";
```

**问题**：运行时会抛 `ReferenceError: validateInterpretOutput is not defined`。`testRealInterpret_G1` 在 real mode 下永远 crash。

**为什么之前的 review 没发现**：review 只检查了"函数是否从共享模块导入"的宏观问题，没有逐行核对 import 列表与实际使用是否匹配。

---

### 13.3 HIGH — 复制粘贴 + 静默吞错（7 项）

#### Issue #3：knowledge.mjs 5 个上传函数复制粘贴

**文件**：`tests/e2e/knowledge.mjs:45-77`

5 个函数结构完全一样，只有文件名不同：
```javascript
export async function testKnowledgeUploadTxt() {
  const filePath = path.join(SAMPLES_KNOWLEDGE_DIR, "专利法_2020修正.txt");
  const result = await uploadKnowledgeFile(filePath, getKnowledgeUploadOptions());
  log("Knowledge Upload TXT", result.ok, ...);
}
// testKnowledgeUploadLargeFile — 同样结构
// testKnowledgeUploadMd — 同样结构
// testKnowledgeUploadJson — 同样结构
// testKnowledgeUploadCsv — 同样结构
```

**修复**：改为数据驱动——定义文件名数组，循环调用。

#### Issue #4：e2e.mjs `runRealModeTests()` 14 次复制粘贴

**文件**：`tests/e2e.mjs:348-390`

```javascript
await withTimeout(() => maybe(testRealClaimChart_G1));
await delay(AI_RATE_LIMIT_DELAY);
await withTimeout(() => maybe(testRealNovelty_G1));
await delay(AI_RATE_LIMIT_DELAY);
// ... 重复 14 次
```

**修复**：改为数组 + 循环。

#### Issue #5：mock-agents.mjs 7 个复审测试复制粘贴

**文件**：`tests/e2e/mock-agents.mjs:173-277`

`testMockOpinionAnalysis_G1`、`testMockArgumentAnalysis_G1`、`testMockReexamDraft_G1`、`testMockSummary_G1`、`testMockTranslate_G1`、`testMockExtractCaseFields_G1`、`testMockClassifyDocuments_G1` — 每个 15-20 行，结构完全一样。

**修复**：改为表驱动——定义 `{agent, validator, caseId}` 数组，循环执行。

#### Issue #6：schema-validation.mjs 与 mock-agents.mjs 重复

**文件**：`tests/e2e/schema-validation.mjs:22-107`

6 个 schema 测试与 mock-agents 做同样的事（发 mock 请求 + 校验 schema），逻辑重复。

**修复**：提取公共辅助函数，或合并到一处。

#### Issue #7：SSE 解析逻辑重复

**文件**：`tests/e2e-shared/upload.mjs:48-68` vs `http.mjs:90-119`

相同的 SSE 解析逻辑写了两遍。`http.mjs` 已有 `parseSSEResponse()` 但 `upload.mjs` 不用它。

**修复**：`upload.mjs` 改用 `parseSSEResponse()`。

#### Issue #8：`e2e.mjs:486` 静默 `.catch(() => {})`

```javascript
await fetch(`${BASE}/knowledge/clear`, { method: "DELETE" }).catch(() => {});
```

服务器挂了、500 错误、网络超时——全部吞掉，不报任何信息。后续测试在脏数据上跑，产生误导性结果。

**修复**：改为 `.catch(err => console.warn(...))`。

#### Issue #9：upload.mjs SSE 解析静默吞错

**文件**：`tests/e2e-shared/upload.mjs:63-64`

```javascript
} catch {
  // 跳过解析失败的行
}
```

如果 `done` 或 `error` 事件的 JSON 格式错误，解析器静默跳过，返回 "No done event found"——隐藏了真实错误。

---

### 13.4 MEDIUM — 代码异味（16 项，选取最重要的）

#### Issue #10：`getExponentialBackoff` 名不副实

**文件**：`tests/e2e-shared/retry.mjs:33`

```javascript
export function getExponentialBackoff(attempt, baseMs = RETRY_BASE_DELAY) {
  return baseMs + attempt * RETRY_DELAY_INCREMENT;  // 线性，不是指数
}
```

函数名说"指数退避"，实际是线性增长（5000, 8000, 11000, 14000）。

#### Issue #11：real-agents.mjs 硬编码 3 套不同的重试延迟

**文件**：`tests/e2e/real-agents.mjs:127,155,174`

- 第 127 行：`5000 + attempt * 3000`
- 第 155 行：`15000 + attempt * 5000`
- 第 174 行：`10000 + openrouterAttempt * 5000`

config.mjs 定义了 `RETRY_BASE_DELAY` 和 `RETRY_DELAY_INCREMENT`，但这里不用，自己写了 3 套不同的常量。

#### Issue #12：knowledge.mjs 7 处 raw fetch 绕过 HTTP 工具

**文件**：`tests/e2e/knowledge.mjs:126,135,147,187,218,227,247`

直接 `fetch()` 没有 `AbortSignal.timeout`，服务器挂了会永久阻塞。

#### Issue #13：knowledge.mjs 不检查 res.ok 就解析 JSON

服务器返回 500 HTML 页面时 `res.json()` 抛异常，crash 整个测试套件。

#### Issue #14：siliconflow URL 硬编码 3 处

`https://api.siliconflow.cn/v1` 在 `knowledge.mjs` 中写了 3 遍。

#### Issue #15：`allPassed()` 把 skip 当 pass

`printSkipped()` 写入 `{pass: true}`，`allPassed()` 只检查 `pass`。50 个测试全 skip → exit 0（成功）。

#### Issue #16：29 个未使用的 export

`e2e-shared/index.mjs` 导出大量从未被调用的函数，维护负担。

#### Issue #17：unused imports

- `real-agents.mjs:39` — `SAMPLE_FEATURES_G1` 未使用
- `e2e.mjs:35` — `SEARCH_RATE_LIMIT_DELAY` 未使用

---

### 13.5 LOW — 不修的项（记录）

| # | 问题 | 不修原因 |
|---|------|---------|
| 19 | allPassed() skip 语义 | Fix 15 部分覆盖 |
| 20 | main() 300 行 | 重构成本高，当前可维护 |
| 21 | maybe() 按函数名匹配 | 已改进为 setGroup，--only 的 name matching 是可接受的折中 |
| 23 | 重复 setGroup("schema") | 无害 |
| 25 | duplicateDetection 不断言行为 | 需要了解服务端接口 |
| 26 | 源码字符串匹配 | 这些测试的本质就是检查代码结构 |
| 28 | "[Mock E2E test]" magic string | 需要服务端配合改 |
| 29 | testRealInventive_G2 标签错误 | cosmetic |
| 31 | pipeline 测试与 mock 测试重复 | pipeline 测试验证的是"按顺序跑不报错" |
| 33 | git diff --name-only HEAD | 可接受的行为 |

---

### 13.6 修复计划

详见 `docs/test-framework-refactor-plan.md` 的代码质量修复部分。

**修改文件清单**：

| 文件 | 修改内容 |
|------|---------|
| `tests/e2e/real-agents.mjs` | Fix 1（加 import）、Fix 11（延迟常量）、Fix 17（移除 unused import） |
| `tests/e2e/knowledge-code-structure.mjs` | Fix 2（读目录替代硬编码） |
| `tests/e2e/knowledge.mjs` | Fix 3（数据驱动上传）、Fix 12（用 HTTP 工具）、Fix 13（检查 res.ok）、Fix 14（提取 URL 常量） |
| `tests/e2e.mjs` | Fix 4（循环替代复制粘贴）、Fix 8（log clear 错误）、Fix 17（移除 unused import） |
| `tests/e2e/mock-agents.mjs` | Fix 5（表驱动复审测试） |
| `tests/e2e/schema-validation.mjs` | Fix 6（消除与 mock-agents 的重复） |
| `tests/e2e-shared/upload.mjs` | Fix 7（用 parseSSEResponse） |
| `tests/e2e-shared/http.mjs` | Fix 9（改进 parseSSEResponse 错误消息） |
| `tests/e2e-shared/retry.mjs` | Fix 10（修正退避算法或改名） |
| `tests/e2e-shared/config.mjs` | Fix 14（添加 SILICONFLOW_BASE_URL 常量） |
| `tests/e2e-shared/test-runner.mjs` | Fix 15（修正 allPassed 逻辑） |
| `tests/e2e-shared/index.mjs` | Fix 16（移除未使用的 re-export） |

---

### 13.7 总结

**之前的 review 犯了什么错**：
1. 只检查"有没有做"，不检查"做得怎么样"
2. 给了多处 ⭐⭐⭐⭐⭐ 优秀，但代码质量远达不到
3. 没有逐行读代码，只做了宏观的 checklist 检查
4. 发现了"功能存在"就标记完成，没有验证功能是否正确

**本次审计的改进**：
1. 逐行读代码，不信任任何"已完成"标记
2. 关注代码实际行为，而非代码是否存在
3. 发现了 2 个 CRITICAL bug（之前 review 完全没发现）

---

**Reviewer**: Claude Code
**Review Date**: 2026-06-03

# 全场景持久化自动测试方案

## 背景

Settings 持久化反复出现回归 bug（providers / searchProviders / knowledgeProviders 刷新后丢失）。根因是 `setSettings` 缺少 `isInitialized` 守卫（已修复），但缺少自动化测试覆盖导致这类 bug 无法被 CI 及时发现。

**目标**：建立全面的持久化测试，覆盖 app 中所有**业务数据**存储场景的写入-读回一致性。测试分三层：DB 层（内存数据库，毫秒级）→ HTTP 层（supertest，无真实网络）→ 客户端守卫层（mock fetch）。不消耗 token。

## 核心原则：测试必须断言正确行为，不是记录当前行为

> **反模式**：测试断言当前 buggy 行为（`expect(value).toBeUndefined()`），通过了等于什么都没测。
> **正确做法**：测试断言**正确行为**（`expect(value).toBeDefined()`），bug 存在时测试**失败**。

规则：
1. **每个测试用例必须写"预期正确行为"**，不写"记录当前行为"。如果当前代码做不到正确行为，测试就该失败。
2. **禁止用"已知限制"包装 bug**。"store 层无 isInitialized 守卫"是 bug，不是限制。测试应该断言守卫存在。
3. **可选字段的正确行为 = 有合理默认值**，不是 undefined。`providerErrorMessages` 应默认为 `[]`，`knowledge` 应默认为 `{ enabled: false }`，等等。如果 `readSettings()` 没给默认值，测试必须失败。
4. **写入失败的正确行为 = 用户有感知**，不是静默吞掉。如果 `writeSettings` 失败后用户看不到错误提示，测试必须失败。

**范围说明**：
- **包含**：所有业务实体 store（cases、documents、claimNodes、claimCharts、novelty、inventive、defects、chatSessions、chatMessages、opinionAnalyses、argumentMappings、interpretSummaries、reexamDrafts、summaries、runMarkers、searchSessions、feedback、textIndex、settings）
- **排除**：`ocrCache`（缓存层，有 7 天过期策略，非业务数据）、`knowledgeSources`/`knowledgeChunks`/`knowledgeVectors`（v0.2.0 知识库功能，已有独立测试 `tests/knowledge-base-e2e.mjs`）
- **特别关注**：`clearAllLocalData` 函数（历史 bug bg-43：`runMarkers`/`searchSessions` 未被清除导致数据残留）

---

## 安全原则

- 所有测试使用 **内存数据库**（`:memory:`）或 **临时文件数据库**
- 复用已有 `tests/helpers/testDb.ts` 的 `createMemoryDb()` 工具
- 绝不连接生产 `data/patent-examiner.db`
- 测试结束后自动清理临时文件

---

## 测试文件

`tests/integration/persistence.test.ts`

运行命令：
```bash
npm run test:db:all
# 或单独运行
vitest run --config vitest.integration.config.ts tests/integration/persistence.test.ts
```

---

## 一、Settings 全字段持久化（核心防回归）

### 测试数据 — 完整 AppSettings 对象

> **注意**：
> - `persistKeysEncrypted` 字段已在 B-027 中删除（从未有实现），不在测试数据中出现
> - 测试数据以实际运行代码为准。DESIGN.md §3.3 存在系统性偏差，以下接口需要同步更新：
>   - **`AppSettings` 接口**（缺少 5 个字段）：`searchProviders[]`、`knowledgeProviders[]`、`providerErrorMessages[]`、`enableProviderFallback`、`knowledge`
>   - **`ProviderConnection` 接口**（缺少 3 个字段）：`providers[].defaultModelId`、`providers[].modelFallbacks`、`providers[].enableModelFallback`（模型级 fallback，v0.1.0-r32 起）
>   - **`AgentAssignment.agent` 类型**（缺少 3 个值）：需从 7 个扩展到 10 个，增加 `"opinion-analysis"`、`"argument-analysis"`、`"reexam-draft"`（B-008 复审流程起）
> - DESIGN.md §3.3 仍包含已废弃的 `persistKeysEncrypted`，待清理

```typescript
const FULL_SETTINGS = {
  id: "app",
  mode: "real",
  guidelineVersion: "2023",
  providers: [
    {
      providerId: "mimo",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      apiKeyRef: "sk-mimo-test-key-12345",
      modelIds: ["MiMo-V2.5-Pro", "MiMo-V2.5"],
      defaultModelId: "MiMo-V2.5-Pro",
      modelFallbacks: ["MiMo-V2.5-Pro", "MiMo-V2.5"],
      enabled: true,
      enableModelFallback: true,
    },
    {
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyRef: "sk-deepseek-test-key-12345",
      modelIds: ["deepseek-chat", "deepseek-reasoner"],
      defaultModelId: "deepseek-chat",
      enabled: false,
      enableModelFallback: false,
    },
  ],
  agents: [
    { agent: "interpret", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 },
    { agent: "claim-chart", providerOrder: ["mimo", "deepseek"], modelId: "MiMo-V2.5-Pro", maxTokens: 8192, reasoningLevel: "high" },
    { agent: "novelty", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "inventive", providerOrder: ["deepseek"], modelId: "deepseek-reasoner", maxTokens: 16384, reasoningLevel: "high" },
    { agent: "summary", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "chat", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 },
    { agent: "draft", providerOrder: [], modelId: "", maxTokens: 1500 },
    { agent: "opinion-analysis", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 },
    { agent: "argument-analysis", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 },
    { agent: "reexam-draft", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 },
  ],
  searchProviders: [
    { providerId: "tavily", name: "Tavily", apiKeyRef: "tvly-dev-abc123def456", enabled: true },
    { providerId: "serpapi", name: "SerpAPI", apiKeyRef: "serpapi-key-789", baseUrl: "https://serpapi.com/search", enabled: false },
    { providerId: "epo", name: "EPO OPS", apiKeyRef: "epo-consumer:epo-secret", enabled: true },
  ],
  enableProviderFallback: true,
  providerErrorMessages: [
    {
      id: "err-001",
      providerId: "mimo",
      errorCode: "quota-exceeded",
      message: "Quota exceeded for MiMo API",
      timestamp: "2026-06-04T10:00:00.000Z",
      read: false,
      agent: "novelty",
      caseId: "case-123",
    },
    {
      id: "err-002",
      providerId: "deepseek",
      errorCode: "rate-limited",
      message: "Rate limit exceeded",
      timestamp: "2026-06-04T11:00:00.000Z",
      read: true,
      agent: "claim-chart",
      caseId: "case-456",
    },
  ],
  knowledge: {
    enabled: true,
    topK: 10,
    scoreThreshold: 0.5,
  },
  knowledgeProviders: [
    {
      providerType: "embedding",
      providerId: "siliconflow",
      displayName: "硅基流动 Embedding",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKeyRef: "sk-siliconflow-embedding-key",
      modelId: "BAAI/bge-m3",
      availableModels: ["BAAI/bge-m3", "BAAI/bge-large-zh"],
      enabled: true,
    },
    {
      providerType: "reranker",
      providerId: "siliconflow",
      displayName: "硅基流动 Re-ranker",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKeyRef: "sk-siliconflow-reranker-key-different",
      modelId: "BAAI/bge-reranker-v2-m3",
      availableModels: [],
      enabled: true,
    },
  ],
  sanitizeRules: [
    { pattern: "\\s+", replace: " ", note: "合并空白" },
  ],
  ocrQualityThresholds: { good: 0.70, poor: 0.40 },
};
// 注：测试数据使用 mimo + deepseek 两个 Provider 覆盖"启用/禁用"对比场景。
// 实际 PRESET_MODEL_PROVIDERS 共 10 个（含 qwen/bedrock/openrouter/opencode），
// 但持久化逻辑对所有 Provider 一致，无需逐个测试。
```

### 测试用例

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 写入完整 settings → `dbGetById` 读回 → 逐字段 deepEqual | 所有字段完整保留 |
| 2 | 写入 → 新建内存 DB → 再次写入 → 读回 | 模拟"重启"后数据不丢 |
| 3 | 更新 mimo provider 的 apiKeyRef → 读回验证 deepseek provider 不变 | 局部更新不破坏整体 |
| 4 | 写入空 `providers: []` → 读回确认为空数组 | 空数组不变成 undefined |
| 5 | 写入 `enableProviderFallback: false` → 读回确认为 false | 布尔值 false 不丢失 |
| 6 | 写入不含 `knowledge` 字段的 settings → `readSettings()` 读回 → knowledge 有合理默认值（`{ enabled: false }`） | **可选字段必须有默认值，undefined 会导致 UI 崩溃** |
| 7 | 写入不含 `knowledgeProviders` 字段的 settings → `readSettings()` 读回 → knowledgeProviders 为 `[]` | **可选数组字段必须默认为空数组** |
| 8 | `searchProviders` 中 EPO key 含冒号 `key:secret` → 读回完整保留 | 特殊字符不被截断 |
| 9 | `providerErrorMessages` 数组含 50 条（测试代码动态生成）→ 读回数量和内容一致 | 大数组序列化不丢 |
| 10 | `knowledgeProviders` 中 reranker 和 embedding 同 providerId 不同 providerType → 各自独立保留 | 复合主键区分正确 |

---

## 二、全 Store CRUD 持久化

对每个 store 测试 **Create → Read → Update → Delete → Readback** 完整链路。

### Store 列表与测试数据

> **来源说明**：下表中部分 store（如 `defects`、`chatSessions`、`opinionAnalyses`、`argumentMappings`、`reexamDrafts`、`searchSessions`）在 DESIGN.md §11 SQLite Schema 表中尚未列出，以代码实现（`server/src/routes/data.ts` + `tests/helpers/testDb.ts`）为准。DESIGN.md §11 待后续同步补充。

| Store | 关键字段 | 测试重点 |
|-------|---------|---------|
| `cases` | applicationNumber, title, patentType, workflowState, examinerNotes | 全字段读写 |
| `documents` | caseId, role(application/reference), fileName, extractedText, textIndex | role 字段区分 |
| `claimNodes` | caseId, claimNumber, type(independent/dependent), rawText | 类型字段 |
| `claimCharts` | caseId, featureCode, specificationCitations[], citationStatus | **嵌套数组** |
| `novelty` | caseId, referenceId, rows[].citations[], differenceFeatureCodes[] | **深嵌套** |
| `inventive` | caseId, closestPriorArtId, features[], overallConclusion | 复杂对象 |
| `defects` | caseId, category, description, severity, resolved | 布尔值 |
| `chatSessions` | caseId, title | 基础 CRUD |
| `chatMessages` | id, caseId, sessionId, moduleScope, role(user/assistant), content | 外键关联 + moduleScope 隔离 |
| `opinionAnalyses` | caseId, analysisData, createdAt | 时间戳 |
| `argumentMappings` | caseId, claimFeature, argument | 简单对象 |
| `interpretSummaries` | caseId(=id), summaries: `{ [documentId]: string }` | 嵌套对象映射（v0.1.0-r20 起） |
| `reexamDrafts` | id=caseId, draft content | 大文本 |
| `summaries` | id=caseId, summary content | 大文本 |
| `runMarkers` | id=`${caseId}::${module}`, caseId, module | 复合 ID |
| `searchSessions` | caseId, queries[], results[], updatedAt | 数组嵌套 |
| `feedback` | caseId, subjectType, subjectId, verdict(like/dislike), comment | 布尔枚举 |
| `textIndex` | documentId(=id), pages[], paragraphs[], lineMap[] | 大对象 |

### 通用测试模式

```typescript
// 每个 store 重复此模式
describe("Store: xxx", () => {
  it("Create → GetById → 字段一致", () => { ... });
  it("Update → GetById → 更新生效", () => { ... });
  it("Delete → GetById → 返回 null", () => { ... });
  it("Query by field → 过滤正确", () => { ... });
});
```

### 测试数据示例（chatSessions）

```typescript
const SAMPLE_CHAT_SESSION = {
  id: "session-1",
  caseId: "case-1",
  title: "文档解读对话",
  createdAt: "2026-06-04T10:00:00.000Z",
  updatedAt: "2026-06-04T10:00:00.000Z",
};
// 注：moduleScope 是 chatMessages 的字段，不是 chatSessions 的字段（见 DESIGN.md §3.2）
const SAMPLE_CHAT_MESSAGE = {
  id: "msg-1",
  sessionId: "session-1",
  caseId: "case-1",
  moduleScope: "case",
  role: "user",
  content: "这个技术方案的核心创新在哪？",
  createdAt: "2026-06-04T10:00:00.000Z",
};
```

### 测试数据示例（interpretSummaries）

```typescript
const SAMPLE_INTERPRET_SUMMARIES = {
  caseId: "case-1",  // caseId 同时作为主键 id
  summaries: {
    "doc-app-1": "本申请涉及一种LED灯具散热装置，核心技术方案包括...",
    "doc-ref-d1": "D1公开了一种铝合金散热基板，但未涉及石墨烯导热膜...",
  },
};
// 结构：{ [documentId]: string }，v0.1.0-r20 起（见 DESIGN.md §11）
```

---

## 三、复杂嵌套对象一致性（重点回归）

| 场景 | 测试方法 |
|------|---------|
| `claimCharts.specificationCitations[]` 含 10 条 citation | 写入 → 读回 → 数组长度和每条 citation 的 quote/confidence 一致 |
| `novelty.rows[0].citations[0].quote` 含中文 + 特殊字符 | 写入 → 读回 → 字符串完全匹配 |
| `inventive.features[]` 含多个 feature 分析 | 写入 → 读回 → 嵌套结构完整 |
| `providerErrorMessages[]` 含 50 条错误记录（动态生成） | 写入 → 读回 → 数组长度 = 50，每条 id 唯一 |
| `chatMessages` content 含 markdown + 代码块 | 写入 → 读回 → 内容不被转义破坏 |

---

## 四、边界场景

| 场景 | 预期行为 |
|------|---------|
| `apiKeyRef: ""`（空字符串） | 持久化后读回为空字符串，不是 undefined |
| `apiKeyRef: "sk-" + "x".repeat(2000)`（超长 key） | 完整保留 |
| `apiKeyRef` 含中文 `"测试密钥"` | 完整保留 |
| `apiKeyRef` 含 JSON 特殊字符 `"key\"with\"quotes"` | 不被 JSON.parse 破坏 |
| `modelIds: []`（空数组） | 读回为空数组，不是 undefined |
| `modelIds` 含 50 个模型 | 全部保留 |
| 同一 store 先 DELETE 再 INSERT 同 ID | 不冲突，数据为新值 |
| 连续 10 次 INSERT OR REPLACE 同 ID | 最终值为最后一次写入 |
| SQLite 写入异常（模拟 db.prepare().run 抛错） | 不崩溃，错误被捕获并记录 |
| `clearAllLocalData` 后查询所有 store | 所有 store 返回空数组（含 `runMarkers`、`searchSessions`，历史 bug bg-43） |
| `clearAllLocalData` 后重新写入 settings → 读回 | 正常工作，无脏数据残留 |
| `ocrCache` 写入后 `createdAt` 为 8 天前 → 读取时自动删除过期条目 | 7 天过期策略生效（PRD §7.2） |
| `ocrCache` 写入后 `createdAt` 为 6 天前 → 读取时正常返回 | 未过期条目不被误删 |

> 注：`clearAllLocalData` 为逻辑描述，实际函数名以代码为准（`settingsSlice.clearAllData` 或 `settingsRepo.clearAllLocalData`）。

---

## 五、与 settingsSlice 的集成测试

在 `tests/unit/settingsPersist.test.ts` 中补充：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `isInitialized=false` 时调用 `setSettings` → 断言 `writeSettings` **未被执行** | **store 层必须有 isInitialized 守卫，防止竞态覆盖 DB** |
| 2 | `loadFromDb` 完成后（`isInitialized=true`）调用 `setSettings` → DB 写入成功 | 正常流程可用 |
| 3 | `updateKnowledgeConfig` 在 `isInitialized=false` 时被调用 → 断言 `writeSettings` **未被执行** | **store 层必须有 isInitialized 守卫** |
| 4 | 写入含 `knowledgeProviders` 的 settings → `loadFromDb` 读回 → reranker apiKeyRef 完整 | **reranker key 不丢** |
| 5 | 写入含 `searchProviders` 的 settings → `loadFromDb` 读回 → EPO key 含冒号完整 | **search key 不丢** |

---

## 六、全链路持久化测试（Client → Server → DB）

> **背景**：§一~§五 测的是 DB 层和 mock fetch 层，但用户实际经历的是 `readSettings()` 函数的返回值。如果 `readSettings()` 不给可选字段补默认值，用户刷新页面就丢配置——但 §一~§五 的测试发现不了这个问题，因为它们 mock 了 `loadFromDb`。

### 5.5 readSettings() 真实返回值测试（核心抓 bug）

测试文件：`tests/unit/settingsPersist.test.ts`

**关键区别**：不 mock `loadFromDb`，只 mock 底层 `fetch`（模拟 server 返回）。让真实的 `readSettings()` 代码路径执行。

| # | 用例 | 验证点 | 关联 bug |
|---|------|--------|---------|
| 12 | server 返回不含 `providerErrorMessages` 的 settings → `loadFromDb()` → store 中 `providerErrorMessages` 应为 `[]`（不是 undefined） | **readSettings 必须为可选数组字段补默认值** | BUG-134 |
| 13 | server 返回不含 `knowledge` 的 settings → `loadFromDb()` → store 中 `knowledge` 应有默认值 `{ enabled: false }` | **readSettings 必须为可选对象字段补默认值** | BUG-133 |
| 14 | server 返回不含 `knowledgeProviders` 的 settings → `loadFromDb()` → store 中 `knowledgeProviders` 应为 `[]` | **同上** | BUG-132 |
| 15 | server 返回不含 `sanitizeRules` 的 settings → `loadFromDb()` → store 中 `sanitizeRules` 应为 `[]` | **同上** | BUG-135 |
| 16 | server 返回不含 `ocrQualityThresholds` 的 settings → `loadFromDb()` → store 中 `ocrQualityThresholds` 应有默认值 | **同上** | BUG-136 |
| 17 | server 返回不含 `agents` 的 settings → `loadFromDb()` → store 中 `agents` 应为 `[]`（不是 undefined，否则 UI 遍历崩溃） | **核心字段也必须有默认值** | — |
| 18 | server 返回只有 `{ id: "app", mode: "mock" }`（最小 settings）→ `loadFromDb()` → 所有字段都有值，无 undefined | **readSettings 对任何缺失字段都能兜底** | — |

> **测试模式**：mock fetch 让 `GET /api/data/settings/app` 返回精简数据 → 调用 `loadFromDb()` → 断言 store 中每个字段都不是 undefined。

### 5.6 writeSettings 失败感知测试

| # | 用例 | 验证点 | 关联 bug |
|---|------|--------|---------|
| 19 | `writeSettings` 网络失败 → 用户应收到错误提示（通过 `idbWriteGuard` 或其他机制） | **写入失败不能静默吞掉** | BUG-137 |
| 20 | `writeSettings` 返回 500 → 用户应收到错误提示 | **同上** | BUG-137 |

> **背景**：近期多个回归 bug 发生在数据流的不同层次（见下方"回归 bug 分层映射"），仅测试 DB 层无法捕获这些故障。本节设计覆盖完整数据链路的端到端测试。

### 回归 bug 分层映射

| 层次 | 故障模式 | 回归 bug | 根因 |
|------|---------|---------|------|
| **Client State → UI** | 组件挂载时用默认值覆盖已保存配置 | B-018 `a0bfed8` | useState 默认值 + useEffect 无守卫 |
| **Client State → UI** | persist effect 在 loadFromDb 完成前触发 | BUG-134 `fe82fce` | 缺少 isInitialized 守卫 |
| **Client State → UI** | 保存 key 时 enabled 状态未同步 | BUG-135 `b42a92d` | enabled 默认 false，未随 key 更新 |
| **Client → API** | API 端点缺少 Zod 输入校验 | BUG-101 `146ab0a` | 6 个端点无 schema 校验 |
| **Client → API** | agent 枚举不严格 | BUG-129 `f5a8aa7` | z.string() 而非 z.enum() |
| **Client → API** | 废弃 agent 仍在枚举中 | BUG-130 `5e3c632` | search-references 未移除 |
| **Shared Schema ↔ Prompt** | schema 字段 optional 但 prompt 要求必填 | BUG-123 `9feb5fb` | closestPriorArtId |
| **Shared Schema ↔ Prompt** | schema 缺少 .default([]) | BUG-124 `44d548f` | AI 省略 warnings → 验证失败 |
| **Shared Schema ↔ Prompt** | prompt 文本 ≠ schema 默认值 | BUG-128 `8a85eda` | legalCaution 措辞不一致 |
| **Client → DB** | readSettings 手动构造遗漏字段 | `a567442`（已修复：改为 `...spread`） | knowledge 字段丢失 |
| **Client → DB** | 新增字段未加入 readSettings | `9ed9e67`（已修复：展开运算符自动保留） | 每次加字段都要手动补漏 |
| **DB → Client** | 字段缺失导致页面刷新后丢失 | 多个（已修复：展开运算符 + 默认值兜底） | readSettings 构造不完整 |
| **Client → API** | Provider key 同步失败被静默吞掉 | bg-39 `64e4e3b` | syncProviderKeys 错误未传播给调用方 |

### 六.1 HTTP 全链路 Round-Trip 测试

测试文件：`tests/integration/persistence.test.ts`（与 §一~§四 同文件）

使用 supertest + 真实 Express router（复用 `server/src/routes/data.ts`），测试 HTTP 层的完整读写链路。

```typescript
// 测试基础设施：复用 server-routes.test.ts 的模式
import express from "express";
import request from "supertest";
import { dataRouter } from "@server/routes/data.js";
import { resetSyncDbForTesting } from "@server/lib/syncDb.js";
import { createMemoryDb } from "../../helpers/testDb.js";

function createTestApp(db: BetterSqlite3.Database) {
  // 注入测试数据库，避免连接生产 data/patent-examiner.db
  resetSyncDbForTesting(db);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", dataRouter);
  return app;
}

// beforeEach: 每个测试用例创建新的内存 DB
// afterEach: 自动清理（内存 DB 无需手动清理）
```

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | POST `/api/data/settings` 写入 FULL_SETTINGS → GET `/api/data/settings/app` 读回 → deepEqual | **HTTP round-trip 数据完整性** |
| 2 | POST 写入 → PUT 更新单个字段 → GET 读回 → 其余字段不变 | HTTP 层局部更新不破坏整体 |
| 3 | POST 写入含 EPO key（`key:secret`）→ GET 读回 → 冒号完整 | **特殊字符 HTTP 传输不被截断** |
| 4 | POST 写入含 `knowledgeProviders`（同 providerId 不同 providerType）→ GET 读回 → 两条独立存在 | **复合主键 HTTP 层正确** |
| 5 | POST 写入空 `providers: []` → GET 读回 → 确认为空数组非 undefined | 空数组 JSON 序列化/反序列化 |
| 6 | POST 写入 `enableProviderFallback: false` → GET 读回 → 确认为 false | 布尔 false 不被丢失 |
| 7 | POST 写入不含 `knowledge` 字段 → `readSettings()` 读回 → knowledge 有合理默认值 | **可选字段必须有默认值** |
| 8 | POST 写入 50 条 `providerErrorMessages` → GET 读回 → 数量和内容一致 | 大数组 HTTP 传输不丢 |

### 六.2 Schema ↔ Prompt 一致性测试

测试文件：`tests/integration/schemaPromptConsistency.test.ts`（新建）

**目的**：防止 schema 定义与 orchestrator prompt 指令不一致导致 AI 输出验证失败。

| # | 用例 | 验证点 | 关联 bug |
|---|------|--------|---------|
| 1 | 读取 inventive prompt → 提取"必须填写"字段列表 → 对比 inventiveSchema 的 required 字段 | **prompt 要求必填 ↔ schema 标记必填** | BUG-123 `9feb5fb`（closestPriorArtId optional vs required） |
| 2 | 读取 novelty prompt → 提取 legalCaution 文本 → 对比 noveltySchema 的 legalCaution 默认值 | **prompt 措辞 ↔ schema 默认值一致** | BUG-128 `8a85eda`（legalCaution 措辞不一致） |
| 3 | 读取 defect prompt → 提取输出字段 → 对比 defectSchema 的 .default() 设置 | **schema 默认值覆盖 AI 可能省略的字段** | BUG-124 `44d548f`（warnings 缺 .default([])） |
| 4 | 对所有 agent schema 执行 `.safeParse({})` → 缺失字段应有 .default() 或被标记为 required | **空输入不导致意外的验证通过** | BUG-124 |
| 5 | 对比 `agentRunInputSchema` 的 agent 枚举 与 `aiRunRequestSchema` 的 agent 枚举 → 完全一致 | **两处 agent 枚举同步** | BUG-129 `f5a8aa7`（枚举不严格） |
| 6 | 对比 agent 枚举 与 orchestrator.ts 的 `runAgent` switch case → 无遗漏无多余 | **枚举 ↔ 运行时处理一致** | BUG-130 `5e3c632`（废弃 agent 未移除） |

### 六.3 Client Store 持久化守卫测试

测试文件：`tests/unit/settingsPersist.test.ts`（扩展 §五 的用例）

| # | 用例 | 验证点 |
|---|------|--------|
| 6 | 组件层 `KnowledgeConfigPanel.updateSettings` 在 `isInitialized=false` 时调用 → 断言 `setSettings` 未被调用（守卫阻止写入） | **组件层守卫阻止 HTTP 请求发出** |
| 7 | 模拟 B-018 场景：loadFromDb 未完成时 updateKnowledgeConfig 被调用 → DB 不被覆盖（需 `@testing-library/react` 渲染 KnowledgeConfigPanel） | **防止挂载时覆盖** |
| 8 | 模拟 BUG-134 场景：loadFromDb 异步执行期间 persist effect 触发 → 验证 settings 未被覆盖（需 `@testing-library/react` 渲染 KnowledgeConfigPanel） | **异步竞态防护** |
| 9 | settings 含所有可选字段（knowledge, knowledgeProviders, providerErrorMessages, sanitizeRules, ocrQualityThresholds）→ setSettings → loadFromDb → 全字段完整 | **展开运算符保留所有字段** |
| 10 | store 层 `setSettings` 在 `isInitialized=false` 时被调用 → 断言 `writeSettings` **未执行** | **store 层守卫是唯一的防线，不能依赖调用方** |
| 11 | store 层 `updateKnowledgeConfig` 在 `isInitialized=false` 时被调用 → 断言 `writeSettings` **未执行** | **跨层守卫必须一致** |

### 六.4 Agent 枚举同步测试

测试文件：`tests/unit/schemas.test.ts`（扩展已有测试）

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `agentRunInputSchema` 的 agent 枚举值集合 === `aiRunRequestSchema` 的 agent 枚举值集合 | **两处枚举完全同步** |
| 2 | 以上枚举集合 ⊆ orchestrator `runAgent` switch 的 case 集合 | **枚举值都有运行时处理** |
| 3 | 枚举中不包含已废弃的 agent（如 "draft"、"search-references"） | **无死枚举值** |

---

## 七、数据库隔离测试（B-042）

> **背景**：B-042 设计了三层隔离架构（内存/临时文件/快照），但曾因 `agentPipeline.test.ts` 导入真实 server routes 时未调用 `resetSyncDbForTesting()`，导致 `beforeEach` 的 DELETE 全打到生产库 `data/patent-examiner.db`，清空用户配置。本节测试确保此问题永不再发。

### 设计原则（来自 DESIGN.md §9.2）

1. **隔离注入**：测试通过 `resetSyncDbForTesting(":memory:")` 注入内存数据库，`getSyncDb()` 返回测试 DB 而非生产 DB
2. **导入时序**：`resetSyncDbForTesting` 必须在 `import server routes` 之前调用（routes 模块顶层会调用 `getSyncDb()`）
3. **三种模式**：`:memory:`（最快，推荐）、临时文件（文件系统测试）、快照副本（数据迁移测试）
4. **全局清理**：`tests/globalSetup.ts` 的 `teardown` 函数清理所有追踪的临时文件 + `__TEST_SYNC_DB_PATH__` 全局变量
5. **CRUD 辅助**：`tests/helpers/testDb.ts` 提供 `createMemoryDb()` + `dbCreate/dbGetById/dbQuery/dbUpdate/dbDelete/dbClearStore/dbClearAll` 辅助函数

### 测试文件

`tests/integration/dbIsolation.test.ts`（新建）

```bash
vitest run --config vitest.integration.config.ts tests/integration/dbIsolation.test.ts
```

### 七.1 resetSyncDbForTesting 注入机制

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 调用 `resetSyncDbForTesting(":memory:")` → `getSyncDb()` 返回内存 DB → 写入数据 → 读回一致 | **注入后读写正常** |
| 2 | 注入 `":memory:"` 后写入数据 → 调用 `resetSyncDbForTesting()` (无参数) → `getSyncDb()` 仍返回内存 DB | **无参数调用不改变已注入的路径** |
| 3 | 注入 `":memory:"` → 写入数据 → 再次注入新临时文件路径 → `getSyncDb()` 返回新 DB → 数据为空 | **重复注入切换到新 DB** |
| 4 | `resetSyncDbForTesting(":memory:")` → 写入 → `closeSyncDb()` → `getSyncDb()` 重新初始化 → 数据丢失（内存 DB 特性） | **内存 DB 关闭后数据不保留** |
| 5 | 注入临时文件路径 → 写入 → `closeSyncDb()` → 重新 `getSyncDb()` → 数据完整 | **文件 DB 关闭后数据保留** |
| 6 | 注入 `":memory:"` 后 `globalThis.__TEST_SYNC_DB_PATH__` 为 `":memory:"` | **全局变量被正确设置** |
| 7 | `globalSetup.ts` teardown 后 `globalThis.__TEST_SYNC_DB_PATH__` 被删除 | **全局清理生效** |

### 七.2 生产库保护（核心防回归）

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | **不注入隔离**：直接 `import { getSyncDb } from syncDb` → 读取 `data/patent-examiner.db` 路径 → 断言测试不应走到此路径 | **静态分析：识别未隔离的 import** |
| 2 | 注入 `":memory:"` → 通过 `dataRouter` HTTP 写入 settings → 断言 `data/patent-examiner.db` 的 settings 表未被修改 | **HTTP 层写入不泄露到生产库** |
| 3 | 注入 `":memory:"` → `beforeEach` DELETE 全部 20 个 store → 断言生产库数据完整 | **DELETE 操作不影响生产库** |
| 4 | 两个独立测试文件各自注入 `":memory:"` → 断言数据互不影响（各自有独立内存 DB） | **测试间数据隔离** |
| 5 | 注入 `":memory:"` → 写入数据 → `resetSyncDbForTesting(":memory:")` 再次注入 → 数据为空（新内存 DB） | **重复注入不泄露旧数据** |

### 七.3 导入时序验证

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 先 `import { dataRouter }` → 再 `resetSyncDbForTesting(":memory:")` → 断言 dataRouter 的 `getSyncDb()` 已绑定生产库 | **后注入无效（确认时序重要性）** |
| 2 | 先 `resetSyncDbForTesting(":memory:")` → 再 `import { dataRouter }` → 写入 → 读回 → 数据在内存 DB | **先注入有效（正确模式）** |
| 3 | 使用 `await import()` 动态导入 routes → 在 import 前调用 `resetSyncDbForTesting(":memory:")` → 写入 → 读回正确 | **动态导入模式可行（agentPipeline.test.ts 模式）** |
| 4 | 静态 import routes + `beforeAll(() => resetSyncDbForTesting(":memory:"))` → 断言首次 `getSyncDb()` 调用时已注入 | **静态 import + beforeAll 模式可行（route-coverage.test.ts 模式）** |

> **注意**：用例 1 和 2 可能无法在同一个测试文件中同时验证（模块缓存），需分别在独立测试文件中验证，或通过 `vi.resetModules()` 清除模块缓存。

### 七.4 createMemoryDb 隔离验证

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `createMemoryDb()` → 断言 `db` 非 null、`path === ":memory:"`、`cleanup` 为函数 | **返回值结构正确** |
| 2 | `createMemoryDb()` → `dbCreate` 写入 → `dbGetById` 读回 → 字段一致 | **CRUD 辅助函数正常** |
| 3 | 创建两个独立 `createMemoryDb()` → 各自写入不同数据 → 断言互不影响 | **多个内存 DB 实例互不干扰** |
| 4 | `createMemoryDb()` → `cleanup()` → 断言 `db` 已关闭（再次操作抛错） | **cleanup 正确关闭 DB** |
| 5 | `createTempFileDb()` → 断言文件存在 → `cleanup()` → 断言文件已删除 + WAL/SHM 已清理 | **临时文件清理完整** |
| 6 | `createSnapshotDb()` → 断言数据与源 DB 一致 → 写入新数据 → 断言源 DB 未被修改 | **快照副本不修改源 DB** |
| 7 | `createMemoryDb()` → 断言 `sync_data` 和 `sync_meta` 表已创建（schema 初始化） | **initSchema 正确执行** |

### 七.5 Store 名称准确性

> **历史 bug**：`agentPipeline.test.ts` 的 `beforeEach` 使用 `claimFeatures` 清理，但实际 store 名为 `claimCharts`，导致 claimFeatures 清理无效、claimCharts 数据残留。

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 对所有 20 个 store 名称执行 `dbCreate` + `dbGetAll` → 断言读写一致 | **每个 store 名称可用** |
| 2 | 使用错误 store 名称 `dbGetAll(db, "claimFeatures")` → 断言返回空数组 | **错误名称不报错但返回空** |
| 3 | 通过 `dataRouter` HTTP POST 写入 → GET 读回 → 断言 store 名称在 URL 路径中正确传递 | **HTTP 层 store 名称路由正确** |
| 4 | `beforeEach` 清理列表与 DESIGN.md §11 SQLite Schema 表完全一致 | **清理列表无遗漏无多余** |

**完整的 20 个 store 清理列表**（含 `ocrCache`——虽排除在业务数据持久化测试之外，但 `clearAllLocalData` 必须清除所有 store；与 DESIGN.md §11 一致）：

```typescript
const ALL_STORES = [
  "cases", "documents", "claimNodes", "claimCharts", "novelty",
  "inventive", "chatMessages", "feedback", "settings", "textIndex",
  "ocrCache", "interpretSummaries", "defects", "chatSessions",
  "opinionAnalyses", "argumentMappings", "reexamDrafts", "summaries",
  "runMarkers", "searchSessions",
];
```

### 七.6 globalSetup 生命周期

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 创建 3 个 `createTempFileDb()` → 调用 `cleanupAllTrackedFiles()` → 断言所有临时文件已删除 | **批量清理生效** |
| 2 | 创建临时文件 → 模拟测试崩溃（不调用 cleanup）→ 调用 `cleanupAllTrackedFiles()` → 断言文件已删除 | **崩溃后清理生效** |
| 3 | `cleanupAllTrackedFiles()` → 断言 `getTrackedFileCount() === 0` | **追踪计数正确清零** |
| 4 | `globalSetup.ts` teardown → 断言 `globalThis.__TEST_SYNC_DB_PATH__` 已删除 | **全局变量清理** |
| 5 | 创建临时文件 → `cleanup()` → 再次 `cleanup()` → 不报错 | **幂等清理不抛异常** |

### 七.7 测试基础设施静态审查

> **预防措施**：通过静态审查确保所有导入真实 server routes 的测试文件都正确使用了 DB 隔离。

| # | 审查项 | 验证方法 |
|---|--------|---------|
| 1 | `tests/integration/agentPipeline.test.ts` 包含 `resetSyncDbForTesting(":memory:")` 调用 | grep 验证 |
| 2 | `tests/integration/route-coverage.test.ts` 包含 `resetSyncDbForTesting(":memory:")` 调用 | grep 验证 |
| 3 | `tests/integration/persistence.test.ts`（§六.1 新建）包含 DB 隔离 | grep 验证 |
| 4 | 所有 `tests/integration/*.test.ts` 文件中，凡 `import.*@server/routes` 的，都必须有 `resetSyncDbForTesting` 调用 | **自动化扫描脚本** |
| 5 | `tests/globalSetup.ts` 导出 `teardown` 函数且包含 `__TEST_SYNC_DB_PATH__` 清理 | 代码审查 |

**自动化扫描脚本**（可集成到 CI）：

```bash
# 检查所有集成测试文件是否正确隔离
for f in tests/integration/*.test.ts; do
  if grep -q '@server/routes' "$f" && ! grep -q 'resetSyncDbForTesting' "$f"; then
    echo "ERROR: $f imports server routes but does not call resetSyncDbForTesting"
    exit 1
  fi
done
```

---

## 八、测试文件汇总

| 测试文件 | 覆盖章节 | 类型 | 状态 |
|---------|---------|------|------|
| `tests/integration/persistence.test.ts` | §一~§四, §六.1 | 集成测试（内存 DB + HTTP round-trip） | **新建** |
| `tests/unit/settingsPersist.test.ts` | §五, §六.3 | 单元测试（mock fetch） | **扩展已有**（200 行） |
| `tests/integration/schemaPromptConsistency.test.ts` | §六.2 | 集成测试（读取 prompt/schema 文件） | **新建** |
| `tests/unit/schemas.test.ts` | §六.4 | 单元测试 | **扩展已有**（631 行） |
| `tests/integration/dbIsolation.test.ts` | §七 | 集成测试（DB 隔离 + 生产库保护） | **新建** |

---

## 验证命令

```bash
# 运行所有持久化相关集成测试（§一~§四 + §六.1 HTTP round-trip）
npm run test:db:all

# 运行 schema/prompt 一致性测试（§六.2）
vitest run tests/integration/schemaPromptConsistency.test.ts

# 运行 settings 持久化单元测试（§五 + §六.3）
vitest run tests/unit/settingsPersist.test.ts

# 运行 agent 枚举同步测试（§六.4）
vitest run tests/unit/schemas.test.ts

# 运行数据库隔离测试（§七）
vitest run --config vitest.integration.config.ts tests/integration/dbIsolation.test.ts

# 完整验证（typecheck + lint + 全部测试）
npm run verify
```

**`test:db:all` 更新**：需将新测试文件加入 `package.json` scripts：
```json
"test:db:all": "vitest run --config vitest.integration.config.ts tests/integration/dbLogicChain.test.ts tests/integration/dbScenario.test.ts tests/integration/persistence.test.ts tests/integration/dbIsolation.test.ts"
```

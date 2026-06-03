# CLAUDE.md — 专利复审 AI 助手开发指南

## 核心原则：两类 Key 严格隔离（ADR-007 + B-041）

1. **APP 用户 Key**：用户在 APP 设置页配置，存入 server keyStore
2. **开发者自动测试 Key**：只来自 `.env`，通过请求体字段传递给服务端
3. **绝对不能交叉/fallback/优先/混合使用**

---

## .env 文件位置

项目根目录的 `.env` 文件包含所有 API key，**仅用于自动测试脚本**。

```env
# LLM Provider
GEMINI_KEY=your_gemini_key
MiMo_KEY=your_mimo_key
Openrouter_KEY=your_openrouter_key

# 搜索 Provider
TAVILY_API_KEY=your_tavily_key
SerpAPI_KEY=your_serp_key

# EPO 专利检索
EPO_CONSUMER_KEY=your_epo_key
EPO_CONSUMER_SECRET_KEY=your_epo_secret

# 知识库 Embedding/Reranker（可选）
siliconflow_Key=your_siliconflow_key
```

---

## 测试脚本和 API Key 映射

### E2E 测试（tests/e2e.mjs）

- **命令**：`npm run test:e2e`（Mock 模式）或 `npm run test:e2e:real`（Real 模式）
- **前提**：服务器已在 localhost:3000 运行
- **需要的 API Key**：
  - LLM API（fallback 顺序）：`MiMo_KEY` → `GEMINI_KEY` → `Openrouter_KEY`
  - 搜索 API：`TAVILY_API_KEY`、`SerpAPI_KEY`、`EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET_KEY`
  - Embedding/Reranker API：`siliconflow_Key`
- **缺少 key 时**：对应测试自动 skip，不报错

### 单元/集成测试

- **命令**：`npm test`（单元）或 `npm run test:integration`（集成）
- **需要的 API Key**：无（全部 mock）

### 知识库 E2E 测试（tests/knowledge-base-e2e.mjs）

- **命令**：`node tests/knowledge-base-e2e.mjs`
- **前提**：自启动服务器（port 3099），无需手动启动
- **需要的 API Key**：
  - `siliconflow_Key`（可选，用于 reranker 集成测试）

---

## API Key 传递方式（开发测试专用）

所有 API key 都通过**请求体**传递，不通过 header，不通过 keyStore：

| 用途 | 请求体字段 | 示例 |
|------|-----------|------|
| LLM API key | `apiKey` | `{ "apiKey": "sk-xxx" }` |
| 搜索 API key | `searchApiKey` | `{ "searchApiKey": "epo_key:epo_secret" }` |
| 知识库 Embedding | `embedding.apiKey` | `{ "embedding": { "apiKey": "sk-xxx", "baseUrl": "...", "modelId": "..." } }` |
| 知识库 Reranker | `reranker.apiKey` | `{ "reranker": { "apiKey": "sk-xxx", "baseUrl": "...", "modelId": "..." } }` |

测试脚本通过 `tests/e2e-shared/env.mjs` 的 `loadEnvFile()` 加载 `.env`，通过 `getApiKey("gemini")` 等函数获取 key。

---

## 常见错误

❌ **错误做法**：尝试将 .env 中的 key 加载到 keyStore
✅ **正确做法**：测试脚本从 .env 读取 key，通过请求体字段传递给服务端

❌ **错误做法**：让 APP 读取 .env 中的 key
✅ **正确做法**：APP 只使用用户在设置页配置的 key

❌ **错误做法**：混淆 LLM API key 和搜索 API key
✅ **正确做法**：LLM API key 用 `apiKey` 字段，搜索 API key 用 `searchApiKey` 字段

❌ **错误做法**：在生产代码中用 `process.env.GEMINI_KEY` 读取 key
✅ **正确做法**：生产代码从 keyStore 读取，测试脚本从 .env 读取

❌ **错误做法**：测试脚本使用自己想当然的 key 名字
✅ **正确做法**：使用 `getApiKey("gemini")` 等函数，key 名字在 `tests/e2e-shared/config.mjs` 中集中管理

---

## E2E 测试架构

### 测试文件结构

```
tests/
├── e2e.mjs              # 统一入口（所有测试从这里运行）
├── e2e/                 # 拆分后的测试模块
│   ├── index.mjs        # 模块索引
│   ├── health.mjs       # 健康检查
│   ├── mock-agents.mjs  # Mock 模式测试
│   ├── real-agents.mjs  # Real 模式测试
│   ├── schema-validation.mjs  # Schema 验证
│   ├── knowledge.mjs    # 知识库测试
│   └── pipeline.mjs     # 全链路测试
└── e2e-shared/          # 共享工具模块
    ├── config.mjs       # API key 映射、fallback 模型、超时配置
    ├── env.mjs          # .env 加载、getApiKey/getTestBase
    ├── http.mjs         # postJSON/getJSON/getJSONWithParams
    ├── retry.mjs        # isRetryableError/FallbackModelManager/delay
    ├── schema-validators.mjs  # 所有 validate*Output 函数
    ├── upload.mjs       # uploadKnowledgeFile
    ├── sample-data.mjs  # SAMPLE_* 常量、buildMockRequest
    └── test-runner.mjs  # log/assert/runTest
```

### 运行特定测试

```bash
node tests/e2e.mjs                    # 全量 Mock
node tests/e2e.mjs --only mock        # 所有 Mock 测试
node tests/e2e.mjs --only claimchart  # Claim Chart 相关
node tests/e2e.mjs --only real        # Real 模式（需 key）
node tests/e2e.mjs --only malformed   # 错误处理
node tests/e2e.mjs --check            # 带 lint+typecheck 门禁
```

---

## 常用命令

```bash
npm run dev              # 启动开发服务器（前端 + 后端）
npm test                 # 运行单元测试
npm run test:integration # 运行集成测试
npm run test:e2e         # 运行 E2E 测试（Mock）
npm run typecheck        # TypeScript 类型检查
npm run lint             # ESLint 检查
npm run verify           # 完整验证（typecheck + lint + 测试 + E2E）
```

## 相关文档

- [PRD.md](./PRD.md) - 产品需求文档
- [DESIGN.md](./DESIGN.md) - 设计文档
- [backlog.md](./backlog.md) - 功能 backlog

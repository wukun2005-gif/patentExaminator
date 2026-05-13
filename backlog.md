# Backlog

## B-001: AI 辅助文献检索（自动生成候选文献清单）

**优先级：** P0 — 核心体验提升，显著降低审查员检索负担
**状态：** Done
**目标版本：** v0.1.0

### 问题陈述

当前文献清单完全依赖审查员手动上传对比文件。审查员需要：
1. 阅读申请文件理解技术方案
2. 自行在专利数据库中检索相关文献
3. 找到文献后手动上传 PDF/DOCX
4. 手动填写公开号、公开日等元数据

步骤 2-3 占用大量时间，且是高度重复性工作。如果 AI 能根据申请文件自动检索并生成候选文献清单，审查员只需确认/调整，效率将大幅提升。

### 功能描述

AI 根据申请文件的权利要求和技术方案，自动从多个数据源检索相关专利文献，生成**候选文献清单**。用户可以：
- 查看 AI 推荐的每篇文献（标题、公开号、摘要、相关度评分、AI 推荐理由）
- **接受**文献加入正式对比文件列表
- **拒绝/删除**不相关的推荐
- **手动添加** AI 未检索到的文献
- 触发**补充检索**（调整关键词/技术领域后重新检索）

### 数据源（按优先级）

| 数据源 | 接入方式 | 优势 | 劣势 |
|--------|---------|------|------|
| Web Search（Google Patents / Espacenet） | API | 覆盖广、无需额外授权 | 结构化程度低、检索精度有限 |
| CNIPA 专利检索 | API / 爬虫 | 中国专利覆盖最全 | 接入复杂、可能有访问限制 |
| Google Patents API | API | 全球覆盖、免费 | 需处理速率限制 |
| 用户配置的私有数据库 | 自定义接口 | 可接入企业内部系统 | 需要用户自行配置 |

v0.2.0 优先接入 **Web Search**（作为默认数据源），后续版本支持用户配置外部专利数据库。

### 检索策略

1. **关键技术特征提取** — AI 从独立权利要求中提取核心技术特征、技术问题、技术效果
2. **检索式构建** — AI 将技术特征转化为专利检索式（IPC 分类号 + 关键词 + 同义词扩展）
3. **多源检索** — 并行查询多个数据源
4. **结果去重与排序** — 按相关度、公开日期、引用次数等维度排序
5. **元数据自动填充** — 尽可能提取公开号、公开日、标题、摘要、IPC 分类

### 数据模型扩展

```typescript
// 新增：候选文献状态
type ReferenceSource = "user-upload" | "ai-search" | "user-added-from-candidate";

// 扩展 ReferenceDocument
interface ReferenceDocument {
  // ... 现有字段 ...
  source: ReferenceSource;          // 文献来源
  aiRelevanceScore?: number;        // AI 相关度评分 (0-100)
  aiRecommendationReason?: string;  // AI 推荐理由
  searchQuery?: string;             // 生成此结果的检索式
  candidateStatus?: "pending" | "accepted" | "rejected"; // 候选状态
  searchSessionId?: string;         // 关联的检索会话
}

// 新增：检索会话
interface SearchSession {
  id: string;
  caseId: string;
  createdAt: ISODateString;
  query: string;                    // AI 生成的检索式
  dataSources: string[];            // 使用的数据源
  resultCount: number;
  status: "running" | "completed" | "failed";
}
```

### UI 交互流程

```
申请文件已上传
      │
      ▼
┌─────────────────────┐
│  文献清单 页面       │
│                     │
│  [AI 检索候选文献]   │ ← 新增按钮
│                     │
│  ┌───────────────┐  │
│  │ AI 候选文献    │  │ ← 新增区域
│  │               │  │
│  │ 1. CN112xxxA  │  │
│  │   相关度: 92  │  │
│  │   [接受][拒绝] │  │
│  │               │  │
│  │ 2. US10xxxxB  │  │
│  │   相关度: 85  │  │
│  │   [接受][拒绝] │  │
│  └───────────────┘  │
│                     │
│  已确认文献          │ ← 现有区域
│  ┌───────────────┐  │
│  │ 1. CN108xxxA  │  │
│  │ 2. ...        │  │
│  └───────────────┘  │
└─────────────────────┘
```

### 技术实现要点

1. **后端新增 `/api/search-references` 端点**
   - 接收申请文件文本 / 权利要求
   - 调用 LLM 提取技术特征并构建检索式
   - 调用外部数据源 API
   - 返回结构化的候选文献列表

2. **前端新增 `ReferenceSearchPanel` 组件**
   - 检索触发、进度展示、结果列表
   - 接受/拒绝交互
   - 与现有 `ReferenceLibraryPanel` 联动

3. **Agent 新增 `search-references` 能力**
   - Prompt: 从权利要求提取检索要素 → 构建检索式
   - 支持多轮检索（用户反馈后调整检索策略）

### 验收标准

- [ ] 用户点击"AI 检索"后，系统根据申请文件自动生成候选文献清单（至少 5 篇）
- [ ] 每篇候选文献显示：标题、公开号、摘要、相关度评分、推荐理由
- [ ] 用户可以接受/拒绝每篇候选文献
- [ ] 接受的文献自动进入正式文献清单，元数据（公开号、公开日）自动填充
- [ ] 用户可以手动添加 AI 未检索到的文献
- [ ] 时间轴校验对 AI 检索的文献同样生效
- [ ] 检索失败时有明确的错误提示，不影响手动上传功能

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 外部 API 访问限制 / 不可用 | 多数据源冗余；降级为手动上传 |
| AI 检索结果相关度低 | 用户可拒绝；记录反馈用于优化 prompt |
| 元数据（公开日）提取不准 | 沿用现有 `publicationDateConfidence` 机制，标注置信度 |
| 网络环境限制（内网部署） | 支持配置代理；优先支持可离线的检索方式 |

### 与现有功能的关系

- **文献清单（ReferenceLibraryPanel）**：扩展，新增"AI 候选"区域
- **新颖性分析**：候选文献接受后才能触发新颖性对比
- **创造性分析**：同上，需要已确认的文献列表
- **时间轴校验**：复用现有 `dateRules.ts` 逻辑

## B-002: 创建精简版测试数据（3页申请文件+3页对比文件）

**优先级：** P0 — 开发测试优化，降低 token 消耗
**状态：** Done
**目标版本：** v0.1.0

### 问题陈述

当前 samples 文件夹下的测试数据文件很大（申请文件 30+ 页，对比文件 20+ 页），在开发测试时消耗大量 token，增加测试成本，且测试速度慢。需要一套精简版的测试数据，既包含所有必要的专利文档元素，又能大幅减少页数。

### 功能描述

创建 `samples/led-heatsink-mini` 和 `samples/li-battery-fastcharge-mini` 两个新文件夹，每个文件夹包含：
- 3页申请文件 PDF（包含封面、权利要求书、核心说明书段落）
- 2个对比文件，每个3页PDF（包含封面、权利要求书、核心公开内容）
- 保留所有必要的专利文档元素：申请号、申请人、权利要求、技术特征、对比文献内容等

### 技术实现要点

1. **基于现有生成脚本修改**
   - 复用 `scripts/generate-sample-pdf.js` 等现有脚本
   - 精简内容，只保留核心部分
   - 控制每个文件在 3 页以内

2. **申请文件精简内容**
   - 第1页：封面（申请号、申请人、发明人等基本信息）+ 权利要求书（独立权利要求+从属权利要求）
   - 第2页：说明书核心部分（技术领域、背景技术、发明内容、权利要求引用的技术特征段落）
   - 第3页：附图说明 + 摘要

3. **对比文件精简内容**
   - 第1页：封面（公开号、标题、公开日）+ 权利要求书（相关权利要求）
   - 第2页：说明书核心部分（公开的技术特征段落）
   - 第3页：附图

### 验收标准

- [ ] 新增 `samples/led-heatsink-mini` 文件夹，包含申请文件（3页）和 2 个对比文件（各 3 页）
- [ ] 新增 `samples/li-battery-fastcharge-mini` 文件夹，包含申请文件（3页）和 2 个对比文件（各 3 页）
- [ ] 所有精简版 PDF 包含完整的权利要求书和必要的技术特征描述
- [ ] 使用精简版数据可以跑通 app 所有流程（文档解析、权利要求提取、新颖性分析、创造性分析等）
- [ ] 更新 `samples/README.md`，添加精简版数据的说明

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 精简过度导致功能测试不完整 | 仔细规划内容裁剪，确保保留所有必要的测试元素 |
| 生成的 PDF 格式不规范 | 基于现有脚本修改，保持格式一致 |

---

## B-003: 开发 API 级端到端真实功能自动测试框架

**优先级：** P0 — 确保产品质量，降低回归风险
**状态：** Done
**目标版本：** v0.1.0

### 问题陈述

当前项目测试覆盖严重不足：
- 唯一 E2E 测试（`tests/e2e/app.spec.ts`）仅验证 app 加载和 mode banner 显示
- 单元测试覆盖部分工具函数，但缺少 API 级别的端到端集成测试
- 前后端 API 交互（`/api/ai/run`、各个 Agent 路由）没有自动化测试
- Bug 多，每次改动缺乏回归保护网

需要参考 resumeTailor 的 `test-e2e.mjs` 框架设计，构建一套纯 Node.js 脚本的 API 级自动测试框架。UI 交互留给人类手工验证，测试重点放在前后端 API 全链路。

### 功能描述

构建一个独立的 Node.js `.mjs` 脚本 `tests/e2e-real.mjs`，通过 HTTP 请求直接调用后端 API，覆盖所有核心功能模块的端到端链路。**这是项目唯一的 E2E 自动测试文件**——现有 Playwright 测试（`tests/e2e/app.spec.ts`）的内容将被吸收合并后删除，Playwright 配置一并移除。

框架设计遵循 resumeTailor test-e2e.mjs 的核心理念：

- **自包含脚本**：单文件 `.mjs`，零外部测试框架依赖，`node tests/e2e-real.mjs` 即可运行
- **纯 API 测试**：直接 HTTP POST/GET 后端端点，不启动浏览器，不做 UI 交互
- **双模式运行**：Mock 模式（不消耗 Token、不需要 Key，验证全流程 schema/逻辑）和 Real 模式（调用真实 AI API，验证端到端功能正确性）
- **PASS/FAIL 汇总**：每个测试用例输出 `[PASS]` / `[FAIL]`，末尾统计通过率和失败清单，exit code 反映结果
- **选择性运行**：支持 `--only <pattern>` 按函数名过滤，开发时只跑相关测试
- **变更驱动测试选择**：文件顶部有详细的测试分类指南（见 §测试分类指南），执行测试的 AI 根据 `git diff` 变更文件自动选择相关测试，而非盲目全跑

### 使用场景与使命

此测试框架在**每次提交前强制运行**（pre-commit gate）：

```
开发者修改代码 → git diff 分析变更范围
                      │
                      ├── 变更仅涉及 UI（CSS/HTML 结构/样式）
                      │   → 跳过 E2E 自动测试
                      │   → 人类手工验证 UI
                      │
                      ├── 变更涉及后端/API/Agent/Schema/共享类型
                      │   → 根据 §测试分类指南 选择相关测试
                      │   → node tests/e2e-real.mjs --only <category>
                      │   → 必须全部 PASS，否则不能提交
                      │
                      └── 新 Feature 开发
                          → 添加新测试用例到 tests/e2e-real.mjs
                          → 跑新用例验证 Feature + 跑受影响模块的旧用例防回归
                          → 全部 PASS 后方可提交
```

**测试选择原则（写入脚本顶部注释，AI 必读）：**
- 修改 `server/src/routes/ai.ts` → 跑 `--only mock`（全量 Mock）+ `--only schema`
- 修改 `shared/src/schemas/xx.ts` → 跑 `--only schema` + `--only mockXx`
- 修改某 Agent 的 prompt/mock fixture → 跑 `--only mock<AgentName>`
- 修改 `shared/src/types/` → 跑 `--only schema` + `--only mock`
- 修改 `server/src/services/webSearch.ts` → 跑 `--only realSearch`（需 GEMINI_KEY + TAVILY_API_KEY）
- 修改 Provider/fallback/Gateway → 跑 `--only real`（需 GEMINI_KEY）
- 修改非核心文件（README/docs/config）→ 跳过 E2E

### 测试分类指南（写入 tests/e2e-real.mjs 文件顶部注释）

参考 resumeTailor test-e2e.mjs 顶部的分类注释（第 1-121 行），脚本文件必须包含以下分类指南供 AI 执行者查阅：

```javascript
/**
 * E2E Functional Test Suite for Patent Examiner
 * ==============================================
 *
 * 测试分类指南（AI 开发者必读）：
 * 根据 git diff 变更文件选择对应测试，不要盲目全跑。
 *
 * 【基础连通性测试】任何非 UI 改动都必须跑
 * ├── testHealthCheck              - GET /api/health
 * └── testMockModeEnabled          - Mock 模式默认开启
 *
 * 【Claim Chart 测试】修改 claims/claim-chart Agent/claimChartSchema 时运行
 * ├── testMockClaimChart_G1        - G1 LED 散热 → 特征拆解 + Schema
 * ├── testMockClaimChart_G3        - G3 零对比文件 → 正常生成 + 待检索清单
 * └── testSchemaClaimChart         - Schema 校验
 *
 * 【Novelty 测试】修改 novelty/新颖性对照相关时运行
 * ├── testMockNovelty_G1           - G1 → 公开状态 + Citation
 * └── testSchemaNovelty            - Schema 校验
 *
 * 【Inventive 测试】修改 inventive/创造性三步法相关时运行
 * ├── testMockInventive_G2         - G2 锂电池 → 三步法结构
 * ├── testMockInventive_G3_NoRef   - G3 无对比文件 → 跳过创造
 * └── testSchemaInventive          - Schema 校验
 *
 * 【Interpret 测试】修改 interpret/文档解读相关时运行
 * └── testMockInterpret_G1         - G1 → 解读输出非空
 *
 * 【Search References 测试】修改 search/文献检索相关时运行
 * ├── testMockSearchReferences_G1  - G1 → 候选文献列表
 * └── testSchemaSearchReferences   - Schema 校验
 *
 * 【Search API 真实测试】修改搜索 Provider/webSearch 时运行（需 GEMINI_KEY + TAVILY_API_KEY）
 * ├── testRealSearchVerifyTavilyKey - Tavily Key 有效性
 * ├── testRealSearchVerifySerpKey   - SerpAPI Key 有效性
 * ├── testRealSearchReferences_G1   - 真实搜索流程
 * └── testRealSearchRateLimit       - 搜索频率限制验证
 *
 * 【Export 测试】修改 export/导出相关时运行
 * └── testMockExportHtml_G1        - G1 → HTML 结构 + legalCaution
 *
 * 【错误处理测试】修改 API Gateway/路由/错误处理时运行
 * ├── testInvalidAgent             - 非法 agent → 400
 * ├── testMissingRequiredFields    - 缺少必要字段 → 400
 * └── testEmptyClaimText           - 空权利要求 → 合理提示
 *
 * 【全量 Mock 回归】修改共享类型/Schema/核心基础设施时运行
 * → --only mock  （运行所有 Mock 模式测试，秒级完成）
 *
 * 【Real 模式测试】修改 Provider/Gateway/Fallback 时运行（需 GEMINI_KEY）
 * ├── testRealProviderConnectivity - Gemini API 连通性
 * ├── testRealClaimChart_G1        - G1 Claim Chart 真实 AI 生成
 * ├── testRealNovelty_G1           - G1 新颖性对照真实 AI
 * ├── testRealInventive_G2         - G2 三步法真实 AI
 * ├── testRealFallbackMechanism    - 429 → fallback 切换
 * └── testRealTokenUsageReturned   - usage 字段验证
 *
 * 【完整流程测试】修改流程编排/AgentClient 时运行
 * ├── testFullPipelineMock_G1      - G1: 案件→Chart→Novelty→Export
 * └── testFullPipelineMock_G2      - G2: 案件→Chart→Inventive→Export
 *
 * 【UI 改动】跳过 E2E 自动测试，人类手工验证
 *
 * Usage:
 *   # 全量 Mock（默认，推荐日常开发）
 *   node tests/e2e-real.mjs
 *
 *   # 根据变更选择（开发时）
 *   node tests/e2e-real.mjs --only mock        # 所有 Mock 测试
 *   node tests/e2e-real.mjs --only claimChart  # claim chart 相关
 *   node tests/e2e-real.mjs --only schema      # Schema 校验
 *   node tests/e2e-real.mjs --only real        # Real 模式（需 Key）
 *
 *   # Real 模式
 *   GEMINI_KEY=xxx node tests/e2e-real.mjs --real
 *   GEMINI_KEY=xxx node tests/e2e-real.mjs --only realClaimChart
 */
```

### 测试分层与范围

```
tests/e2e-real.mjs
├── 【Mock 模式测试】（默认，无需 Key，秒级完成）
│   ├── 基础连通性：health check、app 加载（吸收原 app.spec.ts）、Mock 模式开关
│   ├── Agent 全链路（Mock）：Claim Chart / Novelty / Inventive / Interpret / Search / Summary
│   ├── Schema 校验：每个 Agent 返回的 JSON 是否符合 shared/schemas 定义
│   ├── 错误处理：非法请求、超时、Agent 不存在的响应
│   └── 预置案例回归：G1/G2/G3 fixture 数据一致性
│
├── 【Real 模式测试】（需 GEMINI_KEY，分钟级完成）
│   ├── Provider 连通性：Gemini API 连通性 + 模型列表验证
│   ├── Agent 全链路（Real）：Claim Chart / Novelty / Inventive / Interpret / Search
│   ├── Fallback 机制：配额错误自动切换 Gemini 模型、9 个 fallback 依次尝试
│   ├── Token 计量：验证 SSE 流返回的 usage 字段完整性
│   └── 真实案例验证：G1 新颖性对照 skeleton、G2 三步法 skeleton
│
└── 【共享基础设施】
    ├── loadEnvFile()：从 .env 或环境变量加载 GEMINI_KEY
    ├── postJSON() / getJSON()：封装的 HTTP 请求函数
    ├── parseSSE()：SSE 流式响应解析
    ├── log()：PASS/FAIL 记录 + 调用栈
    ├── 重试/fallback 逻辑：429 → 切换模型，5xx → 指数退避
    └── RESULTS[] + Summary 统计
```

### API 端点测试矩阵

每个 Agent 的测试维度：

| Agent | API 路径 | Mock 模式验证 | Real 模式验证 |
|-------|---------|-------------|-------------|
| Health | `GET /api/health` | 200 + `{status:"ok"}` | 同左 |
| Claim Chart | `POST /api/ai/run` (agent=`claim-chart`) | Schema 校验、特征 A/B/C 存在、Citation 字段完整 | 真实 AI 输出特征拆解正确性、说明书出处定位 |
| Novelty | `POST /api/ai/run` (agent=`novelty`) | 公开状态四档枚举、D1 行校验 | 真实文件的新颖性对照准确性 |
| Inventive | `POST /api/ai/run` (agent=`inventive`) | 三步法结构完整、Step 1/2/3 字段 | G2 案例三步法输出正确性 |
| Interpret | `POST /api/ai/run` (agent=`interpret`) | 解读文本非空、包含技术方案概述 | 真实解读质量 |
| Search References | `POST /api/search` | 候选文献列表结构、去重逻辑 | 真实检索结果质量 |
| Export HTML | `POST /api/export/html` | HTML 结构完整、legalCaution 存在 | 同左 |

### 技术实现要点

1. **测试环境配置**
   - 测试 Key 来源（从 `.env` 加载，均在 `.gitignore` 中）：
     | 环境变量 | 用途 | 调用频率限制 |
     |---------|------|-------------|
     | `GEMINI_KEY` | Google AI Studio API（AI 文本生成） | 免费层 1500 req/day，RPM 有限；默认 8000ms 间隔 |
     | `TAVILY_API_KEY` | Tavily Search API（专利搜索，主用） | 免费层 1000 req/month；每次搜索消耗 1 credit；严格控制频率 |
     | `SerpAPI_KEY` | SerpAPI（专利搜索，备用） | 免费层 100 req/month；极限节省使用 |
   - Base URL：`TEST_BASE` 环境变量，默认 `http://localhost:3000/api`
   - 默认模型：`gemini-3.1-flash-lite-preview`（可通过 `GEMINI_MODEL_ID` 覆盖）
   - Fallback 模型列表（按优先级，共 9 个）：
     ```
     gemini-3.1-flash-lite-preview   # 1. 速度极快、配额最高
     gemini-2.5-flash-lite            # 2. 速度极快、配额最高
     gemini-2.0-flash-lite            # 3. 速度极快、配额最高
     gemini-3-flash-preview           # 4. 综合能力最强
     gemini-2.5-flash                 # 5. 综合能力最强
     gemini-2.0-flash                 # 6. 综合能力最强
     gemini-3.1-pro-preview           # 7. 高级能力(配额较低)
     gemini-3-pro-preview             # 8. 高级能力(配额较低)
     gemini-2.5-pro                   # 9. 高级能力(配额较低)
     ```
     可通过 `GEMINI_MODEL_FALLBACKS` 逗号分隔覆盖
   - 搜索 Rate limit delay：`SEARCH_RATE_LIMIT_DELAY`，默认 15000ms（搜索 API 配额更紧张）
   - AI Rate limit delay：`GEMINI_RATE_LIMIT_DELAY`，默认 8000ms
   - Banned model patterns：过滤 image/imagen/audio/embedding/video 等非文本模型
   - Mock 模式通过请求 body 中 `mock: true` 参数启用

2. **测试框架结构**（参考 resumeTailor test-e2e.mjs）
   ```javascript
   // 环境加载
   loadEnvFile()                        // 读 .env → process.env
   
   // HTTP 工具
   postJSON(path, body) → fetch()      // POST + JSON 请求
   getJSON(path) → fetch()             // GET + JSON 响应
   parseSSE(text) → {text, error, usage} // 解析 text/event-stream
   postSSEWithRetry(path, body, retries) // 带 fallback 的 SSE 请求
   
   // 测试工具
   log(test, pass, detail)             // 记录 PASS/FAIL + 调用栈
   delay(ms)                           // rate limit 等待
   
   // 测试函数（每个 async function testXxx() 为一个测试用例）
   async function testHealthCheck()
   async function testMockClaimChart_G1()
   // ...
   
   // main() 编排
   async function main()               // 按顺序执行、支持 --only 过滤
   ```

3. **测试数据策略 — 极致节省 Token**
   - Gemini 模型配额有限（免费层 1500 req/day，付费层 RPM/TPM 也有限制），测试数据必须精简
   - **Mock 模式零 Token**：~18 个 Mock 用例完全不消耗 Token，是主力回归测试
   - **Real 模式最小化 Token**：
     - 每个 Agent 仅挑 1 个最具代表性的 case（而非全量 9 案例）
     - G1 代表新颖性：1 条权利要求 + 1 篇对比文件（特征 A/B/C 各一行描述即可）
     - G2 代表创造性：1 条权利要求 + 2 篇对比文件（精简至核心参数）
     - 输入文本控制在 ~500 tokens 以内（权利要求文字精简至核心要素）
     - 不传完整 PDF 全文，仅传人工提炼的关键段落文本
   - **模型选择节省**：默认用 `gemini-3.1-flash-lite-preview`（速度最快、配额最高），fallback 按优先级依次尝试
   - **测试输入示例**（Real 模式 G1 权利要求，~200 tokens）：
     ```
     "一种LED灯具散热装置，包括：散热基板(A)，铝合金材质，表面有散热翅片；
      导热界面层(B)，石墨烯复合导热膜，厚度0.1-0.5mm；风冷模块(C)，含离心风扇和导风罩。"
     ```
   - **对比文件输入示例**（Real 模式 G1 D1 摘要，~150 tokens）：
     ```
     "D1(CN201510012345A，公开日2015-06-20)：铝合金散热基板+散热翅片；
      导热硅脂连接(非石墨烯)；自然对流散热(无风扇)。"
     ```

4. **Schema 验证**
   - 每个 Agent 返回的 JSON 必须通过 `shared/src/schemas/` 中对应的 Zod schema
   - 测试中 import 对应 schema，对 AI 返回结果执行 `schema.safeParse()`
   - Schema 验证失败 → FAIL + 输出 zod error

5. **错误处理与重试**
   ```
   AI 429 (quota) → 切换下一个 Gemini fallback 模型，等待 5s
   AI 5xx/网络错误 → 指数退避 [8s, 16s, 32s]，最多 3 次
   AI 401/403 → 不重试，直接 FAIL（Key 无效）
   
   搜索 429 (rate limit) → 指数退避 [15s, 30s, 60s]，最多 3 次
   搜索 5xx → 切换备用搜索 Provider（Tavily → SerpAPI），不可重试
   搜索 quota 耗尽 → FAIL + 提示 "搜索 API 月配额已耗尽，跳过搜索测试"
   
   Schema 校验失败 → 不重试，直接 FAIL（输出格式问题）
   ```

6. **Mock 模式下的预置案例覆盖**
   - 复用 PRD 附录 C 的 G1/G2/G3 定义
   - Mock 模式验证：Claim Chart 特征识别、Novelty 公开状态、Inventive 三步法结构
   - 所有 Mock 响应必须通过 Schema 校验
   - 可以使用 `?mockDelay=0` 加速

### 核心测试用例清单（~25+ 个）

**基础连通性（2 个）**
- `testHealthCheck` — `GET /api/health` 返回 200
- `testMockModeEnabled` — Mock 模式默认开启，`/api/ai/run` 返回预置响应

**Mock 模式 Agent 全链路（8 个）**
- `testMockClaimChart_G1` — G1 LED 散热装置 → Claim Chart 特征拆解 + Schema 校验
- `testMockNovelty_G1` — G1 → 新颖性对照 + 公开状态 + Citation
- `testMockInventive_G2` — G2 锂电池 → 三步法 Step 1/2/3 结构
- `testMockInterpret_G1` — G1 → 文档解读输出非空
- `testMockSearchReferences_G1` — G1 → 候选文献检索结果
- `testMockClaimChart_G3` — G3 零对比文件 → 正常生成 + 待检索问题清单
- `testMockInventive_G3_NoRef` — G3 → 无对比文件时跳过创造性分析
- `testMockExportHtml_G1` — G1 导出 HTML 结构完整

**Schema 校验（4 个）**
- `testSchemaClaimChart` — claim-chart 输出通过 `claimChartSchema`
- `testSchemaNovelty` — novelty 输出通过 `noveltySchema`
- `testSchemaInventive` — inventive 输出通过 `inventiveSchema`
- `testSchemaSearchReferences` — search 输出通过 `searchReferencesSchema`

**错误处理（3 个）**
- `testInvalidAgent` — 非法 agent 名称返回 400
- `testMissingRequiredFields` — 缺少必要字段返回 400
- `testEmptyClaimText` — 空权利要求文本 → 合理错误提示

**Real 模式（~12 个，需 GEMINI_KEY + 搜索 Key）**
- `testRealProviderConnectivity` — Gemini API 连通性 + 模型列表
- `testRealClaimChart_G1` — 真实 AI 生成 G1 Claim Chart + Schema 校验
- `testRealNovelty_G1` — 真实 AI 生成 G1 新颖性对照
- `testRealInventive_G2` — 真实 AI 生成 G2 三步法 skeleton
- `testRealFallbackMechanism` — 模拟 429 触发 fallback 模型切换
- `testRealTokenUsageReturned` — 验证 SSE 流中 usage 字段
- `testRealSearchReferences_G1` — 真实 Tavily 搜索 G1 LED 散热相关专利 + 验证返回候选文献
- `testRealSearchVerifyTavilyKey` — 验证 Tavily API Key 有效性（`POST /api/verify-search-key`）
- `testRealSearchVerifySerpKey` — 验证 SerpAPI Key 有效性
- `testRealSearchRateLimit` — 验证搜索 API 频率限制处理（连续请求后不封禁）
- `testRealEndToEnd_G1` — G1 完整链路：AI 提取检索词 → Tavily 搜索 → AI 筛选排序 → 候选文献清单

**端到端完整流程（2 个）**
- `testFullPipelineMock_G1` — Mock 模式：新建案件 → Claim Chart → Novelty → Export 全流程 API 调用链
- `testFullPipelineMock_G2` — Mock 模式：新建案件 → Claim Chart → Inventive → Export 全流程

### Key 管理与安全

- 测试 Key 来源：Google AI Studio（`https://aistudio.google.com`），`GEMINI_KEY` 环境变量
- 与用户 Key 严格隔离：测试脚本读 `.env` 中的 `GEMINI_KEY`，用户 Key 由 server keystore 管理
- `.env` 已在 `.gitignore`，不提交
- 脚本内不打印完整 Key，日志中仅显示末 4 位
- 401/403 → 不重试不 fallback，直接 FAIL（Key 无效）

### 运行方式

```bash
# Mock 模式全量测试（推荐，无需 Key，秒级完成）
node tests/e2e-real.mjs

# Real 模式（需先配置 GEMINI_KEY）
GEMINI_KEY=xxx node tests/e2e-real.mjs --real

# 选择性运行（开发时）
node tests/e2e-real.mjs --only claimChart   # 只跑 claim chart 相关
node tests/e2e-real.mjs --only mock         # 只跑 mock 模式测试
node tests/e2e-real.mjs --only real         # 只跑 real 模式测试
node tests/e2e-real.mjs --only G1           # 只跑 G1 相关测试

# 自定义 Base URL 和模型
TEST_BASE=http://localhost:3000/api GEMINI_MODEL_ID=gemini-2.5-flash node tests/e2e-real.mjs --real

# 添加到 npm scripts
npm run test:e2e-real    # → node tests/e2e-real.mjs
npm run test:e2e-real -- --real   # → node tests/e2e-real.mjs --real
```

### 验收标准

- [ ] `tests/e2e-real.mjs` 脚本完成，单文件自包含、零外部测试框架依赖——这是项目**唯一**的 E2E 自动测试文件
- [ ] 旧的 `tests/e2e/app.spec.ts` **已删除**，其内容（app 加载 + mode banner 验证）已合并到新框架的 health check 和 Mock 连通性测试中
- [ ] `playwright.config.ts` 中的 E2E 配置已移除，若 Playwright 无其他用途则整个依赖和配置删除
- [ ] `package.json` 中 `test:e2e` 脚本指向新框架，移除旧的 `playwright test` 命令；若 Playwright 完全删除则移除 `@playwright/test` 依赖
- [ ] Mock 模式全量测试通过（~18 个测试用例），无需任何 Key
- [ ] Real 模式测试支持（~6+ 个），需 `GEMINI_KEY`
- [ ] Schema 校验：所有 Agent 的 Mock 输出通过对应 Zod schema
- [ ] 选择性运行：`--only` 和 `--real` 参数正常工作
- [ ] PASS/FAIL 汇总：末尾输出总数/通过数/失败数/失败清单，失败时 exit code = 1
- [ ] Rate limit 处理：有 Gemini fallback 模型列表 + 429 自动切换 + 指数退避重试
- [ ] 更新 `DEVELOPMENT_PLAN.md` §9 测试章节
- [ ] 更新 `backlog.md` B-002（如果 B-002 简化测试数据已就绪，标记为 done；如果未就绪，要求在 B-003 开始前先完成 B-002）

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 测试用 Gemini Key 配额限制严格 | Mock 模式为主力（零消耗）；Real 模式用 flash-lite 默认、输入文本极致精简（~500 tokens/次）、9 个 fallback 模型轮换 |
| AI 输出随机性导致 Real 测试不稳定 | Real 模式仅做 smoke（输出非空 + Schema 校验），不做精确文本比对 |
| 测试脚本依赖 server 运行 | 脚本开头自动 health check，server 未启动时提前退出并提示 |
| Fixture 数据与代码不同步 | Mock 测试验证 Schema 结构而非精确内容；Schema 变更时同步更新 fixture |
| Gemini fallback 模型全部配额耗尽 | Real 模式失败不阻塞 Mock 模式；Mock 模式独立运行；可配置 `GEMINI_MODEL_ID` 临时切换其他模型 |

## B-004: 申请文件修改版本智能比对与变更解读

**优先级：** P1 — 审查流程中的高频刚需，显著提升审查效率
**状态：** [ ] 待开发
**目标版本：** v0.1.0

### 问题陈述

在发明专利实质审查过程中，申请人在收到审查意见后常常会提交修改后的申请文件（权利要求书、说明书等），向审查员发送新版本。当前系统：

1. **textVersion 下拉仅是一个标签**（original / amended-1 / amended-2），不关联实际的文档版本
2. **无法上传新版本文件并关联到旧的版本**——审查员只能手动切换 textVersion，系统无法知道新版本文件与旧版本的实际对应关系
3. **没有自动比对能力**——审查员需要人工逐字比对旧版本和新版本，找出申请人修改了哪些内容，这是一项耗时且容易遗漏的重复性工作
4. **变更影响不透明**——即使人工找出了变更，审查员还要自己判断这些变更对已有分析结果（Claim Chart、新颖性对照、创造性分析等）的影响

审查员需要一个自动化流程：上传新版本文件 → 系统自动与指定旧版本逐项比对 → AI 解读变更内容 → 标记受影响的下游产出。

### 功能描述

系统提供完整的**申请文件版本管理与智能比对**能力：

**1. 文档版本管理**
- 用户可上传新的申请文件版本（修改后的权利要求书、说明书等）
- 新文件自动关联到当前案件的 `textVersion`（如 "amended-1"）
- 系统维护文件与 `textVersion` 的映射关系，知道每个版本对应的实际文档内容
- 支持为每个版本添加备注（如"依据第一次审查意见修改"）

**2. 自动逐项比对**
- 用户选择"与前一版本比对"，系统自动对比两个版本的文本
- 文字级 diff：使用 diff 算法精确标注新增、删除、修改的文本段落
- 结构化 diff：针对权利要求书，按权利要求的逐项比对（权1 vs 权1、权2 vs 权2），识别：
  - 新增的权利要求
  - 删除的权利要求
  - 修改的权利要求（文字变更 + 引用关系变更）
- 针对说明书，按段落/章节比对，标注修改区域

**3. AI 变更解读**
- AI 用通俗语言总结变更内容，回答三个核心问题：
  - 申请人改了**什么**？（变更内容摘要）
  - 改的原因是什么？（推断修改意图：克服新颖性缺陷？澄清不清楚之处？缩小保护范围？）
  - 对本审查案件的影响是什么？（哪些已有分析结果需要更新？）
- 解读输出在独立的对话面板中，审查员可追问具体变更的细节

**4. 下游产出联动更新**
- 基于 diff 结果，系统自动标记受影响的已有分析：
  - Claim Chart 中涉及修改权利要求的特征 → 标记为 stale，提示"权利要求已修改，建议重新拆解"
  - 新颖性对照中涉及变更特征的 → 标记为 stale
  - 创造性分析中涉及变更特征的 → 标记为 stale
- 审查员可一键触发受影响模块的重新分析（沿用已有 Agent，无需重复配置）

### 数据模型扩展

```typescript
// 新增：文档版本快照
interface DocumentVersion {
  id: string;
  caseId: string;
  textVersion: PatentCase["textVersion"];  // "original" | "amended-1" | "amended-2"
  parentVersion?: PatentCase["textVersion"]; // 基于哪个版本修改
  documents: string[];                      // 关联的 SourceDocument IDs
  changeDescription?: string;               // 申请人声称的修改说明
  examinerNotes?: string;                   // 审查员备注
  createdAt: ISODateTimeString;
}

// 新增：版本比对结果
interface VersionDiff {
  id: string;
  caseId: string;
  baseVersion: PatentCase["textVersion"];   // 旧版本
  targetVersion: PatentCase["textVersion"]; // 新版本
  status: "pending" | "completed" | "failed";
  sections: DiffSection[];                  // 各部分的比对结果
  aiSummary?: string;                       // AI 变更摘要
  affectedModules: AffectedModule[];        // 受影响的功能模块
  createdAt: ISODateTimeString;
}

interface DiffSection {
  sectionType: "claims" | "description" | "abstract" | "drawings";
  label: string;                            // e.g., "权利要求1", "说明书§3.2"
  changeType: "added" | "deleted" | "modified" | "unchanged";
  oldText?: string;
  newText?: string;
  diffMarkup?: string;                      // 带标注的 diff 文本
  aiInterpretation?: string;                // AI 对该处变更的单独解读
}

interface AffectedModule {
  module: "claim-chart" | "novelty" | "inventive" | "summary" | "draft";
  entityIds: string[];                      // 受影响的实体 ID 列表
  reason: string;                           // 受影响的原因
  staleStatus: "stale";                     // 标记为需更新
}
```

### UI 交互流程

```
案件详情页 → 文档导入区域
  │
  ├── 当前版本: original（已上传 3 个文件）
  │
  └── [上传新版本] 按钮
        │
        ▼
      ┌──────────────────────────────┐
      │  上传修改后的申请文件          │
      │  选择版本: amended-1          │
      │  修改说明: (申请人声称的)     │
      │  [上传文件...]                │
      │  [取消]  [确认上传]           │
      └──────────────────────────────┘
        │
        ▼ 上传完成后
      ┌──────────────────────────────┐
      │  版本比对                     │
      │  旧版本: original             │
      │  新版本: amended-1            │
      │                              │
      │  [开始自动比对]               │
      └──────────────────────────────┘
        │
        ▼ 比对完成后
      ┌──────────────────────────────┐
      │  比对结果面板                 │
      │                              │
      │  AI 变更摘要:                 │
      │  "申请人主要修改了权利要求1， │
      │   将'石墨烯复合导热膜'限定为   │
      │   '厚度0.1-0.3mm'，缩小了保护 │
      │   范围...                     │
      │                              │
      │  逐项变更:                    │
      │  ┌──────────────────────┐    │
      │  │ 权利要求1 ✏️ 修改     │    │
      │  │ + 厚度0.1mm-0.3mm    │    │
      │  │ - 厚度0.1mm-0.5mm    │    │
      │  │ [AI 解读] 缩小保护范围│    │
      │  ├──────────────────────┤    │
      │  │ 权利要求5 ➕ 新增     │    │
      │  │ + 还包括主动散热风扇  │    │
      │  │ [AI 解读] 新增从属权利│    │
      │  ├──────────────────────┤    │
      │  │ 说明书§0023 ✏️ 修改  │    │
      │  │ ...                  │    │
      │  └──────────────────────┘    │
      │                              │
      │  受影响模块:                  │
      │  ⚠️ Claim Chart — 特征B 描述  │
      │     需更新 (权1已修改)        │
      │  ⚠️ 新颖性对照 — 需重新分析   │
      │      (区别特征范围已变化)     │
      │                              │
      │  [一键更新所有受影响模块]      │
      │  [仅更新 Claim Chart]        │
      │  [仅更新新颖性对照]           │
      └──────────────────────────────┘
```

### 技术实现要点

1. **Diff 引擎**
   - 文字级：使用 `diff` 库（如 `diff-match-patch` 或 `jsdiff`）进行逐行/逐段文本比对
   - 结构化：针对权利要求，先按权利要求编号对齐（权1→权1），再逐项 diff
   - 输出统一 diff 格式（unified diff）供前端渲染

2. **新增 `/api/ai/run` Agent: `version-diff`**
   - 输入：旧版本全文 + 新版本全文 + 已解析的权利要求列表
   - 输出：结构化 diff（`versionDiffSchema`）+ AI 变更解读
   - Prompt 设计要点：
     - 要求 AI 按权利要求的逐项分析变更
     - 解读变更的潜在法律含义（缩小保护范围？澄清？新增特征？）
     - 标注"所有解读为候选分析，需审查员确认"

3. **前端新增组件**
   - `VersionUploadPanel.tsx` — 新版本文件上传 + 版本选择
   - `VersionDiffPanel.tsx` — 比对结果展示（diff 视图 + AI 解读）
   - `VersionDiffActions.tsx` — 受影响的模块更新触发按钮

4. **联动更新机制**
   - 复用现有"textVersion 切换 stale 标记"机制（DESIGN §4.3.1）
   - 比对完成后自动标记受影响模块为 stale
   - 用户点击更新按钮时，携带变更上下文重新调用对应 Agent（如 claim-chart agent 会收到"权利要求1已从X改为Y，请重新拆解"的提示）

5. **IndexedDB 新增 store**
   - `documentVersions` — 存储 DocumentVersion 记录
   - `versionDiffs` — 存储 VersionDiff 比对结果

### 与现有功能的关系

- **案件基线（CaseBaselineForm）**：现有 textVersion 下拉已有 original/amended-1/amended-2 选项，不需要修改
- **文档导入（DocumentUploadPanel）**：扩展，新增"上传为新版本"模式
- **Claim Chart / 新颖性 / 创造性**：依赖现有的 stale 标记机制（DESIGN §4.3.1），无需修改这些模块本身
- **Agent 分配**：新增 `version-diff` Agent，需在设置页面配置 Provider

### 验收标准

- [ ] 用户可上传新版本的申请文件（权利要求书、说明书等），并关联到 textVersion
- [ ] 用户选择旧版本和新版本后，系统自动执行逐项比对
- [ ] 比对结果以 diff 视图展示：新增（绿色）、删除（红色）、修改（黄色）
- [ ] AI 生成变更解读摘要，用通俗语言说明改了什么、可能的原因、对审查的影响
- [ ] 审查员可在 diff 视图中对具体变更追问 AI（复用 AgentChatPanel）
- [ ] 比对完成后，受影响的下游模块（Claim Chart、新颖性对照、创造性分析）自动标记为 stale
- [ ] 用户可一键触发受影响模块的重新分析
- [ ] Mock 模式提供预置比对结果（基于 G1/G2/G3 案例构造修改版本）

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| AI 对修改意图的解读可能不准确 | 所有解读标注"候选分析·需审查员确认"；审查员可在对话面板追问或修正 |
| 权利要求重新编号导致逐项对齐失败 | Diff 前先做权利要求的相似度匹配（用文本相似度而非仅依赖编号），用户可手动调整对齐关系 |
| 大文本 diff 性能问题（100页说明书） | 先做段落级哈希快速定位未修改部分，仅对变化区域做细粒度 diff |
| 联动更新可能遗漏受影响的分析 | 以特征代码为单位追踪变更影响；保守策略下可提示"建议全部重新分析" |
| textVersion 值有限（仅 original/amended-1/amended-2） | 后续扩展 textVersion 联合类型为 `"original" \| "amended-${number}"` 支持任意次修改 |

---

## B-005: 审查意见草稿的原文依据（Grounding Citation）

**优先级：** P0 — 审查意见法律严谨性的核心要求，无此则草稿不可直接用于 OA 起草
**状态：** Todo
**目标版本：** v0.1.0

### 问题陈述

当前系统分析模块（Claim Chart、新颖性对照、创造性分析）已能产出带 `quote` 字段的 Citation 结构化数据，但**最终审查意见草稿**存在以下 gap：

1. **简述模块未实现**：`SummaryPanel.tsx` 仅为占位 UI，未实际生成审查意见正文。
2. **草稿正文无内联引用**：`DraftMaterialPanel.tsx` 将各模块片段平铺展示，但不将 Citation 的 `quote` 编织进正文——正文是纯文本，引用出处仅以标签/段落号形式存在，审查员仍需自行回源文档查找对应原文。
3. **导出缺失审查意见正文**：`exportMarkdown.ts` 完全没有新颖性/创造性章节；`exportHtml.ts` 新颖性对照表不展示每行的 citation quote。
4. **Citation 来源不完整**：当前 citation 主要来自对比文件（reference），但审查意见同样需要引用**权利要求书原文**（`ClaimNode.rawText`）和**说明书原文**（`ClaimFeature.specificationCitations`）。

**核心差距**：审查意见的每一条事实主张缺少从源文档摘录的**原文引用**。审查员拿到草稿后仍需自行回源文档查找对应段落——而这正是系统应消除的重复劳动。

### 功能描述

审查意见草稿中每一条事实主张，必须附带源文档的**原文引用（grounding citation）**。**原文（而非段落号链接或指针）必须出现在审查意见正文中。**

三层原文依据：

| 依据来源 | 文档类型 | 数据来源 | 呈现示例 |
|---------|---------|---------|---------|
| 权利要求书原文 | 申请文件 | `ClaimNode.rawText` | "权利要求 1 记载：'…原文…'" |
| 说明书原文 | 申请文件 | `ClaimFeature.specificationCitations[].quote` | "说明书记载：'…原文…'（[0035]段）" |
| 对比文件原文 | 对比文件 | `NoveltyComparisonRow.citations[].quote` / `InventiveStepAnalysis.motivationEvidence[].quote` | "D1 公开了：'…原文…'（D1 [0008]段）" |

原文引用在正文中的呈现格式：

```
【权利要求原文】
权利要求 X 记载："<引用原文>"。

【本申请说明书依据】
说明书记载："<引用原文>"（[段落号]段）。

【对比文件依据】
对比文件 D1（CNxxx）公开了："<引用原文>"（[段落号]段），
该内容相当于本申请的 <技术特征>。
```

### 影响的系统组件

| 组件 | 变更内容 |
|------|---------|
| `shared/src/prompts/summary.prompt.md` | 强化为"每条事实必须引出处的引用原文，原文必须是逐字摘录，内联出现在输出正文中" |
| `shared/src/prompts/draft.prompt.md`（新增） | 新增审查意见草稿生成 prompt，明确要求三种原文来源的引用格式 |
| `shared/src/schemas/draft.schema.ts` | 扩展 draft 结构，区分 `body`（含引用的正文）和 `aiNotes`（无出处的内容），增加 citations 校验 |
| `client/src/features/draft/DraftMaterialPanel.tsx` | 正文中的引用原文以引用块样式呈现；可 hover 查看完整上下文 |
| `client/src/features/summary/SummaryPanel.tsx` | 不再为占位，实现真实的简述生成与展示（含内联原文引用） |
| `client/src/lib/exportHtml.ts` | 新颖性对照表每行展示 citation quote；创造性分析展示全部 motivationEvidence quote；新增审查意见正文章节 |
| `client/src/lib/exportMarkdown.ts` | 大幅增强：补充新颖性/创造性/审查意见正文章节，每章节含内联原文引用 |
| `server/src/routes/ai.ts` | 支持 `draft` / `summary` agent 路由 |
| `shared/src/fixtures/` | 新增 draft/summary mock fixture（覆盖 G1/G2） |
| `tests/e2e-real.mjs` | 新增 draft/summary 测试用例 |

### 数据流

```
Claim Chart（confirmed citationStatus + specificationCitations[].quote）
        +
新颖性对照（user-reviewed + rows[].citations[].quote）
        +
创造性分析（motivationEvidence[].quote）
        │
        ▼
  ┌─────────────────────────────┐
  │  Draft / Summary Agent      │
  │  约束：                      │
  │  - 正文每条事实必须引用原文   │
  │  - 原文必须内联（引号+来源）  │
  │  - 区分三种来源              │
  │  - 不确定内容进 AI 备注区     │
  └─────────────────────────────┘
        │
        ▼
  审查意见草稿正文（内联原文引用）
        │
        ├──→ DraftMaterialPanel（引用块高亮展示）
        └──→ Export（HTML / Markdown）
```

### Citation 质量门禁

只有满足以下条件的 citation 才能进入审查意见正文：
- `quote` 字段非空
- `quote` 长度 ≥ 20 字符（过短的引用无实质内容）
- `confidence` 为 `high` 或 `medium`
- 已通过 `citationMatch.ts` 验证（quote 在源文档中可定位）

不满足条件的 citation 进入 AI 备注区，标注为"待补充原文依据"。

### 验收标准

- [ ] 审查意见草稿的每条事实主张均附有原文引用（三种来源至少各出现 1 次）
- [ ] 原文引用在正文中以引号标注 + 来源段落号的形式内联呈现，不接受仅段落号/链接的引用
- [ ] `quote` 非空且长度 ≥ 20 字符的 citation 才能进入正文
- [ ] 简述（Summary）模块不再为占位 UI，能生成带原文引用的审查意见简述
- [ ] HTML/Markdown 导出包含完整的审查意见正文（含内联原文引用）
- [ ] DraftMaterialPanel 中原文引用有视觉区分（引用块样式）
- [ ] 新增 Draft/Summary Agent 的 mock fixture（覆盖 G1/G2）
- [ ] `tests/e2e-real.mjs` 新增 draft/summary 测试用例

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| AI 生成的引用原文不准确（张冠李戴） | `citationMatch.ts` 四级容错验证；每处引用标注 confidence level |
| AI 输出过长（内联原文增加 token 消耗） | Prompt 限制单条 quote ≤ 300 字符，超出以"…"省略 |
| 原文引用过多致正文冗长 | 提供"简洁/详细"两档——简洁模式仅引用关键原文，详细模式引用全部 |
| 依赖前置模块（Claim Chart + Novelty + Inventive）全部完成 | 草稿生成前校验前置状态，缺失时提示用户先完成 |
| 三种来源引用格式不一致 | Prompt 中规定标准引用格式模板，AI 严格遵循 |

---

## B-006: 文档解读环节的非中文内容自动翻译

**优先级：** P1 — 提升英文专利文档的可读性，降低审查员语言障碍
**状态：** Planned
**目标版本：** v0.1.0

### 问题陈述

当前文档解读（`InterpretPanel`）直接将原始文档文本发送给 AI，prompt 要求"请用中文回答"。当专利申请文件为英文（如 US 专利、PCT 申请）时：

1. AI 虽然能理解英文输入并输出中文解读，但**不提供对原文的忠实翻译**——审查员只能看到 6 维度的分析摘要，无法在解读页面直接阅读中文版专利文档
2. 审查员如需查阅专利文档的中文翻译，必须手动复制原文到外部翻译工具，打断审查流程
3. 中文专利审查实践中，审查员需要对照中文版本理解外文专利文献的技术细节

需要在文档解读环节增加翻译能力：对于非中文（主要是英文）文档，先翻译成中文，再基于中文译文进行解读，审查员可同时查看翻译和解读结果。

### 功能描述

文档文本进入解读页面后，系统自动检测语言：
- **中文文档**（CJK 字符占比 ≥ 30%）：跳过翻译，直接进行解读（保持现有行为）
- **非中文文档**（主要是英文）：先调用翻译 Agent 将文档翻译为中文，翻译结果展示在可编辑区域，然后自动基于中文译文调用解读 Agent 生成 6 维度解读

用户可手动触发重新翻译、重新解读，也可直接编辑翻译结果后点"重新解读"基于修改版重新生成解读。

### 核心流程

```
文档文本
    │
    ▼
┌──────────────┐
│ 语言检测      │  CJK 字符占比统计
└──────┬───────┘
       │
   ┌───▼───┐
   │中文?   │
   └─┬───┬─┘
    是   否
     │    │
     │    ▼
     │  ┌─────────────┐
     │  │ 翻译 Agent   │  英文→中文专利翻译
     │  └─────┬───────┘
     │        │
     │        ▼
     │  ┌─────────────┐
     │  │ 翻译结果展示  │  editable textarea
     │  └─────┬───────┘
     │        │
     ▼        ▼
  ┌─────────────────┐
  │ 解读 Agent       │  6维度分析（基于中文文本）
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ 解读结果展示      │  editable textarea
  └─────────────────┘
```

### 数据模型扩展

```typescript
// shared/src/types/agents.ts
type AgentKey = "..." | "translate";  // 新增

// client/src/agent/contracts.ts
interface TranslateRequest {
  caseId: string;
  documentText: string;       // 原始文档文本
}
interface TranslateResponse {
  translatedText: string;     // 中文翻译
}

// InterpretRequest 扩展
interface InterpretRequest {
  caseId: string;
  documentText: string;       // 原始文本（用于语言检测和 fallback 解读）
  translatedText?: string;    // 若已翻译则优先基于此字段解读
}
```

### UI 布局

```
┌─────────────────────────────────────────────┐
│  文档解读                     源语言: 英文   │
│                              [查看原文]     │
│                                             │
│  ┌ 中文翻译 ──────────────────────────────┐ │
│  │                                        │ │
│  │  [可编辑的中文翻译文本...]              │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│  [重新翻译]                                 │
│                                             │
│  ┌ 解读结果 ──────────────────────────────┐ │
│  │                                        │ │
│  │  ## 技术领域                           │ │
│  │  ## 核心技术方案                       │ │
│  │  ...                                   │ │
│  └────────────────────────────────────────┘ │
│  [重新解读] [保存解读]                       │
└─────────────────────────────────────────────┘
```

- 源语言标签自动显示（中文/英文/日文/其他）
- "查看原文"：弹窗或展开原始非中文文本（只读）
- 中文翻译区域：editable textarea，用户可修正术语
- 翻译完成后自动触发解读；用户修改翻译后可点"重新解读"
- 翻译与解读各自独立 loading 状态

### 技术实现要点

1. **语言检测** — 新增 `client/src/lib/languageDetect.ts`
   - 统计 CJK 字符（Unicode: `一-鿿`, `㐀-䶿`, `豈-﫿`）占总字符数比例
   - 阈值 30%：≥ 30% 判定为中文，跳过翻译
   - 纯函数，零外部依赖

2. **翻译 Agent** — `client/src/agent/AgentClient.ts` 新增 `runTranslate()`
   - `buildTranslatePrompt()`: 忠实翻译专利文献，保留段落/编号结构，对不确定术语给出原文标注
   - 输入截断与解读一致（12000 字符）

3. **InterpretPanel 改造** — `client/src/features/interpret/InterpretPanel.tsx`
   - 新增 state: `translatedText`, `isTranslating`, `sourceLanguage`
   - `useEffect` 中: 语言检测 → 若非中文 → `runTranslate()` → `runInterpret(translatedText)`
   - 中文文档路径与现有行为完全一致（零回归风险）

4. **后端适配** — `server/src/routes/ai.ts` 和 `server/src/lib/schemas.ts`
   - agent 枚举增加 `"translate"`
   - Mock 路由映射

5. **Router 适配** — `client/src/router.tsx`
   - `InterpretWrapper` 注入 `runTranslate`

6. **Mock Fixture** — `shared/src/fixtures/translate-g1.json`
   - G1 LED 散热装置英文原文的预置中文翻译

### 验收标准

- [ ] 上传英文专利文档后，系统自动检测语言并显示"英文"标签
- [ ] 非中文文档自动触发翻译，翻译结果在可编辑区域展示
- [ ] 翻译完成后自动基于中文译文进行 6 维度解读
- [ ] 上传中文专利文档后，跳过翻译直接解读（回归现有行为）
- [ ] 用户可编辑翻译结果，点击"重新解读"基于修改后的翻译重新生成解读
- [ ] 用户可点击"重新翻译"重新生成翻译
- [ ] 用户可点击"查看原文"展开原始英文文本
- [ ] 翻译失败时有明确错误提示，不影响手动触发解读
- [ ] Mock 模式下翻译 + 解读均可正常完成
- [ ] 新增 `--only translate` E2E 测试用例覆盖

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| AI 翻译专利术语不够准确 | 翻译结果可编辑；prompt 强调保留原文术语并标注；后续可接入术语库 |
| 翻译 + 解读串行调用，延迟翻倍 | 各自独立 loading 状态，用户感知清晰；中文文档零额外开销 |
| 语言检测误判混合中英文文档 | 30% CJK 阈值可调；用户可手动触发翻译覆盖检测结果 |
| 长文档翻译 Token 消耗大 | 与解读一致采用 12000 字符截断；后续可按段落分批翻译 |

### 与现有功能的关系

- **文档解读（InterpretPanel）** — 核心改造目标
- **文档上传（DocumentUploadPanel）** — 提取的文本作为翻译输入
- **AI Gateway** — 复用 `/api/ai/run`，新增 translate agent 类型
- **Agent 配置（AgentsAssignmentPanel）** — 新增 translate agent 的模型分配

---

## B-007: 文档解读环节的图像理解与解读

**优先级：** P0 — 核心体验缺陷，当前完全忽略附图导致解读不完整
**状态：** Planned
**目标版本：** v0.1.0

### 问题陈述

中国发明专利申请文件中，**说明书附图**是理解技术方案不可或缺的组成部分。专利法要求说明书对发明作出清楚、完整的说明，而附图是达成"清楚、完整"的关键手段。当前系统存在以下严重缺陷：

1. **PDF 图像完全不提取**：`pdfText.ts` 仅调用 `pdfjs-dist` 的 `getTextContent()` 提取文本层，完全不处理 PDF 中嵌入的图片/矢量图。附图页（通常含有大量矢量标注的机械结构图、电路图、流程图等）的视觉信息完全丢失。

2. **AI 模型不支持图像输入**：所有 6 个 Provider 适配器仅支持 `content: string` 文本消息。`ProviderAdapter.ts` 的 `NON_TEXT_PATTERNS` 正则（`/image|vision/i`）主动过滤视觉模型。Gemini 适配器的 `NON_TEXT_PATTERNS` 同样排除 image/vision 模型。`ChatRequest.messages[].content` 类型为 `string`，不支持多模态 `parts` 数组。

3. **文档解读是纯文本的**：`interpret.prompt.md` 仅接收 `{documentText}` 字符串。AI 解读时看不到任何附图，只能从文字描述中猜测技术方案的结构关系。当说明书描述"如图3所示，散热翅片(A)与导热界面层(B)通过卡扣(C)连接"时，AI 完全看不到图3的实际结构，无法验证文字描述的准确性，也无法发现文字与附图可能存在的矛盾。

4. **OCR 管线不是图像理解**：当 PDF 无文本层时，Tesseract OCR 将整页渲染为图像后提取文字，输出是 flat text。这个过程完全破坏了附图的结构信息——标注箭头、组件编号、空间关系全部丢失。

**结论**：当前的"文档解读"是残缺的——AI 只读了文字，没看附图。必须实现真正的图像理解，让 AI 看到并解读专利附图。

### 功能描述

系统在文档解读环节新增**图像理解能力**，使 AI 能够真正"看到"并解读专利附图中的视觉信息：

**1. PDF 附图提取**
- 解析"说明书附图"章节，识别每个图（图1、图2…）对应的页码范围
- 使用 `pdfjs-dist` 的 `page.render()` 将附图页渲染为高分辨率 PNG 图像
- 提取每个图下方/上方的图注文字（如"图1 是本发明实施例的结构示意图"）
- 对于无文本层的扫描件 PDF，渲染所有页面为图像，与 OCR 文字一起处理

**2. 多模态 AI 模型支持**
- 接入支持视觉的模型（Gemini 2.5 Flash/Pro 均原生支持图片输入）
- 扩展 `ChatRequest` 协议：`content` 从 `string` 扩展为 `string | MultimodalPart[]`
- 扩展 Gemini 适配器 `chat()` 方法：当 `messages` 包含图片时，使用 Gemini Vision API 格式（`inlineData` with base64）
- 移除 Gemini 适配器中对 vision/image 模型的过滤规则
- 支持 OpenAI 兼容协议的视觉模型（如 GPT-4o、Kimi-Visual、GLM-4V 等）

**3. 图像感知的文档解读**
- 更新 `interpret` Agent 的 prompt：将文档文字 + 附图图片一起发送给多模态模型
- AI 必须逐个分析每张附图：
  - 图中展示了什么（整体结构/流程概览）
  - 各标注组件（A、B、C…）的空间关系和连接方式
  - 图与权利要求之间的对应关系（权1的技术特征在图中如何体现）
  - 图中是否有文字描述未提及的细节或矛盾
- 解读输出新增"附图解读"章节，包含逐图分析

**4. 附图 Viewer UI**
- 文档解读面板中嵌入附图查看器
- 左侧显示附图缩略图列表，点击可放大查看
- 右侧显示 AI 对该图的解读文字
- 用户可对特定图的解读进行追问（复用 AgentChatPanel）

### 数据模型扩展

```typescript
// 新增：从文档中提取的附图
interface DocumentFigure {
  id: string;
  documentId: string;          // 关联的 SourceDocument
  caseId: string;
  figureNumber: number;        // 图1、图2...
  caption: string;             // 图注文字，如"图1 是本发明实施例的结构示意图"
  pageNumbers: number[];       // 该图所在的 PDF 页码
  imageDataUrl: string;        // 渲染后的 PNG base64 data URL
  imageWidth: number;
  imageHeight: number;
  renderingMethod: "text-layer" | "full-page-render";
}

// 扩展 SourceDocument
interface SourceDocument {
  // ... 现有字段 ...
  figures?: DocumentFigure[];  // 从该文档提取的附图列表
  hasFigures: boolean;         // 是否检测到附图
}

// 多模态消息部分
interface MultimodalPart {
  type: "text" | "image_url" | "inline_data";
  text?: string;
  image_url?: { url: string };
  inline_data?: { mimeType: string; data: string }; // base64
}

// ChatRequest content 从 string 扩展为联合类型
// messages[].content: string | MultimodalPart[]

// InterpretRequest 扩展
interface InterpretRequest {
  caseId: string;
  documentText: string;
  figures?: Array<{
    figureNumber: number;
    caption: string;
    imageDataUrl: string;      // base64 PNG
  }>;
}
```

### UI 交互流程

```
文档上传完成 → 文本提取完成
      │
      ├── 自动检测是否有附图
      │   (解析"说明书附图"章节 / 页面文本量 < 50 chars)
      │
      ├── 有附图 → 触发附图提取
      │   ┌─────────────────────────────┐
      │   │  正在提取附图... 3/5         │
      │   │  图1: 结构示意图 ✓          │
      │   │  图2: 电路连接图 ✓          │
      │   │  图3: 流程图 提取中...      │
      │   └─────────────────────────────┘
      │
      ▼
文档解读页面
┌──────────────────────────────────────────────────┐
│  文档解读                                         │
│                                                  │
│  ┌─ 文字解读 ─────────────────────────────────┐  │
│  │ ## 技术领域                                 │  │
│  │ ...                                        │  │
│  │ ## 技术方案                                 │  │
│  │ ...                                        │  │
│  │                                            │  │
│  │ ## 附图解读                                 │  │
│  │ ┌── 图1: 结构示意图 ───────────────────┐   │  │
│  │ │ [附图缩略图] [点击放大]              │   │  │
│  │ │ AI 解读: 该图展示了LED散热装置的整体  │   │  │
│  │ │ 结构。散热基板(A)位于底部，导热界面层 │   │  │
│  │ │ (B)覆盖在基板上方...                  │   │  │
│  │ │ [追问此图]                            │   │  │
│  │ └──────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [重新解读]  [保存解读]                           │
└──────────────────────────────────────────────────┘
```

### 技术实现要点

**1. PDF 附图提取（`client/src/lib/figureExtract.ts`）**

- 步骤1: 解析"说明书附图"章节 — 在 extractedText 中定位"附图说明"或"说明书附图"标题，提取每个"图N"的标题文字作为 caption
- 步骤2: 识别附图页 — 启发式：文本量 < 50 chars 的页面、包含"图N"标签的页面、页面 OperatorList 有大量绘图操作
- 步骤3: 渲染 — 使用 `pdfjs-dist` 的 `page.render()` 渲染为 canvas，输出 150 DPI PNG，转换为 base64 data URL
- 步骤4: 存储到 IndexedDB 新 store `documentFigures`，key 为 `${documentId}_${figureNumber}`

**2. 多模态 Provider 适配**

Gemini 适配器 (`gemini.ts`)：
- 移除 `NON_TEXT_PATTERNS` 中对 `/image/i`、`/vision/i` 的过滤
- `chat()` 方法检测 `content` 类型，若为数组则构建 Gemini Vision parts（`inlineData` + `text`）
- 新增 `DEFAULT_VISION_MODELS: ["gemini-2.5-flash", "gemini-2.5-pro"]`

OpenAI 兼容适配器 (`ProviderAdapter.ts`)：
- `chat()` 方法检测 `content` 类型，若为数组则转换为 OpenAI Vision 格式（`image_url` + `text`）

**3. Prompt 更新**

在 `interpret.prompt.md` 中新增"附图解读"规则：AI 必须逐图描述图中内容、标注组件、空间关系、与权利要求的对应关系。输出格式包含 `## 附图解读` 章节。

**4. Token 优化**

| 策略 | 说明 |
|------|------|
| 选择性发送 | 只发送附图页，不发送纯文字页的渲染图 |
| 分辨率控制 | 150 DPI（viewPort scale = 2.0），平衡清晰度与 token 消耗 |
| 分批发送 | 一次请求不超过 5 张图，超过时分批发送并合并结果 |
| 模型选择 | 默认用 `gemini-2.5-flash`（视觉能力强 + 配额高） |
| Image 缓存 | IndexedDB 7 天 TTL，避免重复渲染 |

**5. 前端新增/修改组件**

- `FigureExtractPanel.tsx`（新增）— 附图提取进度 + 附图缩略图列表
- `FigureViewer.tsx`（新增）— 附图放大查看器（Modal）
- `InterpretPanel.tsx`（修改）— 嵌入附图查看区域，展示逐图解读
- `DocumentUploadPanel.tsx`（修改）— PDF 上传后自动触发附图提取

**6. 后端变更**

- `server/src/providers/gemini.ts` — 移除 vision 过滤 + 支持多模态 parts
- `server/src/providers/ProviderAdapter.ts` — 扩展 ChatRequest content 类型
- `server/src/routes/ai.ts` — interpret agent 传递 figures 数据
- `shared/src/types/domain.ts` — 新增 DocumentFigure 接口
- `shared/src/types/api.ts` — 扩展 InterpretRequest

### 验收标准

- [ ] PDF 上传后，系统自动检测并提取附图（识别附图章节 + 渲染附图页为 PNG）
- [ ] 附图以缩略图列表形式展示在文档解读页面中，点击可放大查看
- [ ] 文档解读 AI 能正确分析每张附图的内容（组件标注、空间关系、与技术方案的对应）
- [ ] AI 解读输出中包含完整的"附图解读"章节，每张图有独立分析段落
- [ ] 用户可对特定附图的解读进行追问（复用 AgentChatPanel）
- [ ] 至少支持一个多模态模型（Gemini 2.5 Flash 为首选）
- [ ] 无附图的纯文本文档不受影响，解读流程正常工作（零回归）
- [ ] 多模态请求走 Provider fallback 机制（与文本请求相同）
- [ ] Mock 模式提供预置附图解读结果（基于 G1 LED 散热装置的 Fig1-5）
- [ ] 附图缓存在 IndexedDB 的 `documentFigures` store，7 天 TTL
- [ ] `tests/e2e-real.mjs` 新增 `--only figureExtract` 测试用例

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 多模态模型 token 消耗大 | 严格 150 DPI、每请求 ≤ 5 张图、仅发送附图页、纯文本解读作为降级方案 |
| 渲染大尺寸 PDF 页面可能导致浏览器内存溢出 | 分页渲染 + 及时释放 canvas；设置最大尺寸限制（4000x3000px） |
| 某些 PDF 中附图非独立页面（文字与图混排） | 整页渲染发送给 AI（含文字+图），不影响理解 |
| 扫描件 PDF 的附图质量差 | AI 基于 OCR 文字 + 低质量图进行解读，标注"图像质量有限，解读仅供参考" |
| 视觉模型 API 稳定性/配额限制 | 复用现有 fallback 机制；至少保留纯文本解读作为降级方案 |
| 附图编号与页码对应关系解析不准确 | 用户可在 FigureExtractPanel 中手动调整图号与页码的对应关系 |
| AI 对复杂附图（如芯片版图、化学结构式）的解读可能不准确 | 所有 AI 解读标注"候选分析·需审查员确认"；审查员可追问或修正 |
| 图片 base64 占用 IndexedDB 空间大 | 7 天 TTL + 总存储上限 50MB；超出时提示用户清理旧缓存 |

### 与现有功能的关系

- **文档上传（DocumentUploadPanel）**：扩展，上传 PDF 后自动触发附图提取
- **文档解读（InterpretPanel）**：扩展，嵌入附图查看和逐图解读
- **AI Agent（interpret）**：扩展 prompt + 支持多模态输入（文字 + 图片）
- **Provider 适配器（gemini.ts / ProviderAdapter.ts）**：改造 chat() 方法支持多模态 parts
- **OCR 管线**：无文本层 PDF 的附图提取作为 OCR 补充（OCR 提取文字 + 附图渲染保留视觉）
- **Claim Chart**：后续可复用附图信息，在特征拆解时引用附图中的标注（另开 feature）

---

## B-008: 产品转向 — 从初审助手彻底转为复审AI助手

**优先级：** P0 — 最高优先级。产品方向性决定，所有其他 feature 以此为前提
**状态：** ✅ 已完成 (c3b3816)
**目标版本：** v0.1.0

### 产品决定

**patentExaminator 定位为复审 AI 助手，不再支持初审场景。** 当前系统基于初审流程构建，需要彻底改造为复审流程。初审场景以后作为独立入口重新设计，不在当前版本范围内。

### 问题陈述

当前系统按照**首次审查（初审）**流程构建：

```
Case Setup（上传申请文件）
  → References（检索/上传对比文献）
  → Claim Chart（权利要求特征拆解）
  → Novelty（新颖性对照）
  → Inventive（创造性三步法分析）
  → Defects（形式缺陷检测）
  → Draft（审查意见草稿）
  → Export（导出）
```

但用户的实际工作场景是**复审**——审查员在收到申请人的意见陈述书和修改后的权利要求后，进行再次审查。复审的输入和流程与初审有本质区别：

1. **输入不同**：除了申请文件，还有上一次（或几次）的审查意见通知书 + 申请人的意见陈述书 + 可能修改后的权利要求书
2. **分析目标不同**：不是从零开始分析新颖性/创造性，而是要**针对申请人的答辩理由逐条回应**
3. **输出格式不同**：复审意见必须是"逐条回应"结构，不能是初审的"从头分析"结构

因此，系统需要从初审流程**彻底转向**复审流程。

### 目标复审流程

```
Case Setup
  输入：申请文件 + 审查意见通知书（≥1份）+ 意见陈述书 + 修改后的权利要求书（可选）
      │
      ├── 提取案卷字段（复用 extract-case-fields）
      ├── 解析审查意见通知书 → 驳回理由清单
      └── 解析意见陈述书 → 答辩理由清单
      │
      ▼
Opinion Analysis（审查意见解析）
  输出：结构化驳回理由（类别、涉及权利要求、法律依据、引用文献、事实认定）
      │
      ▼
Argument Mapping（答辩理由映射）
  输出：驳回理由 ↔ 答辩理由 一一对应表 + 权利要求修改追踪 + 未回应项标注
      │
      ▼
References（对比文献管理）
  复用现有逻辑。复审通常不新增对比文件，但也可能引入新文献
      │
      ▼
Claim Chart（权利要求特征拆解）
  输入：修改后的权利要求书（如有）
  输出：特征拆解 + 标注哪些特征是新增/修改的
      │
      ▼
Novelty（新颖性对照分析）
  输入：Claim Chart + 对比文献 + 申请人关于新颖性的答辩理由
  输出：特征级新颖性对照 + 对每条答辩理由的逐条回应
      │
      ▼
Inventive（创造性三步法分析）
  输入：Novelty 区别特征 + 答辩理由中关于创造性的部分
  输出：三步法分析 + 对创造性答辩的逐条回应
      │
      ▼
Defects（形式缺陷检测）
  输入：修改后的权利要求 + 上次审查意见指出的缺陷清单
  输出：缺陷清单 + 每项缺陷的"已克服/未克服"状态
      │
      ▼
Draft（复审审查意见草稿）
  输入：所有上游分析结果 + 驳回理由 + 答辩映射
  输出：逐条回应格式的复审意见草稿
      │
      ▼
Export（导出）
  复用现有逻辑，适配复审意见格式
```

### 需要移除的初审内容

| 移除项 | 说明 |
|-------|------|
| 初审 CaseSetup 逻辑 | `CaseSetupPage` 中的"仅上传申请文件"模式 |
| 初审 Draft 模板 | `DraftMaterialPanel` 中的"首次审查意见"输出格式 |
| 初审 prompt 中的初始分析指令 | Novelty/Inventive/Draft 的 prompt 从"首次分析"改为"针对答辩的回应分析" |
| `CaseWorkflowState` 中的初审专属状态 | 简化状态机，移除初审路径 |

### 需要新增的模块

| 新增项 | 对应 Agent | 说明 |
|-------|-----------|------|
| OpinionAnalysisPanel | `opinion-analysis` | 展示审查意见通知书解析结果（驳回理由清单、引用文献、事实认定） |
| ArgumentMappingPanel | `argument-analysis` | 展示驳回理由 ↔ 答辩理由对应表 |
| 复审 Draft 模板 | `reexam-draft` | 生成逐条回应格式的复审意见稿 |

### 需要适配的现有模块

| 现有模块 | 适配内容 |
|---------|---------|
| CaseSetupPage | 改为复审输入模式：申请文件 + 审查意见通知书 + 意见陈述书 + 修改后权利要求书（可选） |
| ClaimChartTable | 支持拆解修改后的权利要求；标注新增/修改/删除的特征 |
| NoveltyComparisonTable | prompt 接收申请人新颖性答辩理由；输出增加"审查员回应"列 |
| InventiveStepPanel | prompt 接收申请人创造性答辩理由；输出增加"审查员回应"列 |
| DefectPanel | 接收"上次审查意见指出的缺陷清单"；输出增加"是否已克服"列 |
| DraftMaterialPanel | 切换为复审意见模板（逐条回应格式） |
| InterpretPanel | 扩展支持审查意见通知书、意见陈述书的解读 |

### 受影响的文档和资产（实现本 feature 时必须同步更新）

| 文档/资产 | 更新内容 |
|----------|---------|
| **PRD** (`PRD.md`) | 产品定位从"AI辅助专利审查"改为"AI辅助专利复审"；用户场景重写为复审场景；功能需求列表替换为复审流程 |
| **Design Doc** (`DESIGN.md`) | 工作流状态机替换为复审流程；数据模型新增 `OfficeActionAnalysis`/`ArgumentMapping` 等；路由从初审路径改为复审路径 |
| **Development Plan** (`DEVELOPMENT_PLAN.md`) | 开发阶段重新划分；里程碑目标从"初审可用"改为"复审可用" |
| **Sample Data** (`samples/`) | 新增构造的审查意见通知书 PDF + 意见陈述书 PDF（基于 G1/G2 案例）；现有申请文件可复用 |
| **Mock Fixtures** (`shared/src/fixtures/`) | 新增 `opinion-analysis`、`argument-analysis`、`reexam-draft` 的 mock 数据 |
| **E2E 测试** (`tests/e2e-real.mjs`) | 重写全流程测试用例为复审流程；移除初审流程测试 |
| **Prompt 文件** (`shared/src/prompts/`) | Novelty/Inventive/Draft prompt 从"首次审查分析"改为"针对答辩的复审回应"；新增 opinion-analysis、argument-analysis 的 prompt |

### 数据模型变更

```typescript
// 1. SourceDocumentRole 新增
type SourceDocumentRole = 
  | "application" 
  | "reference" 
  | "office-action-response"  // 已有：意见陈述书
  | "office-action";           // 新增：审查意见通知书

// 2. CaseWorkflowState 简化（移除初审路径，加入复审专属状态）
type CaseWorkflowState =
  | "empty"
  | "case-ready"
  | "documents-uploaded"
  | "text-extracted"
  | "text-confirmed"
  | "opinion-analyzed"          // 新增：审查意见已解析
  | "argument-mapped"           // 新增：答辩已映射
  | "references-ready"
  | "claim-chart-ready"
  | "novelty-ready"
  | "inventive-ready"
  | "defects-ready"             // 新增：缺陷复查完成
  | "draft-ready"
  | "export-ready";

// 3. PatentCase 扩展
interface PatentCase {
  // ... 现有字段 ...
  reexaminationRound: number;        // 第几轮复审（1-based）
  previousCaseId?: string;           // 上一轮审查的案例 ID
}

// 4. 新增类型
interface OfficeActionAnalysis {
  id: string;
  caseId: string;
  documentId: string;
  rejectionGrounds: RejectionGround[];
  citedReferences: RejectionCitedReference[];
}

interface RejectionGround {
  code: string;
  category: "novelty" | "inventive" | "clarity" | "support" | "amendment" | "other";
  claimNumbers: number[];
  summary: string;
  legalBasis: string;              // 专利法条款
}

interface RejectionCitedReference {
  publicationNumber: string;
  rejectionGroundCodes: string[];
  featureMapping: string;
}

interface ArgumentMapping {
  id: string;
  caseId: string;
  rejectionGroundCode: string;
  applicantArgument: string;       // 申请人答辩论点原文
  argumentSummary: string;         // AI 提炼
  confidence: "high" | "medium" | "low";
  amendedClaims?: AmendedClaimDetail[];
  newEvidence?: string;
}

interface AmendedClaimDetail {
  claimNumber: number;
  originalText: string;
  amendedText: string;
  changeDescription: string;
}

// 5. 现有分析类型扩展（增加复审上下文字段）
// NoveltyComparison / InventiveStepAnalysis / FormalDefect 各新增：
//   applicantArguments?: string;
//   examinerResponse?: string;
```

### 技术实现要点

1. **不是增量开发，是流程替换** — CaseSetupPage、路由、工作流状态机都需要从初审模式改为复审模式，而非在初审基础上加复审分支
2. **后端新增 3 个 Agent**：`opinion-analysis`、`argument-analysis`、`reexam-draft`，均走 `POST /api/ai/run`
3. **前端新增 2 个 Panel**：`OpinionAnalysisPanel`、`ArgumentMappingPanel`
4. **前端适配 6 个现有 Panel**：CaseSetupPage、ClaimChartTable、NoveltyComparisonTable、InventiveStepPanel、DefectPanel、DraftMaterialPanel
5. **所有 prompt 重写**：Novelty/Inventive/Defect/Draft 的 prompt 从"首次审查分析者"改为"复审回应者"角色
6. **多轮复审**：`reexaminationRound` 跟踪复审轮次，历史数据可追溯
7. **Token 优化**：多份通知书 + 多份答辩书容易超出 token 限制，需对历史文档做摘要压缩

### 验收标准

- [✅] 用户新建案例时只需上传：申请文件 + 审查意见通知书 + 意见陈述书（+ 可选修改后权利要求）
- [✅] `opinion-analysis` 正确提取驳回理由（类别、涉及权利要求、法律依据、引用文献、事实认定）
- [✅] `argument-analysis` 正确将答辩理由对应到驳回理由，含置信度标注
- [✅] Claim Chart 能拆解修改后的权利要求，标注新增/修改/删除的特征
- [✅] Novelty 分析对申请人的新颖性答辩逐条回应（而非从零分析）
- [✅] Inventive 分析对申请人的创造性答辩逐条回应
- [✅] Defects 对比上次缺陷清单，判断每项是否已克服
- [✅] Draft 输出"逐条回应"格式的复审意见，与初审格式完全不同
- [✅] 支持多轮复审，历史审查意见和答辩书可追溯
- [✅] Mock 模式下所有 Agent 有预置 fixture
- [✅] E2E 测试覆盖复审全流程
- [✅] **PRD.md 已更新**：产品定位改为复审 AI 助手
- [✅] **DESIGN.md 已更新**：工作流、数据模型、路由适配复审流程
- [✅] **DEVELOPMENT_PLAN.md 已更新**：开发阶段重新划分
- [ ] **Sample data 已更新**：包含构造的审查意见通知书 + 意见陈述书（延期：mock fixture 已覆盖，PDF 样本后续补充）
- [✅] **旧的初审相关测试用例已移除**

### Detail Implementaion Plan
/Users/wukun/Documents/tmp/patentExaminator/B-008/b008_implementation_plan.md

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 复审场景真实数据获取困难 | 用 AI 基于 G1/G2 案例生成模拟审查意见通知书 + 意见陈述书 |
| 多轮复审上下文膨胀 | 对历史审查意见做摘要压缩，只保留关键驳回理由和答辩要点 |
| 审查意见通知书格式多样 | Opinion-analysis prompt 做充分 few-shot，覆盖 3-5 种格式 |
| 答辩理由可能模糊/不对应 | Argument mapping 输出置信度，低置信度时提示人工确认 |
| Token 超限（多份文档） | 模块化传入：Novelty 只收新颖性相关的答辩段落 |
| 工作量较大（涉及文档、测试、数据全面改造） | 分阶段实施：先改核心流程 → 再改文档 → 最后更新测试和 sample data |

---

## B-009: 新增阿里通义千问（Qwen）模型提供商

**优先级：** P2 — 增加国内模型选择，降低对单一提供商的依赖
**状态：** Todo
**目标版本：** v0.1.0

### 问题陈述

当前系统已接入 6 个模型提供商（Gemini、Mimo、Kimi、GLM、MiniMax、DeepSeek），但缺少阿里通义千问（Qwen）。阿里 DashScope API 提供 OpenAI 兼容端点（`/compatible-mode/v1`），接入成本低，且 Qwen 系列模型在国内审查员群体中使用广泛。

### 功能描述

新增 `qwen` 作为第 7 个模型提供商，用户可在设置页面配置 Qwen API Key 并将 Qwen 模型分配给各个 Agent。

### 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `shared/src/types/agents.ts` | `ProviderId` 联合类型追加 `"qwen"` |
| `server/src/providers/qwen.ts`（新增） | `QwenAdapter extends OpenAICompatibleAdapter`，base URL `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `server/src/providers/registry.ts` | 导入并注册 `QwenAdapter` |
| `server/src/index.ts` | 支持 `QWEN_KEY` 环境变量加载 |
| `client/src/lib/modelCatalog.ts` | `DEFAULT_MODELS` 新增 qwen 模型列表 |
| `client/src/features/settings/ProvidersConfigPanel.tsx` | `PROVIDER_OPTIONS` 新增 qwen 条目 |
| `client/src/features/settings/AgentsAssignmentPanel.tsx` | `PROVIDER_NAMES` 新增 qwen 条目 |
| `client/src/lib/repositories/settingsRepo.ts` | 可选：默认设置中包含 qwen |

### Qwen 模型列表

| 模型 ID | 定位 | 上下文窗口 |
|---------|------|-----------|
| `qwen-turbo` | 速度最快、配额最高 | 131K |
| `qwen-plus` | 能力均衡 | 131K |
| `qwen-max` | 能力最强 | 32K |
| `qwen3-235b-a22b` | 最新旗舰 MoE 模型 | 131K |

### 技术实现要点

- DashScope 兼容 OpenAI `/v1/chat/completions` 格式，**零适配器代码**——直接继承 `OpenAICompatibleAdapter`，仅需覆写 `id`、`defaultBaseUrl`、`supportedModels()`
- API Key 通过 `Authorization: Bearer` header，与现有 OpenAI 兼容适配器一致
- SSE 流式响应格式与 OpenAI 兼容，无需特殊解析
- 无需 fallback 特殊处理——复用 `OpenAICompatibleAdapter` 的默认行为

### 验收标准

- [ ] 用户在 Providers 设置页面可选择"Qwen"并配置 API Key
- [ ] Qwen 模型出现在 Agent 分配的模型下拉列表中
- [ ] `POST /api/ai/run` 使用 qwen provider 能正常完成 claim-chart 链路（Mock 模式）
- [ ] 真实模式下 Qwen API Key 连通性验证通过
- [ ] `tests/e2e-real.mjs` 新增 `--only qwen` 测试用例

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| DashScope API 配额限制 | 与现有 6 个 provider 互补，用户可切换 |
| Qwen API Key 获取需要阿里云账号 | 设置页面提供文档链接 |
| DashScope 兼容模式可能不完全兼容 OpenAI 格式 | 继承 OpenAICompatibleAdapter，如有差异仅需覆写对应方法 |

---

## B-010: 配置界面模型列表折叠

**优先级：** P2 — 体验优化，提升配置界面可读性
**状态：** Todo
**目标版本：** v0.1.0

### 问题陈述

设置页面的 Agent 配置区域（`AgentsAssignmentPanel`）中，每个 Provider 查询到的模型列表直接全量展开显示在下拉菜单中。当接入 7 个 Provider、每个 Provider 返回 5-20 个模型时：

1. 下拉列表极长，滚动查找困难
2. 用户实际只需为每个 Agent 选 1 个模型，不需要看到所有模型
3. 配置界面的核心功能（Agent → Provider → Model 的映射）被淹没在大量模型名称中，难以理解和操作

### 功能描述

模型选择下拉列表支持折叠分组显示：

- 默认仅显示每个 Provider 下**当前已选中的模型**（1 行），其余模型折叠
- 点击展开箭头后，展示该 Provider 的完整模型列表
- 列表顶部保留搜索/过滤输入框，快速定位模型
- 折叠/展开状态按 Provider 独立管理，用户展开的 Provider 保持展开

### UI 行为

```
模型选择下拉:
┌─────────────────────────────┐
│ Gemini                  ▼  │  ← 已选中: gemini-2.5-flash
│   ├─ gemini-2.5-flash  ✓   │  ← 当前选中（打勾）
│   ├─ 其他模型 (8)     ▶    │  ← 折叠，点击展开
│                             │
│ Kimi                    ▼  │
│   ├─ kimi-latest       ✓   │
│   ├─ 其他模型 (5)     ▶    │
│ ...                         │
└─────────────────────────────┘

点击"其他模型 (N)"展开后:
┌─────────────────────────────┐
│ Gemini                  ▼  │
│   ├─ gemini-2.5-flash  ✓   │
│   ├─ 其他模型 (8)     ▼    │
│   │  gemini-2.0-flash       │
│   │  gemini-2.5-pro         │
│   │  gemini-3-pro-preview   │
│   │  ...                    │
│   ├─ 收起             ▲    │
└─────────────────────────────┘
```

### 技术实现要点

1. **前端组件** — 修改 `AgentsAssignmentPanel.tsx` 中的模型选择下拉组件
   - 新增 state: `expandedProviders: Set<ProviderId>` 管理展开/折叠状态
   - 每个 Provider 的模型列表分为两组：`selectedModel`（始终可见）+ `otherModels`（可折叠）
   - 折叠区域显示可折叠模型数量，如"其他模型 (8)"
2. **不涉及后端/API 变更** — 纯前端交互优化
3. **不涉及数据模型变更**

### 验收标准

- [ ] 模型下拉默认只显示每个 Provider 当前选中的模型，其余折叠
- [ ] 点击展开箭头可查看该 Provider 的完整模型列表
- [ ] 点击收起可再次折叠
- [ ] 每个 Provider 的折叠状态独立，切换 Provider 不影响其他 Provider 的展开状态
- [ ] 搜索功能正常工作（折叠/展开不影响过滤）
- [ ] 现有模型选择功能零回归（选中、切换模型正常）

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| 折叠状态可能让用户误以为模型缺失 | 明确显示"其他模型 (N)"数量提示 |
| 搜索过滤与折叠展开的交互冲突 | 搜索时自动展开所有 Provider，清空搜索后恢复折叠状态 |

---

## B-011: 配置界面退出按钮固定显示

**优先级：** P2 — 显著提升用户体验，高频场景优化
**状态：** done
**目标版本：** v0.1.0

### 问题陈述

当前配置界面（SettingsPage）的设计存在明显的 UX 缺陷：
1. 退出按钮 "X" 位于页面顶部的 `settings-page__header` 中
2. 当配置内容较多、页面需要向下滚动时，退出按钮会随着滚动条滚出可视区域
3. 用户完成配置后，需要手动滚动回顶部才能找到退出按钮，操作流程不顺畅
4. 对于长配置页面，这个问题会被放大，显著降低用户体验

### 功能描述

通过 CSS 固定定位技术，将配置界面的头部区域（含退出按钮）固定在屏幕顶部，无论页面如何滚动，用户始终可以看到并点击退出按钮。

### 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `client/src/styles/app.css` | 为 `.settings-page__header` 添加 `position: sticky`、`top: 0`、`background: #fff`、`z-index` 等样式，实现头部固定 |

### 技术实现要点

1. **CSS 实现** — 无需修改 React 组件代码，仅需调整样式
   - `.settings-page__header` 增加 `position: sticky` 定位
   - 同时设置 `top: 0`，确保固定在视口顶部
   - 添加 `background: #fff`（白色背景），避免滚动时内容透过头部显示
   - 增加适当的 `z-index`，确保头部始终在其他内容之上
   - 保留原有的 `display: flex`、`align-items: center`、`justify-content: space-between` 样式不变

2. **样式细节**
   - 确保固定的头部与页面内容之间有适当的视觉分隔
   - 可以添加一个底部边框或阴影，增强固定效果的视觉感知

### UI 行为

```
滚动前:
┌─────────────────────────────────┐
│ 设置                      [X]    │ ← 头部在顶部
│ ─────────────────────────────── │
│ 描述文字...                    │
│ ...更多内容...                │
│ ...更多内容...                │
└─────────────────────────────────┘

滚动后:
┌─────────────────────────────────┐
│ 设置                      [X]    │ ← 头部固定在顶部，始终可见
│ ─────────────────────────────── │
│ ...更多内容...                │
│ ...更多内容...                │
│ ...更多内容...                │
│ ...更多内容...                │
│ ...更多内容...                │
└─────────────────────────────────┘
```

### 验收标准

- [ ] 在配置页面滚动时，头部区域（含退出按钮）始终固定在屏幕顶部
- [ ] 退出按钮在滚动后仍然可以点击，功能正常
- [ ] 固定的头部有白色背景，不会与下方内容重叠混淆
- [ ] 头部区域的布局（"设置"标题在左，按钮在右）保持不变
- [ ] 在不同屏幕尺寸下，固定头部的行为一致
- [ ] 与其他功能零回归

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| `sticky` 定位在旧浏览器上可能不支持 | 使用 `position: -webkit-sticky` 作为前缀，兼容 Safari 等浏览器；降级方案：保持当前行为 |
| 固定头部可能与页面其他元素的 `z-index` 冲突 | 设置合适的 `z-index` 值（如 100），确保头部在最上层 |
| 固定头部可能遮挡页面顶部的内容 | 为 `.settings-page` 添加适当的 `padding-top`，或为 `.settings-page__header` 添加 `padding-bottom` 以避免内容遮挡 |

---

## B-012: 接入 EPO 专利检索 API（OPS v3.2）

**优先级：** P2 — nice-to-have，丰富数据源生态，提升欧洲专利检索质量
**状态：** Todo
**目标版本：** v0.2.0

### 问题陈述

当前系统专利检索（B-001 AI 辅助文献检索）主要通过 Web Search（Tavily/SerpAPI）进行，检索结果结构化程度低、元数据提取不完整。EPO（欧洲专利局）提供的 OPS（Open Patent Services）v3.2 API 是全球最权威的专利数据源之一，覆盖 100+ 国家/地区的专利文献，提供：

1. **结构化专利数据**：公开号、标题、摘要、申请人、发明人、IPC 分类、优先权信息、法律状态等
2. **全文检索**：支持关键词、分类号、日期范围等多维度检索
3. **专利家族查询**：获取同族专利信息
4. **引用关系**：前引和后引专利文献
5. **高质量元数据**：官方数据，无需 AI 后处理即可直接使用

接入 EPO OPS API 可作为 Tavily/SerpAPI 之外的补充数据源，显著提升专利检索结果的结构化程度和元数据质量，减少 AI 后处理的错误率。

### EPO OPS API 概况

| 项目 | 说明 |
|------|------|
| API 文档 | https://developers.epo.org/apis/ops-v32 |
| 认证方式 | OAuth2（Consumer Key + Consumer Secret Key） |
| 免费额度 | 有免费 tier，具体限制见 EPO 开发者门户 |
| 数据覆盖 | 100+ 国家/地区，包括 EPO、WIPO、USPTO、CNIPA 等 |
| 主要端点 | Published Data Search、Family、Register、Images 等 |
| 响应格式 | XML / JSON（默认 XML，Accept header 可指定 JSON） |

### 功能描述

系统新增 EPO OPS API 作为专利检索数据源，与现有 Tavily/SerpAPI Web Search 并列：

1. **用户配置**：在设置页面的搜索 Provider 区域新增"EPO OPS"选项，用户填入 Consumer Key 和 Consumer Secret Key
2. **自动测试配置**：`.env` 文件支持 `EPO_CONSUMER_KEY` 和 `EPO_CONSUMER_SECRET` 环境变量，用于 E2E 自动测试
3. **检索流程**：B-001 的 AI 辅助文献检索在选择 EPO OPS 作为数据源时，使用 EPO OPS API 进行结构化专利检索
4. **结果增强**：EPO OPS 返回的结构化数据直接映射到 `ReferenceDocument` 字段（公开号、公开日、标题、摘要、IPC 分类、申请人等），无需 AI 从网页文本中提取

### 数据流

```
用户检索专利
      │
      ▼
┌──────────────────────────┐
│  搜索 Provider 选择       │
│  ├── Tavily (Web Search)  │
│  ├── SerpAPI (Web Search) │
│  └── EPO OPS (新增)       │  ← 用户选择或在 Agent 配置中指定
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  EPO OPS Adapter          │
│                           │
│  OAuth2 Token 获取        │  ← Consumer Key + Secret → access_token
│  │                        │
│  ▼                        │
│  检索式构建                │  ← AI 提取的关键词/IPC分类 → EPO CQL 查询
│  │                        │
│  ▼                        │
│  GET /published-data/search  │
│  │                        │
│  ▼                        │
│  结果映射                  │  ← EPO 结构化数据 → ReferenceDocument
└──────────┬───────────────┘
           │
           ▼
候选文献清单（结构化元数据 + 高置信度）
```

### 数据模型扩展

```typescript
// shared/src/types/agents.ts — SearchProviderId 扩展
type SearchProviderId = "tavily" | "serpapi" | "epo";  // 新增 "epo"

// 新增：EPO OPS 配置
interface EpoOpsConfig {
  consumerKey: string;
  consumerSecret: string;
  accessToken?: string;           // OAuth2 token（运行时获取，不持久化）
  tokenExpiresAt?: ISODateTimeString;
  enabled: boolean;
}

// shared/src/types/api.ts — 扩展
interface SearchConfig {
  provider: SearchProviderId;
  // ... existing fields for Tavily/SerpAPI ...
  epo?: EpoOpsConfig;            // 新增
}

// server 端环境变量（.env）
// EPO_CONSUMER_KEY=xxx           // 用于自动测试
// EPO_CONSUMER_SECRET=xxx        // 用于自动测试
```

### UI 交互

```
Settings → Search Providers 配置:

┌─────────────────────────────────────────┐
│  搜索 Provider 配置                      │
│                                         │
│  Tavily                          [▼]   │
│  ┌─────────────────────────────────┐    │
│  │ API Key: [tavily_key_here    ] │    │
│  └─────────────────────────────────┘    │
│                                         │
│  SerpAPI                         [▼]   │
│  ┌─────────────────────────────────┐    │
│  │ API Key: [serpapi_key_here   ] │    │
│  └─────────────────────────────────┘    │
│                                         │
│  EPO OPS                    [◎ 已启用]  │  ← 新增
│  ┌─────────────────────────────────┐    │
│  │ Consumer Key:      [ck_here  ] │    │
│  │ Consumer Secret:   [cs_here  ] │    │
│  │ Status: ✓ 已连接               │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [+ 添加 Provider]                      │
└─────────────────────────────────────────┘
```

### 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `server/src/search/epo-ops.ts`（新增） | EPO OPS API 适配器：OAuth2 Token 获取、检索请求、结果解析 |
| `server/src/search/registry.ts` | 注册 `epo` 搜索 Provider |
| `server/src/routes/search.ts` | 支持 `epo` provider 检索请求；Key 验证端点 |
| `shared/src/types/agents.ts` | `SearchProviderId` 追加 `"epo"` |
| `shared/src/types/api.ts` | 新增 `EpoOpsConfig` 接口；扩展 `SearchConfig` |
| `server/src/lib/schemas.ts` | 新增 epo config 的 Zod schema |
| `client/src/features/settings/SearchProvidersConfigPanel.tsx` | 新增 EPO OPS 配置表单（Consumer Key + Consumer Secret 输入） |
| `client/src/lib/repositories/settingsRepo.ts` | 默认设置中包含 epo 配置结构 |
| `client/src/features/references/ReferenceSearchPanel.tsx` | 支持选择 EPO OPS 作为数据源 |
| `tests/e2e-real.mjs` | 新增 `--only epo` 测试用例（Mock + Real） |
| `.env.example` | 新增 `EPO_CONSUMER_KEY` / `EPO_CONSUMER_SECRET` 示例 |

### 技术实现要点

1. **OAuth2 认证流程**
   - EPO OPS API 使用 OAuth2 Client Credentials Grant
   - POST `https://ops.epo.org/3.2/auth/accesstoken` 获取 `access_token`
   - Token 有效期内复用，过期前 5 分钟自动刷新
   - 服务端缓存 token，不暴露给前端

2. **检索端点**
   - 主端点：`GET /3.2/rest-services/published-data/search`
   - 查询语言：CQL（Contextual Query Language）
   - 支持字段：`ti`（标题）、`ab`（摘要）、`desc`（说明书）、`clms`（权利要求）、`pa`（申请人）、`in`（发明人）、`ipc`（IPC 分类号）、`pd`（公开日）
   - 请求头：`Accept: application/json` 获取 JSON 响应（优先，降级 XML）

3. **检索式构建**
   - AI 提取的技术特征（关键词）→ CQL 查询
   - IPC 分类号 → `ipc = "F21V29/00"` 精确匹配
   - 日期范围 → `pd within "2010 2026"`
   - 示例 CQL：`ti = "LED" AND ab = "heat" AND ipc = "F21V" AND pd within "2010 2026"`

4. **结果映射**
   - EPO 返回的 `exchange-documents[].bibliographic-data` → `ReferenceDocument`
   - 公开号：`publication-reference.@doc-number` + `@kind`
   - 公开日：`publication-reference.@date`
   - 标题：`invention-title.$`
   - 摘要：`abstract.$`
   - IPC：`classification-ipc[]` → IPC 分类列表
   - 申请人：`applicants.applicant[].@data-format` → 申请人名称

5. **速率限制与错误处理**
   - 遵守 EPO API 的速率限制（免费 tier 通常 ~1 req/s）
   - 429 → 等待 Retry-After header 指定时间后重试
   - OAuth2 认证失败 → 友好提示用户检查 Consumer Key/Secret
   - 不可用时 → 降级为其他数据源（Tavily/SerpAPI），与 B-001 的多源冗余设计一致

6. **Key 管理与安全**
   - Consumer Key/Secret 仅在服务端使用，不暴露给前端 API 响应
   - E2E 测试用 `.env` 中的 `EPO_CONSUMER_KEY` / `EPO_CONSUMER_SECRET`，已在 `.gitignore`
   - 日志中不打印完整 Key，仅显示末 4 位

### 验收标准

- [ ] 用户在 Search Providers 设置页面可选择"EPO OPS"并填入 Consumer Key + Consumer Secret
- [ ] OAuth2 Token 正常获取、缓存和自动刷新
- [ ] 支持关键词 + IPC 分类号 + 日期范围的 CQL 检索
- [ ] 检索结果正确映射为 `ReferenceDocument` 结构（公开号、公开日、标题、摘要、IPC、申请人）
- [ ] EPO OPS 检索失败时自动降级为 Web Search（Tavily/SerpAPI）
- [ ] `.env` 中的 `EPO_CONSUMER_KEY` / `EPO_CONSUMER_SECRET` 可用于 E2E 自动化测试
- [ ] Mock 模式下提供预置的 EPO OPS 检索响应 fixture
- [ ] `tests/e2e-real.mjs` 新增 `--only epo` 测试用例（Mock + Real）
- [ ] `.env.example` 包含 EPO 环境变量的说明注释

### 依赖与风险

| 风险 | 缓解措施 |
|------|---------|
| EPO API 免费额度有限 | 提供 Mock fixture 用于开发测试；生产环境由用户自行管理额度 |
| OAuth2 Token 获取失败 | 明确错误提示；降级为 Web Search |
| CQL 查询语法限制（复杂布尔嵌套可能不支持） | AI 构建检索式时限制查询复杂度；提供 fallback 为简单关键词搜索 |
| EPO API 响应格式变化（XML/JSON 字段调整） | 适配器中做字段存在性校验；解析失败时降级为 Web Search |
| EPO 开发者账户审核可能较慢 | 不影响现有功能；EPO OPS 作为可选数据源，非强制要求 |
| 国内网络访问 EPO API 可能不稳定 | 支持配置代理；与现有 Web Search 互为备份 |

### 与现有功能的关系

- **AI 辅助文献检索（B-001）**：EPO OPS 作为新增数据源，在数据源表格中增加一行
- **ReferenceLibraryPanel**：EPO 检索结果直接进入候选文献清单，接受/拒绝交互复用
- **搜索 Provider 配置**：在现有 Tavily/SerpAPI 配置旁边新增 EPO OPS 配置区域
- **B-005 Grounding Citation**：EPO OPS 返回的高质量元数据可直接用于 citation（公开号、段落号更准确）

## B-013: 配置界面仅允许从预置 Provider 列表选取，禁止用户自行添加

**优先级：** P0 — 安全与品牌控制，防止用户接入非授权第三方服务
**状态：** Todo
**目标版本：** v0.2.0

### 问题陈述

当前配置界面存在两类 Provider 配置区域：

1. **模型 Provider**（`ProvidersConfigPanel`）：用户可添加 LLM 模型提供商（OpenAI、Anthropic、DeepSeek 等）
2. **搜索 Provider**（`SearchProvidersConfigPanel`）：用户可添加搜索 API 提供商（Tavily、SerpAPI 等）

这两个面板目前可能存在让用户**自由添加任意 Provider** 的入口（如"添加 Provider"按钮），允许用户输入任意 base URL、API endpoint 等。这带来以下问题：

- **安全风险**：用户可能配置恶意或不安全的第三方代理服务，导致敏感申请文件数据泄露
- **品牌风险**：APP 作为专业审查工具，应保持可控的 Provider 生态，确保所有可用的模型和搜索服务都经过 APP 团队验证
- **支持负担**：用户自行添加的非标 Provider 可能导致不可预期的行为（API 兼容性、响应格式差异），增加支持成本
- **合规风险**：专利审查涉及保密数据，必须确保数据传输链路上的所有服务都合规

### 功能描述

**核心规则：用户不能自行添加任何 Provider。** 配置界面变为"只读选择"模式：

1. **模型 Provider 配置**
   - 预置 Provider 列表由 APP 硬编码（如 OpenAI、Anthropic、DeepSeek、Qwen 等），用户**不可增删**
   - 每个预置 Provider 的 base URL / API endpoint 由 APP 固定，用户**不可修改**
   - 用户仅可填写认证参数：API Key、Token 等（根据各 Provider 的认证方式提供对应输入框）
   - 用户可启用/禁用某个 Provider（toggle switch）
   - 新增 Provider 由 APP 版本更新提供，不在配置界面暴露添加入口

2. **搜索 Provider 配置**
   - 预置 Provider 列表由 APP 硬编码（如 Tavily、SerpAPI、EPO OPS 等），用户**不可增删**
   - 每个预置 Provider 的 base URL / API endpoint 由 APP 固定，用户**不可修改**
   - 用户仅可填写各 Provider 对应的认证参数（如 API Key、Consumer Key/Secret 等）
   - 用户可启用/禁用某个 Provider（toggle switch）
   - 新增 Provider 由 APP 版本更新提供，不在配置界面暴露添加入口

### UI 变更

```
Settings → Providers 配置（变更后）:

┌─────────────────────────────────────────────┐
│  模型 Provider 配置                          │
│                                             │
│  OpenAI                              [◎]   │
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [sk-xxxxxxxxxxxxxxxx    ] │    │
│  │ Base URL: https://api.openai.com   │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  Anthropic                           [◎]   │
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [sk-ant-xxxxxxxxxxxxxx  ] │    │
│  │ Base URL: https://api.anthropic.com│ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  DeepSeek                            [ ]   │ ← 可启用/禁用
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [ds-xxxxxxxxxxxxxxxxx   ] │    │
│  │ Base URL: https://api.deepseek.com │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  Qwen                                [ ]   │
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [sk-xxxxxxxxxxxxxxxx    ] │    │
│  │ Base URL: https://dashscope...     │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  [无 "+ 添加 Provider" 按钮]                 │  ← 移除
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  搜索 Provider 配置                          │
│                                             │
│  Tavily                              [◎]   │
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [tvly-xxxxxxxxxxxxxxxx  ] │    │
│  │ Endpoint: https://api.tavily.com    │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  SerpAPI                             [ ]   │
│  ┌─────────────────────────────────────┐    │
│  │ API Key: [xxxxxxxxxxxxxxxxxxxxxx ] │    │
│  │ Endpoint: https://serpapi.com       │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  EPO OPS                             [ ]   │
│  ┌─────────────────────────────────────┐    │
│  │ Consumer Key:    [xxxxxxxxxxxxxxx] │    │
│  │ Consumer Secret: [xxxxxxxxxxxxxxx] │    │
│  │ Endpoint: https://ops.epo.org       │ ← 灰显/锁定，不可编辑
│  └─────────────────────────────────────┘    │
│                                             │
│  [无 "+ 添加 Provider" 按钮]                 │  ← 移除
└─────────────────────────────────────────────┘
```

### 数据模型变更

```typescript
// shared/src/types/agents.ts

// 预置的模型 Provider 定义（硬编码，不可修改）
interface PresetModelProvider {
  id: string;              // 唯一标识，如 "openai"、"anthropic"、"deepseek"、"qwen"
  displayName: string;     // UI 展示名称
  baseUrl: string;         // 固定的 API endpoint，前端灰显
  authFields: AuthField[]; // 该 Provider 需要的认证参数
  defaultModels: string[]; // 预置的默认模型列表
  enabled: boolean;        // 用户可切换
}

interface AuthField {
  key: string;             // 配置键，如 "apiKey"、"consumerKey"、"consumerSecret"
  label: string;           // UI 标签，如 "API Key"
  type: "password" | "text"; // 输入框类型
  placeholder: string;
}

// 搜索 Provider 同样结构
interface PresetSearchProvider {
  id: string;              // 唯一标识，如 "tavily"、"serpapi"、"epo"
  displayName: string;
  baseUrl: string;         // 固定的 API endpoint
  authFields: AuthField[];
  enabled: boolean;
}

// 用户配置仅保存认证信息
interface UserProviderAuthConfig {
  providerId: string;      // 关联到预置 Provider
  auth: Record<string, string>; // { apiKey: "sk-xxx", ... }
  enabled: boolean;
}
```

### 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `shared/src/types/agents.ts` | 新增 `PresetModelProvider`、`PresetSearchProvider`、`AuthField` 类型；新增预置 Provider 常量数组 `PRESET_MODEL_PROVIDERS`、`PRESET_SEARCH_PROVIDERS` |
| `shared/src/types/api.ts` | 调整 `UserProviderAuthConfig` 结构，用户侧只存认证信息 |
| `client/src/features/settings/ProvidersConfigPanel.tsx` | 移除"添加 Provider"按钮；base URL 字段变为只读灰显；Provider 列表从预置常量渲染 |
| `client/src/features/settings/SearchProvidersConfigPanel.tsx` | 同上：移除添加按钮；endpoint 字段只读灰显；Provider 列表从预置常量渲染 |
| `client/src/store/index.ts` | 调整 Provider 配置相关的 state 结构 |
| `client/src/lib/repositories/settingsRepo.ts` | 调整默认设置，移除用户自定义 Provider 的结构 |
| `shared/src/fixtures/preset-demo.json` | 更新预置 demo 数据 |

### 技术实现要点

1. **预置 Provider 常量化**
   - 在 `shared/src/types/agents.ts` 中定义 `PRESET_MODEL_PROVIDERS` 和 `PRESET_SEARCH_PROVIDERS` 常量数组
   - 包含每个 Provider 的固定 baseUrl 和所需认证字段
   - 新增 Provider 时只需向数组追加元素，无需改动 UI 组件逻辑

2. **配置 UI 改造**
   - Provider 列表由遍历预置常量动态渲染（而非从用户配置中读取）
   - base URL / endpoint 字段设置 `disabled` 属性 + 灰显样式（`opacity: 0.6` 或 `readOnly`）
   - 仅认证字段（API Key 等）可编辑
   - 每个 Provider 行有启用/禁用 toggle
   - 移除底部的"+ 添加 Provider"按钮

3. **认证字段的动态表单**
   - 根据每个 Provider 的 `authFields` 定义动态渲染输入框
   - 统一处理 `password` 类型字段（带 show/hide toggle）

4. **向后兼容**
   - 用户已保存的 API Key 等认证信息不受影响（仅移除用户自行添加的非法 Provider）
   - 如果用户之前自行添加了非预置 Provider，升级后该配置被忽略

5. **Provider 扩展流程**
   - 需要新增 Provider 时：在 `PRESET_MODEL_PROVIDERS` 或 `PRESET_SEARCH_PROVIDERS` 中追加一项 → 发布新版本
   - 不再需要在 UI 中暴露添加接口

### 验收标准

- [ ] 模型 Provider 配置面板无"添加 Provider"按钮
- [ ] 搜索 Provider 配置面板无"添加 Provider"按钮
- [ ] 所有 Provider 的 base URL / endpoint 字段为只读灰显状态，不可编辑
- [ ] 用户可为每个 Provider 填写对应的认证参数（API Key 等）
- [ ] 用户可启用/禁用每个 Provider
- [ ] 预置 Provider 列表与 APP 版本绑定，版本更新可新增 Provider
- [ ] 现有已保存的认证信息（API Key 等）不受影响
- [ ] 用户之前自行添加的非预置 Provider 配置被安全忽略

### 安全考量

- base URL 锁定防止中间人代理攻击（用户将 API 请求导向恶意代理服务器）
- Provider 白名单机制确保所有数据传输仅通过已审核的第三方服务
- 符合专利审查场景的数据安全合规要求

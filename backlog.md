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

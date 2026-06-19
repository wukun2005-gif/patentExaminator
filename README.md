# 专利复审 AI 助手

> AI 辅助发明专利复审的 Web 工具 — RAG + Web Search + Groundedness 三重知识增强 · 内置离线评估平台持续监控质量

目标用户：发明专利复审实质审查员。本工具辅助完成审查意见解析、申请人答辩映射、复审事实复核和逐条回应草稿生成，所有 AI 输出为候选事实整理，需审查员确认。

---

## 快速开始

### 环境要求

- Node.js >= 20.11
- npm >= 10

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（前端 :5173 + 后端 :3000）
npm run dev
```

浏览器访问 **http://localhost:5173** 即可使用。

### 首次使用

1. 打开后默认进入**演示模式**（顶部显示蓝色横幅），所有 AI 输出为预置示例，不消耗 Token、不联网
2. 点击左侧「新建案件」或选择「载入预置案例 G1」体验完整流程
3. 按左侧导航栏顺序依次操作：复审文件导入 → 审查意见解析 → 答辩理由映射 → Claim Chart → 新颖性复核 → 创造性复核 → 复审意见草稿 → 导出

---

## 核心功能

| 功能 | 说明 | 路由 |
|------|------|------|
| 复审文件导入 | 上传申请文件、审查意见通知书、意见陈述书和可选修改后权利要求 | `/cases/:id/setup` |
| 审查意见解析 | 结构化提取驳回理由、法律依据、引用文献和事实认定 | `/cases/:id/opinion-analysis` |
| 答辩理由映射 | 将意见陈述书中的答辩理由映射到驳回理由，标注置信度和未回应项 | `/cases/:id/argument-mapping` |
| 文献清单 | 管理对比文件，查看时间轴状态 | `/cases/:id/references` |
| 文档解读 | AI 按文件类别分组解读申请文件、审查意见书、意见陈述书和对比文件，并明确列出文件名，支持追问 | `/cases/:id/interpret` |
| Claim Chart | 权利要求特征拆解，生成特征代码表 | `/cases/:id/claim-chart` |
| 新颖性复核 | 结合申请人答辩逐特征复核公开状态，标记区别特征 | `/cases/:id/novelty` |
| 创造性复核 | 最近现有技术→区别特征→技术启示，并回应创造性答辩 | `/cases/:id/inventive` |
| 缺陷复查 | 对比上次审查意见指出的缺陷，标注是否已克服 | `/cases/:id/defects` |
| 复审意见草稿 | 生成逐条回应格式的复审审查意见草稿 | `/cases/:id/draft` |
| 专利简述 | 生成专利申请简述 | `/cases/:id/summary` |
| 导出 | 导出 HTML 或 Markdown 格式审查辅助材料 | `/cases/:id/export` |
| 案件历史 | 查看和加载历史案件 | `/cases` |
| 知识库（RAG） | 上传法规文件，混合检索 + 融合重排注入 prompt 减少幻觉 | `/settings` (知识库 tab) |
| Web Search | MCP Server 实时搜索互联网，RAG + Web 跨源融合排序 | 自动触发（chat agent） |
| Groundedness | LLM-as-Judge 验证回答忠实度，自动过滤幻觉声明 | 自动触发 |
| 聊天文件上传 | 聊天中上传 PDF/DOCX/TXT/HTML/图片，AI 理解文件内容回答问题 | AI 助手 📎 按钮 |
| 数据同步 | 跨设备数据同步，服务器 SQLite 存储 | `/settings` (同步 tab) |
| Metrics Dashboard | 五维度 × 八指标实时监控，延迟分布、Groundedness 趋势图 | `/settings` (性能指标 tab) |
| 离线评估 | Golden Set 生成 + Multi-Judge 评估 + Eval Set 管理，量化 RAG 质量 | `/settings` (性能指标 tab) |
| 设置 | 配置 AI Provider、Agent 分配、知识库和同步 | `/settings` |

---

## 安全说明

- 导出文件包含法律声明，明确标注为「审查辅助素材，不构成法律结论」

---

## 知识增强架构

本系统采用 **RAG + Web Search MCP + Groundedness Check** 三层知识增强架构，确保 AI 回答有据可查、忠实可靠。

```
┌─────────────────────────────────────────────────────────────┐
│                    用户查询                                  │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Query Expansion（查询扩展）                │   │
│  │  跨语言映射 · 法律同义词 · 法条知识图谱               │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│           ┌─────────────┴─────────────┐                    │
│           ▼                           ▼                    │
│  ┌─────────────────┐       ┌─────────────────────┐        │
│  │  向量语义搜索     │       │  BM25 关键词搜索     │        │
│  │  cosine similarity│       │   中文分词      │        │
│  └────────┬────────┘       └──────────┬──────────┘        │
│           │                           │                    │
│           └─────────┬─────────────────┘                    │
│                     ▼                                      │
│           ┌──────────────────┐                             │
│           │  RRF 融合 (k=60)  │                             │
│           └────────┬─────────┘                             │
│                    ▼                                       │
│           ┌──────────────────┐                             │
│           │  Reranker 重排序  │                             │
│           │  远程→本地→启发式  │                             │
│           └────────┬─────────┘                             │
│                    ▼                                       │
│           ┌──────────────────┐     ┌──────────────────┐   │
│           │  RAG Citations   │     │  Web Search MCP   │   │
│           │  [1] [2] [3]...  │←───→│  server   多引擎   │   │
│           └────────┬─────────┘     └────────┬─────────┘   │
│                    │                         │              │
│                    └────────────┬────────────┘              │
│                                 ▼                          │
│                    ┌──────────────────────┐                 │
│                    │  Cross-Source Fusion  │                 │
│                    │  跨源融合排序         │                 │
│                    └──────────┬───────────┘                 │
│                               ▼                            │
│                    ┌──────────────────────┐                 │
│                    │  LLM 生成回答         │                 │
│                    │  [1] [2] 引用标记     │                 │
│                    └──────────┬───────────┘                 │
│                               ▼                            │
│                    ┌──────────────────────┐                 │
│                    │  Groundedness Check   │                 │
│                    │  LLM-as-Judge 验证   │                 │
│                    │  过滤幻觉·fail 重试   │                 │
│                    └──────────┬───────────┘                 │
│                               ▼                            │
│                         最终回答                            │
└─────────────────────────────────────────────────────────────┘
```

### RAG 管线（5 阶段）

设置页面"知识库"tab 支持上传文件，AI 在分析时自动检索相关知识注入 prompt，减少专业问题幻觉。

**支持的输入格式**：PDF, TXT, MD, DOCX, JSON, Excel, CSV, PNG, 在线 URL

**数据预处理与 Chunking**：

| 文档类型 | 切分策略 | 说明 |
|---------|---------|------|
| 法律/法规/司法解释 | 按"第X条" | 长条按"款"拆分，短条合并 |
| 审查指南 | 按"第X节" / X.X.X 标题 | 保留章节层级元数据 |
| 案例 | 按段落 | 保留段落完整性 |

- 最小 100 字符，最大 1500 字符；表格整体保留不拆分
- Parent-Child 模式：子 chunk 精准检索，父 chunk 完整上下文注入
- 中文分词：jieba-wasm + 37 个法律专用词典

**Hybrid Search 融合**：

- **向量搜索**： Embedding API 生成向量，cosine similarity 全量扫描
- **关键词搜索**：BM25 + 中文分词 + 长度归一化
- **融合算法**：Reciprocal Rank Fusion（RRF，k=60），`score = Σ 1/(k + rank + 1)`

**Reranker 三层降级**：

| 层级 | 实现 | 说明 |
|------|------|------|
| 远程 Reranker API | POST `/v1/rerank` | 用户配置的远程服务 |
| Cross-Encoder | reranker | 本地模型，懒加载 + 预热 |
| 启发式加权 | 5 信号融合 | 语义 0.4 + 关键词 0.25 + 文档类型 0.15 + 法条引用 0.15 + 深度 0.05 |

### Web Search MCP Server

当 RAG 知识库无法回答时，LLM 自主判断调用 Web Search（Tool Calling，最多 3 轮）。

- **搜索 API**：多引擎 fallback（G* → Bi* → Ba*）
- **MCP 协议**：基于 Model Context Protocol，stdio 子进程通信
- **跨源融合**：RAG + Web Search 结果统一 reranker 排序，引擎优先级兜底（rag > search engine ）

### Groundedness Check（接地性检查）

回答生成后，LLM-as-Judge 逐句验证是否忠实于检索到的文档。

- **阈值策略**：groundedRatio ≥ 0.8 通过；0.5~0.8 仅保留有据声明；< 0.5 触发重新生成
- **降级保护**：Judge 调用失败时默认通过，不阻塞用户

---

## 质量监控与离线评估平台

> 不仅能用 AI，还能**量化 AI 好不好用**。

系统内置完整的 Metrics 采集和离线评估平台，覆盖从单次调用到全局趋势的全链路质量监控。

### 五维度指标体系

每次 AI 调用自动采集 20+ 字段（延迟、Token、Groundedness、RAG 分数等），按 **5 个维度**独立聚合分析：

| 维度 | 回答的问题 | 示例 |
|------|-----------|------|
| **LLM Provider** | 哪个模型最好？ | gemini:gemini-3.1-flash-lite vs mimo:mimo-v2.5-pro |
| **Search Provider** | 哪个搜索引擎最相关？ | google vs bing vs baidu |
| **Reranker** | 重排序模型对检索质量有多大提升？ | bge-reranker-v2-m3 |
| **Embedding** | 向量模型对检索质量有多大影响？ | bge-m3 |
| **模型组合** | 完整 pipeline 配置的端到端表现？ | LLM + Search + Reranker + Embedding 全链路 |

每个维度支持 **8 项指标**：调用次数、成功率、耗时（p50/p90/p99）、Groundedness、RAG 分数、TTFT、Web 相关性、跨源相关性。

### 离线评估（Golden Set + Multi-Judge）

用固定测试集量化 RAG 系统质量，确保每次配置变更不会导致质量退化。

**评估指标（M1-M10）**：

| 指标 | 衡量什么 | 优先级 |
|------|---------|:---:|
| NDCG@K | 检索排序质量（位置敏感） | P0 |
| Faithfulness | 生成内容是否忠实于检索文档（防幻觉） | P0 |
| Source Routing | KB vs Web 路由是否正确 | P0 |
| Recall@K | 关键信息是否被检索到 | P1 |
| KB Hit Rate | 知识库检索质量 | P1 |
| Answer Correctness | 端到端答案正确性 | P1 |
| Fact Coverage | 关键事实是否覆盖 | P1 |
| Conflict Resolution | KB 与 Web 矛盾时是否正确选择权威源 | P2 |
| Refusal Accuracy | 无可靠答案时是否拒绝回答 | P2 |

**Multi-Judge 架构**：M5/M6/M7 等语义指标使用 2-3 个 LLM judge 独立打分，取算术平均，消除单模型偏差。

**Golden Set 设计**：按 sourceType（kb_only / web_only / cross_source / conflict / no_answer）× category（新颖性 / 创造性 / 权利要求 / 形式缺陷 / 程序）矩阵生成，确保全场景覆盖。

### Eval Set 管理

Dashboard 内置 Eval Set 管理界面，支持创建、上传、重命名、删除评估集，异步执行评估任务，实时查看进度。

```
Settings → 性能指标 tab
  ├─ 概览卡片（总调用 / 成功率 / Groundedness）
  ├─ 5 维度 × 8 指标对比表
  ├─ 延迟分布（p50/p90/p99 + 堆叠条形图）
  ├─ Groundedness 趋势图（按天）
  └─ 离线评估
       ├─ Eval Set 管理（CRUD + JSON 导入）
       ├─ Golden Set 生成（3 LLM × 7 题 = 21 题）
       ├─ 异步评估运行 + 进度条
       └─ 历史报告对比
```


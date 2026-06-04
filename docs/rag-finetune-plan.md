# RAG Finetune 计划

<p align="right">2026-06-04</p>

## 1. 现状评估

### 1.1 当前 RAG 流水线

```
用户提问
  → Query Expansion（跨语言 + 法律同义词 + 法条图谱）
  → Embedding Search（可选，远程 API，threshold=0.3）
  → BM25 Search（MiniSearch，bigram 中文分词）
  → RRF 融合（Reciprocal Rank Fusion, k=60）
  → Reranking（远程 API / localRerank 启发式）
  → Top-K 注入 Prompt
  → LLM 生成回答 + Citations
```

### 1.2 已知问题

| # | 问题 | 严重度 | 根因 |
|---|------|--------|------|
| 1 | **Chunk 切分不按法条** | P0 | `simpleChunk` 按行扫描，遇到"第X条"就切，但法律条文跨多行会被切成碎片 |
| 2 | **BM25 分词质量差** | P0 | bigram 产生大量无意义 token（"利法"、"法实"），需要 jieba 分词 |
| 3 | **MiniSearch 无文档长度归一化** | P1 | 长 chunk 天然得分高，短 chunk 被压制 |
| 4 | **Embedding search 在 orchestrator 中被跳过** | P0 | 已修复：现在通过请求体传递 embedding 配置 |
| 5 | **向量 threshold 硬编码 0.3** | P1 | 可能漏掉相关结果或保留不相关结果 |
| 6 | **BM25 索引不持久化** | P2 | 每次重启重建，878 条 chunk 要 1 秒 |
| 7 | **所有 chunk 全量加载到内存** | P2 | 878 条还行，但扩展性差 |
| 8 | **Cross-encoder 模型加载失败** | P2 | `@xenova/transformers` 下载失败，10 秒延迟（已降级为 localRerank） |

---

## 2. 对标分析：经典免费 RAG 实现

### 2.1 参考实现

| 项目 | 特点 | 可借鉴 |
|------|------|--------|
| **RAGFlow** (开源) | 深度文档理解、多种 chunk 策略（按法条/按表格/按标题）、布局识别 | 法律文档的 chunk 策略 |
| **Dify** (开源) | 完整 RAG pipeline、多路召回、reranking、query 改写 | 检索架构 |
| **LangChain** | RecursiveCharacterTextSplitter、Parent-Child chunk、Multi-Query Retriever | 分块和检索策略 |
| **LlamaIndex** | Sentence Window Retrieval、Auto-merging Retriever、Knowledge Graph | 高级检索模式 |

### 2.2 关键差距

| 维度 | 当前实现 | 最佳实践 | 差距 |
|------|----------|----------|------|
| **Chunk 策略** | 按行扫描 + 固定字符合并(200-2000) | 按语义单元（法条/段落/表格）切分 | 大 |
| **中文分词** | bigram | jieba / pkuseg | 中 |
| **BM25 实现** | MiniSearch（简化版） | 完整 Okapi BM25 + 文档长度归一化 | 小 |
| **向量检索** | 余弦相似度 + 固定 threshold | Top-K + 动态 threshold / MMR | 小 |
| **Query 改写** | 跨语言 + 法律同义词 + 法条图谱 | Multi-Query + HyDE | 中 |
| **Reranking** | 启发式 5 信号加权 | Cross-encoder / Cohere Rerank | 中 |
| **Context 组装** | 简单拼接 blockquote | Parent-Child / Sentence Window | 中 |
| **评估** | 无 | RAGAS / TruLens | 大 |

---

## 3. 优化方案（按优先级）

### 3.1 P0: Chunk 策略重构

**目标**：法律文本按"条"为基本单位切分，保留层级元数据。

#### 3.1.1 法律文本专用切分器

```typescript
// 策略：按"第X条"切分，每条是一个完整的法律规范
// 元数据：章/节/条/款 层级
// 合并规则：短条（<100字）与相邻条合并
// 拆分规则：长条（>1500字）按"款"拆分
// 上下文：prepend 章节标题 + 条号

interface LegalChunk {
  text: string;
  metadata: {
    fileName: string;
    documentCategory: string;  // 法律/行政法规/审查指南/...
    chapter: string;           // 第X章
    section: string;           // 第X节
    article: string;           // 第X条
    paragraph: string;         // 第X款（如有）
    articleRefs: string[];     // 引用的其他法条
  };
}
```

#### 3.1.2 多策略切分器（按文档类型）

| 文档类型 | 切分策略 | 理由 |
|----------|----------|------|
| 法律/行政法规 | 按"第X条" | 每条是独立法律规范 |
| 审查指南 | 按"第X节" + 子标题 | 指南有复杂的层级结构 |
| 司法解释 | 按"第X条" | 同法律 |
| 案例 | 按段落 + 决定要点 | 案例是叙述性的 |
| PDF（扫描版） | 按页 + OCR | 无法解析结构 |

#### 3.1.3 Parent-Child Chunk 模式

```
Parent Chunk: 第六十五条（完整条文，500字）
  Child Chunk 1: 第六十五条 第一款（200字）→ 用于检索
  Child Chunk 2: 第六十五条 第二款（200字）→ 用于检索
  Child Chunk 3: 第六十五条 第三款（100字）→ 用于检索

检索时匹配 Child，注入时用 Parent（保留完整上下文）
```

**优势**：检索精度高（小 chunk），上下文完整（大 chunk）。

### 3.2 P0: 中文分词升级

**方案**：用 `@aspect/nodejieba`（jieba 的 Node.js 绑定）。

```typescript
// 替换 bigram tokenizer
import { cut } from "@aspect/nodejieba";

function tokenizeChinese(text: string): string[] {
  const cleaned = text.replace(/[，。！？、；：""''（）【】《》\s]+/g, " ");
  const words = cut(cleaned);
  return words
    .filter(w => w.trim().length > 0)
    .map(w => w.toLowerCase());
}
```

**自定义词典**（法律术语）：
```
专利法实施细则
审查指南
复审请求
创造性三步法
区别技术特征
权利要求书
说明书
```

**依赖**：`npm install @aspect/nodejieba`（纯 JS，无需编译）

### 3.3 P1: BM25 评分改进

#### 方案 A：MiniSearch + 长度归一化（推荐，改动最小）

```typescript
// 在 searchBM25 中添加长度归一化
function searchBM25(query: string, topK: number = 10) {
  const results = index.search(query);
  // 长度归一化：短 chunk 得分 boost
  const normalized = results.map(r => {
    const chunk = chunkMap.get(r.id);
    const len = chunk?.text.length ?? 500;
    const lenNorm = 1 / (1 + Math.log(len / 500)); // 500字为基准
    return { id: r.id, score: r.score * lenNorm };
  });
  return normalized.sort((a, b) => b.score - a.score).slice(0, topK);
}
```

#### 方案 B：SQLite FTS5（中期，替换 MiniSearch）

```sql
-- 利用已有的 knowledge.db
CREATE VIRTUAL TABLE kb_fts USING fts5(
  text, source_id, document_category,
  content=kb_chunks,
  content_rowid=rowid,
  tokenize='unicode61'  -- 支持中文
);

-- 搜索
SELECT c.*, bm25(kb_fts) as rank
FROM kb_fts
JOIN kb_chunks c ON c.rowid = kb_fts.rowid
WHERE kb_fts MATCH '复审 请求书'
ORDER BY rank
LIMIT 10;
```

**优势**：
- 零额外依赖（SQLite 内置）
- 完整 BM25 实现
- 索引持久化
- 支持中文（unicode61 tokenizer）

### 3.4 P1: Query 改写增强

#### 3.4.1 Multi-Query（多查询改写）

```typescript
// 原始 query: "复审都需要哪些文件"
// 改写为多个子查询：
const queries = [
  "复审请求书",           // 核心关键词
  "复审 提交 文件 材料",  // 拆分
  "专利复审 申请 必备",   // 同义词扩展
];
// 每个子查询独立检索，合并去重
```

#### 3.4.2 HyDE（假设性文档嵌入）

```
用户问: "复审需要哪些文件"
→ LLM 生成假设性回答: "根据专利法实施细则第六十五条，复审请求应当提交复审请求书..."
→ 用假设性回答做 embedding search（比用问题做 search 更准）
```

**成本**：HyDE 需要一次额外的 LLM 调用。可以只在知识库检索结果不佳时启用。

### 3.5 P1: Context 组装优化

#### 当前方式（简单拼接）
```
> 【来源：专利法实施细则 · 相似度: 0.85】
> 第六十五条 依照专利法第四十一条的规定...
```

#### 改进方式（结构化注入）
```
## 知识库检索结果（3条）

### 1. 《专利法实施细则》第六十五条（相似度: 0.85）
依照专利法第四十一条的规定向国务院专利行政部门请求复审的，
应当提交复审请求书，说明理由，必要时还应当附具有关证据。

### 2. 《审查指南》第四部分第二章（相似度: 0.72）
复审请求书应当采用国务院专利行政部门规定的表格格式...

### 3. ...
```

**改进点**：
- 按相关性排序
- 标注文档类型和条号
- 控制注入总量（不超过 context window 的 30%）

### 3.6 P2: 向量检索改进

#### 3.6.1 动态 threshold

```typescript
// 不用固定 0.3，用 top-K + 相对 threshold
const TOP_K = 5;
const RELATIVE_THRESHOLD = 0.7; // 相对于最高分

const topScore = scores[0]?.score ?? 0;
const filtered = scores.filter(s => s.score >= topScore * RELATIVE_THRESHOLD);
const results = filtered.slice(0, TOP_K);
```

#### 3.6.2 MMR（Maximal Marginal Relevance）

```typescript
// 避免返回过于相似的结果，增加多样性
function mmr(query_vec, candidates, lambda = 0.5, topK = 5) {
  const selected = [];
  while (selected.length < topK && candidates.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const relevance = cosine(query_vec, candidates[i].vec);
      const diversity = Math.max(...selected.map(s => cosine(candidates[i].vec, s.vec)), 0);
      const mmrScore = lambda * relevance - (1 - lambda) * diversity;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    selected.push(candidates.splice(bestIdx, 1)[0]);
  }
  return selected;
}
```

### 3.7 P2: BM25 索引持久化

```typescript
// 序列化 MiniSearch 索引到磁盘
import fs from "fs";

const INDEX_PATH = "server/data/bm25-index.json";

function saveIndex(index: MiniSearch) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index.toJSON()));
}

function loadIndex(): MiniSearch | null {
  if (!fs.existsSync(INDEX_PATH)) return null;
  const data = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  return MiniSearch.loadJSON(data);
}
```

### 3.8 P2: Reranking 改进

#### 3.8.1 免费远程 Reranker

| 服务 | 免费额度 | 说明 |
|------|----------|------|
| **SiliconFlow** | 有免费额度 | 已在项目中使用，支持 bge-reranker-v2-m3 |
| **Jina AI** | 1M tokens/月 | jina-reranker-v2 |

#### 3.8.2 本地 Reranker 改进

当前 `localRerank` 用 5 个信号加权，可以优化：
- 增加 **query-document 重叠度** 信号
- 增加 **文档新鲜度** 信号（新法规 > 旧法规）
- 调整权重（法律文本中，法条引用匹配应该权重更高）

### 3.9 P2: 评估体系

#### 3.9.1 离线评估

```typescript
// 评估数据集：问题 + 期望的引用来源
const evalSet = [
  {
    query: "复审需要提交哪些文件",
    expectedSources: ["专利法实施细则_2023.txt"],
    expectedArticles: ["第六十五条"],
  },
  // ...
];

// 评估指标：
// - Recall@5: 前5个结果中包含期望来源的比例
// - MRR: 期望来源的平均排名倒数
// - Citation Accuracy: LLM 回答中引用的法条是否正确
```

#### 3.9.2 在线评估

- 用户反馈：每个回答后加"有用/无用"按钮
- 引用点击：用户点击了哪些 citation

---

## 4. 实施路线图

### Phase 1: 核心修复（1-2 天）

| 任务 | 改动文件 | 说明 |
|------|----------|------|
| 法律文本按条切分 | `knowledge.ts` simpleChunk | 按"第X条"切分，保留章/节/条元数据 |
| jieba 分词 | `hybridSearch.ts` + `package.json` | 替换 bigram，添加法律词典 |
| Parent-Child chunk | `knowledge.ts` + `knowledgeDb.ts` | 检索用 child，注入用 parent |

### Phase 2: 检索增强（2-3 天）

| 任务 | 改动文件 | 说明 |
|------|----------|------|
| BM25 长度归一化 | `hybridSearch.ts` | 短 chunk boost |
| 动态 threshold | `orchestrator.ts` | top-K + 相对 threshold |
| Multi-Query | `queryExpand.ts` | 多子查询合并 |
| Context 组装优化 | `orchestrator.ts` | 结构化注入格式 |

### Phase 3: 架构优化（3-5 天）

| 任务 | 改动文件 | 说明 |
|------|----------|------|
| SQLite FTS5 替换 MiniSearch | `knowledgeDb.ts` + `hybridSearch.ts` | 完整 BM25，索引持久化 |
| HyDE 查询改写 | `queryExpand.ts` | 可选，检索不佳时启用 |
| MMR 多样性排序 | `hybridSearch.ts` | 避免返回重复内容 |
| Reranking 权重调优 | `reranker.ts` | 法律文本专用权重 |

### Phase 4: 评估与调优（持续）

| 任务 | 说明 |
|------|------|
| 构建评估数据集 | 20-30 个典型问题 + 期望来源 |
| 离线评估脚本 | Recall@5, MRR, Citation Accuracy |
| 用户反馈收集 | 有用/无用按钮 |

---

## 5. 约束

- **全部免费**：不使用付费 API（如 Cohere Rerank）
- **服务端处理**：所有 RAG 逻辑在 server 端，客户端只传配置
- **渐进式**：每个 Phase 独立可部署，不破坏现有功能
- **向后兼容**：已上传的知识库文件不需要重新上传（自动迁移）

# Offline Evaluation Metrics — 专利复审 RAG 离线评估规范

> **📋 已合并到 [DESIGN.md §6.7.3](../DESIGN.md#673-离线评估golden-set--eval-set)**（2026-06-19）。核心指标定义（M1-M10）、Golden Set 结构、Multi-Judge 架构已整合到设计文档。本文档保留作为详细参考。

---

## 1. 目标与动机

### 1.1 为什么需要离线评估

专利复审 AI 助手的核心能力是**检索增强生成（RAG）**：从知识库和 web 搜索中检索相关信息，生成审查意见分析。

当前系统缺乏量化评估手段：
- 无法知道检索结果的排序质量（最相关的 chunk 是否排在前面）
- 无法知道生成答案是否忠实于检索上下文（是否产生幻觉）
- 无法知道来源路由是否正确（该用 KB 时用了 KB，该用 web 时用了 web）
- 无法比较不同配置（provider、model、检索参数）的优劣

**离线评估的目标**：建立一套可重复、可量化的评估体系，用固定测试集（golden set）持续监控和比较 RAG 系统质量。

### 1.2 离线评估 vs 在线评估

| 维度 | 离线评估 | 在线评估 |
|------|---------|---------|
| 数据来源 | 预构建的 golden set | 用户真实查询 |
| 执行方式 | 自动化脚本 | 用户交互 |
| 可重复性 | ✅ 完全可重复 | ❌ 每次不同 |
| 覆盖面 | 可控（按矩阵设计） | 随机（取决于用户行为） |
| 用途 | 版本发布前的质量门禁 | 线上问题发现 |

本文档定义离线评估的指标体系和实现方案。

---

## 2. 指标体系

### 2.1 指标总览

| # | 指标 | 类别 | 计算方式 | 需要 judge？ | 需要 golden set？ | 适用 sourceType |
|---|------|------|---------|-------------|------------------|----------------|
| M1 | **NDCG@K** | 检索排序 | DCG@K / IDCG@K | ✅ 实时评估 | ❌ reference-free | **全部** |
| M2 | **Recall@K** | 检索覆盖 | relevant_in_topK / total_relevant | ✅ 实时评估 | ❌ reference-free | **全部** |
| M3 | **KB Hit Rate** | 检索覆盖 | kb_only 题的 Recall@K | ✅ 实时评估 | ❌ reference-free | kb_only |
| M5 | **Faithfulness** | 生成忠实度 | 2 judge → claim 支持率 → average | ✅ | ❌ reference-free | 全部 |
| M6 | **Answer Correctness** | 生成正确性 | 2 judge → 与 expectedAnswer 对比 → average | ✅ | ✅ expectedAnswer | 全部 |
| M7 | **Fact Coverage** | 生成完整性 | 2 judge → mustIncludeFacts 覆盖率 → average | ✅ | ✅ mustIncludeFacts | 全部 |
| M8 | **Source Routing Accuracy** | 路由准确性 | expectedSource == 实际源 | ❌ | ✅ expectedSource | 全部 |
| M9 | **Conflict Resolution Rate** | 冲突处理 | 冲突题中正确选择权威源的比例 | ❌ | ✅ sourceType | conflict |
| M10 | **Refusal Accuracy** | 拒绝回答 | no_answer 题中正确拒绝的比例 | ❌ | ✅ sourceType | no_answer |

> **⚠️ M4 Web Hit Rate 已删除**
>
> Web 搜索是非确定性的——今天搜"专利法第二十二条"可能找到知乎文章，下个月可能找到专利局官网。
> 不存在稳定的 "relevant chunk set" 可以作为 ground truth，因此 chunk 级检索指标（NDCG/Recall）不适用于 web 搜索。
>
> **Web 搜索质量通过端到端答案质量衡量**（M6 Answer Correctness + M7 Fact Coverage），
> 而非 chunk 级检索指标。这是 Copilot、Perplexity 等跨源系统的通用做法。

### 2.2 指标详细定义

#### M1: NDCG@K（检索排序质量）

**为什么选这个指标**：检索返回 top-K 个 citations（KB chunks + web search results），但并非所有 citations 都相关。NDCG 考虑了排序位置——排在前面的相关 citations 贡献更大。比单纯的 Recall 更能反映用户体验。

**公式**：
```
DCG@K = Σᵢ₌₁ᴷ (2^relᵢ - 1) / log₂(i + 1)
NDCG@K = DCG@K / IDCG@K

relᵢ = LLM judge 对第 i 个检索结果的 relevance grade（0-3）
IDCG@K = 假设所有 K 个 citations 都是 grade 3 的理想 DCG
```

**输入数据**：
- `retrievedChunks`：实际检索到的 citations 列表（包括 KB chunks 和 web search results，按排序顺序）
- `query`：题目 query
- LLM judge API（实时评估）

**范围**：所有 sourceType（通过 LLM 实时评估 citation 与 query 的相关性）

---

#### M2: Recall@K（检索覆盖率）

**为什么选这个指标**：衡量关键信息是否被检索到。用户关心"答案在不在 top-K 里"。

**公式**：
```
Recall@K = (top-K 中 LLM judge 判定 grade ≥ 2 的 citation 数) / (LLM judge 判定 grade ≥ 2 的 citation 总数)
```

**输入数据**：
- `retrievedChunks`：实际检索到的 citations 列表（包括 KB chunks 和 web search results）
- `query`：题目 query
- LLM judge API（实时评估）

**范围**：所有 sourceType（同 M1）

---

#### M3: KB Hit Rate（KB 检索命中率）

**为什么选这个指标**：KB 检索质量的单一来源监控。KB Hit Rate 低说明知识库检索有问题。

**公式**：对 `kb_only` 题目，只统计来自 KB 的检索结果，计算 Recall@K

**输入数据**：
- `retrievedChunks`：实际检索到的 chunk 列表（仅 KB 来源）
- `query`：题目 query
- LLM judge API（实时评估）

**范围**：仅 `kb_only`（M3 是 M2 的子集，专门监控 KB 检索质量）

> **Web 搜索质量如何衡量？**
>
> Web 搜索是非确定性的，无法预计算 ground truth chunk 集。Web 搜索质量通过端到端答案质量衡量：
> - M6 Answer Correctness：答案是否正确
> - M7 Fact Coverage：关键事实是否覆盖
>
> 这是 Copilot、Perplexity 等跨源系统的通用做法——不通过匹配特定 URL 来衡量 web 搜索，而是通过最终答案质量来衡量。

---

#### M5: Faithfulness（生成忠实度）

**为什么选这个指标**：RAG 系统的最大风险是幻觉——生成了检索上下文中不支持的内容。Faithfulness 是 reference-free 指标，不需要参考答案，只检查生成内容是否被上下文支持。

**计算流程**：
```
1. 2 个 LLM judge 各自独立执行：
   a. 将生成的答案拆成 N 个独立 claims
   b. 对每个 claim，检查是否被检索到的上下文支持
   c. 计算该 judge 的 faithfulness = 被支持 claims / 总 claims
2. 最终 Faithfulness = 2 个 judge 的算术平均
```

**输入数据**：chat Q&A 输出的答案 + 检索到的 chunks（评估阶段实时获取）

**不需要 golden set 字段**：这是 reference-free 指标

---

#### M6: Answer Correctness（答案正确性）

**为什么选这个指标**：Faithfulness 只检查是否忠实于上下文，但上下文本身可能是错的或不完整的。Answer Correctness 将生成答案与 golden set 中的参考答案对比。

**计算流程**：
```
1. 2 个 LLM judge 各自独立执行：
   a. 对比生成答案与 expectedAnswer
   b. 给出 0-1 的正确性分数
2. 最终 Answer Correctness = 2 个 judge 的算术平均
```

**输入数据**：chat Q&A 输出的答案 + `expectedAnswer` 字段

---

#### M7: Fact Coverage（事实覆盖率）

**为什么选这个指标**：答案可能部分正确但遗漏关键事实。Fact Coverage 检查参考答案中的关键事实点是否被覆盖。

**计算流程**：
```
1. 2 个 LLM judge 各自独立执行：
   a. 对 mustIncludeFacts 中的每个事实点
   b. 判断生成答案是否包含该事实（语义匹配）
   c. 计算该 judge 的 fact coverage = 被覆盖数 / 总数
2. 最终 Fact Coverage = 2 个 judge 的算术平均
```

**输入数据**：chat Q&A 输出的答案 + `mustIncludeFacts` 字段

---

#### M8: Source Routing Accuracy（来源路由准确性）

**为什么选这个指标**：系统需要判断答案来自 KB 还是 web，路由错误会导致检索失败。

**公式**：
```
Source Routing Accuracy = 路由正确的题目数 / 总题目数
```

**输入数据**：`expectedSource` 字段 vs chat Q&A 实际使用的源

---

#### M9: Conflict Resolution Rate（冲突处理率）

**为什么选这个指标**：当 KB 和 web 给出矛盾答案时，系统应优先选择权威来源（KB）。

**公式**：
```
Conflict Resolution Rate = 冲突题中正确选择 KB 的数量 / 冲突题总数
```

**输入数据**：`sourceType == "conflict"` 的题目 + chat Q&A 选择的源

---

#### M10: Refusal Accuracy（拒绝回答准确率）

**为什么选这个指标**：对于没有可靠答案的问题，系统应拒绝回答而非编造。这是防幻觉的最后一道防线。

**公式**：
```
Refusal Accuracy = no_answer 题中正确拒绝的数量 / no_answer 题总数
```

**输入数据**：`sourceType == "no_answer"` 的题目 + chat Q&A 的回答是否表示"无法确定"

---

### 2.3 指标优先级

| 优先级 | 指标 | 适用 sourceType | 理由 |
|--------|------|----------------|------|
| **P0** | M1 NDCG@5 | kb_only | KB 检索排序是最核心的 RAG 质量指标 |
| **P0** | M5 Faithfulness | 全部 | 幻觉是最严重的质量问题 |
| **P0** | M8 Source Routing | 全部 | 路由错误直接导致检索失败 |
| **P1** | M2 Recall@10 | kb_only | KB 检索覆盖率 |
| **P1** | M3 KB Hit Rate | kb_only | KB 检索质量分源监控 |
| **P1** | M6 Answer Correctness | 全部 | 端到端答案质量（web 搜索质量的核心衡量） |
| **P1** | M7 Fact Coverage | 全部 | 关键事实遗漏 |
| **P2** | M9 Conflict Resolution | conflict | 冲突处理能力 |
| **P2** | M10 Refusal Accuracy | no_answer | 拒绝回答能力（防幻觉最后防线） |

### 2.4 指标与 judge 的关系

| 指标类型 | judge 时机 | 说明 |
|----------|-----------|------|
| **确定性指标**（M8-M10） | 不需要 judge | 用 golden set 的预计算数据直接计算 |
| **检索质量指标**（M1-M3） | 评估阶段实时调用 judge | 对每个 citation（KB chunk + web result）实时评估相关性 |
| **语义指标**（M5, M6, M7） | 评估阶段实时调用 judge | 对比 RAG 输出和参考数据 |

> **Judge 使用场景**：
> - **D 阶段**：judge 对检索 citations 实时打分（M1-M3），或对 RAG 输出打分（M5-M7）
> - **所有 sourceType 都评估 M1/M2**：NDCG/Recall 衡量 citations 与 query 的相关性，不只是 KB chunks
> - **M3 KB Hit Rate 仅适用于 kb_only**：专门监控 KB 检索质量

---

## 3. 离线评估的成功标准

离线评估本身也需要评估——怎么证明这套指标体系是有用的？

### 3.1 成功标准

| # | 成功标准 | 验证方法 |
|---|---------|---------|
| S1 | 指标能区分好坏配置 | 用不同 provider/model 跑评估，指标应有显著差异 |
| S2 | 指标变化与用户体验一致 | 指标下降时，人工抽检确认答案质量确实下降 |
| S3 | 评估结果可重复 | 相同配置多次评估，指标方差 < 5% |
| S4 | 评估覆盖所有题型 | 5 种 sourceType × 5 个 category = 25 个 cell，至少覆盖 21 个 |
| S5 | Golden set 质量合格 | 人工抽检确认题目和答案质量 |

### 3.2 反模式

| 反模式 | 问题 | 检测方法 |
|--------|------|---------|
| 指标无区分度 | 所有配置得分差不多 | 比较 best vs worst 配置的指标差异 |
| 指标与体验脱节 | 指标涨了但用户说更差了 | 定期人工抽检 + 用户反馈 |
| Golden set 质量差 | 题目不合理或答案错误 | 人工抽检 |

---

## 4. Golden Set 数据结构

### 4.1 GoldenQuestion 字段映射

每个字段必须映射到具体的评估指标。无映射的字段应删除。

| 字段 | 类型 | 映射指标 | 产出阶段 | 说明 |
|------|------|---------|---------|------|
| `id` | string | — | A.1 | 唯一标识，不映射指标 |
| `query` | string | 所有指标 | A.1 | 评估的输入问题 |
| `category` | enum | 分组统计 | A.1 | 按 category 分组看指标 |
| `difficulty` | enum | 分组统计 | A.1 | 按 difficulty 分组看指标 |
| `sourceType` | enum | M3/M8/M9/M10 | A.1 | 决定该题评估哪些指标 |
| `agent` | string | 分组统计 | A.1 | Phase 1 固定为 "chat" |
| `expectedAnswer` | string | **M6** Answer Correctness | A.1 | RAG 输出的对比基准 |
| `mustIncludeFacts` | string[] | **M7** Fact Coverage | A.1 | 关键事实点覆盖检查 |
| `expectedSource` | enum | **M8** Source Routing | A.1 | 路由正确性检查 |
| `sourceRoutingRationale` | string | — | A.1 | 解释为什么选这个源（辅助理解，不参与指标计算） |
| `expectedSources` | string[] | — | A.1 | 文件名/URL 列表（辅助理解，不参与指标计算） |
| `generatedBy` | string | — | A.1 | 记录哪个 provider 生成 |
| `verifiedBy` | enum | — | A.1 | 验证方式 |

**字段删除建议**：
- `sourceRoutingRationale` 和 `expectedSources` 不直接参与指标计算，但有助于标记不可信和调试，保留。


### 4.3 题目类型（sourceType）

| sourceType | 检索指标（citation 级） | 答案指标（端到端） | 说明 |
|------------|-------------------|-------------------|------|
| `kb_only` | M1, M2, M3 | M5, M6, M7, M8 | 纯 KB 场景：检索 + 答案都评估 |
| `web_only` | M1, M2 | M5, M6, M7, M8 | 纯 Web 场景：评估 web citation 质量 |
| `cross_source` | M1, M2 | M5, M6, M7, M8 | 综合场景：评估混合 citation 质量 |
| `conflict` | M1, M2 | M8, M9 | 冲突处理场景：评估路由 + 冲突解决 |
| `no_answer` | M1, M2 | M8, M10 | 拒绝回答场景：评估拒绝准确性 |

> **所有 sourceType 都评估检索指标（M1/M2）**
>
> NDCG 和 Recall 衡量的是 **actual citations**（包括 KB chunks、web search results 等）与 query 的相关性。
> 不是只有 KB chunks 才叫 citation —— web search results URLs 也是 citations。
>
> 通过 LLM 实时评估每个 citation 的相关性（0-3），然后计算 NDCG 和 Recall。
> 这样可以统一衡量所有 sourceType 的检索质量。

### 4.4 题目类型分布矩阵

每个 provider 生成 7 题，3 provider 共 21 题。

> **硬约束**：总题数必须等于矩阵所有非零 cell 之和（21）。不符合则生成失败。

```
┌──────┬──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│  行  │  sourceType  │  新颖性  │  创造性  │ 权利要求 │ 形式缺陷 │   程序   │ 行合计 │
│      │              │    C1    │    C2    │    C3    │    C4    │    C5    │        │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│  R1  │ kb_only      │ 11: 1    │ 12: 1    │ 13: 1    │ 14: 1    │ 15: 1    │   5    │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│  R2  │ web_only     │ 21: 1    │ 22: 1    │ 23: 1    │ 24: 1    │ 25: 1    │   5    │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│  R3  │ cross_source │ 31: 1    │ 32: 1    │ 33: 1    │ 34: 1    │ 35: 1    │   5    │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│  R4  │ conflict     │ 41: 1    │ 42: 1    │ 43: 1    │ 44: 0    │ 45: 0    │   3    │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│  R5  │ no_answer    │ 51: 0    │ 52: 2    │ 53: 0    │ 54: 0    │ 55: 1    │   3    │
├──────┼──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│      │ 列合计       │    3     │    5     │    3     │    3     │    5     │   21   │
└──────┴──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────┘
```

---

## 5. 实现方案 — Phase 1：Chat Agent

Phase 1 评估 `chat` agent（占实际使用量 90%+）。所有题目 `agent` 字段固定为 `"chat"`。

Phase 1 分四个阶段执行：

```
┌─────────────────────────────────────────────────────────────┐
│ A.1 生成 Golden Set                                          │
│ 产出：21 题 + 参考答案                                        │
│ 为指标服务：M5-M10 的输入数据                                   │
├─────────────────────────────────────────────────────────────┤
│ B Golden Set 质量评估                                         │
│ 产出：质量报告（题目是否合格）                                   │
│ 目的：确保 golden set 本身质量达标，不产出垃圾指标                │
├─────────────────────────────────────────────────────────────┤
│ C 清理不合格题目                                               │
│ 产出：删除 B 阶段不通过的题目，保留合格题目到 DB                  │
│ 导出：golden-set-raw-{ts}.json（调试）+ golden-set-{ts}.json   │
├─────────────────────────────────────────────────────────────┤
│ D 用 Golden Set 评估模型                                      │
│ 产出：评估报告（各项指标分数）                                    │
│ 计算指标：M1-M3（实时评估）+ M5-M10（按 sourceType）            │
└─────────────────────────────────────────────────────────────┘
```

**各阶段 LLM 调用预算**：

| 阶段 | 逐题调用 | 批量合并后 | 说明 |
|------|---------|-----------|------|
| A.1 生成 | 3 | 3 | 3 providers × 1 call = 3（每 provider 批量生成 7 题） |
| B 质量评估 | 0 | 0 | 确定性检查，不调用 LLM |
| D RAG 生成 | 21 | 21 | 每题独立检索，不可合并 |
| D 检索指标 | 42 | **2** | M1-M2：21 题 × 10 citations 全部合并到 1 个 prompt × 2 judge |
| D 语义指标 | 42 | **6** | M5/M6/M7：21 题分 3 批（每批 7 题）× 2 judge |
| **总计** | **108** | **~32** | |

> **B 阶段为什么 0 次 LLM 调用？**
> B 的检查全部是确定性规则：题数计数、矩阵覆盖、字符长度。
> 不需要 LLM 判断，用代码即可完成。

**批量合并策略**：

核心原则：**能合并的 prompt 尽量合并，减少 LLM 调用次数。**

| 阶段 | 合并方式 | 效果 |
|------|---------|------|
| D 检索指标 | 21 题 × 10 citations = 210 citations 全部合并到 1 个 prompt，2 judge 并行 | 420 → **2** 次 |
| D 语义指标 | 21 题分 3 批（每批 7 题），M5/M6/M7 三指标合并到 1 个 prompt，2 judge 并行 | 126 → **6** 次 |

**不可合并的调用**：
- D RAG 生成：每道题的 query 不同 → 检索结果不同 → 生成答案不同，存在顺序依赖，必须逐题执行

**Batch size 选择依据**：
- 检索指标：210 citations × 300 chars ≈ 63k chars ≈ 20k tokens（安全）
- 语义指标：7 题 × ~10k chars ≈ 70k chars ≈ 25k tokens（接近上限，如质量下降可减小 batch）

**⚠️ 注意**：
- D 检索指标适用于**所有 sourceType**（NDCG/Recall 衡量 citations 与 query 的相关性）
- D 检索指标中 M3 KB Hit Rate 仅适用于 `kb_only` 题目
- D 语义指标中 Refusal Accuracy 单独调用（仅 no_answer 3 题需要），已计入 6 次

### 5.1 A.1 生成 Golden Set

**职责**：生成题目和参考答案。

**输入**：知识库 chunks、web 搜索结果
**输出**：21 道 GoldenQuestion

**流程**：

```
1. 采样阶段
   ├─ KB: sampleChunks(N) → 每个 source 均匀采样
   └─ Web: 对采样 chunk 提取关键词 → web 搜索 → top-K 结果

2. 题目生成阶段（并行，3 providers）
   ├─ 按 sourceType × category 矩阵分配（§4.4）
   ├─ 批量生成 query + expectedAnswer + metadata
   └─ 每个 provider 生成 7 题

3. 存储阶段
   └─ 写入 metrics_golden_set 表
```

**字段 → 指标映射**：

| 产出字段 | 服务的指标 | 说明 |
|---------|-----------|------|
| `query` | 所有 | 评估输入 |
| `expectedAnswer` | M6 | Answer Correctness 的对比基准 |
| `mustIncludeFacts` | M7 | Fact Coverage 的检查清单 |
| `expectedSource` | M8 | Source Routing 的对比基准 |
| `sourceType` | M3/M8/M9/M10 | 决定该题评估哪些指标 |
| `contextChunkIds` | 调试 | 记录生成时使用的 chunk IDs（调试用，不参与指标计算） |

**Token 消耗**：~21 次 LLM 调用，~2 万 tokens

**⚠️ 不做的事**：web 搜索结果是生成问题的辅助工具，不存储为 ground truth。

---

### 5.2 B Golden Set 质量评估

**职责**：验证 A.1 产出的 golden set 本身质量是否达标。

**为什么需要这个阶段？**

Golden set 是所有指标的 ground truth 来源。如果 golden set 质量差（题目不合理、答案错误），后续 D 阶段产出的所有指标都不可信——垃圾进，垃圾出。

B 阶段是 golden set 的"出厂质检"，确保只有合格的 golden set 才进入 D 阶段。

**输入**：A.1 产出的完整 golden set
**输出**：质量报告（通过 / 不通过 + 具体问题清单）

**检查项**：

| # | 检查项 | 合格标准 | 适用范围 | 不合格处理 |
|---|--------|---------|---------|-----------|
| B1 | 题目数量 | 总数 == 21 | 全部 | 生成失败，重跑 A.1 |
| B2 | 矩阵覆盖 | 21 个非零 cell 全部有题 | 全部 | 生成失败，重跑 A.1 |
| B3 | query 质量 | 每题 query ≥ 20 字，不重复 | 全部 | **C 阶段删除** |
| B4 | expectedAnswer 质量 | 每题 200-500 字，引用法条 | 全部 | **C 阶段删除** |
| B5 | mustIncludeFacts | 每题 3-8 个事实点 | 全部 | **C 阶段删除** |
| B10 | 题目不重复 | 任意两题 query 语义相似度 < 0.8 | 全部 | **C 阶段删除** |

**C 阶段清理**：B 阶段检查完成后，自动删除 B3/B4/B5/B7/B8/B9/B10 不合格的题目。删除后导出两个 JSON：
- `golden-set-raw-{ts}.json`：A.1 后的原始快照（全部题目，调试用）
- `golden-set-{ts}.json`：清理后的干净版（仅合格题目，用于 D 阶段评估）

**质量报告格式**：

```json
{
  "passed": true,
  "totalQuestions": 21,
  "checks": {
    "B1_count": { "passed": true, "detail": "21/21" },
    "B2_matrix": { "passed": true, "detail": "21/21 cells covered" },
    "B3_query_quality": { "passed": true, "detail": "0 issues" }
  },
  "warnings": ["gs-abc123: expectedAnswer only 150 chars (min 200)"],
  "recommendation": "PROCEED"
}
```

**决策规则**：
- **B1/B2 不通过** → 重跑 A.1
- **其他检查不通过** → C 阶段自动删除不合格题目，保留合格题目进入 D 阶段

---

### 5.3 D 用 Golden Set 评估模型

**职责**：用 golden set 评估 RAG 系统。

**输入**：golden set + 被测 RAG 配置
**输出**：评估报告（各项指标分数）

**⚠️ 关键约束：必须使用实际 app 的 chat Q&A 流程**

D 阶段评估的目的是 **eval app 中用户配置的模型组合和 chat query & answer 这个 feature**。
因此，必须调用实际 app 的完整 chat Q&A 流程，包括：
- **多源融合**：KB 检索 + Web 搜索 → 合并重排
- **Tool calling**：web search tool、knowledge search tool
- **完整的 system prompt**：包含 web search 使用引导
- **用户配置的模型组合**：provider/model/fallback 等

❌ **绝对禁止**：
- 只用 KB 检索，不调用 web 搜索
- 使用简化版的流程
- 硬编码检索逻辑，绕过实际流程

✅ **正确做法**：
- 调用实际 app 的 chat Q&A 流程（与用户在 UI 中使用的完全相同）
- 启用 web 搜索、知识库等所有功能
- 让流程自行决定路由（KB/web/融合）

**流程**：

```
1. 加载 golden set（从 DB）

2. 对每个 golden question：
   a. 用实际 app 的 chat Q&A 流程生成答案
   b. 记录：检索到的 chunks、生成的答案、使用的源（KB + web）

3. 计算指标：
   ┌─────────────────────────────────────────────────────┐
   │ 确定性指标（直接计算，不需要 judge）                     │
   │ ├─ M8 Source Routing：expectedSource 对比实际           │
   │ │   （全部 sourceType）                                │
   │ ├─ M9 Conflict Resolution：冲突题路由正确率            │
   │ │   （仅 conflict）                                    │
   │ └─ M10 Refusal Accuracy：no_answer 题拒绝率            │
   │     （仅 no_answer）                                    │
   ├─────────────────────────────────────────────────────┤
   │ 检索质量指标（LLM judge 实时评估，全部 sourceType）       │
   │ ├─ M1 NDCG@K：对每个 citation 实时评估相关性             │
   │ │   grade→DCG/IDCG                                    │
   │ ├─ M2 Recall@K：统计 grade≥2 的 citation 覆盖率        │
   │ └─ M3 KB Hit Rate：kb_only 题的 Recall（仅 kb_only）   │
   ├─────────────────────────────────────────────────────┤
   │ 语义指标（2 judge：MiMo + DeepSeek）                     │
   │ ├─ M5 Faithfulness：2 judge → claim 支持率 → average   │
   │ │   （全部 sourceType）                                │
   │ ├─ M6 Answer Correctness：2 judge → 对比 expectedAnswer│
   │ │   （全部 sourceType）                                │
   │ └─ M7 Fact Coverage：2 judge → mustIncludeFacts 覆盖率  │
   │     （全部 sourceType）                                │
   └─────────────────────────────────────────────────────┘

   > **为什么所有 sourceType 都评估 M1/M2？**
   >
   > NDCG/Recall 衡量的是 actual citations（KB chunks + web search results）与 query 的相关性。
   > 不是只有 KB chunks 才叫 citation —— web search results URLs 也是 citations。
   > 通过 LLM 实时评估每个 citation 的相关性（0-3），然后计算 NDCG 和 Recall。

4. 汇总报告
```

**指标 → 数据源映射**：

| 指标 | 数据来源 | 适用 sourceType | 计算时机 |
|------|---------|----------------|---------|
| M1 NDCG@K | LLM judge 实时评估 + 检索 citations（KB + web） | **全部** | 评估时 |
| M2 Recall@K | LLM judge 实时评估 + 检索 citations（KB + web） | **全部** | 评估时 |
| M3 KB Hit Rate | M2 的子集（仅 KB 来源的检索结果） | kb_only | 评估时 |
| M5 Faithfulness | RAG 答案 + 检索上下文 | 全部 | 评估时（judge） |
| M6 Answer Correctness | RAG 答案 + `expectedAnswer`（A.1 产出） | 全部 | 评估时（judge） |
| M7 Fact Coverage | RAG 答案 + `mustIncludeFacts`（A.1 产出） | 全部 | 评估时（judge） |
| M8 Source Routing | `expectedSource`（A.1 产出）+ RAG 实际源 | 全部 | 评估时 |
| M9 Conflict Resolution | `sourceType == "conflict"`（A.1 产出）+ RAG 路由 | conflict | 评估时 |
| M10 Refusal Accuracy | `sourceType == "no_answer"`（A.1 产出）+ RAG 回答 | no_answer | 评估时 |

> **M1/M2 适用于所有 sourceType**：
> - kb_only：评估 KB chunks 与 query 的相关性
> - web_only：评估 web search results 与 query 的相关性
> - cross_source：评估混合 citations（KB + web）与 query 的相关性
> - conflict/no_answer：评估所有 citations 与 query 的相关性


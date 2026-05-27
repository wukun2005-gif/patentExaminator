# 专利复审 AI 助手 — 系统规格书

<p align="right">2026-05-27 · v0.8.0 · 用于 Coze.cn 低代码 Agent 平台移植</p>

> **变更摘要（v0.8.0）**：依据 [system-specification-review.md](file:///Users/wukun/Documents/tmp/patentExaminator/docs/system-specification-review.md) 七审意见修复 1 项问题——
> 附录 E 消息结构表补充脚注说明 `draft` 省略原因，与 §1.4 / §22 保持一致（ISSUE-R1）。
>
> 本文档对 `patentExaminator` 项目进行完整扫描，提取核心业务逻辑、数据流转（Schema）以及 AI 提示词（Prompts），以便无缝移植到 [Coze.cn](https://www.coze.cn/) 低代码 Agent 开发平台。
>
> **Prompt 来源权威声明**：所有 AI Prompt 以 `client/src/agent/AgentClient.ts` 中 `build*Prompt()` 函数的实际运行代码为准。`shared/src/prompts/*.prompt.md` 为早期设计稿，可能存在差异，本文档列出全部差异供参考。

---

## 目录

1. [系统架构概述](#1-系统架构概述)
2. [全局数据模型](#2-全局数据模型)
3. [模块 1：案件基线设置（Case Setup）](#3-模块-1案件基线设置case-setup)
4. [模块 2：文档导入与 OCR（Document Import & OCR）](#4-模块-2文档导入与-ocr)
5. [模块 3：文档分类（Document Classification）](#5-模块-3文档分类document-classification)
6. [模块 4：审查意见解析（Opinion Analysis）](#6-模块-4审查意见解析opinion-analysis)
7. [模块 5：答辩理由映射（Argument Mapping）](#7-模块-5答辩理由映射argument-mapping)
8. [模块 6：文档解读（Document Interpretation）](#8-模块-6文档解读document-interpretation)
9. [模块 7：附图提取（Figure Extraction）](#9-模块-7附图提取figure-extraction)
10. [模块 8：文献管理与时间轴校验（References & Timeline）](#10-模块-8文献管理与时间轴校验references--timeline)
11. [模块 9：Claim Chart（权利要求特征拆解）](#11-模块-9claim-chart权利要求特征拆解)
12. [模块 10：新颖性复核（Novelty Comparison）](#12-模块-10新颖性复核novelty-comparison)
13. [模块 11：创造性三步法复核（Inventive Step Analysis）](#13-模块-11创造性三步法复核inventive-step-analysis)
14. [模块 12：缺陷复查（Defect Review）](#14-模块-12缺陷复查defect-review)
15. [模块 13：复审意见草稿（Reexam Draft）](#15-模块-13复审意见草稿reexam-draft)
16. [模块 14：专利申请简述（Summary）](#16-模块-14专利申请简述summary)
17. [模块 15：AI 辅助专利检索（Search References）](#17-模块-15ai-辅助专利检索search-references)
18. [模块 16：模块对话（Chat Agent）](#18-模块-16模块对话chat-agent)
19. [模块 17：导出（Export）](#19-模块-17导出export)
20. [模块 18：文档翻译（Translate）](#20-模块-18文档翻译translate)
21. [附录 A：Server 端 AI 调用方式](#21-附录-aservernbsp端-ai-调用方式)
22. [附录 B：Prompt 术语对照](#22-附录-bprompt-术语对照)
23. [附录 C：工作流状态机](#23-附录-c工作流状态机)
24. [附录 D：Prompt 截断限制总表](#24-附录-dprompt-截断限制总表)
25. [附录 E：Prompt Message 结构总览](#25-附录-eprompt-message-结构总览)
26. [附录 F：模块间数据流图](#26-附录-f模块间数据流图)

---

## 1. 系统架构概述

### 1.1 产品定位

专利复审 AI 助手是一款面向**发明专利实质审查员**的 Web App，辅助完成审查意见解析、申请人答辩映射、复审事实复核和逐条回应草稿生成。所有 AI 输出为候选事实整理，需审查员确认，**不作出法律结论**。

### 1.2 核心业务流程

```
复审文件导入（申请文件 + 审查意见通知书 + 意见陈述书）
  → 文档分类（AI 自动识别文件类型）
  → 审查意见解析（opinion-analysis）
  → 答辩理由映射（argument-analysis）
  → [可选：AI 文档解读]
  → Claim Chart（以修改后权利要求为准）
  → 新颖性复核 / 创造性复核 / 缺陷复查
  → 复审意见草稿（reexam-draft）
  → 导出
```

### 1.3 技术架构

- **前端**：React 18.3 + TypeScript 5.5 + Zustand 4.5（状态管理）+ Vite 5.4（构建）
- **后端**：Express 4 + AI Gateway（Provider 适配层）
- **AI Provider**：Gemini、MiMo、Kimi、GLM、MiniMax、DeepSeek、Qwen、AWS Bedrock、OpenRouter、OpenCode Zen
- **共享类型与 Prompts**：shared 包（TypeScript 类型定义 + Zod Schema）

### 1.4 Agent 与业务模块映射

| Agent ID | 业务模块 | 功能 |
|----------|---------|------|
| `opinion-analysis` | 审查意见解析 | 从通知书中提取驳回理由、法律依据、引用文献 |
| `argument-analysis` | 答辩理由映射 | 将意见陈述书答辩理由映射到驳回理由 |
| `interpret` | 文档解读 | 用通俗语言解读专利文档 |
| `classify-documents` | 文档分类 | 自动识别上传文件的类型 |
| `extract-case-fields` | 案件字段提取 | 从文档中提取申请号、发明名称、权利要求结构等 |
| `claim-chart` | Claim Chart | 权利要求技术特征拆解 |
| `novelty` | 新颖性复核 | 逐特征与对比文件对照 |
| `inventive` | 创造性复核 | 三步法（最接近现有技术→区别特征→技术启示） |
| `defects` | 缺陷复查 | 形式缺陷检测 |
| `reexam-draft` | 复审意见草稿 | 逐条回应格式草稿 |
| `draft` | （`reexam-draft` 的遗留别名） | 代码 `GATEWAY_AGENT_TO_KEY` 和 `aiRunRequestSchema` 枚举中存在，但无代码路径将其作为独立 Agent 调用。Chat Agent 的 `moduleScope` 中使用 `"draft"` 标识复审草稿模块。Coze.cn 移植时可忽略，统一使用 `"reexam-draft"` |
| `summary` | 专利简述 | 基于已确认数据生成简述 |
| `search-references` | AI 检索 | 提取检索词 + 搜索筛选专利文献 |
| `chat` | 各模块独立对话 | 模块级多轮追问 |
| `translate` | 文档翻译 | 外文专利文档翻译为中文 |

### 1.5 Prompt 版本说明

代码中存在两套 Prompt 来源：

- **运行时 Prompt（权威来源）**：`client/src/agent/AgentClient.ts` 中的 `build*Prompt()` 函数，为实际运行的 Prompt。
- **Prompt 模板文件（早期设计稿）**：`shared/src/prompts/*.prompt.md`，部分条目与运行时 Prompt 存在措辞差异。

本文档**所有 Prompt 均以 `AgentClient.ts` 运行时代码为准**。章节末尾的"与 prompt 文件的差异"标注了两套 Prompt 的不同之处，供 Coze.cn 移植时参考。

---

## 2. 全局数据模型

### 2.1 核心实体

```typescript
// 案件
interface PatentCase {
  id: string;
  applicationNumber: string | null;
  title: string;
  applicant?: string;
  applicationDate: string;           // YYYY-MM-DD
  priorityDate?: string;             // YYYY-MM-DD，若填写必须 ≤ applicationDate
  patentType: "invention";           // 固定为发明专利
  textVersion: "original" | `amended-${number}`;
  targetClaimNumber: number;         // 默认为 1
  guidelineVersion: string;          // 审查指南版本，默认 "2023"
  examinerNotes?: string;
  reexaminationRound: number;        // 复审轮次
  previousCaseId?: string;
  workflowState: CaseWorkflowState;
  createdAt: string;
  updatedAt: string;
}

// 源文档
interface SourceDocument {
  id: string;
  caseId: string;
  role: "application" | "reference" | "office-action-response" | "office-action";
  fileName: string;
  fileType: "pdf" | "docx" | "txt" | "html" | "manual";
  fileHash?: string;
  textLayerStatus?: "present" | "absent" | "unknown";
  ocrStatus?: "not-needed" | "pending" | "running" | "completed" | "failed";
  textStatus: "empty" | "extracted" | "confirmed" | "needs-review";
  extractedText: string;
  textIndex: TextIndex;
  createdAt: string;
  hasFigures?: boolean;
}

// 引用文献（继承 SourceDocument）
interface ReferenceDocument extends SourceDocument {
  title?: string;
  publicationNumber?: string;
  publicationDate?: string;
  publicationDateConfidence: "high" | "medium" | "low" | "manual";
  timelineStatus: TimelineStatus;
  technicalField?: string;
  summary?: string;
  relevanceNotes?: string;
  source?: "user-upload" | "ai-search";
  sourceUrl?: string;
  candidateStatus?: "pending" | "accepted" | "rejected";
  aiRelevanceScore?: number;
  aiRecommendationReason?: string;
}

type TimelineStatus =
  | "available"               // ✅ 可用：公开日严格早于基准日
  | "unavailable-same-day"    // ❌ 同日公开
  | "unavailable-later"       // ❌ 晚于基准日
  | "needs-publication-date"  // ⚠️ 缺少公开日
  | "needs-baseline-date";    // ⚠️ 缺少基准日

interface TextIndex {
  pages: TextPage[];
  paragraphs: TextParagraph[];
  lineMap: TextLine[];
}

interface ClaimFeature {
  id: string;
  caseId: string;
  claimNumber: number;
  featureCode: string;
  description: string;
  specificationCitations: Citation[];
  citationStatus: "confirmed" | "needs-review" | "not-found";
  userNotes?: string;
  source: "ai" | "user" | "mock";
}

interface Citation {
  documentId?: string;
  label: string;
  page?: number;
  paragraph?: string;
  quote?: string;
  confidence: "high" | "medium" | "low";
}

interface NoveltyComparison {
  id: string;
  caseId: string;
  referenceId: string;
  claimNumber: number;
  rows: NoveltyComparisonRow[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  reviewerConclusions?: string[];        // 前端存储扩展字段（非 AI 返回）
  aiPreliminaryConclusions?: string[];   // 前端存储扩展字段（非 AI 返回）
  applicantArguments?: string;
  examinerResponse?: string;
  status: "draft" | "user-reviewed" | "stale";
  legalCaution: string;
}

interface NoveltyComparisonRow {
  featureCode: string;
  disclosureStatus: "clearly-disclosed" | "possibly-disclosed" | "not-found" | "not-applicable";
  citations: Citation[];
  mismatchNotes?: string;
  reviewerNotes?: string;
}

interface InventiveStepAnalysis {
  id: string;
  caseId: string;
  closestPriorArtId?: string;
  sharedFeatureCodes: string[];
  distinguishingFeatureCodes: string[];
  applicantArguments?: string;
  examinerResponse?: string;
  status: "draft" | "user-reviewed" | "stale";
  objectiveTechnicalProblem?: string;
  motivationEvidence: Citation[];
  candidateAssessment:
    | "possibly-lacks-inventiveness"
    | "possibly-inventive"
    | "insufficient-evidence"
    | "not-analyzed";
  cautions: string[];
  legalCaution: string;
}

interface FormalDefect {
  id: string;
  caseId: string;
  category: string;
  description: string;
  location?: string;
  severity: "error" | "warning" | "info";
  resolved: boolean;
  previouslyRaised?: boolean;
  overcomeStatus?: "overcome" | "not-overcome" | "partially-overcome";
}

interface RejectionGround {
  code: string;
  category: "novelty" | "inventive" | "clarity" | "support" | "amendment" | "other";
  claimNumbers: number[];
  summary: string;
  legalBasis: string;
  originalText?: string;
}

interface ArgumentMapping {
  rejectionGroundCode: string;
  applicantArgument: string;
  argumentSummary: string;
  confidence: "high" | "medium" | "low";
  amendedClaims?: Array<{
    claimNumber: number;
    originalText: string;
    amendedText: string;
    changeDescription: string;
  }>;
  newEvidence?: string;
}

type ProviderId = "kimi" | "glm" | "minimax" | "mimo" | "deepseek" | "gemini" | "qwen" | "bedrock" | "openrouter" | "opencode";

interface ProviderConnection {
  providerId: ProviderId;
  baseUrl?: string;
  protocol?: "openai-compatible" | "anthropic-compatible";
  apiKeyRef: string;
  modelIds: string[];
  defaultModelId: string;
  modelFallbacks?: string[];
  enabled: boolean;
  enableModelFallback?: boolean;
}

interface AgentAssignment {
  agent: AgentKey;
  providerOrder: ProviderId[];
  modelId: string;
  modelFallbacks?: string[];
  reasoningLevel?: "low" | "medium" | "high";
  maxTokens: number;
}
```

---

## 3. 模块 1：案件基线设置（Case Setup）

### 功能描述

创建和编辑发明专利案件的基本信息，包括申请号、发明名称、申请日、优先权日等。支持从上传文件中自动提取案件字段和权利要求结构（通过 `extract-case-fields` Agent）。

### 输入 Schema

```json
{
  "caseBaseline": {
    "applicationNumber": "string | null",
    "title": "string（必填，1-120字）",
    "applicant": "string | undefined",
    "applicationDate": "string（必填，YYYY-MM-DD）",
    "priorityDate": "string | undefined（YYYY-MM-DD）",
    "targetClaimNumber": "number（必填，默认 1）",
    "textVersion": "\"original\" | \"amended-{number}\"（数字可任意，如 amended-1, amended-2）",
    "guidelineVersion": "string（默认 '2023'）",
    "reexaminationRound": "number",
    "examinerNotes": "string | undefined（0-2000字）"
  }
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/caseFields.schema.ts
{
  title: z.string().nullable(),
  applicationNumber: z.string().nullable(),
  applicant: z.string().nullable(),
  applicationDate: z.string().nullable(),
  priorityDate: z.string().nullable(),
  claims: z.array(z.object({
    claimNumber: z.number(),
    type: z.enum(["independent", "dependent"]),
    dependsOn: z.array(z.number()),
    rawText: z.string()
  }))
}
```

### 核心 AI 提示词（extract-case-fields Agent）

- **System Prompt（实际运行代码）**：

```
你是一个专利文档信息提取助手。请从以下专利申请文件中提取案件基本信息和权利要求结构。

请严格返回 JSON 格式，不要包含任何其他文字。字段无法确定时设为 null。

返回格式:
{
  "title": "发明名称（字符串或 null）",
  "applicationNumber": "申请号，格式如 CN202310001001A（字符串或 null）",
  "applicant": "申请人（字符串或 null）",
  "applicationDate": "申请日，格式 YYYY-MM-DD（字符串或 null）",
  "priorityDate": "优先权日，格式 YYYY-MM-DD（字符串或 null）",
  "claims": [
    {
      "claimNumber": 1,
      "type": "independent 或 dependent",
      "dependsOn": [],
      "rawText": "权利要求全文"
    }
  ]
}

要求:
- 提取所有权利要求，识别独立权利要求和从属权利要求
- 从属权利要求的 dependsOn 填写其引用的权利要求编号列表
- 日期格式统一为 YYYY-MM-DD
```

- **User Prompt 模板**：

```
案件 ID: {caseId}

=== 文件 1: {doc.fileName} ===
{doc.text}

=== 文件 2: {doc.fileName} ===
{doc.text}
...（每个上传文件为一节）
```

> **截断限制**：文档文本无显式截断（由前端限制每个文件最多前 3 页文本，约 3000-5000 字符，实现于 `client/src/lib/caseFieldExtractor.ts:76` — `combined.slice(0, 3000)` 用于非 AI 回退提取）。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{doc.fileName}`：上传文件的原始文件名
> - `{doc.text}`：该文件的提取文本

### 前置依赖

- 无（首个步骤）

### 业务规则与备注

- 申请日不晚于今日
- 若填写优先权日，必须 ≤ 申请日
- 切换 `textVersion` 时，已生成的 ClaimFeature 的 `citationStatus` 自动重置为 `"needs-review"`，NoveltyComparison 和 InventiveStepAnalysis 的 `status` 标记为 `"stale"`
- 案件字段自动提取通过对每个文档文本调用 `extract-case-fields` Agent 实现
- 自动提取后按置信度填入或标"待确认"
- 权利要求结构通过 `claimParser.ts` 解析，独立权利要求编号作为 `targetClaimNumber` 下拉选项

---

## 4. 模块 2：文档导入与 OCR

### 功能描述

支持上传 PDF / DOCX / TXT / HTML 格式的专利申请文件、审查意见通知书、意见陈述书和对比文件。PDF 无文字层时自动启动浏览器端 OCR（Tesseract.js），完成后展示质量评分供审查员确认。

### 输入 Schema

```json
{
  "document": {
    "fileType": "\"pdf\" | \"docx\" | \"txt\" | \"html\"",
    "fileName": "string",
    "fileData": "ArrayBuffer"
  }
}
```

### 输出 Schema

```json
{
  "sourceDocument": {
    "id": "string",
    "caseId": "string",
    "role": "\"application\" | \"reference\" | \"office-action-response\" | \"office-action\"",
    "textLayerStatus": "\"present\" | \"absent\" | \"unknown\"",
    "ocrStatus": "\"not-needed\" | \"pending\" | \"running\" | \"completed\" | \"failed\"",
    "textStatus": "\"empty\" | \"extracted\" | \"confirmed\" | \"needs-review\"",
    "extractedText": "string",
    "textIndex": {
      "pages": "[{ pageNumber, startOffset, endOffset }]",
      "paragraphs": "[{ id, page, paragraphNumber, text, startOffset, endOffset }]",
      "lineMap": "[{ line, startOffset, endOffset }]"
    }
  }
}
```

### 核心 AI 提示词

文档导入和 OCR 为纯前端处理，不涉及 AI 调用。

- **PDF 文字层检测**：抽样前 5 页，平均每页 ≥ 40 个有效字符视为有文字层。
- **OCR 质量评分公式**：

```
effectiveChars = 去除空白后字符数
cjkRatio = 中日韩字符 / effectiveChars
asciiRatio = 可打印 ASCII / effectiveChars
junkRatio = (非可打印 - 空白 - 换行 - 常见标点) / effectiveChars
shortPageRatio = 有效字符 < 50 的页数 / 总页数
quality = clamp(1 - (junkRatio * 2) - (shortPageRatio * 0.5), 0, 1)
```

- **三档 UI 映射**：≥0.70 绿色"良好" / 0.40–0.70 黄色"一般" / <0.40 红色"较差"

### 前置依赖

- 模块 1（案件基线）必须先完成

### 业务规则与备注

- 支持格式：PDF（含 OCR）、DOCX（mammoth）、TXT（直接读取）、HTML（DOMParser）
- OCR 在浏览器端执行（Tesseract.js Web Worker），数据不外发
- OCR 失败 → `ocrStatus: "failed"`，允许用户重新上传或手动粘贴文本
- OCR 进度分页回调
- 文本抽取后建立段落、页码、行号索引（TextIndex），供后续 Citation 匹配使用

---

## 5. 模块 3：文档分类（Document Classification）

### 功能描述

AI 自动识别上传文件的类型（申请文件 / 审查意见通知书 / 意见陈述书 / 对比文件），为每个文件分配 `role` 字段。

### 输入 Schema

```json
{
  "caseId": "string",
  "documents": [
    {
      "fileIndex": "number",
      "fileName": "string",
      "textSample": "string（前约 2000 字符）"
    }
  ]
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/classifyDocuments.schema.ts
{
  classifications: z.array(z.object({
    fileIndex: z.number(),
    fileName: z.string(),
    role: z.enum(["application", "office-action", "office-action-response", "reference"]),
    confidence: z.enum(["high", "medium", "low"]),
    reason: z.string()
  })),
  warnings: z.array(z.string()).optional()
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一个专利文档分类助手。请根据以下文件的文件名和文本内容，识别每个文件的类型。

## 文档类型定义

| 类型 | 英文标识 | 识别特征 |
|------|---------|---------|
| 申请文件 | application | 包含'说明书'、'权利要求书'、'摘要'；文件名含'申请'、专利号格式 |
| 审查意见通知书 | office-action | 包含'审查意见通知书'；文件名含'审查意见'、'OA' |
| 意见陈述书 | office-action-response | 包含'意见陈述书'、'答复'；文件名含'意见陈述'、'答复' |
| 对比文件 | reference | 包含其他专利公开号；文件名含专利号格式 |

## 分类规则

1. 优先根据文件名判断：文件名明确包含关键词的直接分类
2. 无法识别的文件统一归类为'对比文件'(reference)
3. 权利要求书属于'申请文件'的一部分
```

- **User Prompt 模板**：

```
请严格返回 JSON 格式：
{
  "classifications": [
    {
      "fileIndex": 0,
      "fileName": "文件名",
      "role": "application | office-action | office-action-response | reference",
      "confidence": "high | medium | low",
      "reason": "分类理由（一句话）"
    }
  ],
  "warnings": ["如果某文件难以分类，在此说明"]
}

案件 ID: {caseId}

=== 文件 0: {fileName} ===
{textSample}
=== 文件 1: {fileName} ===
{textSample}
...
```

> **与 prompt 文件的差异**：代码中的 Prompt 未包含 prompt 文件中的"其次根据文本内容判断：分析前 2000 字符的关键词出现频率"和"每个文件必须分类，不能遗漏"两条规则。以代码为准。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{fileName}`：上传文件的原始文件名
> - `{textSample}`：文件的前 2000 字符样本文本

### 前置依赖

- 模块 2（文件已上传且文本已提取）

### 业务规则与备注

- `CaseSetupPage.tsx` 中 `classifyDocuments()` 是上传流程的必要环节
- 优先根据文件名判断；无法识别的文件统一归类为"对比文件"（reference）
- 权利要求书属于"申请文件"（application）的一部分，不单独分类

---

## 6. 模块 4：审查意见解析（Opinion Analysis）

### 功能描述

从审查意见通知书中结构化提取驳回理由、法律依据、涉及权利要求和引用文献。这是复审流程的第一个核心分析步骤。

### 输入 Schema

```json
{
  "caseId": "string",
  "officeActionText": "string（截断到 12000 字符）",
  "documentId": "string"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/opinionAnalysis.schema.ts
{
  documentId: z.string(),
  rejectionGrounds: z.array(z.object({
    code: z.string(),                                          // RG-1, RG-2…
    category: z.enum(["novelty","inventive","clarity","support","amendment","other"]),
    claimNumbers: z.array(z.number()),
    summary: z.string(),                                      // 摘要（50字以内）
    legalBasis: z.string(),                                   // 如 "专利法第22条第2款"
    originalText: z.string().optional()
  })),                                                         // 允许空数组（无驳回理由时返回 []）
  citedReferences: z.array(z.object({
    publicationNumber: z.string(),                            // 如 CN108123456A
    rejectionGroundCodes: z.array(z.string()),
    featureMapping: z.string()
  })),
  legalCaution: z.string()
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员，擅长分析审查意见通知书。
```

- **User Prompt 模板**：

```
案件 ID: {caseId}
文档 ID: {documentId}

审查意见通知书文本:
{officeActionText.slice(0, 12000)}

请从以上审查意见通知书中提取驳回理由和引用文献，严格按以下 JSON 格式输出，不要输出其他内容：
{
  "documentId": "{documentId}",
  "rejectionGrounds": [
    {
      "code": "唯一标识（如 RG-1、RG-2）",
      "category": "novelty|inventive|clarity|support|amendment|other",
      "claimNumbers": [权利要求编号数组],
      "summary": "驳回理由摘要（50字以内）",
      "legalBasis": "法律依据（如'专利法第22条第2款'）",
      "originalText": "审查意见中相关段落的原文"
    }
  ],
  "citedReferences": [
    {
      "publicationNumber": "引用文献公开号（如 CN108123456A）",
      "rejectionGroundCodes": ["关联的驳回理由 code 数组"],
      "featureMapping": "该文献公开了哪个技术特征"
    }
  ],
  "legalCaution": "AI 分析法律风险提示"
}

注意：
- 一个驳回理由可能对应多个权利要求编号
- 一个引用文献可能被多条驳回理由引用
- 务必使用双引号，字段名必须与示例完全一致
- 如果审查意见中没有驳回理由，rejectionGrounds 返回空数组
```

> **与 prompt 文件的差异**：prompt 文件中角色为"你是一名专利复审辅助系统，负责解析…"，代码中为"你是一位资深专利审查员，擅长分析审查意见通知书。"。以代码为准。

> **截断限制**：`officeActionText.slice(0, 12000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{documentId}`：当前审查意见文档的唯一标识符
> - `{officeActionText}`：通知书全文文本

### 前置依赖

- 模块 2（审查意见通知书文本已提取）
- 模块 3（文件已分类为 office-action）

### 业务规则与备注

- 解析完成后工作流状态推进到 `opinion-analyzed`
- 输出结果持久化到 IndexedDB 的 `opinionAnalyses` store
- 驳回理由分类标准：
  - `novelty`：涉及专利法§22.2
  - `inventive`：涉及专利法§22.3
  - `clarity`：涉及专利法§26.3/§26.4
  - `support`：涉及专利法§26.3
  - `amendment`：涉及专利法§33
  - `other`：其他驳回理由

---

## 7. 模块 5：答辩理由映射（Argument Mapping）

### 功能描述

将申请人意见陈述书中的答辩理由一一映射到审查意见通知书的驳回理由，标注置信度和未回应项，追踪权利要求修改。

### 输入 Schema

```json
{
  "caseId": "string",
  "rejectionGrounds": [
    {
      "code": "string",
      "category": "string",
      "claimNumbers": "[number]",
      "summary": "string",
      "legalBasis": "string",
      "originalText": "string | undefined"
    }
  ],
  "responseText": "string（截断到 12000 字符）",
  "amendedClaimsText": "string | undefined（截断到 4000 字符）"
}
```

###  AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/argumentMapping.schema.ts
{
  mappings: z.array(z.object({
    rejectionGroundCode: z.string(),
    applicantArgument: z.string(),
    argumentSummary: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    amendedClaims: z.array(
      z.union([
        z.object({                                           // 正常 JSON 结构
          claimNumber: z.number(),
          originalText: z.string(),
          amendedText: z.string(),
          changeDescription: z.string()
        }),
        z.string().transform((s) => ({                        // 容错：AI 返回字符串时降级处理
          claimNumber: 0,
          originalText: "",
          amendedText: "",
          changeDescription: s
        }))
      ])
    ).optional(),
    newEvidence: z.string().optional()
  })),
  unmappedGrounds: z.array(z.string()).optional(),
  legalCaution: z.string()
}
```

> **Zod 容错说明**：`amendedClaimItemSchema = z.union([amendedClaimDetailSchema, z.string()])` 兼容了 AI 返回字符串而非对象的降级处理。Coze.cn 低代码平台的输出格式化能力有限，移植时需注意此兼容逻辑。

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由与驳回理由之间的对应关系。
```

- **User Prompt 模板**：

```
案件 ID: {caseId}

驳回理由清单:
  RG-1 (novelty): 权利要求1相对于D1不具备新颖性（§22.2）
  RG-2 (inventive): ...（每条驳回理由格式为：code (category): summary）

意见陈述书文本:
{responseText.slice(0, 12000)}

修改后权利要求:
{amendedClaimsText.slice(0, 4000)}  （如未提供，省略本节）

请将每条驳回理由与意见陈述书中的答辩内容进行映射，严格按以下 JSON 格式输出，不要输出其他内容：
{
  "mappings": [
    {
      "rejectionGroundCode": "驳回理由的 code（如 RG-1）",
      "applicantArgument": "申请人的答辩原文片段",
      "argumentSummary": "答辩理由摘要（50字以内）",
      "confidence": "high|medium|low",
      "amendedClaims": [
        {
          "claimNumber": 权利要求编号,
          "originalText": "修改前原文",
          "amendedText": "修改后原文",
          "changeDescription": "修改说明"
        }
      ],
      "newEvidence": "申请人提交的新证据（如有）"
    }
  ],
  "unmappedGrounds": ["未在意见陈述书中找到对应答辩的驳回理由 code 数组"],
  "legalCaution": "AI 分析法律风险提示"
}

注意：
- 如果某条驳回理由在意见陈述书中没有对应答辩，将其 code 加入 unmappedGrounds
- amendedClaims 为可选字段，如果没有修改权利要求则不包含此字段
- newEvidence 为可选字段，没有新证据时不包含此字段
- 务必使用双引号，字段名必须与示例完全一致
```

> **与 prompt 文件的差异**：prompt 文件中角色为"你是一名专利复审辅助系统，负责将…答辩理由映射…"，代码中为"你是一位资深专利审查员，擅长分析…答辩理由与驳回理由之间的对应关系。"以代码为准。

> **截断限制**：`responseText.slice(0, 12000)`，`amendedClaimsText.slice(0, 4000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{documentId}`：当前意见陈述书文档的唯一标识符
> - `{responseText}`：意见陈述书全文文本
> - `{amendedClaimsText}`：修改后权利要求全文
> - `{rejectionGrounds}`：驳回理由清单

### 前置依赖

- 模块 4（审查意见解析结果 `rejectionGrounds`）

### 业务规则与备注

- 解析完成后工作流状态推进到 `argument-mapped`
- 输出结果持久化到 IndexedDB 的 `argumentMappings` store
- `amendedClaims` 的 Zod union 容错：AI 若返回字符串而非对象，自动转为含 `changeDescription` 的降级结构（`claimNumber: 0`）

---

## 8. 模块 6：文档解读（Document Interpretation）

### 功能描述

AI 以结构化维度解读专利申请文件、审查意见通知书和意见陈述书，帮助审查员快速理解技术方案和案件全局。支持多文件关联解读（结合同案其他文件说明当前文件与案件整体的关联）。

### 输入 Schema

```json
{
  "caseId": "string",
  "documentId": "string | undefined",
  "fileName": "string | undefined",
  "documentText": "string（截断到 12000 字符）",
  "documentType": "\"application\" | \"office-action\" | \"office-action-response\"",
  "relatedDocuments": [
    {
      "fileName": "string",
      "documentType": "\"application\" | \"office-action\" | \"office-action-response\""
    }
  ]
}
```

### 输出 Schema

```json
{
  "reply": "string（AI 自由格式文本，非 JSON）"
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一个专利审查助手。请对以下{模板.title}进行深度解读，从以下维度分析：

{模板.instructions（逐条展开）}
```

> **模板选择逻辑**：根据输入中的 `documentType` 字段匹配对应的解读模板——`"application"` → 申请文件模板、`"office-action"` → 审查意见通知书模板、`"office-action-response"` → 意见陈述书模板。三个模板的定义来自代码 `INTERPRET_TEMPLATES` 常量。

**三种文档类型的解读维度**（来自代码 `INTERPRET_TEMPLATES` 常量）：

#### application（专利申请文件）

解读维度：
1. 【技术领域】该专利属于哪个技术领域
2. 【核心技术方案】概括发明的技术方案
3. 【主要权利要求】列出独立权利要求的核心技术特征
4. 【关键实施例】概括关键实施例及其技术效果
5. 【创新点分析】该发明相对于现有技术的创新之处
6. 【潜在问题】可能存在的形式或实质性问题

#### office-action（审查意见通知书）

解读维度：
1. 【通知书基本信息】发文日、通知书编号、审查员姓名（如有）
2. 【审查结论】整体审查结论概述
3. 【驳回理由清单】逐条列出驳回理由及其法律依据
4. 【引用对比文件】列出引用的对比文件及其公开号、公开日
5. 【权利要求对应关系】每项驳回理由涉及的权利要求号
6. 【申请人答复期限】答复截止日期及注意事项

#### office-action-response（意见陈述书）

解读维度：
1. 【陈述书基本信息】提交日、对应审查意见通知书编号
2. 【答复策略概述】申请人采取的整体答复策略
3. 【权利要求修改情况】是否修改权利要求，修改内容及依据
4. 【争辩要点】逐条回应驳回理由的核心论点
5. 【新增证据或论证】是否有新的技术证据或论证
6. 【未解决问题】审查员可能继续质疑的问题点

- **User Prompt 模板**：

```
你是一个专利审查助手。请对以下{模板.title}进行深度解读，从以下维度分析：

{模板.instructions（逐条展开）}

请用中文回答，结构清晰，每个维度用标题分隔。
必须在开头明确写出当前解读文件名。
需要结合同案其它文件类型说明当前文件与案件整体的关联，但不得编造未出现在文本中的事实。

案件 ID: {caseId}
文件 ID: {documentId}
文件名: {fileName}

=== 同案相关文件 ===
- {fileName}（{文档类型标签}）
...

=== 文档内容 ===
{documentText.slice(0, 12000)}
```

> **与 prompt 文件的差异**：prompt 文件中的解读维度为"技术领域 → 技术方案 → 技术效果 → 关键特征 → 附图解读"，代码实际维度完全不同（见上方三种模板）。代码额外要求"结合同案其它文件类型说明当前文件与案件整体的关联"，此约束对 Coze.cn 的多文件上下文处理很关键。以代码为准。

> **占位符说明**：
> - `{模板.title}`：由 `documentType` 决定的模板标题（如"申请文件"、"审查意见通知书"、"意见陈述书"）
> - `{模板.instructions}`：对应模板的解读维度指令（逐条展开）
> - `{caseId}`：当前案件的唯一标识符
> - `{documentId}`：被解读文档的唯一标识符
> - `{fileName}`：被解读文件的原始文件名
> - `{文档类型标签}`：同案相关文件的中文类型标签（如"申请文件"）
> - `{documentText}`：被解读文档的全文

> **截断限制**：`documentText.slice(0, 12000)`。

### 前置依赖

- 模块 2（文件文本已提取）
- 可选步骤，不阻塞后续模块

### 业务规则与备注

- 解读结果按 `documentId` 持久化到 IndexedDB
- 历史案件加载时自动恢复逐文件解读
- 解读是"理解阶段"，Claim Chart 是"拆解阶段"，两者独立
- 所有 AI 解读标注"候选分析·需审查员确认"
- **附图提取**为文档解读的子功能，见下一章

---

## 9. 模块 7：附图提取（Figure Extraction）

### 功能描述

从文档文本中自动识别图注（Figure Caption），推断每张图对应的页码范围，为文档解读提供附图级上下文。纯前端处理，不涉及 AI 调用。

### 输入 Schema

```json
{
  "documentText": "string（文档全文）",
  "textIndex": {
    "pages": "[{ pageNumber, startOffset, endOffset }]"
  },
  "totalPages": "number"
}
```

### 输出 Schema

```json
{
  "figures": [
    {
      "figureId": "string（格式：{documentId}_fig{N}）",
      "figureNumber": "number",
      "caption": "string",
      "pageNumbers": "[number]（推断的页码范围）"
    }
  ],
  "errors": ["string"]
}
```

--- **相关源码**：`client/src/lib/figureExtract.ts` — `extractFigureCaptions()`, `estimateFigurePages()`, `isFigureSectionHeader()`, `isLikelyFigurePage()`。纯前端模块，无 `/api/agent/figure-extract` 端点，不通过 AgentClient 调用。---

### 核心逻辑（纯函数）

#### 步骤 1：提取图注

正则匹配中文（`/图\s*(\d+)\s*(?:是|为|示出了|表示|示出)?\s*(.{0,80})/g`）和英文（`/Fig\.?\s*(\d+)\s*(?:is|shows|illustrates)?\s*(.{0,80})/gi`）图注，去重排序。

#### 步骤 2：定位附图章节

扫描"附图说明"、"说明书附图"、"BRIEF DESCRIPTION OF THE DRAWINGS"等章节头，找到附图章节起始页。

#### 步骤 3：推断页码范围

在附图章节内，根据图号匹配页码；若无明确章节头，用启发式规则（短文本页、高图号密度页）推断。

### 前置依赖

- 模块 2（文档文本已提取，TextIndex 已建立）
- 模块 6（文档解读——附图提取作为解读的子功能）

### 业务规则与备注

- 图号上限 200（防止误匹配）
- 页面文本 < 50 字符直接判为附图页
- 图号标签密度 > 30% 直接判为附图页
- UI 展示：`FigureExtractPanel.tsx` + `FigureViewer.tsx`

---

## 10. 模块 8：文献管理与时间轴校验（References & Timeline）

### 功能描述

管理对比文件清单，支持上传、手动添加和 AI 检索导入。自动提取公开日并按基准日（优先权日 ?? 申请日）进行时间轴校验，标注每篇文献的可用性。

### 输入 Schema

```json
{
  "reference": {
    "title": "string | undefined",
    "publicationNumber": "string | undefined",
    "publicationDate": "string | undefined（YYYY-MM-DD）",
    "publicationDateConfidence": "\"high\" | \"medium\" | \"low\" | \"manual\"",
    "technicalField": "string | undefined",
    "summary": "string | undefined",
    "source": "\"user-upload\" | \"ai-search\""
  }
}
```

### 输出 Schema

```json
{
  "timelineStatus": "\"available\" | \"unavailable-same-day\" | \"unavailable-later\" | \"needs-publication-date\" | \"needs-baseline-date\""
}
```

### 核心逻辑（纯函数）

时间轴校验为纯函数 `dateRules.ts::classifyReferenceDate()`，不涉及 AI 调用。

- **校验规则**：
  - 基准日 = `priorityDate ?? applicationDate`
  - 公开日严格早于基准日 → `available` ✅
  - 同日 → `unavailable-same-day` ❌（不可用于新颖性评价）
  - 晚于 → `unavailable-later` ❌
  - 缺少公开日 → `needs-publication-date` ⚠️
  - 缺少基准日 → `needs-baseline-date` ⚠️

### 前置依赖

- 模块 1（案件基线中的申请日/优先权日）
- 对比文件已上传（含公开日信息）

### 业务规则与备注

- 对比文件数量上限：10 篇
- 仅 `timelineStatus === "available"` 的文件可参与新颖性/创造性对照
- **元数据提取方式**：`source: "user-upload"` 的文献元数据（公开号、公开日等）由用户手动填写；`source: "ai-search"` 的文献元数据由 AI 检索流程自动填充。时间轴校验为纯函数，不涉及 AI 调用
- 不可用文献在 UI 中灰色展示，hover 显示原因

---

## 11. 模块 9：Claim Chart（权利要求特征拆解）

### 功能描述

将目标权利要求拆解为独立技术特征（A、B、C…），每项特征标注说明书出处（Citation），形成结构化的 Claim Chart。这是后续新颖性/创造性分析的数据基础。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimText": "string（目标权利要求全文）",
  "claimNumber": "number",
  "specificationText": "string（截断到 8000 字符）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/claimChart.schema.ts
{
  features: z.array(z.object({
    featureCode: z.string(),                                  // A / B / C…
    description: z.string(),
    specificationCitations: z.array(z.object({
      label: z.string(),                                     // 如 "[0035]"
      paragraph: z.string(),                                 // 如 "0035"
      quote: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"])
    })),
    citationStatus: z.enum(["confirmed", "needs-review", "not-found"])
  })).min(1),
  warnings: z.array(z.string()),
  pendingSearchQuestions: z.array(z.string()).max(5),
  legalCaution: z.string()
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员助理，任务是对权利要求 {claimNumber} 进行技术特征拆解（Claim Chart）。

约束：
- 只能基于给定的权利要求文本与说明书片段；不得编造段落号或引用。
- 每个技术特征必须给出可映射到说明书段落号的 specificationCitations；若无法定位，citationStatus 必须为 "needs-review"。
- 不得输出新颖性/创造性等法律结论。
- 严格按下方 JSON 格式输出，不要输出 markdown 代码块或任何解释性文字。
```

- **User Prompt 模板**：

```
权利要求 {claimNumber} 文本：
{claimText}

说明书片段（含段落号，如有）：
{specificationText.slice(0, 8000)} 或 "（未提供说明书片段）"

请严格输出以下 JSON 格式（字段名必须完全一致，使用双引号）：
{
  "claimNumber": {claimNumber},
  "features": [
    {
      "featureCode": "A",
      "description": "技术特征描述",
      "specificationCitations": [
        { "label": "[0001]", "paragraph": "0001", "quote": "说明书原文摘录", "confidence": "high" }
      ],
      "citationStatus": "confirmed"
    }
  ],
  "warnings": [
    { "type": "other", "message": "可选警告说明" }
  ],
  "pendingSearchQuestions": ["待检索问题，最多5条"],
  "legalCaution": "以上为候选事实整理，不构成法律结论。"
}

注意：
- featureCode 使用大写字母 A、B、C…（从 A 起连续编号）
- features 至少 1 项；citationStatus 只能是 confirmed / needs-review / not-found
- specificationCitations 中 confidence 只能是 high / medium / low
- warnings 可为空数组 []；pendingSearchQuestions 最多 5 条
```

> **与 prompt 文件的差异**：prompt 文件中角色为"你是协助发明专利实质审查员的助理"，代码中为"你是一位资深专利审查员助理"。代码额外添加了大量 JSON 格式约束指令（JSON 示例、字段约束说明），prompt 文件中不含这些。以代码为准。

> **截断限制**：`specificationText.slice(0, 8000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{claimNumber}`：待分析的权利要求编号
> - `{specificationText}`：说明书全文文本

### 前置依赖

- 模块 2（说明书文本已提取）
- 权利要求树已通过 `claimParser.ts` 解析

### 业务规则与备注

- Citation 四级容错匹配（`citationMatch.ts`）：精确段落号 → ±1 近邻容错 → 引文片段搜索 → not-found
- 一票升级规则：ClaimFeature 任一 Citation 的 confidence === 'high' 时，citationStatus 自动提升为 'confirmed'
- 零对比文件路径时由 Claim Chart Agent 生成待检索问题清单（pendingSearchQuestions，最多 5 条）
- 用户可直接编辑特征描述、Citation、备注；编辑后 source 标记为 "user"

---

## 12. 模块 10：新颖性复核（Novelty Comparison）

### 功能描述

在复审阶段，逐特征重新评估权利要求与单一对比文件的新颖性对照。结合申请人的答辩理由，输出每项特征的公开状态、Citation、区别特征候选和待检索问题清单。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimNumber": "number",
  "features": [
    {
      "featureCode": "string",
      "description": "string"
    }
  ],
  "referenceId": "string",
  "referenceText": "string（截断到 8000 字符）",
  "applicantArguments": "string | undefined",
  "amendedClaimText": "string | undefined（截断到 4000 字符）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/novelty.schema.ts
{
  referenceId: z.string(),
  claimNumber: z.number().int().positive(),
  rows: z.array(z.object({
    featureCode: z.string(),
    disclosureStatus: z.enum(["clearly-disclosed","possibly-disclosed","not-found","not-applicable"]),
    citations: z.array(z.object({
      label: z.string(),
      paragraph: z.string(),
      quote: z.string().optional(),
      confidence: z.enum(["high","medium","low"])
    })),
    mismatchNotes: z.string().optional(),
    reviewerNotes: z.string().optional()
  })).min(1),
  differenceFeatureCodes: z.array(z.string()),
  pendingSearchQuestions: z.array(z.string()).max(5),
  legalCaution: z.string().default("以上为候选事实整理，不构成新颖性法律结论。")
}
```

> **注意**：`reviewerConclusions` 和 `aiPreliminaryConclusions` 不在 Zod Schema 中——它们属于前端 storage 层的扩展字段（`NoveltyComparison` 类型），用于存储用户的编辑内容。Coze.cn 移植时仅需关注 AI 返回 Schema。

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一名专利复审辅助系统，负责在复审阶段逐特征重新评估新颖性对照。

## 复审上下文
本次分析基于以下复审背景：
- 审查意见通知书中的驳回理由
- 申请人的答辩理由（如提供）
- 申请人修改后的权利要求（如提供）

## 公开状态四档语义
- clearly-disclosed：对比文件明确公开了该技术特征
- possibly-disclosed：对比文件可能公开了该技术特征，但需审查员确认
- not-found：在对比文件中未找到该技术特征的公开内容
- not-applicable：该特征不适用于本次对照
```

- **User Prompt 模板**：

```
## 输入数据
案件 ID: {caseId}
权利要求号: {claimNumber}
技术特征:
  A: 特征A描述
  B: 特征B描述
  ...

对比文件 ID: {referenceId}
对比文件内容:
{referenceText.slice(0, 8000)}

申请人答辩理由:
{applicantArguments}  （如未提供，省略本节）

修改后权利要求:
{amendedClaimText.slice(0, 4000)}  （如未提供，省略本节）

## 输出要求
严格按以下 JSON 格式输出，不要输出其他任何内容：

{
  "referenceId": "{referenceId}",
  "claimNumber": {claimNumber},
  "rows": [
    {
      "featureCode": "A",
      "disclosureStatus": "clearly-disclosed|possibly-disclosed|not-found|not-applicable",
      "citations": [
        {
          "label": "[0005]",
          "paragraph": "0005",
          "quote": "引用原文",
          "confidence": "high|medium|low"
        }
      ],
      "mismatchNotes": "差异说明（可选）"
    }
  ],
  "differenceFeatureCodes": ["B", "C"],
  "pendingSearchQuestions": ["待检索问题（最多5条）"],
  "legalCaution": "以上为候选事实整理，不构成新颖性法律结论。"
}

注意事项：
- rows 数组必须包含每条输入的技术特征
- citations 中必须包含 paragraph 字段
- 如果提供了答辩理由，需在 mismatchNotes 中回应
- 务必使用双引号，字段名必须与示例完全一致
```

> **与 prompt 文件的差异**：`shared/src/prompts/novelty.prompt.md` 角色措辞为"在复审阶段逐特征重新评估"，代码为"逐特征进行新颖性对照分析"。以代码为准。

> **截断限制**：`referenceText.slice(0, 8000)`，`amendedClaimText.slice(0, 4000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{claimNumber}`：待分析的权利要求编号
> - `{features}`：Claim Chart 提取的技术特征列表
> - `{referenceText}`：对比文件全文文本
> - `{rejectionGroundCodes}`：对应的驳回理由代码
> - `{amendedClaimText}`：修改后权利要求全文

### 前置依赖

- 模块 9（Claim Chart 已完成，`claim-chart-reviewed` 状态）
- 模块 8（选中的对比文件 `timelineStatus === "available"`）
- 模块 5（如有答辩理由）

### 业务规则与备注

- 触发条件：目标权要所有特征 citationStatus !== "not-found" 且选中对比文件 timelineStatus === "available"
- 绝对新颖性语境：同日或晚于基准日的对比文件不得使用
- 单篇对比：每次只针对一篇对比文件
- 多对比文件支持：UI 展示所有已完成的复核结果列表，允许在不同对比文件结果间切换查看

---

## 13. 模块 11：创造性三步法复核（Inventive Step Analysis）

### 功能描述

在复审阶段，按照专利审查指南的"三步法"进行创造性复核。结合申请人的答辩理由，输出三步法结构化分析结果。**仅基于上传的对比文件内容判断技术启示**。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimNumber": "number",
  "features": [
    {
      "featureCode": "string",
      "description": "string"
    }
  ],
  "availableReferences": [
    {
      "referenceId": "string",
      "label": "string（如 'D1'）",
      "excerpt": "string（每篇截断到 500 字符）"
    }
  ],
  "closestPriorArtId": "string | undefined",
  "applicantArguments": "string | undefined",
  "amendedClaimText": "string | undefined（截断到 4000 字符）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/inventive.schema.ts
{
  claimNumber: z.number().int().positive(),
  closestPriorArtId: z.string().optional(),
  sharedFeatureCodes: z.array(z.string()),
  distinguishingFeatureCodes: z.array(z.string()),
  objectiveTechnicalProblem: z.string().optional(),
  motivationEvidence: z.array(z.object({
    referenceId: z.string(),
    label: z.string(),
    paragraph: z.union([z.string(), z.number(), z.null(), z.undefined()])
                .transform((v) => v === undefined || v === null || v === "" ? undefined : String(v))
                .optional(),                                   // 容错：AI 可能返回数字
    quote: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"])
  })).default([]),
  candidateAssessment: z.enum([
    "possibly-lacks-inventiveness",
    "possibly-inventive",
    "insufficient-evidence",
    "not-analyzed"
  ]).default("not-analyzed"),
  cautions: z.array(z.string()).default([]),
  legalCaution: z.string().default("以上为候选事实整理，不构成创造性法律结论。")
}
```

> **Zod 容错说明**：`paragraph` 字段使用 `z.union([z.string(), z.number(), z.null()])` 兼容 AI 可能返回数字（如段落号 5 而非 "0005"），通过 `.transform()` 统一转为字符串。

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一名专利复审辅助系统，负责在复审阶段进行创造性三步法分析。

## 复审上下文
本次分析基于以下复审背景：
- 审查意见通知书中的驳回理由
- 申请人的答辩理由（如提供）
- 申请人修改后的权利要求（如提供）
```

- **User Prompt 模板**：

```
## 输入数据
案件 ID: {caseId}
权利要求号: {claimNumber}
技术特征:
  A: 特征A描述
  B: 特征B描述
  ...

可用对比文件:
  D1 (ref-1): {excerpt.slice(0, 500)}
  D2 (ref-2): {excerpt.slice(0, 500)}
  ...

用户指定最接近现有技术: {closestPriorArtId ?? "由 AI 推荐"}

申请人答辩理由:
{applicantArguments}  （如未提供，省略本节）

修改后权利要求:
{amendedClaimText.slice(0, 4000)}  （如未提供，省略本节）

## 输出要求
严格按以下 JSON 格式输出，不要输出其他任何内容：

{
  "claimNumber": {claimNumber},
  "closestPriorArtId": "最接近现有技术的 referenceId（必须填写，从可用对比文件中选择一个）",
  "sharedFeatureCodes": ["共有特征的 featureCode 数组"],
  "distinguishingFeatureCodes": ["区别特征的 featureCode 数组"],
  "objectiveTechnicalProblem": "客观技术问题描述",
  "motivationEvidence": [
    {
      "referenceId": "对比文件ID",
      "label": "引用标签",
      "quote": "引用原文",
      "confidence": "high|medium|low"
    }
  ],
  "candidateAssessment": "possibly-inventive|possibly-lacks-inventiveness|insufficient-evidence",
  "cautions": ["注意事项数组"],
  "legalCaution": "法律风险提示"
}

注意事项：
- closestPriorArtId 必须填写，如果用户未指定则从可用对比文件中选择最相关的一个
- sharedFeatureCodes 和 distinguishingFeatureCodes 并集必须等于输入的所有 features
- candidateAssessment 只能是 possibly-inventive、possibly-lacks-inventiveness 或 insufficient-evidence
- motivationEvidence 中的 confidence 只能是 high、medium 或 low
- 务必使用双引号，字段名必须与示例完全一致
```

> **与 prompt 文件的差异**：`shared/src/prompts/inventive.prompt.md` 角色措辞为"按照三步法进行创造性复核"，代码为"进行创造性三步法分析"。以代码为准。

> **截断限制**：每篇 reference excerpt `slice(0, 500)`，`amendedClaimText.slice(0, 4000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{claimNumber}`：待分析的权利要求编号
> - `{features}`：Claim Chart 提取的技术特征列表
> - `{references}`：可用对比文件清单
> - `{amendedClaimText}`：修改后权利要求全文

### 前置依赖

- 模块 10（新颖性复核已完成，`novelty-ready` 状态）
- 模块 8（对比文件清单）

### 业务规则与备注

- 触发条件：`novelty-ready` 且对应 NoveltyComparison status === "user-reviewed"
- 硬约束：仅基于上传的对比文件内容判断技术启示，不使用模型训练知识中的外部技术信息
- 所有结论字段必须以"候选/待确认"措辞标注
- **注意**：本文档 Prompt 模板已移除 `examinerResponse` 字段（Zod Schema 未定义，会被静默丢弃），但代码 `AgentClient.ts` 的 `buildInventivePrompt()` 函数中仍保留该字段（Prompt JSON 示例 + 返回对象）。Coze.cn 移植时不应包含 `examinerResponse`，否则每次调用浪费 token 生成无用文本。建议代码层面同步删除该字段。
- **注意**：`candidateAssessment` 的 `"not-analyzed"` 值为 Schema 默认值（当 AI 未正确返回该字段时使用），不作为 AI 输出候选值。Coze.cn 移植时需为 `not-analyzed` 设计 UI 处理路径（如显示"待分析"灰色标记），Prompt 仅要求 AI 输出三种候选值：`possibly-inventive`、`possibly-lacks-inventiveness`、`insufficient-evidence`。

---

## 14. 模块 12：缺陷复查（Defect Review）

### 功能描述

对比上次审查意见指出的形式缺陷，结合本轮申请人的修改，检测缺陷是否已克服。帮助审查员追踪缺陷修复状态。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimText": "string（截断到 4000 字符）",
  "specificationText": "string（截断到 8000 字符）",
  "claimFeatures": [
    {
      "featureCode": "string",
      "description": "string"
    }
  ]
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/defect.schema.ts
{
  defects: z.array(z.object({
    category: z.string(),                                      // 权利要求、说明书、附图、摘要、其他
    description: z.string().min(1),
    location: z.string().optional(),
    severity: z.enum(["error", "warning", "info"]),
    previouslyRaised: z.boolean().optional(),
    overcomeStatus: z.enum(["overcome", "not-overcome", "partially-overcome"]).optional()
  })),
  warnings: z.array(z.string()),
  legalCaution: z.string()
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员，擅长识别专利申请文件中的形式缺陷。
```

- **User Prompt 模板**：

```
案件 ID: {caseId}

权利要求文本:
{claimText.slice(0, 4000)}

说明书文本:
{specificationText.slice(0, 8000)}

技术特征:
  A: 特征A描述
  B: 特征B描述
  ...

请根据以上内容检测形式缺陷，严格按以下 JSON 格式输出，不要输出其他内容：
{
  "defects": [
    {
      "category": "缺陷类别（如：权利要求、说明书、摘要）",
      "description": "缺陷具体描述",
      "location": "缺陷所在位置（可选）",
      "severity": "error|warning|info",
      "previouslyRaised": true或false（可选，是否曾被提出）,
      "overcomeStatus": "overcome|not-overcome|partially-overcome（可选，克服状态）"
    }
  ],
  "warnings": ["检测过程中的警告信息数组"],
  "legalCaution": "AI 分析法律风险提示"
}

注意：
- severity 只能是 error（错误）、warning（警告）或 info（提示）
- 如果没有发现缺陷，defects 返回空数组
- 务必使用双引号，字段名必须与示例完全一致
- location、previouslyRaised、overcomeStatus 为可选字段，不适用时可不包含
```

> **注意**：代码中 category 示例为"缺陷类别（如：权利要求、说明书、摘要）"。完整类别应包括"权利要求、说明书、附图、摘要、其他"。

> **截断限制**：`claimText.slice(0, 4000)`，`specificationText.slice(0, 8000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{claimText}`：权利要求全文
> - `{specificationText}`：说明书全文
> - `{previousDefects}`：上次审查意见指出的缺陷清单

### 前置依赖

- 模块 9（Claim Chart 已完成）

### 业务规则与备注

- 缺陷保留策略（重新运行复查时）：
  1. 用户手动添加的缺陷：全部保留
  2. 用户编辑过的 AI 缺陷：保留编辑过的字段
  3. 未编辑的 AI 缺陷：被新结果替换
- overcomeStatus 三档：overcome / not-overcome / partially-overcome
- 上次已指出的缺陷（previouslyRaised: true）需要审查员重点关注克服状态

---

## 15. 模块 13：复审意见草稿（Reexam Draft）

### 功能描述

综合审查意见解析、答辩映射、新颖性复核、创造性复核和缺陷复查的结果，生成逐条回应格式的复审审查意见草稿。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimNumber": "number",
  "rejectionGrounds": "[RejectionGround]",
  "argumentMappings": "[ArgumentMapping]",
  "noveltyResults": "string | undefined（截断到 4000 字符）",
  "inventiveResults": "string | undefined（截断到 4000 字符）",
  "defectResults": "string | undefined（截断到 2000 字符）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/reexamDraft.schema.ts

const MIN_QUOTE_LENGTH = 20;

// supportingEvidence 的 quote 质量门禁 transform：
// quote < 20 字符时 confidence 自动降级为 "low"
const supportingEvidenceSchema = z.object({
  label: z.string(),
  quote: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
}).transform((data) => {
  const hasValidQuote = data.quote != null && data.quote.length >= MIN_QUOTE_LENGTH;
  if ((data.confidence === "high" || data.confidence === "medium") && !hasValidQuote) {
    return { ...data, confidence: "low" as const };
  }
  return data;
});

{
  claimNumber: z.number(),
  responseItems: z.array(z.object({
    rejectionGroundCode: z.string(),
    category: z.string(),
    applicantArgumentSummary: z.string(),
    examinerResponse: z.string(),
    conclusion: z.enum([
      "argument-accepted", "argument-partially-accepted",
      "argument-rejected", "needs-further-review"
    ]),
    supportingEvidence: z.array(supportingEvidenceSchema).optional()
  })),
  overallAssessment: z.string(),
  defectReviewSummary: z.string().optional(),
  legalCaution: z.string()
}
```

> **Schema 层自动门禁**：`supportingEvidenceSchema.transform()` 在 Schema 层自动执行——当 confidence 为 `high` 或 `medium` 但 quote 不足 20 字符时，confidence 自动降级为 `"low"`。这意味着即使 AI 返回了高置信度的引用，若引文过短，也会被降级处理。

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员，负责起草复审意见草稿。
```

- **User Prompt 模板**：

```
案件 ID: {caseId}
权利要求号: {claimNumber}

驳回理由清单:
  RG-1 (novelty): 驳回理由摘要
  RG-2 (inventive): 驳回理由摘要
  ...

答辩映射:
  RG-1: 答辩摘要 [high]
  RG-2: 答辩摘要 [medium]
  ...

新颖性复核:
{noveltyResults.slice(0, 4000)}  （如未提供，省略本节）

创造性复核:
{inventiveResults.slice(0, 4000)}  （如未提供，省略本节）

缺陷复查:
{defectResults.slice(0, 2000)}  （如未提供，省略本节）

请根据以上内容起草复审意见草稿，严格按以下 JSON 格式输出，不要输出其他内容：
{
  "claimNumber": 权利要求号,
  "responseItems": [
    {
      "rejectionGroundCode": "驳回理由代码",
      "category": "驳回理由类别",
      "applicantArgumentSummary": "申请人答辩要点摘要",
      "examinerResponse": "审查员回应（复审意见正文）",
      "conclusion": "argument-accepted|argument-partially-accepted|argument-rejected|needs-further-review",
      "supportingEvidence": [
        { "label": "证据标签", "quote": "引文片段（可选）", "confidence": "high|medium|low" }
      ]
    }
  ],
  "overallAssessment": "综合评估",
  "defectReviewSummary": "缺陷复查总结（可选）",
  "legalCaution": "法律风险提示"
}

注意：
- conclusion 只能是 argument-accepted、argument-partially-accepted、argument-rejected 或 needs-further-review
- supportingEvidence 为可选字段，无证据时不包含
- confidence 为 high 或 medium 时，quote 必须有至少 20 个字符的引文
- defectReviewSummary 为可选字段
- 务必使用双引号，字段名必须与示例完全一致
```

> **与 prompt 文件的差异**：`shared/src/prompts/reexam-draft.prompt.md` 与代码 `buildReexamDraftPrompt()` 的对比如下，以代码为准：

| 差异类别 | prompt 文件 | 代码实际 |
|---------|------------|---------|
| 角色措辞 | "你是一名专利复审辅助系统，负责生成逐条回应格式的复审审查意见草稿。" | "你是一位资深专利审查员，负责起草复审意见草稿。" |
| 硬约束 | 5 条详细约束（逐条回应、不作法律结论、引用有据 Grounding Citation、四档结论、quote≥20 门禁） | 无显式约束段，仅在 JSON 注意事项中隐含 |
| 原文引用格式 | 3 种来源详细示例（权利要求原文、本申请说明书依据、对比文件依据） | 无引用格式指导 |
| 输出示例 | 含 `examinerResponse` 字段的完整示例 | 同样含 `examinerResponse`（⚠️ Zod Schema 未定义该字段，AI 输出被静默丢弃——建议代码层删除，见业务规则） |
| 输入变量 | `{rejectionGrounds}`、`{argumentMappings}` 占位符 | `rejectionGrounds` 和 `argumentMappings` 数组通过 `.map()` 展开为格式化文本行 |

> **截断限制**：`noveltyResults.slice(0, 4000)`，`inventiveResults.slice(0, 4000)`，`defectResults.slice(0, 2000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{claimNumber}`：待分析的权利要求编号
> - `{rejectionGrounds}`：驳回理由清单（全部传入，不做截断）
> - `{argumentMappings}`：答辩映射结果
> - `{noveltyResults}`：新颖性复核结果（序列化文本）
> - `{inventiveResults}`：创造性复核结果（序列化文本）
> - `{defectResults}`：缺陷复查结果（序列化文本）

### 前置依赖

- 模块 4（审查意见解析）
- 模块 5（答辩理由映射）
- 模块 10（新颖性复核）
- 模块 11（创造性复核）
- 模块 12（缺陷复查）

### 业务规则与备注

- 所有结论标注"候选/待审查员确认"
- 四档结论：argument-accepted / argument-partially-accepted / argument-rejected / needs-further-review
- 引用原文质量门禁（Schema 层自动执行）：quote ≥ 20 字符的 citation 才能保持高置信度

---

## 16. 模块 14：专利申请简述（Summary）

### 功能描述

基于已确认的 Claim Chart、新颖性对照和创造性分析结果，生成专利申请简述。每条事实必须附原文引用（Grounding Citation）。

### 输入 Schema

```json
{
  "caseId": "string",
  "caseBaseline": "string",
  "confirmedFeatures": "string（截断到 4000 字符）",
  "reviewedNoveltyComparisons": "string（截断到 4000 字符）",
  "inventiveAnalysis": "string（截断到 4000 字符）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/summary.schema.ts
{
  body: z.string(),          // 简述正文：技术方案概述 + 审查意见核心结论
  aiNotes: z.string(),       // AI 备注（不确定内容、citation 不满足门禁的内容）
  legalCaution: z.string()
}
```

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
你是一位资深专利审查员，负责撰写审查意见简述。
```

- **User Prompt 模板**：

```
案件基线: {caseBaseline}

Claim Chart（已确认特征）:
{confirmedFeatures.slice(0, 4000)}

新颖性对照（已审核记录）:
{reviewedNoveltyComparisons.slice(0, 4000)}

创造性分析:
{inventiveAnalysis.slice(0, 4000)}

请根据以上内容撰写审查意见简述，严格按以下 JSON 格式输出，不要输出其他内容：
{
  "body": "简述正文：①简要概述专利申请的技术方案、发明要解决的问题和关键技术手段；②概述审查意见的核心要点，包含新颖性、创造性的主要结论和关键依据（援引对比文件和 Citation）",
  "aiNotes": "AI 备注（包括不确定性说明、需要人工确认的事项等）",
  "legalCaution": "法律风险提示"
}

注意：
- body 字段必须包含有效的简述正文，且必须同时包含技术方案概述和审查意见核心结论两部分
- 审查意见结论需引用具体的对比文件和法律依据
- 务必使用双引号，字段名必须与示例完全一致
```

> **与 prompt 文件的差异**：`shared/src/prompts/summary.prompt.md` 与代码 `buildSummaryPrompt()` 的对比如下，以代码为准：

| 差异类别 | prompt 文件 | 代码实际 |
|---------|------------|---------|
| 角色措辞 | "你是一名专利复审辅助系统，负责生成审查意见简述。" | "你是一位资深专利审查员，负责撰写审查意见简述。" |
| 硬约束 | 4 条详细约束（仅使用已确认的事实、每条事实必须附 Grounding Citation、不输出法律结论、quote≥20 门禁） | 无显式约束段，仅在 JSON 注意事项中隐含 |
| 原文引用格式 | 3 种来源详细示例（权利要求原文、本申请说明书依据、对比文件依据） | 无引用格式指导 |
| 输出格式 | Markdown 分节（正文 + AI 备注区），无 JSON 约束 | JSON 格式（`body`、`aiNotes`、`legalCaution`），带详细字段说明 |
| 简述结构 | 未明确要求双部分结构 | 明确要求"①技术方案概述 + ②审查意见核心结论"两部分 |

> **截断限制**：`confirmedFeatures.slice(0, 4000)`，`reviewedNoveltyComparisons.slice(0, 4000)`，`inventiveAnalysis.slice(0, 4000)`。
>
> **占位符说明**：
> - `{caseId}`：当前案件的唯一标识符
> - `{caseBaseline}`：案件基线信息（序列化文本）
> - `{confirmedFeatures}`：已确认的技术特征列表
> - `{reviewedNoveltyComparisons}`：已审核的新颖性对照结果
> - `{inventiveAnalysis}`：创造性分析结果

### 前置依赖

- 模块 9（Claim Chart 已确认）
- 模块 10（新颖性对照已审核）
- 模块 11（创造性分析已完成）

### 业务规则与备注

- 仅使用已确认的事实
- 正文中每条事实主张后紧跟原文引用块
- AI 备注区存放不满足质量门禁的内容

---

## 17. 模块 15：AI 辅助专利检索（Search References）

### 功能描述

从权利要求中提取检索要素（关键词），调用外部专利搜索引擎（Tavily / SerpAPI / EPO OPS），再用 AI 筛选和排序搜索结果，输出候选项供审查员添加为对比文件。

### 输入 Schema

```json
{
  "caseId": "string",
  "claimText": "string",
  "features": [
    {
      "featureCode": "string",
      "description": "string"
    }
  ],
  "maxResults": "number（1-10，默认 5）"
}
```

### AI 返回 Schema（Zod 验证）

```typescript
// shared/src/schemas/searchReferences.schema.ts
{
  ok: z.boolean(),
  candidates: z.array(z.object({
    title: z.string(),
    publicationNumber: z.string(),
    publicationDate: z.string().optional(),
    summary: z.string(),
    relevanceScore: z.number(),
    recommendationReason: z.string(),
    sourceUrl: z.string().optional()
  })),
  searchSummary: z.object({
    featureCount: z.number(),
    queryCount: z.number(),
    dataSource: z.string(),
    queries: z.array(z.string())
  }).optional(),
  error: z.string().optional()
}
```

### 核心 AI 提示词

#### 步骤 1：提取检索关键词（内嵌在 server `search.ts`）

> **实际发送方式**：代码中以单条 `role: "user"` message 发送，角色身份与指令合并。以下"System Prompt / User Prompt"仅为文档组织上的拆分，Coze.cn 移植时应合并为单条 user message 以保持与原系统一致。

- **System Prompt**：

```
你是资深专利检索专家。请从权利要求中提取用于搜索专利文献的检索式。
```

- **User Prompt 模板**：

```
权利要求文本:
{claimText.slice(0, 4000)}

技术特征:
{featureText}

检索策略要求:
1. 生成 3-5 条短检索式，每条仅含 2-4 个词，用于在 Google Patents 等专利搜索引擎中检索
2. 每条检索式必须是纯中文或纯英文，不要中英混杂
3. 优先选择能区分技术方案的特征词，避免通用词（如"装置""方法"）
4. 中文检索式用中文关键词，英文检索式用英文关键词
5. 覆盖不同角度：技术领域、核心结构、关键技术特征

示例（LED散热专利）:
{"queries":["LED散热器 相变材料","LED heatsink phase change","散热模组 相变储能","thermal management phase change material"]}

示例（锂电池快充专利）:
{"queries":["锂电池快速充电","lithium battery fast charging","正极材料 快充","cathode material rapid charge"]}

请严格输出 JSON 格式 {"queries":["查询1","查询2",...]}，不要输出其他内容：
```

> **截断限制**：`claimText.slice(0, 4000)`，生成的检索式最多 5 条。

> **占位符说明**：
> - `{claimText}`：权利要求全文（前端传入前已 `slice(0, 4000)`）
> - `{featureText}`：由 `features` 数组拼接的技术特征文本，格式为 `特征编号: 描述`

#### 步骤 2：搜索专利文献（server `webSearch.ts`）

调用外部搜索引擎（Tavily / SerpAPI / EPO OPS），每个检索式分别搜索，合并去重结果。

- **EPO 特化处理**：若使用 EPO OPS，中文检索式先经 LLM 翻译为英文再搜索。

> **实际发送方式**：代码中以单条 `role: "user"` message 发送，角色身份与指令合并。以下 Prompt 仅为文档组织上的拆分。

- **System Prompt**：

```
你是专利检索专家。请将以下中文检索词翻译为英文，用于在 EPO（欧洲专利局）专利数据库中检索。
```

- **User Prompt 模板**：

```
中文检索词:
1. {检索式1}
2. {检索式2}
...

翻译要求:
1. 使用专利领域的专业英文术语
2. 保持检索意图不变，不要添加或删除技术特征
3. 每个检索词单独翻译，不要合并

输出 JSON 格式: {"translations":["英文检索词1","英文检索词2",...]}
```

> **触发条件**：`searchProviderId === "epo"` 且检索式中存在中文时才触发。

#### 步骤 3：筛选和排序（LLM 二次处理）

> **实际发送方式**：代码中以单条 `role: "user"` message 发送，角色身份与指令合并。以下 Prompt 仅为文档组织上的拆分。

- **System Prompt**：

```
你是专利检索分析专家。以下是从网络搜索到的结果，需要从中识别专利文献。
```

- **User Prompt 模板**：

```
权利要求文本:
{claimText.slice(0, 2000)}

技术特征:
{featureText}

搜索结果:
[1] 标题: ...
URL: ...
摘要: ...

任务：
1. 从搜索结果中识别专利文献（标题或URL包含专利号：CN/US/EP/JP/KR/WO开头）
2. 提取每篇专利的标题、公开号、公开日期、技术摘要、相关度评分、推荐理由、来源URL
3. 按相关度排序，最多返回{maxResults}篇

输出格式：JSON数组
[{
  "title": "专利标题",
  "publicationNumber": "CN108123456A",
  "publicationDate": "2023-01-15",
  "summary": "技术摘要",
  "relevanceScore": 85,
  "recommendationReason": "推荐理由",
  "sourceUrl": "https://..."
}]

重要规则：
- 只返回专利文献，非专利网页返回空数组
- 所有信息必须来自搜索结果原文，不得编造
- 优先中国专利（CN开头）和高相关度文献
- 如果没有专利文献，返回空数组 []
```

> **与 prompt 文件的差异**：`shared/src/prompts/search-references.prompt.md` 与代码 `server/src/routes/search.ts` 的对比如下，以代码为准：

| 差异类别 | prompt 文件 | 代码实际 |
|---------|------------|---------|
| 文档定位 | 设计稿文档，含"用途一：提取检索关键词"和"用途二：筛选搜索结果"两部分 | 实际实现分为 3 个步骤（提取、翻译、筛选），每步独立构建 Prompt |
| 步骤 1 角色 | "你是一名专利检索分析专家" | "你是资深专利检索专家" |
| 步骤 1 内容 | 简述 `searchTerms`/`ipcCodes`/`searchQuery` 输出字段 | 含 5 条详细检索策略要求 + 2 个示例（LED 散热、锂电池快充） |
| 步骤 1.5（EPO 翻译） | 未单独列出 | 独立步骤，仅 `searchProviderId === "epo"` 且含中文时触发 |
| 步骤 3 输出 | JSON 含 `candidates` + `searchQuery` + `legalCaution` | JSON 为纯数组 `[...]`，无外层包装 |
| 硬约束 | 4 条（绝不编造文献、不输出法律结论、公开号必须有据、相关度基于实际内容） | 4 条内嵌在步骤 3 的"重要规则"中（只返回专利文献、不得编造、优先 CN、无结果返回空数组） |

> **截断限制**：步骤 3 中 `claimText.slice(0, 2000)`。

> **占位符说明**：
> - `{claimText}`：权利要求全文（前端传入前已 `slice(0, 2000)`）
> - `{featureText}`：由 `features` 数组拼接的技术特征文本（同步骤 1）
> - `{maxResults}`：预期返回最大结果数（1-10，默认 5）

### 前置依赖

- 模块 9（Claim Chart 已完成，提供技术特征）
- 步骤 2–3 仅限真实模式运行（需配置外部搜索 API Key）

### 业务规则与备注

- 检索结果需审查员逐篇确认，确认后可作为对比文件导入
- 候选项状态三态：pending / accepted / rejected
- 仅位置字段非模拟模式时运行步骤 2–3
- 步骤 1.5（EPO 中文转英文）仅在 searchProviderId === "epo" 时触发

---

## 18. 模块 16：模块对话（Chat Agent）

### 功能描述

为每个业务模块提供独立的 AI 多轮对话能力。Chat Agent 维护模块级会话上下文，通过自动构建的上下文摘要（Context Summary）注入当前模块的实时数据，让 AI 能结合模块数据进行针对性问答。支持多轮追问、日志记录和重新生成操作。

### 输入 Schema

```typescript
// client/src/agent/contracts.ts
interface ChatRequest {
  caseId: string;
  sessionId: string;
  moduleScope: ModuleScope;
  userMessage: string;
  contextSummary: string;
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

type ModuleScope =
  | "claim-chart" | "novelty" | "inventive" | "summary" | "draft"
  | "defects" | "case" | "documents" | "interpret"
  | "opinion-analysis" | "argument-mapping";
```

### 输出 Schema

```typescript
interface ChatResponse {
  reply: string;
  action?: {
    type: "regenerate";
    target: "claim-chart" | "novelty" | "inventive";
  };
}
```

- `reply`：AI 对话回复文本
- `action`（可选）：当用户输入包含"重新 + 目标模块"关键词时，返回操作指令，前端展示"应用修改"按钮触发重跑

### 核心 AI 提示词

- **System Prompt（实际运行代码）**：

```
案件 ID: {caseId}
当前模块: {moduleScope}

=== 当前模块数据 ===
{contextSummary}

=== 对话历史 ===
[user]: 用户消息...
[assistant]: AI 回复...

=== 用户消息 ===
{userMessage}
```

> **注意**：Chat Agent 使用**无角色的纯内容拼接**方式构建 Prompt，将背景信息、对话历史和用户消息以自然分隔行组合，不设置独立 System 角色。

### 上下文摘要构建（`chatContext.ts::buildContextSummary()`）

根据 `moduleScope` 自动注入不同模块的实时数据：

| moduleScope | 注入内容 |
|-------------|---------|
| `case` | 案件标题、申请号、申请日、专利类型、目标权利要求、工作流状态 |
| `documents` / `interpret` | 文档清单、文件角色、文本状态 + 文档正文（截断到 6000 字符，截断后追加 `\n...（已截断）` 标记） |
| `claim-chart` | 技术特征列表（code + 描述 + 引用状态） |
| `novelty` | 新颖性对照结果（每篇对比文件：特征码 + 公开状态 + Citation + 审查员备注） |
| `inventive` | 创造性分析（最接近现有技术 + 区别特征 + 客观技术问题 + 候选结论） |
| `defects` | 形式缺陷清单（严重程度 + 类别 + 描述 + 解决状态） |
| `draft` / `summary` | 特征数 + 对照数 + 创造性 + 缺陷数摘要 |

### Chat 会话管理

- **存储**：IndexedDB（`chatRepo.ts`），按 caseId 分库，支持多会话切换
- **会话标题**：用户可重命名；默认按创建时间命名
- **对话历史**：每次请求携带最近 10 条历史消息（`.slice(-10)`）
- **操作检测**：Mock 模式下检测用户消息中的关键词（"重新 + claim/特征 → 重跑 Claim Chart"等），返回 action 指令

### 模块标签映射

```
baseline → "案件基本信息"  (scope: case)
documents → "文档导入"     (scope: documents)
references → "文献清单"   (scope: documents)
interpret → "文档解读"    (scope: interpret)
claim-chart → "权利要求特征表" (scope: claim-chart)
novelty → "新颖性对照"    (scope: novelty)
inventive → "创造性分析"   (scope: inventive)
defects → "形式缺陷"      (scope: defects)
draft → "素材草稿"        (scope: draft)
export → "导出"           (scope: summary)
```

### 前置依赖

- 对应模块的数据已存在于 Store 中（Chat 依赖当前模块状态）
- ChatSession 已在 IndexedDB 中创建（`createSession`）

### 业务规则与备注

- 每个模块维护独立 Chat 会话（按 moduleScope 隔离）
- 对话历史最近 10 条携带到 AI
- UI 面板宽度 340px，可拖拽调整
- 对话通过 `ChatBubble` 组件展示，支持 action 按钮（"应用修改"）
- 错误消息通过 `formatAiErrorMessage` 格式化展示

---

## 19. 模块 17：导出（Export）

### 功能描述

将案件审查全流程数据（包括案件信息、Claim Chart、新颖性对照、创造性分析、缺陷复查、复审意见草稿、简述）打包导出为 HTML 文件。纯前端操作，不涉及 AI 调用。

### 输入 Schema

```typescript
// client/src/lib/exportHtml.ts
interface ExportViewModel {
  caseData: PatentCase;
  claimFeatures: ClaimFeature[];
  noveltyComparisons: NoveltyComparison[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  inventiveAnalysis?: InventiveStepAnalysis;
  defects?: FormalDefect[];
  reexamDraft?: ReexamDraftResponse;
  summary?: SummaryResponse;
}
```

### 输出

- **HTML 文件**：结构化审查辅助材料报告，含 CSS 内联样式
- **文件名格式**：`{申请号}_{发明名称简写}_审查辅助_{日期}.html`
- **内容结构**：
  1. 案件基本信息（申请号、发明名称、申请人、申请日、优先权日）
  2. 权利要求特征表（已确认特征 + Citation）
  3. 新颖性对照（逐篇、逐特征）
  4. 区别特征候选
  5. 待检索问题清单
  6. 创造性三步法分析（最接近现有技术、区别特征、客观技术问题、动机证据、候选结论）
  7. 形式缺陷检查
  8. 复审意见草稿（逐条回应 + 综合评估 + 缺陷复查总结）
  9. 审查意见简述
  10. 法律免责声明

### 核心逻辑（纯前端）

- **HTML 渲染**：`exportHtml.ts::renderCaseHtml()` 基于模板字面量拼接 HTML
- **Markdown 渲染**（备选）：`exportMarkdown.ts::renderCaseMarkdown()` 生成 Markdown 文本
- **文件下载**：`exportHtml.ts::downloadHtml()` 创建 Blob → URL.createObjectURL → 模拟点击下载
- **文件名清洗**：`fileNameSanitize.ts::buildExportFileName()` 过滤非法字符

### 前置依赖

- 模块 1（案件基线）
- 模块 9（Claim Chart）
- 模块 10（新颖性复审）
- 模块 11（创造性复审）
- 模块 12（缺陷复查）
- 模块 13（复审意见草稿）
- 模块 14（专利简述）

### 业务规则与备注

- 所有导出内容标注法律免责声明："本文件为审查辅助素材，不构成法律结论。所有 AI 生成内容均为候选事实整理，需审查员确认。"
- 仅导出状态为 "confirmed" 的 Claim Feature
- 缺陷按严重程度（error > warning > info）排序
- 复审结论四档中文化：argument-accepted → "答辩成立"、argument-partially-accepted → "答辩部分成立"、argument-rejected → "答辩不成立"、needs-further-review → "需进一步审查"

---

## 20. 模块 18：文档翻译（Translate）

### 功能描述

将外文专利文档文本翻译为中文，辅助审查员快速理解非中文专利文献内容。在文档解读模块中作为辅助功能使用。

### 输入 Schema

```typescript
// client/src/agent/contracts.ts
interface TranslateRequest {
  caseId: string;
  documentText: string;
}
```

### 输出 Schema

```typescript
interface TranslateResponse {
  translatedText: string;
}
```

- `translatedText`：翻译后的中文文本（纯字符串，非结构化 JSON）

### 核心 AI 提示词

Translate Agent 不使用独立的 System Prompt。Prompt 为文档原文直接传入（非结构化翻译）：

- **User Prompt（实际运行代码）**：

```
{documentText.slice(0, 12000)}
```

> **说明**：Translate Agent 不拼接任何角色引导语或格式指令，**仅传入被截断的原文**。AI 的翻译行为由模型自身能力决定，客户端不做翻译方向或风格约束。这意味着 Coze.cn 移植时需依赖平台节点自身的翻译能力或单独设计翻译 Prompt。
>
> **与 prompt 文件的差异**：`shared/src/prompts/translate.prompt.md` 包含角色定义和翻译约束（"你是专利文献翻译专家，请将以下外文专利文献翻译为中文..."），但代码中 `buildTranslatePrompt()` 只返回 `request.documentText.slice(0, 12000)`。以代码为准。
> **Coze.cn 移植建议**：虽然当前代码依赖模型自身翻译能力（裸传原文），但 Coze.cn 平台移植时强烈建议参考 `shared/src/prompts/translate.prompt.md` 中的完整翻译约束体系（忠实翻译、保留结构、术语一致性、不确定术语标注、专利格式保留等），以获得更符合专利审查实务要求的翻译质量。

> **截断限制**：`documentText.slice(0, 12000)`。

### 前置依赖

- 模块 2（文档文本已提取）
- 模块 6（文档解读——翻译作为解读子功能）

### 业务规则与备注

- 翻译结果以 TextArea 展示，用户可手动编辑
- 支持"重新翻译"按钮
- 翻译在 `InterpretPanel` 中作为文档解读的辅助功能（可折叠面板）
- 语言检测通过 `languageDetect.ts` 自动识别文档语言，仅非中文文档展示翻译入口
- **⚠️ Provider 配置限制**：`translate` 未注册到 `AgentKey` 类型和 `GATEWAY_AGENT_TO_KEY` 映射（`shared/src/types/agents.ts` / `client/src/agent/AgentClient.ts`），导致 `resolveAgent("translate")` 返回 `null`，翻译始终使用全局 fallback Provider/Model。用户无法在设置页面为翻译指定独立的 Provider。Coze.cn 移植时建议为翻译节点独立配置模型，不必复现此限制。若需代码层修复，将 `"translate"` 添加到 `AgentKey` 联合类型和 `GATEWAY_AGENT_TO_KEY` 映射即可

---

## 21. 附录 A：Server 端 AI 调用方式

### 路由端点

- **`POST /api/ai/run`**：统一 AI 调用入口（`server/src/routes/ai.ts`）

### 请求格式（`aiRunRequestSchema`）

```typescript
// server/src/lib/schemas.ts
{
  agent: "interpret" | "claim-chart" | "novelty" | "inventive" | "summary"
       | "draft"              // ← 遗留别名，实际 AI 调用使用 "reexam-draft"
       | "chat" | "defects" | "search-references"
       | "extract-case-fields" | "opinion-analysis" | "argument-analysis"
       | "reexam-draft" | "translate" | "classify-documents",
  providerPreference: string[],          // Provider 优先级列表，至少 1 个
  modelId: string,                       // 模型 ID
  maxTokens?: number,                    // 最大 token 数，默认 4096
  modelFallbacks?: Record<string, string[]>,     // 模型级回退
  enableModelFallback?: Record<string, boolean>, // 是否启用模型回退
  providerBaseUrls?: Record<string, string>,     // 自定义 Provider Base URL
  reasoningLevel?: "low" | "medium" | "high",
  prompt: string,                        // 完整 Prompt 字符串
  expectedSchemaName?: string,
  sanitized: boolean,                    // 是否已脱敏
  mock?: boolean,                        // Mock 模式
  metadata: {
    caseId: string,
    moduleScope: string,
    tokenEstimate: number
  }
}
```

### 响应格式（`AiRunResponse`）

```typescript
// 成功
{
  ok: true,
  provider: ProviderId,            // 实际使用的 Provider
  modelId: string,
  outputJson?: unknown,            // 解析后的 JSON（经 Zod 验证）
  rawText: string,                 // AI 原始文本
  tokenUsage?: { input: number; output: number; total: number },
  structureErrors?: string[],      // Schema 验证失败时的错误详情
  durationMs: number,
  attempts: Array<{ providerId: string; ok: boolean; errorCode?: string }>
}

// 失败
{
  ok: false,
  error: {
    code: "invalid-request" | "no-api-keys" | "quota-exceeded"
        | "auth-failed" | "internal-error",
    message: string,
    retryable: boolean
  },
  attempts?: Array<{ providerId: string; ok: boolean; errorCode?: string }>,
  durationMs?: number
}
```

### 请求处理流程

1. **Schema 校验**（`z.safeParse`）→ 400 无效请求
2. **Mock 模式**：加载 Shared Fixture 数据直接返回
3. **脱敏处理**（`sanitizeText`）：应用用户配置的脱敏规则
4. **构建 Chat Message**：`[{ role: "user", content: prompt }]`（仅 User 角色，无 System）
5. **Provider 选择与回退**（`registry.runWithFallback`）：
   - 依次尝试 `providerPreference` 中配置的 Provider
   - 每个 Provider 内支持模型级回退（`modelFallbacks`）
   - 首个成功即返回；全部失败则按配额/认证/内部错误分类返回
6. **JSON 提取**（`extractJsonFromText`）：从 AI 返回文本中提取 JSON（支持 markdown fence 剥离）
7. **Schema 验证**（`validateAgentResponse`）：对结构化 Agent 执行 Zod 校验
8. **客户端断开检测**：通过 TCP Socket 监听（`server/src/lib/clientDisconnect.ts`），客户端断开时 abort 请求。Coze.cn 平台自身管理连接生命周期，移植时不需实现此机制。

### Provider 适配层

每个 AI Provider 实现 `ProviderAdapter` 接口：

```typescript
// server/src/providers/ProviderAdapter.ts
interface ProviderAdapter {
  id: ProviderId;
  defaultBaseUrl: string;
  supportedModels(): string[];
  chat(req: ChatRequest): Promise<ChatResponse>;
  listModels(apiKey: string, customBaseUrl?: string): Promise<string[]>;
}

interface ChatRequest {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
  signal?: AbortSignal;
  baseUrl?: string;
}
```

支持 Provider：Gemini、MiMo、Kimi、GLM、MiniMax、DeepSeek、Qwen、AWS Bedrock、OpenRouter、OpenCode Zen

### JSON 提取逻辑（`jsonExtractor.ts`）

1. 剥离 markdown fence：移除 ` ```json ` / ` ``` ` 包裹
2. 查找首个 `{` 或 `[` 到末个 `}` 或 `]` 之间的 JSON 段
3. `JSON.parse()` 尝试解析
4. 失败时返回 undefined（不抛异常，前端降级处理）

### 错误分类

| HTTP 状态码 | error.code | 说明 |
|------------|-----------|------|
| 400 | `invalid-request` | Schema 校验失败 |
| 400 | `no-api-keys` | 无可用 API Key |
| 400 | `mock-fixture-not-found` | Mock 数据不存在 |
| 401 | `auth-failed` | 认证失败（无效 API Key） |
| 429 | `quota-exceeded` | 所有 Provider 额度用尽 |
| 502 | （其他错误码） | 上游 Provider 调用失败 |
| 500 | `internal-error` | 服务器内部错误 |

---

## 22. 附录 B：Prompt 术语对照

### 角色身份对照表

| Agent ID | 代码中角色（`AgentClient.ts`） | 术语分类 |
|----------|---------------------------|---------|
| `opinion-analysis` | 你是一位资深专利审查员，擅长分析审查意见通知书。 | 资深专利审查员 |
| `argument-analysis` | 你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由与驳回理由之间的对应关系。 | 资深专利审查员 |
| `claim-chart` | 你是一位资深专利审查员助理 | 资深专利审查员 |
| `novelty` | 你是一名专利复审辅助系统，负责逐特征进行新颖性对照分析。 | 专利复审辅助系统 |
| `inventive` | 你是一名专利复审辅助系统，负责在复审阶段进行创造性三步法分析。 | 专利复审辅助系统 |
| `reexam-draft` | 你是一位资深专利审查员，负责起草复审意见草稿。 | 资深专利审查员 |
| `draft` | （遗留别名，无独立 Prompt——复用 `reexam-draft`） | — |
| `summary` | 你是一位资深专利审查员，负责撰写审查意见简述。 | 资深专利审查员 |
| `defects` | 你是一位资深专利审查员，擅长识别专利申请文件中的形式缺陷。 | 资深专利审查员 |
| `interpret` | 你是一个专利审查助手。 | 专利审查助手 |
| `classify-documents` | 你是一个专利文档分类助手。 | 专利文档分类助手 |
| `extract-case-fields` | 你是一个专利文档信息提取助手。 | 专利文档信息提取助手 |
| `translate` | （无角色定义——仅传入原文） | 无 |
| `search-references` | 你是资深专利检索专家。（步骤1） / 你是专利检索分析专家。（步骤3） | 专利检索专家 |
| `chat` | （无角色定义——纯内容拼接） | 无 |

### 术语统一建议（供 Coze.cn 移植参考）

三类角色定位：
- **"资深专利审查员"**：涉及审查意见分析、法律判断、草稿撰写等核心审查工作的 Agent
- **"专利复审辅助系统"**：虽不直接作出法律结论，但涉及法律标准的适用判断（如新颖性逐特征对照、创造性三步法分析），输出包含 `legalCaution` 法律风险提示。Coze.cn 移植时注意：其 Prompt 角色自称"辅助系统"，但实际分析内容涉及实质法律判断
- **"助手/Specialist"**：文档分类、信息提取、解读、检索等辅助性工作，不涉及法律判断

---

## 23. 附录 C：工作流状态机

### CaseWorkflowState 定义

```typescript
type CaseWorkflowState =
  | "empty"                // 初始空状态
  | "case-ready"           // 案件基线已设置
  | "documents-uploaded"   // 文档已上传
  | "text-extracted"       // 文本已提取
  | "ocr-running"          // OCR 进行中
  | "ocr-failed"           // OCR 失败
  | "ocr-review"           // OCR 结果待审核
  | "text-confirmed"       // 文本已确认
  | "opinion-analyzed"     // 审查意见已解析
  | "argument-mapped"      // 答辩理由已映射
  | "references-ready"     // 对比文件已准备
  | "timeline-checked"     // 时间轴校验完成
  | "claim-chart-ready"    // Claim Chart 已生成
  | "claim-chart-reviewed"  // Claim Chart 已审核
  | "novelty-ready"        // 新颖性对照已完成
  | "inventive-ready"      // 创造性分析已完成
  | "defects-ready"        // 缺陷复查已完成
  | "draft-ready"          // 复审草稿已生成
  | "export-ready";        // 导出就绪
```

### 状态转移路径

```
empty
  → case-ready（设置案件基线）
    → documents-uploaded（上传文档）
      → text-extracted（提取文本）
        → ocr-running / ocr-failed / ocr-review（OCR 分支）
          → text-confirmed（文本确认）
            → opinion-analyzed（审查意见解析）
              → argument-mapped（答辩映射）
                → references-ready（文献准备）
                  → timeline-checked（时间轴校验）
                    → claim-chart-ready（Claim Chart 生成）
                      → claim-chart-reviewed（Claim Chart 审核）
                        → novelty-ready（新颖性复核）
                          → inventive-ready（创造性复核）
                            → defects-ready（缺陷复查）
                              → draft-ready（复审草案）
                                → export-ready（导出就绪）
```

### 状态依赖关系

- `novelty-ready` 要求 NoveltyComparison.status === "user-reviewed"
- `claim-chart-ready` 触发后，可并行执行缺陷复查（`defects-ready`）
- OCR 分支不影响后续流程（文本确认即可继续）
- 文档分类是上传流程的必要环节，在 `CaseSetupPage` 中自动执行

---

## 24. 附录 D：Prompt 截断限制总表

以下截断限制来源于 `AgentClient.ts` 中所有 `build*Prompt()` 函数的 `.slice()` 和 `Array.slice()` 调用。

| Agent ID | 截断字段 | 限制值 | 截断方式 | 备注 |
|----------|---------|-------|---------|------|
| `reexam-draft` | noveltyResults | 4000 字符 | `String.slice(0, 4000)` | |
| `reexam-draft` | inventiveResults | 4000 字符 | `String.slice(0, 4000)` | |
| `reexam-draft` | defectResults | 2000 字符 | `String.slice(0, 2000)` | |
| `opinion-analysis` | officeActionText | 12000 字符 | `String.slice(0, 12000)` | |
| `argument-analysis` | responseText | 12000 字符 | `String.slice(0, 12000)` | |
| `argument-analysis` | amendedClaimsText | 4000 字符 | `String.slice(0, 4000)` | |
| `claim-chart` | specificationText | 8000 字符 | `String.slice(0, 8000)` | |
| `novelty` | referenceText | 8000 字符/篇 | `String.slice(0, 8000)` | 对比文件全文截断（单篇） |
| `novelty` | amendedClaimText | 4000 字符 | `String.slice(0, 4000)` | |
| `inventive` | reference excerpts | 500 字符/篇 | `String.slice(0, 500)` | 每篇对比文件的摘要截断 |
| `inventive` | amendedClaimText | 4000 字符 | `String.slice(0, 4000)` | |
| `defects` | claimText | 4000 字符 | `String.slice(0, 4000)` | |
| `defects` | specificationText | 8000 字符 | `String.slice(0, 8000)` | |
| `interpret` | documentText | 12000 字符 | `String.slice(0, 12000)` | |
| `translate` | documentText | 12000 字符 | `String.slice(0, 12000)` | |
| `summary` | confirmedFeatures | 4000 字符 | `String.slice(0, 4000)` | |
| `summary` | reviewedNoveltyComparisons | 4000 字符 | `String.slice(0, 4000)` | |
| `summary` | inventiveAnalysis | 4000 字符 | `String.slice(0, 4000)` | |
| `search-references` (步骤1) | claimText | 4000 字符 | `String.slice(0, 4000)` | 提取检索关键词 |
| `search-references` (步骤1) | queries | 最多 5 条 | `Array.slice(0, 5)` | 每条 2-4 个词；另含过滤规则：长度 ≥ 3、排除 markdown fence 和 JSON 开头 |
| `search-references` (步骤3) | claimText | 2000 字符 | `String.slice(0, 2000)` | 筛选和排序 |
| `search-references` (步骤3) | candidates | 最多 N 条 | `Array.slice(0, maxResults)` | 默认 5，上限 10 |
| `chat` | contextSummary (documents) | 6000 字符/篇 | `String.slice(0, 6000)` | 仅 documents/interpret scope |
| `chat` | history | 最近 10 条 | `Array.slice(-10)` | |
| `extract-case-fields` | 无显式截断 | — | — | 前端限制每文件最多前3页文本（约3000-5000字符） |

> **Coze.cn 移植注意事项**：以上截断限制直接影响 token 消耗和 AI 输出完整性。

---

## 25. 附录 E：Prompt Message 结构总览

以下列出各 Agent 实际发送给 AI 的消息结构（以代码中 `messages` 数组为准）：

| Agent ID | Message 结构 | 说明 |
|----------|-------------|------|
| `extract-case-fields` | `[{ role: "user", content: prompt }]` | 单条 user message，角色身份与指令合并 |
| `classify-documents` | `[{ role: "user", content: prompt }]` | 同上 |
| `opinion-analysis` | `[{ role: "user", content: prompt }]` | 同上 |
| `argument-analysis` | `[{ role: "user", content: prompt }]` | 同上 |
| `claim-chart` | `[{ role: "user", content: prompt }]` | 同上 |
| `novelty` | `[{ role: "user", content: prompt }]` | 同上 |
| `inventive` | `[{ role: "user", content: prompt }]` | 同上 |
| `defects` | `[{ role: "user", content: prompt }]` | 同上 |
| `reexam-draft` | `[{ role: "user", content: prompt }]` | 同上 |
| `summary` | `[{ role: "user", content: prompt }]` | 同上 |
| `interpret` | `[{ role: "user", content: prompt }]` | 同上 |
| `translate` | `[{ role: "user", content: prompt }]` | 同上 |
| `search-references` (步骤1/1.5/3) | `[{ role: "user", content: prompt }]` | 同上，文档中"System Prompt / User Prompt"仅为组织拆分 |
| `chat` | `[{ role: "user", content: prompt }]` | `buildChatPrompt()` 返回纯字符串，server 端统一封装为单条 user message |

> **Coze.cn 移植注意事项**：所有 Agent（含 chat）均使用单条 user message 发送，无独立 system role。`buildChatPrompt()` 内部以分隔行（`=== 当前模块数据 ===`、`=== 对话历史 ===`、`=== 用户消息 ===`）组织内容结构，但不区分 system/user role。Coze.cn 创建 Bot 时，可参考 prompt 文件获得更自然的 system/user prompt 拆分素材。

> **注**：`draft` 为 `reexam-draft` 的遗留别名（见 §1.4），无独立消息结构，此处省略。

---

## 26. 附录 F：模块间数据流图

```
模块 2（文件上传 / 文本提取）
    ↓ documentFiles
模块 3（文档分类 / classify-documents）
    ↓ classified documents
    ├──→ 模块 4（审查意见解析 / opinion-analysis）→ rejectionGrounds
    │                                                       ↓
    │                                                 模块 5（答辩映射 / argument-analysis）
    │                                                       ↓
    │                                                  argumentMappings
    │                                                       ↓
    ├──→ 模块 9（技术特征提取 / claim-chart）→ features
    │                                              ↓           ↓
    │                         模块 10（新颖性复核 / novelty）  模块 11（创造性复核 / inventive）
    │                              ↓                               ↓
    │                          noveltyResults               inventiveResults
    │                              ↓                               ↓
    │                              └─────→ 模块 13（复审意见草稿 / reexam-draft）←───┘
    │                                                                  ↓
    │                                                              reexamDraft
    │                                                                  ↓
    │                                              模块 14（审查结论 / summary）
    │
    ├──→ 模块 12（缺陷复查 / defects）→ defectResults ──→ 模块 13
    │
    └──→ 模块 15（AI 辅助检索 / search-references）→ 可选检索结果
```

**关键数据传递路径**：

1. **驳回理由流**：`opinion-analysis` → `rejectionGrounds` → `argument-analysis` → `argumentMappings` → `reexam-draft`
2. **技术特征流**：`claim-chart` → `features` → `novelty` + `inventive` → `noveltyResults` + `inventiveResults` → `reexam-draft`
3. **缺陷复查流**：`defects` → `defectResults` → `reexam-draft`
4. **最终集成**：`reexam-draft` 汇聚以上所有结果 → `summary`

> **注**：模块 16（Chat Agent）、模块 18（翻译）、模块 7（附图提取）不参与上述核心数据流，属于独立辅助功能。
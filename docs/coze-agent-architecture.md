# 专利复审 AI 助手 — Coze Agent/Bot 架构设计文档

<p align="right">2026-05-28 · v1.0 · 对应 backlog nf-6</p>

> 本文档定义将 `patentExaminator` 项目移植到 [Coze.cn](https://www.coze.cn/) 低代码平台的 Agent/Bot 架构方案。核心挑战是在 Coze 平台上平衡 **Agent（对话智能体）**、**Workflow（结构化流程引擎）** 和 **Skill（独立能力节点）** 三者的职责边界。目标平台为 [豆包 Bot](https://www.doubao.com/chat/bot/)。

---

## 目录

1. [架构概述](#1-架构概述)
2. [Coze 平台组件职责分配](#2-coze-平台组件职责分配)
3. [主 Bot 设计](#3-主-bot-设计)
4. [Workflow 设计](#4-workflow-设计)
5. [Skill 设计](#5-skill-设计)
6. [三种操作场景的实现路径](#6-三种操作场景的实现路径)
7. [数据流与变量系统](#7-数据流与变量系统)
8. [Human-in-the-Loop 集成](#8-human-in-the-loop-集成)
9. [Provider 与模型配置](#9-provider-与模型配置)
10. [移植优先级与分阶段路线](#10-移植优先级与分阶段路线)
11. [与原系统的差异与取舍](#11-与原系统的差异与取舍)

---

## 1. 架构概述

### 1.1 痛点与目标

当前 `patentExaminator` 是一个完整的前后端 Web App（React + Express + IndexedDB），审查员需要在浏览器中操作。移植到 Coze.cn 的目标是让审查员在豆包 Bot 对话界面中即可完成全部复审辅助工作，无需离开对话窗口。

### 1.2 三种操作场景（来自 system-specification.md §0）

| 场景 | 描述 | 用户介入程度 |
|------|------|-------------|
| **0.1 一键直出** | 上传全部复审文件 → Bot 自动走完所有环节 → 直接输出复审意见草稿 | 仅上传 + 最终确认 |
| **0.2 每步协作** | 上传文件 → Bot 逐步引导，每环节需审查员确认后才进入下一步 | 全程交互 |
| **0.3 部分协作** | 审查员指定哪些环节协作、哪些自动，如只协作"文档解读"，其余全自动 | 混合模式 |

### 1.3 Coze 平台核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                     Coze.cn 平台                                 │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    主 Bot（Agent）                         │  │
│  │  · 对话入口 · 意图识别 · 场景路由 · 上下文管理            │  │
│  │  · 知识库（审查指南、专利法）                             │  │
│  └──────────┬──────────────────────┬─────────────────────────┘  │
│             │                      │                             │
│  ┌──────────▼──────────┐  ┌───────▼──────────────────────────┐  │
│  │   Workflow（流程）   │  │   Skills（独立能力节点）         │  │
│  │                     │  │                                  │  │
│  │ · 全自动复审流水线   │  │ · opinion-analysis              │  │
│  │ · 分步协作流水线     │  │ · argument-analysis              │  │
│  │ · 部分协作流水线     │  │ · claim-chart                   │  │
│  │                     │  │ · novelty / inventive / defects  │  │
│  │  每个 Workflow       │  │ · reexam-draft / summary        │  │
│  │  由多个 Skill 节点   │  │ · interpret / translate         │  │
│  │  + 条件/代码节点组成  │  │ · classify-documents            │  │
│  │                     │  │ · extract-case-fields            │  │
│  │                     │  │ · extract-search-terms           │  │
│  │                     │  │ · llm-filter-results             │  │
│  │                     │  │ · chat（模块对话）               │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  插件 / 工具                                              │  │
│  │  · 文件读取（PDF/DOCX/TXT）· OCR（如有）                 │  │
│  │  · 变量系统（跨 Skill 数据传递）                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Coze 平台组件职责分配

### 2.1 核心原则

| 原则 | 说明 |
|------|------|
| **Agent 做"对话与路由"** | 意图识别、场景判断、闲聊兜底、上下文记忆——适合 Agent 的 LLM 原生能力 |
| **Workflow 做"流程编排"** | 有明确步骤顺序、有条件分支、需要暂停等待用户输入——适合 Workflow 可视化编排 |
| **Skill 做"原子能力"** | 单一 AI 分析任务（一条 Prompt → 一个结构化输出）——适合 Skill 封装复用 |

### 2.2 职责分配矩阵

| 功能 | Agent | Workflow | Skill | 理由 |
|------|:-----:|:--------:|:-----:|------|
| 场景意图识别（一键直出/每步协作/部分协作） | ✅ | | | 自然语言理解，Agent 原生能力 |
| 自由问答（"量子纠缠是什么"） | ✅ | | | 无结构流程，纯对话 |
| 文档解读（interpret） | ✅ | | ✅ | 自由格式输出 + 追问，Agent 对话模式最适合；但也可封装为 Skill 供 Workflow 调用 |
| 模块对话（chat，各模块追问） | ✅ | | ✅ | 同上 |
| 全自动复审流水线 | | ✅ | | 18 个步骤有严格 DAG 依赖，需编排 |
| 分步协作流水线 | | ✅ | | 每个步骤有 Human-in-the-Loop 检查点 |
| 部分协作流水线 | | ✅ | | 条件分支选择哪些步骤需协作 |
| 审查意见解析（opinion-analysis） | | | ✅ | 单次 AI 调用，明确输入输出 |
| 答辩理由映射（argument-analysis） | | | ✅ | 同上 |
| Claim Chart | | | ✅ | 同上 |
| 新颖性/创造性/缺陷复核 | | | ✅ | 同上 |
| 复审意见草稿（reexam-draft） | | | ✅ | 同上 |
| 文档分类（classify-documents） | | | ✅ | 同上 |
| 案件字段提取（extract-case-fields） | | | ✅ | 同上 |
| AI 辅助检索（两步式：extract-search-terms / llm-filter-results / translate-search-terms） | | | ✅ | 多步骤（提取检索词→用户编辑→翻译→搜索→筛选），建议封装为 Workflow 子流程 |
| 文档翻译（translate） | | | ✅ | 单次 AI 调用 |
| 专利申请简述（summary） | | | ✅ | 单次 AI 调用 |
| OCR / 文本提取 | | | ✅ | 纯工具函数，可封装为 Code 节点或插件 |

---

## 3. 主 Bot 设计

### 3.1 Bot 身份与系统 Prompt（System Prompt）

```
你是一位专利复审 AI 助手，面向中国国家知识产权局的发明专利实质审查员。

你的职责是辅助审查员完成复审流程中的技术事实整理工作，包括：
- 解读专利申请文件、审查意见通知书、意见陈述书
- 解析驳回理由与答辩理由的映射关系
- 生成 Claim Chart（权利要求特征拆解）
- 进行新颖性、创造性、形式缺陷复核
- 生成复审意见草稿

重要约束：
1. 所有 AI 输出为候选事实整理，不构成法律结论，审查员拥有最终判断权。
2. 你不替代审查员的专业判断，你的分析仅供参考。
3. 涉及专利申请文件内容时，注意保密——不将未公开信息透露到对话外部。
4. 回答问题时引用具体的段落、页码或权利要求编号，言之有据。

你可以帮助审查员完成以下场景：
- 【一键直出】：审查员上传全部文件后，自动走完所有复审环节，直接生成复审意见草稿
- 【每步协作】：逐步骤与审查员协作，每完成一步确认后再继续
- 【部分协作】：审查员指定哪些环节需要协作，其余自动完成
- 【自由问答】：审查员随时可以询问专利相关的问题、请求解读某个文档或概念
```

### 3.2 Bot 人设

| 维度 | 设定 |
|------|------|
| 角色 | 资深专利审查员助理 |
| 语气 | 专业、严谨、客观 |
| 交互风格 | 开门见山，结构化呈现，避免冗长的"AI 免责声明"在每条回复中重复 |
| 兜底策略 | 遇到无法处理的问题，明确告知边界，建议审查员自行判断 |

### 3.3 意图识别与路由

Bot 收到用户消息后，按以下优先级路由：

```
用户消息
  │
  ├── 包含文件上传？
  │     ├── 是 → 文件预处理流程
  │     │        ├── 识别文件数量与类型
  │     │        ├── 若为首次上传 → 询问选择场景（0.1/0.2/0.3）
  │     │        └── 若为追加文件 → 更新文件列表，询问下一步
  │     └── 否 → 继续
  │
  ├── 明确的流程指令？
  │     ├── "一键生成"/"全自动"/"全部走完" → 触发 full-auto-reexamination workflow
  │     ├── "逐步来"/"一步一步"/"每步确认" → 触发 step-collaboration workflow
  │     ├── "只做文档解读"/"只做新颖性" → 触发 partial-collaboration workflow
  │     └── 否 → 继续
  │
  ├── 模块相关的专业问题？
  │     ├── 与当前已完成的模块上下文相关 → 调用对应 chat Skill
  │     └── 否 → 继续
  │
  └── 兜底 → Bot 直接用 LLM 能力回答（知识库辅助）
```

### 3.4 上下文管理

Bot 需要维护以下上下文（通过 Coze 变量系统）：

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `caseFiles` | Array\<FileInfo\> | 已上传文件列表（文件名、类型、文本内容摘要） |
| `currentPhase` | String | 当前所处的复审阶段 |
| `sceneMode` | "full-auto" \| "step-collab" \| "partial-collab" \| null | 当前操作场景 |
| `collabSteps` | Array\<String\> | 部分协作场景下指定协作的环节列表 |
| `lastWorkflowOutput` | Object | 最近一次 Workflow/Skill 的输出 |
| `completedSteps` | Array\<String\> | 已完成的步骤列表 |

---

## 4. Workflow 设计

### 4.1 总览

Coze Workflow 承担结构化复审流水线的编排。设计 **3 个 Workflow** 对应三种场景：

| Workflow ID | 场景 | 特点 |
|-------------|------|------|
| `full-auto-reexamination` | 0.1 一键直出 | 无中断，全程自动，最终输出草稿 |
| `step-collaboration` | 0.2 每步协作 | 每步暂停等待用户确认/修改 |
| `partial-collaboration` | 0.3 部分协作 | 条件分支，指定步骤暂停其余自动 |

### 4.2 PDF 章节拆分预处理

专利文件通常是一个**数十页的单一 PDF**，结构如下：

```
┌─────────────────────────────┐
│ 权利要求书、说明书正文       │  ← 前 N-5 页（纯文本，送 mimo-v2.5-pro）
│ · 技术领域 · 背景技术       │
│ · 发明内容 · 具体实施方式   │
│ · 权利要求                 │
├─────────────────────────────┤
│ 说明书附图                   │  ← 最后 ~5 页（图片/图表，送 mimo-v2.5）
│ · 图 1 · 图 2 · 图 3 ...  │
└─────────────────────────────┘
```

#### 预处理链路

**降级说明**：Coze 沙箱环境不支持 Python 直接操作 PDF 二进制文件（页级切割）。采用**双阶段预处理**方案：

```
[插件: TextIn pdf2markdown]  PDF → Markdown
        │
        ▼
[代码节点: md-section-splitter]  Markdown 正则切割 → {{textSection}} / {{figureSection}}
```

#### 阶段 1：TextIn pdf2markdown 插件

使用合合信息（TextIn）的 `pdf2markdown` 插件将 PDF 转换为 Markdown 格式。此插件几乎完整保留原文段落结构，同时处理了表格和图片占位符。

**输入**：用户上传的 PDF 文件
**输出**：Markdown 文本（含图注文字和 `![figure]` 占位符）

#### 阶段 2：Python 代码节点 `md-section-splitter`

对 Markdown 文本执行正则切割，定位"正文区域"和"附图区域"：

```python
import re

def split_markdown(md_text: str) -> dict:
    # 正则定位"说明书附图"或"附图说明"章节头
    figure_header = re.search(
        r'(?:^|\n)#{1,3}\s*(?:说明书\s*)?附图(?:说明)?\s*\n',
        md_text
    )
    
    if figure_header:
        split_point = figure_header.start()
        text_section = md_text[:split_point].strip()
        figure_section = md_text[split_point:].strip()
    else:
        # 启发式：Markdown 末尾图片密度骤增 → 最后 20% 为附图区
        lines = md_text.split('\n')
        total = len(lines)
        last_20pct = lines[int(total * 0.8):]
        img_count = sum(1 for l in last_20pct if l.startswith('!['))
        
        if img_count >= 3:
            split_line = int(total * 0.8)
            text_section = '\n'.join(lines[:split_line])
            figure_section = '\n'.join(lines[split_line:])
        else:
            text_section = md_text
            figure_section = ""
    
    return {
        "textSection": text_section,
        "figureSection": figure_section,
        "hasFigures": bool(figure_section.strip())
    }
```

**输出变量**：

| 输出变量 | 内容 | 用途 |
|---------|------|------|
| `{{textSection}}` | 权利要求书 + 说明书正文（纯 Markdown） | 送入 `mimo-v2.5-pro` Skill |
| `{{figureSection}}` | 说明书附图区域的 Markdown | 用于附图章节定位和图注提取 |
| `{{figureUrls}}` | 附图图片 URL 数组（由 `md-section-splitter` 从 Markdown 中提取 `![figure](url)` 生成） | 送入 `mimo-v2.5` 的 `interpret`/`figure-extract` HTTP 节点，通过 `image_url` 格式传入 |
| `{{originalPdf}}` | 原始 PDF 文件 | **主方案**：直接送入 `mimo-v2.5` 的 `interpret`/`figure-extract` Skill，发挥多模态视觉能力 |
| `{{hasFigures}}` | 是否检测到附图区域 | 条件分支：有附图才触发 `figure-extract` |

#### 附图处理双路径策略

`mimo-v2.5` 是原生多模态模型，可直接理解 PDF 中的图表。因此采用**双路径策略**：

| 路径 | 触发条件 | 输入 | 优势 | 劣势 |
|------|---------|------|------|------|
| **主路径：原始 PDF 直传** | `mimo-v2.5` 可用 | 原始 PDF 文件 | 图表精度最高，发挥视觉能力 | PDF 文件较大时 token 消耗高 |
| **降级路径：Markdown 文本** | `mimo-v2.5` 不可用 | `{{figureSection}}` Markdown | token 消耗低，不依赖视觉能力 | 图片为占位符，丢失视觉信息 |

**主路径工作原理**：
1. 预处理阶段同时输出 `{{originalPdf}}`（原始 PDF）、`{{textSection}}`（Markdown 正文）和 `{{figureUrls}}`（附图 URL 数组）
2. `interpret` Skill 将原始 PDF 直接发送给 `mimo-v2.5`，模型端到端完成文字+图表的理解
3. `figure-extract` Skill 将原始 PDF 发送给 `mimo-v2.5`，模型直接识别图注、组件标注和空间关系

**多模态 HTTP 节点请求体结构**：

Coze 的 HTTP 节点调用 `mimo-v2.5` 时，需使用 `Content-Type: application/json`，将图片 URL 通过 `image_url` 传入。`md-section-splitter` 代码节点提取出的 `figureUrls` 数组中前几张主图按以下格式组装：

```json
{
  "model": "mimo-v2.5",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请结合以下专利说明书文本及提取出的关键附图进行深度解读：\n文本：{{input.textSection}}"
        },
        {
          "type": "image_url",
          "image_url": { "url": "{{input.figureUrls[0]}}" }
        },
        {
          "type": "image_url",
          "image_url": { "url": "{{input.figureUrls[1]}}" }
        }
      ]
    }
  ]
}
```

> **注意**：`content` 为数组格式（非纯字符串），每个元素通过 `type` 字段区分文本和图片。`figureUrls` 取前 N 张主图（建议 N ≤ 5），避免 token 消耗过大。若 `figureUrls` 为空数组，则 content 退化为纯字符串（与 `mimo-v2.5-pro` 的调用方式一致）。

**降级路径工作原理**：
1. 当 `mimo-v2.5` 不可用时，`interpret` 降级为 `mimo-v2.5-pro` + `{{textSection}}` 纯文本解读
2. `figure-extract` 降级为正则匹配 `{{figureSection}}` 中的图注文字，输出结构化的图注列表（无视觉解读）

### 4.3 核心 Workflow：`full-auto-reexamination`

```
START
  │
  ▼
[插件: TextIn pdf2markdown] PDF → Markdown
  │
  ▼
[代码节点: md-section-splitter] Markdown 正则切割正文 vs 附图
  │  ├── {{textSection}}    → 纯文本（送 mimo-v2.5-pro）
  │  ├── {{figureSection}}  → 附图区域 Markdown（降级路径用）
  │  ├── {{originalPdf}}    → 原始 PDF（主路径送 mimo-v2.5）
  │  └── {{hasFigures}}     → 是否检测到附图
  │
  ▼
[代码节点] 收集文件文本、提取 caseId
  │
  ▼
[Skill: classify-documents] 文档分类
  │
  ▼
[Skill: extract-case-fields] 提取案件字段
  │
  ▼
[条件节点] 是否有审查意见通知书？
  ├── 是 → [Skill: opinion-analysis] 审查意见解析
  │          │
  │          ▼
  │        [条件] 是否有意见陈述书？
  │          ├── 是 → [Skill: argument-analysis] 答辩理由映射
  │          └── 否 → 跳过
  │
  └── 否 → 跳过
  │
  ▼
[Skill: claim-chart] 权利要求特征拆解（model: mimo-v2.5-pro）
  │
  ▼
[条件] mimo-v2.5 可用？
  ├── 是 → [Skill: interpret] 文档解读（model: mimo-v2.5, 输入: {{originalPdf}}）
  │          │
  │          ▼
  │        [条件] {{hasFigures}}？
  │          ├── 是 → [Skill: figure-extract] 附图提取（model: mimo-v2.5, 输入: {{originalPdf}}）
  │          └── 否 → 跳过
  │
  └── 否 → [Skill: interpret] 降级纯文本解读（model: mimo-v2.5-pro, 输入: {{textSection}}）
  │
  ▼
  │
  ▼
[条件] 是否有对比文件？
  ├── 是 → [代码节点] 时间轴校验
  │          │
  │          ▼
  │        [循环节点] 对每篇可用对比文件：
  │          ├── [Skill: novelty] 新颖性复核
  │          └── 汇总区别特征
  │          │
  │          ▼
  │        [条件] 是否需要创造性分析？
  │          ├── 是 → [Skill: inventive] 创造性三步法
  │          └── 否 → 跳过
  │
  └── 否 → 跳过
  │
  ▼
[Skill: defects] 缺陷复查（如有权利要求文本）
  │
  ▼
[Skill: reexam-draft] 生成复审意见草稿
  │
  ▼
[代码节点] 格式化输出为 Markdown
  │
  ▼
END（输出完整复审意见草稿 + 各环节结构化数据）
```

### 4.4 核心 Workflow：`step-collaboration`

与 `full-auto-reexamination` 结构相同，但在每个 Skill 节点后插入 **"用户确认节点"**：

```
[Skill: opinion-analysis]
  │
  ▼
[用户确认节点] 
  输出当前结果给用户
  等待用户回复："确认"/"修改 xxx"/"重新生成"
  ├── "确认" → 继续下一个 Skill
  ├── "修改" → 用用户反馈重新调用 Skill
  └── "重新生成" → 重新调用 Skill
```

Coze Workflow 中"暂停等待用户输入"需要通过特定节点实现。若 Coze Workflow 不原生支持暂停，可采用以下替代方案：

**替代方案 A（推荐）：Bot 逐 Skill 调用**
- 不依赖 Workflow 的暂停能力
- Bot 在对话中逐 Skill 调用，每步完成后询问用户
- Bot 维护步骤状态机（通过变量 `completedSteps`）

**替代方案 B：Workflow + 条件变量**
- 使用 Coze Workflow 的条件节点
- 用户通过在对话中设置标志变量来控制流程走向

### 4.5 核心 Workflow：`partial-collaboration`

在 `step-collaboration` 基础上增加条件分支。用户预先指定协作步骤列表。

#### 实现方式：Bot 对话驱动 + 条件 Workflow

由于 Coze Workflow 的条件分支需要在每个 Skill 节点前插入判断，`partial-collaboration` 最佳实现方式是 **Bot 对话驱动**（而非单一 Workflow）：

```
Bot 维护步骤状态机：
  steps = [
    { id: "classify",      skill: "classify-documents",   auto: true },
    { id: "extract-fields", skill: "extract-case-fields",  auto: true },
    { id: "opinion",       skill: "opinion-analysis",     auto: true },
    { id: "argument",      skill: "argument-analysis",    auto: true },
    { id: "interpret",     skill: "interpret",            auto: false },  ← 用户指定协作
    { id: "claim-chart",   skill: "claim-chart",          auto: true },
    { id: "novelty",       skill: "novelty",              auto: false },  ← 用户指定协作
    { id: "inventive",     skill: "inventive",            auto: true },
    { id: "defects",       skill: "defects",              auto: true },
    { id: "draft",         skill: "reexam-draft",         auto: true },
  ]

Bot 执行逻辑：
  for step in steps:
    if step.auto:
      result = callSkill(step.skill, inputs)  # 静默执行
      saveToVariable(step.id, result)
    else:
      showResult(step.id)                      # 展示给用户
      waitUserConfirm()                        # 等待确认/修改/重新生成
```

#### 可协作步骤的推荐默认值

| 步骤 | 推荐默认 | 理由 |
|------|---------|------|
| `interpret` | 可协作 | 审查员可能想追问技术细节 |
| `novelty` | 可协作 | 新颖性判断需要审查员确认 |
| `claim-chart` | 可协作 | 特征拆解直接影响后续分析 |
| `opinion-analysis` | 通常自动 | 驳回理由提取相对客观 |
| `argument-analysis` | 通常自动 | 答辩映射相对客观 |
| `defects` | 通常自动 | 形式缺陷检测标准化程度高 |
| `reexam-draft` | 通常自动 | 最终输出，审查员事后修改 |

### 4.6 子 Workflow：`search-references`（两步式 AI 辅助检索，nf-7）

检索流程拆分为两个独立 Workflow 节点，审查员可在 Step 1 和 Step 2 之间编辑检索词，提高检索精准度。

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1：提取检索词（extract-search-terms）                  │
│                                                             │
│  [代码节点] 收集 claimText + features                        │
│     │                                                       │
│     ▼                                                       │
│  [Skill: extract-search-terms]                               │
│    输入：claimText（截断 4000 字符）、features 列表           │
│    输出：queries[]（3-5 条检索词，每条 2-4 个词）              │
│    模型：mimo-v2.5-pro                                      │
│     │                                                       │
│     ▼                                                       │
│  [代码节点] 后处理过滤                                       │
│    1. 过滤 length < 3 的无效检索词                           │
│    2. 排除 markdown fence（```）和 JSON 开头项               │
│    3. 截断到最多 5 条                                        │
│    4. 若为空 → 使用原始 AI 输出作为兜底                       │
│     │                                                       │
│     ▼                                                       │
│  [用户确认节点] ⏸ 暂停                                       │
│    展示检索词列表，用户可编辑/删除/添加                       │
│    等待用户："确认" / 编辑后的检索词                          │
└─────────────────────────────────────────────────────────────┘
                           │
                    用户确认后
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2：执行搜索 + AI 筛选（search-with-terms）             │
│                                                             │
│  [条件] searchProviderId === "epo" 且含中文？                │
│    ├── 是 → [代码节点: epo-translate-with-fallback]          │
│    │         伪代码：                                        │
│    │         try:                                            │
│    │           translations = callSkill(                     │
│    │             "translate-search-terms",                   │
│    │             {queries: 中文检索词列表}                    │
│    │           )                                             │
│    │           if translations 为空或格式异常:                │
│    │             translations = 中文检索词列表  # 降级       │
│    │         except:                                         │
│    │           translations = 中文检索词列表  # 降级         │
│    │         输出：translations[]（英文或降级中文）           │
│    │         模型：mimo-v2.5-pro                             │
│    └── 否 → 跳过                                             │
│     │                                                       │
│     ▼                                                       │
│  [循环节点] 并行多 Provider 检索                             │
│    对每个已启用的 Search Provider：                           │
│    ├── 构造检索式（用用户确认后的检索词）                      │
│    ├── HTTP 调用检索 API                                     │
│    └── 收集原始结果（合并去重）                                │
│     │                                                       │
│     ▼                                                       │
│  [Skill: llm-filter-results] AI 二次筛选                     │
│    输入：claimText（截断 2000 字符）、原始搜索结果列表          │
│    输出：candidates[]（含 title/publicationNumber/summary/     │
│           relevanceScore/recommendationReason）              │
│    模型：mimo-v2.5-pro                                      │
│    约束：绝不编造文献、公开号必须有据                          │
│     │                                                       │
│     ▼                                                       │
│  [代码节点] 结果裁剪 + 持久化                                 │
│    1. 截断到 maxResults（默认 5，上限 10）                     │
│    2. 写入 search_sessions 表（JSON: terms + providerResults） │
│     │                                                       │
│     ▼                                                       │
│  输出候选文献列表（待用户确认导入为对比文件）                    │
└─────────────────────────────────────────────────────────────┘
```

**两步式关键设计要点**：

| 设计要素 | 实现方式 |
|---------|---------|
| Step 1→2 间隙 | 用户编辑检索词，Workflow 通过 `{{confirmedQueries}}` 变量传递编辑后的结果 |
| EPO 翻译降级 | Python 代码节点 try-except 包裹，翻译失败/空结果/格式异常时直接使用中文检索式（见下方代码） |
| 后处理过滤 | 代码节点执行：`filter(q => q.length >= 3 && !q.startsWith("```") && !q.startsWith("{"))` + `slice(0, 5)` |
| 检索会话持久化 | 每次搜索创建/更新 `search_sessions` 表（见 §7.4.5），用户可回溯历史检索 |
| 并行 Provider | 多 Provider 并行发起（Promise.all 模式），各自结果合并去重 |

**EPO 翻译降级 Python 代码节点（扣子标准入口）**：

扣子（Coze）的 Python 3 节点入口函数必须是 `async def main(args: Args) -> Output:`，输入参数全部在 `args.params` 字典中。以下代码可直接复制到扣子工作流的代码节点中：

```python
import json
import re

def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()

async def main(args: Args) -> Output:
    params = args.params
    # 原始输入的中文检索词
    queries = params.get("queries", [])
    # 翻译 Skill 返回的原始 JSON 字符串或对象
    translate_skill_output = params.get("translate_skill_output", "")

    try:
        # 1. 兼容性解析：处理输入是字符串或已被扣子自动解析为 dict 的情况
        if isinstance(translate_skill_output, str):
            cleaned = strip_code_fences(translate_skill_output)
            result = json.loads(cleaned)
        else:
            result = translate_skill_output

        # 2. 如果返回格式外层包装了大模型的标准 choices 结构，进行解包
        if isinstance(result, dict) and "choices" in result:
            content = result["choices"][0]["message"]["content"]
            cleaned_content = strip_code_fences(content)
            result = json.loads(cleaned_content)

        translations = result.get("translations", [])

        # 3. 严格校验：translations 必须是非空字符串数组
        if (not isinstance(translations, list)
                or len(translations) == 0
                or not all(isinstance(t, str) and len(t.strip()) > 0 for t in translations)):
            # 格式或数据异常 → 触发降级
            return {"translations": queries, "fallback": True, "reason": "empty_or_invalid_format"}

        return {"translations": translations, "fallback": False, "reason": ""}

    except Exception as e:
        # 解析过程中发生任何异常 → 触发安全降级，返回原始中文检索式
        return {"translations": queries, "fallback": True, "reason": f"parse_error: {str(e)}"}
```

> **节点配置**：
> - 此代码节点位于 `translate-search-terms` Skill 之后、并行检索节点之前
> - 输入参数：`queries`（中文检索词数组）、`translate_skill_output`（Skill 原始输出）
> - 输出的 `translations` 数组直接传入后续检索节点
> - `strip_code_fences()` 处理大模型返回的 markdown 围栏格式（```json ... ```）
> - 第 2 步的 `choices` 解包兼容某些 Skill 返回 OpenAI 标准格式的情况
> - 当 `fallback: true` 时，Workflow 可选在日志中记录降级原因供排查

---

## 5. Skill 设计

### 5.1 Skill 清单（22 个）

每个 Skill 对应 `system-specification.md` 中的一个业务模块。详细 Prompt 和 Schema 参考 `docs/system-specification.md` 对应章节。

**与附录 G（18 Skill）的差异说明**：附录 G 按"18 个业务模块 = 18 个 Skill"映射。本架构文档在此基础上做了 4 处拆分：
1. `case-setup`（附录 G）拆分为 `case-setup`（案件创建与编辑）+ `extract-case-fields`（AI 字段提取），因为前者是用户手动操作，后者是独立 AI 调用
2. `references`（附录 G）拆分为 `references`（文献清单管理 + 元数据）+ `references-timeline`（纯函数时间轴校验），因为后者无 LLM 调用
3. `search-references`（附录 G，对应 nf-7）拆分为 `extract-search-terms` + `llm-filter-results` + `translate-search-terms`，实现两步式检索流程

总计 22 个 Skill（18 模块 + 4 处拆分）。

| # | Skill ID | 名称 | 输入 | 输出 | 模型 | 参考章节 |
|---|----------|------|------|------|------|---------|
| 1 | `case-setup` | 案件基线设置 | 申请文件 PDF | 案件基本信息（手动编辑） | —（用户操作） | §3 模块 1 |
| 2 | `document-import` | 文档导入与 OCR | 文件 PDF/DOCX/TXT | 提取文本 + TextIndex | `mimo-v2.5`（OCR） | §4 模块 2 |
| 3 | `classify-documents` | 文档分类 | 文件名列表 + 文本片段 | 每文件 role + confidence | `mimo-v2.5-pro` | §5 模块 3 |
| 4 | `extract-case-fields` | 案件字段提取 | 文件文本 | 申请号、发明名称、权利要求结构 | `mimo-v2.5-pro` | §3 模块 1 |
| 5 | `opinion-analysis` | 审查意见解析 | 通知书文本（≤12000字） | 驳回理由 + 引用文献 | `mimo-v2.5-pro` | §6 模块 4 |
| 6 | `argument-analysis` | 答辩理由映射 | 驳回理由 + 陈述书文本 | 答辩映射 + 权利修改追踪 | `mimo-v2.5-pro` | §7 模块 5 |
| 7 | `interpret` | 文档解读 | 文档文本 + 类型 + 同案文件 + 原始 PDF | 结构化解读（自由文本） | **`mimo-v2.5`** | §8 模块 6 |
| 8 | `figure-extract` | 附图提取 | 原始 PDF + 文档全文 + TextIndex | 图注列表 + 页码范围 + 附图图像 | **`mimo-v2.5`** | §9 模块 7 |
| 9 | `references` | 文献管理 | 对比文件 PDF + 元数据 | 文献清单 + 元数据提取 | `mimo-v2.5-pro` | §10 模块 8 |
| 10 | `references-timeline` | 时间轴校验 | 对比文件公开日 + 基准日 | timelineStatus | —（纯函数） | §10 模块 8 |
| 11 | `claim-chart` | Claim Chart | 权利要求 + 说明书文本 | 特征拆解 + Citation | `mimo-v2.5-pro` | §11 模块 9 |
| 12 | `novelty` | 新颖性复核 | 特征列表 + 对比文件文本 | 逐特征公开状态对照表 | `mimo-v2.5-pro` | §12 模块 10 |
| 13 | `inventive` | 创造性三步法 | 特征列表 + 对比文件摘要 | 三步法分析结果 | `mimo-v2.5-pro` | §13 模块 11 |
| 14 | `defects` | 缺陷复查 | 权利要求 + 说明书文本 | 形式缺陷列表 | `mimo-v2.5-pro` | §14 模块 12 |
| 15 | `reexam-draft` | 复审意见草稿 | 驳回理由 + 答辩映射 + 复核结果 | 逐条回应格式草稿 | `mimo-v2.5-pro` | §15 模块 13 |
| 16 | `summary` | 专利申请简述 | 已确认特征 + 对照结果 | 专利简述 | `mimo-v2.5-pro` | §16 模块 14 |
| 17 | **`extract-search-terms`** | **提取检索词（Step 1）** | 权利要求文本 + 技术特征列表 | 3-5 条检索词 | `mimo-v2.5-pro` | §17 模块 15 |
| 18 | **`llm-filter-results`** | **AI 筛选检索结果（Step 2）** | 权利要求摘要 + 原始搜索结果 | 候选文献列表（含相关度） | `mimo-v2.5-pro` | §17 模块 15 |
| 19 | `translate-search-terms` | EPO 检索词翻译 | 中文检索词列表 | 英文翻译列表 | `mimo-v2.5-pro` | §17 模块 15 |
| 20 | `chat` | 模块对话 | 模块上下文 + 用户消息 | AI 回复 | `mimo-v2.5-pro` | §18 模块 16 |
| 21 | `translate` | 文档翻译 | 外文文档文本 | 中文翻译 | `mimo-v2.5-pro` | §20 模块 18 |
| 22 | `export` | 导出 | 案件全流程数据 | 格式化文档 | — | §19 模块 17 |

> **模型列说明**：`mimo-v2.5-pro` = 推理引擎（无视觉），`mimo-v2.5` = 多模态引擎（含图片/图表/OCR）。标记 `**加粗**` 的两项（`interpret`、`figure-extract`）是唯一必须走多模态模型的 Skill。详细模型选择依据见 §9.2。

### 5.2 Skill 输入输出契约

每个 Skill 遵循统一的输入输出契约，参考 `system-specification.md` 每个模块章节的：

- **输入 Schema**：当前 Skill 需要的结构化数据或文本
- **输出 Schema**（AI 返回的 Zod Schema）：AI 输出的 JSON 结构
- **核心 AI 提示词**：System Prompt + User Prompt 模板

### 5.3 Skill 的 Prompt 结构适配

当前项目使用单条 `role: "user"` message 发送完整 Prompt（System + User 合并）。Coze.cn 的 Skill 支持独立配置 System Prompt 和 User Prompt，建议：

```
Coze Skill 配置：
┌─────────────────────────────┐
│ System Prompt               │
│ （原 system prompt 部分）    │
│ "你是一位资深专利审查员..."  │
├─────────────────────────────┤
│ User Prompt                 │
│ （原 user prompt 模板）      │
│ 包含占位符 {{变量}}          │
│ 案件 ID: {{caseId}}         │
│ 权利要求文本: {{claimText}} │
├─────────────────────────────┤
│ 输出格式                    │
│ JSON Schema（用于校验）      │
└─────────────────────────────┘
```

### 5.4 Skill 依赖链（DAG）

与 `system-specification.md` 附录 G 一致：

```
case-setup
  ├── document-import
  │     ├── classify-documents
  │     │     ├── opinion-analysis
  │     │     │     └── argument-analysis
  │     │     └── (其他模块依赖 classify 的角色识别)
  │     ├── interpret（独立，可随时调用）
  │     ├── figure-extract（独立，可随时调用）
  │     └── translate（独立，可随时调用）
  ├── references
  └── claim-chart
        ├── novelty（需 claim-chart + references）
        │     └── inventive（需 novelty）
        ├── defects（仅需 claim-chart）
        └── extract-search-terms（需 claim-chart 的 features）
              └── [用户编辑检索词]
                    ├── translate-search-terms（条件触发：EPO + 中文检索词）
                    └── llm-filter-results（需用户确认的检索词）

reexam-draft ← opinion-analysis + argument-analysis + novelty + inventive + defects
summary ← claim-chart + novelty + inventive
export ← 所有上游
chat ← 任意模块上下文
```

---

## 6. 三种操作场景的实现路径

### 6.0 场景状态机：workflowState + sceneMode

审查员在豆包端与 Agent 交互时，Agent 通过 Coze 数据库中的 `tb_patent_case` 表的两个字段驱动场景执行：

| 字段 | 类型 | 说明 |
|------|------|------|
| `sceneMode` | `VARCHAR(20)` | 场景模式：`full-auto` / `step-collab` / `partial-collab`。首次上传文件时由用户选择，后续会话从数据库恢复 |
| `workflowState` | `VARCHAR(30)` | 当前工作流状态：`empty` → `documents-uploaded` → `opinion-analyzed` → `argument-mapped` → `claim-chart-ready` → `novelty-ready` → `inventive-ready` → `defects-ready` → `draft-ready` |

**状态机驱动逻辑**：

```
用户发送消息
  │
  ▼
[Agent] 查询 tb_patent_case 获取 sceneMode + workflowState
  │
  ├── sceneMode = 'full-auto'？
  │     └── 是 → Agent 提示词引导一口气调完所有 Workflow 节点
  │              每完成一个 Skill，Agent 更新 workflowState（如 'opinion-analyzed'）
  │              全部完成后输出复审意见草稿
  │
  ├── sceneMode = 'step-collab'？
  │     └── 是 → Agent 根据 workflowState 定位当前步骤
  │              调用当前步骤的 Skill → 更新 workflowState
  │              输出结果 + 带按钮卡片（[确认] [修改] [重新生成]）
  │              用户点击 [确认] → 作为用户消息发送 → Agent 识别后触发下一步
  │
  └── sceneMode = 'partial-collab'？
        └── 是 → Agent 查询 collabSteps 列表
                 当前步骤 ∈ collabSteps → 同 step-collab（暂停协作）
                 当前步骤 ∉ collabSteps → 同 full-auto（自动继续）
```

**workflowState 的值与对应步骤**：

| workflowState 值 | 含义 | 下一步 |
|-----------------|------|--------|
| `empty` | 初始状态 | → `documents-uploaded` |
| `documents-uploaded` | 文件已上传 | → `opinion-analyzed`（执行 opinion-analysis） |
| `opinion-analyzed` | 审查意见已解析 | → `argument-mapped`（执行 argument-analysis） |
| `argument-mapped` | 答辩已映射 | → `claim-chart-ready`（执行 claim-chart） |
| `claim-chart-ready` | Claim Chart 已完成 | → `novelty-ready`（执行 novelty） |
| `novelty-ready` | 新颖性复核已完成 | → `inventive-ready`（执行 inventive） |
| `inventive-ready` | 创造性分析已完成 | → `defects-ready`（执行 defects） |
| `defects-ready` | 缺陷复查已完成 | → `draft-ready`（执行 reexam-draft） |
| `draft-ready` | 复审草稿已生成 | 完成 |

**跨会话恢复**：用户在新会话中说"继续上次的复审"，Agent 查询 `tb_patent_case` 恢复 `workflowState`，从断点继续执行。各步骤的分析结果从 Coze 数据库的对应表中加载（见 §7.4）。

### 6.1 场景 0.1：一键直出

**实现方式：Workflow `full-auto-reexamination`**

```
用户: "我上传了申请文件、审查意见通知书和意见陈述书，帮我全自动生成复审意见草稿"
  │
  ▼
Bot: [识别意图] → 触发 full-auto-reexamination Workflow
  │
  ▼
Workflow: 依次执行 classify-documents → extract-case-fields → opinion-analysis
  → argument-analysis → claim-chart → novelty → inventive → defects → reexam-draft
  │
  ▼
Bot: 输出复审意见草稿 + "以上为 AI 自动生成的复审意见草稿。你可以：
  1. 查看各环节详情（输入'查看 [环节名]'）
  2. 修改某环节内容（输入'修改 [环节名]: [修改内容]'）
  3. 重新生成某环节（输入'重新生成 [环节名]'）"
```

### 6.2 场景 0.2：每步协作

**实现方式：Bot 对话驱动 + 逐 Skill 调用 + 消息卡片按钮**

每步协作的核心挑战是：Agent 如何在展示结果后精确触发下一步？采用**消息卡片按钮 + `/cmd:confirm` 指令**方案。

#### 卡片按钮回传参数设计

每完成一个步骤，Bot 输出结构化结果 + 带按钮的消息卡片。按钮绑定隐藏荷载（Payload），用户点击后向 Agent 发送特定格式指令：

```
[审查意见解析] 已完成。结果如下：
┌─────────────────────────────────────────┐
│ RG-1: 权利要求1相对于D1不具备新颖性      │
│       （专利法§22.2）                    │
│ RG-2: 权利要求2-3相对于D1+D2不具备创造性  │
│       （专利法§22.3）                    │
│ RG-3: 权利要求4不清楚（专利法§26.4）      │
└─────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ [确认无误，进入   │  │ [修改后继续]     │  │ [重新生成]       │
│  答辩理由映射]    │  │                  │  │                  │
│ Payload:         │  │ Payload:         │  │ Payload:         │
│ /cmd:confirm     │  │ /cmd:modify      │  │ /cmd:regenerate  │
│ case_id={{id}}   │  │ case_id={{id}}   │  │ case_id={{id}}   │
│ next_state=      │  │ current_step=    │  │ current_step=    │
│ argument-mapped  │  │ opinion-analyzed │  │ opinion-analyzed │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

#### Agent 的卡片指令识别规则

在 Agent 的 System Prompt 中增加以下强规则：

```markdown
# 卡片指令交互规则

- 如果用户发送的消息中包含 `/cmd:confirm` 前缀：
  1. 解析出参数 `case_id` 和 `next_state`。
  2. 自动调用数据库 SQL 节点，执行：
     UPDATE tb_patent_case SET workflow_state = :next_state WHERE case_id = :case_id;
  3. 状态更新成功后，自动触发对应的下一个工作流节点，不需要用户再次输入。

- 如果用户发送的消息中包含 `/cmd:modify` 前缀：
  1. 解析出参数 `case_id` 和 `current_step`。
  2. 等待用户输入修改内容。
  3. 收到修改内容后，用用户反馈重新调用当前步骤的 Skill。

- 如果用户发送的消息中包含 `/cmd:regenerate` 前缀：
  1. 解析出参数 `case_id` 和 `current_step`。
  2. 重新调用当前步骤的 Skill，生成新的结果。
```

#### workflowState 状态转换与 Skill 映射

| 当前 workflowState | 点击确认后 next_state | 自动触发的 Skill |
|-------------------|---------------------|-----------------|
| `opinion-analyzed` | `argument-mapped` | `argument-analysis` |
| `argument-mapped` | `claim-chart-ready` | `claim-chart` |
| `claim-chart-ready` | `novelty-ready` | `novelty` |
| `novelty-ready` | `inventive-ready` | `inventive` |
| `inventive-ready` | `defects-ready` | `defects` |
| `defects-ready` | `draft-ready` | `reexam-draft` |

#### 完整对话流程示例

```
用户: "我要逐步协作完成复审"
  │
  ▼
Bot: "好的，当前第一步：审查意见解析。
  我已读取你上传的审查意见通知书（文件名：第一次审查意见通知书.pdf）。
  是否开始解析？"

用户: "开始"

Bot: [调用 opinion-analysis Skill]
  → 输出驳回理由清单 + 消息卡片（带 [确认/修改/重新生成] 按钮）

用户: [点击卡片按钮 "确认无误，进入答辩理由映射"]
  │  （实际发送：/cmd:confirm case_id=CN202410123456&next_state=argument-mapped）
  ▼
Bot: [识别 /cmd:confirm 指令]
  → UPDATE tb_patent_case SET workflow_state = 'argument-mapped'
  → 自动触发 argument-analysis Skill
  → 输出答辩映射结果 + 消息卡片
```

### 6.3 场景 0.3：部分协作

**实现方式：Bot 对话驱动 + 步骤状态机**（详见 §4.5）

Bot 维护步骤状态机，根据用户指定的 `collabSteps` 列表决定每个步骤是自动执行还是暂停协作。

```
用户: "我只想在文档解读和新颖性复核环节协作，其他自动完成"

Bot: "明白了。以下环节将自动完成：
  · 文档分类、案件字段提取、审查意见解析、答辩理由映射
  · Claim Chart、创造性分析、缺陷复查、复审意见草稿

  以下环节将与你协作：
  · 文档解读（你可以追问和讨论）
  · 新颖性复核（每篇对比文件的结果需要你确认）

  是否开始？"

用户: "开始"

Bot: [自动执行 classify-documents → extract-case-fields → opinion-analysis → argument-analysis]
  "以上环节已自动完成。现在进入文档解读环节——
  你想先解读哪个文件？申请文件、审查意见通知书还是意见陈述书？"

用户: "申请文件"

Bot: [调用 interpret Skill]
  → 输出申请文件解读
  "以上是申请文件的AI解读。你有什么想问的吗？或者输入'继续'进入新颖性复核。"
```

---

## 7. 数据流与变量系统

### 7.1 变量传递机制

Coze 平台中，Workflow 节点间通过变量传递数据。Skill 的输出变量自动成为下游 Skill/节点的可用输入。

```
[Skill: opinion-analysis]
  输出变量：
    {{rejectionGrounds}}       — Array<RejectionGround>
    {{citedReferences}}        — Array<CitedReference>
    {{opinionRawText}}         — String
         │
         ▼
[Skill: argument-analysis]
  输入变量映射：
    rejectionGrounds = {{rejectionGrounds}}
    responseText = {{responseDocument.text}}
         │
         ▼
  输出变量：
    {{mappings}}               — Array<ArgumentMapping>
    {{unmappedGrounds}}        — Array<String>
```

### 7.2 全局变量（跨 Workflow 持久化）

Coze Workflow 执行结束后，变量不持久化。为支持"查看各环节详情""修改某环节"等回溯需求，Bot 需要将关键输出保存为对话上下文变量：

| 变量名 | 内容 | 来源 |
|--------|------|------|
| `{{opinionResult}}` | 审查意见解析结果 | opinion-analysis Skill |
| `{{argumentResult}}` | 答辩映射结果 | argument-analysis Skill |
| `{{claimChartResult}}` | Claim Chart 结果 | claim-chart Skill |
| `{{noveltyResults}}` | 新颖性复核结果（多文件） | novelty Skill × N |
| `{{inventiveResult}}` | 创造性分析结果 | inventive Skill |
| `{{defectsResult}}` | 缺陷复查结果 | defects Skill |
| `{{draftResult}}` | 复审意见草稿 | reexam-draft Skill |
| `{{interpretResults}}` | 文档解读结果（多文件） | interpret Skill × N |

### 7.3 数据回溯与修改

审查员可以在生成最终草稿后回溯修改：

```
用户: "修改 claim-chart 的特征B描述，应该是'基于深度学习的图像分割模块'"

Bot:
  1. 更新 {{claimChartResult}} 中特征B的 description
  2. 检测到 {{noveltyResults}} 和 {{inventiveResult}} 依赖 claimChart
     → 标记为 stale
  3. 提示用户："特征B已更新。新颖性复核和创造性分析结果可能需要重新生成。
     输入'重新生成新颖性'或'重新生成创造性'来更新。"
```

### 7.4 结构化输出持久化：Zod Schema → Coze 数据库

#### 7.4.1 问题

原系统（B23）中，每个 Skill 的 AI 返回结果由 **Zod Schema** 校验并存储到 IndexedDB。Zod 是 TypeScript 运行时校验库，支持嵌套对象、union types、transform 容错等高级特性。

Coze.cn 平台内置的数据库是**结构化表格数据库**（类 MySQL/SQLite），不支持 Zod 级别的校验逻辑。必须将 Zod 结构降维为 SQL 表或 JSON 文本列。

#### 7.4.2 转换策略

两种策略混合使用，按数据复杂度选择：

| 数据层级 | 策略 | 适用场景 |
|---------|------|---------|
| 简单标量字段 | SQL 列 | 单值字段：title、applicationNumber、claimNumber、category、severity 等 |
| 嵌套数组/对象 | JSON 文本列 | 复杂结构：features[], citations[], mappings[], candidates[] 等 |
| 枚举字段 | SQL VARCHAR + 应用层约束 | confidence（high/medium/low）、citationStatus 等 |
| 时间戳字段 | `VARCHAR(32) NULL` + 代码节点 `datetime.now()` | 扣子内置 DB 不支持 `DEFAULT CURRENT_TIMESTAMP`，统一由 Python 代码节点在 INSERT 时生成 `"%Y-%m-%d %H:%M:%S"` 格式字符串写入 |

#### 7.4.3 转换示例

**示例 1：claim-chart 输出 Schema**

原 Zod Schema（简化）：
```typescript
z.object({
  features: z.array(z.object({
    featureCode: z.string(),
    description: z.string(),
    specificationCitations: z.array(z.object({
      label: z.string(),
      paragraph: z.string(),
      quote: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"])
    })),
    citationStatus: z.enum(["confirmed", "needs-review", "not-found"])
  })),
  warnings: z.array(z.string()),
  legalCaution: z.string()
})
```

Coze 数据库 Schema（SQL）：
```sql
CREATE TABLE claim_chart_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       VARCHAR(64)  NOT NULL,
  claim_number  INTEGER      NOT NULL,
  features      TEXT         NOT NULL,  -- JSON: features 数组，含 citations
  warnings      TEXT,                   -- JSON: string[]
  legal_caution TEXT,
  created_at    VARCHAR(32)  NULL,  -- 扣子内置 DB 不支持 DEFAULT CURRENT_TIMESTAMP，由代码节点 datetime.now() 写入
  updated_at    VARCHAR(32)  NULL
);

-- 查询时反序列化
-- SELECT id, case_id, claim_number,
--        json_extract(features, '$') AS features,
--        json_extract(warnings, '$') AS warnings
-- FROM claim_chart_results WHERE case_id = ?;
```

**Python 代码节点序列化/反序列化**：
```python
import json
from datetime import datetime

# 序列化（Skill 输出 → 数据库写入）
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
features_json = json.dumps(skill_output["features"], ensure_ascii=False)
warnings_json = json.dumps(skill_output["warnings"], ensure_ascii=False)
db.execute(
    "INSERT INTO claim_chart_results (case_id, claim_number, features, warnings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [case_id, claim_number, features_json, warnings_json, now, now]
)

# 反序列化（数据库读取 → 下游 Skill 输入）
row = db.fetchone("SELECT features, warnings FROM claim_chart_results WHERE case_id = ?", [case_id])
features = json.loads(row["features"])  # 还原为 Python list[dict]
```

**示例 2：novelty 输出 Schema**

```sql
CREATE TABLE novelty_results (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id             VARCHAR(64)  NOT NULL,
  claim_number        INTEGER      NOT NULL,
  reference_id        VARCHAR(64)  NOT NULL,   -- 对比文件 ID
  rows                TEXT         NOT NULL,    -- JSON: 逐特征对比行
  difference_features TEXT,                     -- JSON: string[]
  pending_questions   TEXT,                     -- JSON: string[]
  legal_caution       TEXT,
  created_at          VARCHAR(32)  NULL   -- 扣子内置 DB 不支持 DEFAULT CURRENT_TIMESTAMP，由代码节点 datetime.now() 写入
);
```

#### 7.4.4 Zod 容错逻辑的保留

原系统的 Zod union types 和 transform 容错需要在 **Python 代码节点**中手动实现：

| Zod 容错机制 | Coze 等效实现 |
|-------------|-------------|
| `z.union([z.string(), z.number(), z.null()]).transform()` | `str(value) if value is not None else ""` |
| `z.array(...).default([])` | `data.get("field") or []` |
| `z.enum([...]).default("not-analyzed")` | `value if value in valid_set else "not-analyzed"` |
| `quote >= 20` 字符门禁（confidence 降级） | `if len(quote) < 20: confidence = "low"` |

**通用清洗函数模板**：
```python
def safe_parse_ai_output(raw: dict, schema_defaults: dict) -> dict:
    """对 AI 输出做 Zod 级别的容错清洗"""
    result = {}
    for key, default in schema_defaults.items():
        value = raw.get(key)
        if value is None or value == "":
            result[key] = default
        elif isinstance(default, list) and not isinstance(value, list):
            result[key] = [value]  # AI 返回单对象 → 包装为数组
        else:
            result[key] = value
    return result
```

#### 7.4.5 Schema 转换清单

以下是需持久化的核心 Skill 输出及其存储策略：

| Skill | 输出表名 | 嵌套字段（JSON 列） | 标量字段（SQL 列） |
|-------|---------|-------------------|-------------------|
| `classify-documents` | `doc_classifications` | — | doc_id, role, confidence |
| `extract-case-fields` | `case_fields` | claims（JSON） | title, app_number, applicant, app_date |
| `opinion-analysis` | `opinion_results` | rejection_grounds, cited_refs（JSON） | doc_id, raw_text |
| `argument-analysis` | `argument_mappings` | mappings, amended_claims（JSON） | — |
| `claim-chart` | `claim_chart_results` | features, warnings（JSON） | case_id, claim_number |
| `novelty` | `novelty_results` | rows, diff_features（JSON） | case_id, ref_id, claim_number |
| `inventive` | `inventive_results` | motivation_evidence（JSON） | case_id, closest_prior_art, assessment |
| `defects` | `defect_results` | defects, warnings（JSON） | case_id |
| `reexam-draft` | `reexam_drafts` | body, sections, evidence（JSON） | case_id, claim_number |
| `summary` | `summaries` | — | body, ai_notes |
| `search-session` | `search_sessions` | terms, provider_results（JSON） | case_id |

#### 7.4.6 跨会话恢复

Coze 对话上下文在会话结束后释放。为实现跨会话的案件回溯，上述数据库表通过 `case_id` 关联。Bot 在新会话中可通过查询数据库恢复上次分析进度：

```
用户: "继续上次的复审案卷 CN202410123456"

Bot:
  1. SELECT * FROM case_fields WHERE app_number = 'CN202410123456'
  2. 恢复 case_id → 查询各下游表
  3. 展示已完成的环节和可继续的操作
```

---

## 8. Human-in-the-Loop 集成

### 8.1 确认节点设计

根据场景不同，确认节点的行为有差异：

| 场景 | 确认节点行为 | 用户可操作 |
|------|-------------|-----------|
| 一键直出 | 无确认节点 | 只能在全部完成后回溯修改 |
| 每步协作 | 每个 Skill 后暂停 | 确认 / 修改 / 重新生成 / 跳过 |
| 部分协作 | 指定 Skill 后暂停 | 同上 |

### 8.2 确认对话模板

```
Bot: "【{步骤名称}】已完成。结果如下：
{结构化输出}
---
请回复：
· '确认' — 接受结果，继续下一步
· '修改: xxx' — 修改内容
· '重新生成' — 让 AI 重新分析
· '跳过' — 跳过此步骤"
```

### 8.3 Coze 平台实现注意事项

Coze Workflow 目前对"暂停等待用户输入"的支持有限。建议：

1. **优先使用 Bot 对话模式**：Bot 在对话中调用 Skill，每步完成后自然暂停等待用户回复
2. **Workflow 用于全自动场景**：`full-auto-reexamination` 不需要暂停，适合 Workflow
3. **混合模式**：Bot 调用 Workflow（全自动部分），然后在需要协作的步骤由 Bot 单独调用 Skill

---

## 9. Provider 与模型配置

### 9.1 选型：XiaoMi MiMo 双模型策略

选用的 AI 模型为 XiaoMi MiMo 系列，采用**双模型策略**：

| 模型 | 定位 | 核心能力 | 缺失能力 |
|------|------|---------|---------|
| `mimo-v2.5-pro` | 推理引擎 | 极难逻辑推理、长文本一致性（≥128K）、代码级结构化生成；推理能力对标 Claude Opus 4.6 | **无视觉能力**（无法处理图片、图表） |
| `mimo-v2.5` | 多模态引擎 | 原生全模态：图片理解、图表解读、OCR 文字识别 | 推理深度不及 pro 版本 |

**架构影响**：Coze 平台上的每个 Skill 和 Workflow LLM 节点必须根据任务类型选择正确的模型——纯文本分析走 `mimo-v2.5-pro`，涉及图片/图表/OCR 的任务走 `mimo-v2.5`。

### 9.2 Skill × 模型分配矩阵

| Skill | 首选模型 | 原因 |
|-------|---------|------|
| `classify-documents` | `mimo-v2.5-pro` | 纯文本分类，需理解文档结构 |
| `extract-case-fields` | `mimo-v2.5-pro` | 纯文本信息提取 |
| `opinion-analysis` | `mimo-v2.5-pro` | 驳回理由提取，需法律逻辑推理 |
| `argument-analysis` | `mimo-v2.5-pro` | 答辩理由与驳回理由映射，需逻辑对应 |
| `claim-chart` | `mimo-v2.5-pro` | 特征拆解 + Citation 定位，需精确引用 |
| `novelty` | `mimo-v2.5-pro` | 逐特征对比，需逻辑推理 |
| `inventive` | `mimo-v2.5-pro` | 三步法分析，最需要强推理能力 |
| `defects` | `mimo-v2.5-pro` | 形式缺陷检测，纯文本分析 |
| `reexam-draft` | `mimo-v2.5-pro` | 综合多源数据生成草稿，需长上下文 + 强推理 |
| `summary` | `mimo-v2.5-pro` | 文本摘要生成 |
| `translate` | `mimo-v2.5-pro` | 纯文本翻译 |
| `extract-search-terms` | `mimo-v2.5-pro` | 检索词提取，需理解技术特征 |
| `llm-filter-results` | `mimo-v2.5-pro` | 文献筛选与排序，需判断技术相关性 |
| `translate-search-terms` | `mimo-v2.5-pro` | 检索词中→英翻译（EPO 触发） |
| `chat` | `mimo-v2.5-pro` | 对话需跟随上下文逻辑 |
| **`interpret`** | **`mimo-v2.5`** | 文档解读需理解 PDF 中的**图纸/图表**——审查员上传的专利 PDF 包含"说明书附图"，`mimo-v2.5-pro` 无视觉能力无法处理 |
| **`figure-extract`** | **`mimo-v2.5`** | 附图提取**依赖图片/图表视觉理解**，是唯一必须走多模态模型的 Skill |
| `export` | — | 无 AI 调用，纯格式化 |
| `document-import` | `mimo-v2.5`（如启用 OCR） | 若需要从扫描 PDF 中 OCR 提取文字，需多模态能力；若为原生文字层 PDF，可用 `mimo-v2.5-pro` |

### 9.3 混合模型 Workflow 中的模型切换

Bot / Workflow 执行期间，模型选择不是全局唯一的——不同 Skill 节点可能调用不同模型。Coze 平台需要在每个 LLM 节点/Skill 节点独立配置模型：

```
[Skill: interpret]         → model: mimo-v2.5    （多模态：阅读附图）
[Skill: figure-extract]    → model: mimo-v2.5    （多模态：提取图注）
[Skill: claim-chart]       → model: mimo-v2.5-pro （推理：特征拆解）
[Skill: novelty]           → model: mimo-v2.5-pro （推理：逐特征对比）
[Skill: reexam-draft]      → model: mimo-v2.5-pro （推理：综合生成）
```

### 9.4 推理模型 maxTokens 自适应

`mimo-v2.5-pro` 是推理模型，在生成 content 之前会消耗大量 token 做内部思考。原系统（B23）实现了推理模型的 maxTokens 自动 ×4 放大。Coze 平台配置 Skill 节点时需注意：

- `mimo-v2.5-pro` 的 maxTokens 建议设为 **16K–32K**（而非默认 4K），确保推理完成后仍有足够空间输出 structured JSON
- `mimo-v2.5` 为常规模型，maxTokens 保持 4K–8K 即可
- 若 maxTokens 不足，模型返回 `finishReason: "length"` 且 `content` 为空

### 9.5 Fallback 策略

当首选模型不可用（配额耗尽、网络错误）时：

| 失败模型 | Fallback 方案 |
|---------|--------------|
| `mimo-v2.5-pro` 不可用 | 降级到 `mimo-v2.5`（推理质量下降但可完成分析） |
| `mimo-v2.5` 不可用 | `figure-extract` 和 `interpret` 降级为纯文本模式（`mimo-v2.5-pro`），丢失图表理解但保留文字解读 |

Coze 平台层面的 Provider 管理和密钥配置由平台统一管理，不在 Bot/Workflow 内实现多 Provider 路由（与原系统 `registry.ts` 的复杂 fallback 链不同）。

---

## 10. 移植优先级与分阶段路线

### Phase 1：核心对话能力（MVP）

**目标：** Bot 能进行文档解读和自由问答

| 优先级 | 交付物 | 依赖 |
|--------|--------|------|
| P0 | Bot 基础对话 + 知识库 | 无 |
| P0 | `interpret` Skill（文档解读） | 文件上传能力 |
| P1 | `chat` Skill（模块对话） | — |
| P1 | `translate` Skill（文档翻译） | — |

### Phase 2：结构化分析能力

**目标：** Bot 能完成复审核心分析

| 优先级 | 交付物 | 依赖 |
|--------|--------|------|
| P0 | `classify-documents` Skill | 文件上传 |
| P0 | `extract-case-fields` Skill | classify-documents |
| P0 | `opinion-analysis` Skill | classify-documents |
| P1 | `argument-analysis` Skill | opinion-analysis |
| P1 | `claim-chart` Skill | extract-case-fields |
| P2 | `novelty` Skill | claim-chart |
| P2 | `inventive` Skill | claim-chart + novelty |
| P2 | `defects` Skill | claim-chart |

### Phase 3：流水线与端到端

**目标：** 一键直出 + 分步协作

| 优先级 | 交付物 | 依赖 |
|--------|--------|------|
| P0 | `reexam-draft` Skill | 所有上游 Skill |
| P1 | `full-auto-reexamination` Workflow | 全部 Skill |
| P2 | `step-collaboration` Bot 对话流程 | 全部 Skill |
| P3 | `partial-collaboration` Bot 对话流程 | 全部 Skill |
| P3 | `extract-search-terms` Skill | claim-chart |
| P3 | `llm-filter-results` Skill | extract-search-terms + 用户确认 |
| P3 | `summary` Skill | claim-chart + novelty + inventive |

---

## 11. 与原系统的差异与取舍

### 11.1 保留的能力

| 能力 | 状态 |
|------|------|
| 18 个业务模块的 AI Prompt | ✅ 完整迁移到 Skill |
| 结构化输出的 JSON Schema | ✅ 作为 Skill 的输出格式校验 |
| DAG 依赖链 | ✅ Workflow 节点编排体现 |
| 三种操作场景（0.1/0.2/0.3） | ✅ Bot + Workflow 组合实现 |

### 11.2 不再需要的能力（Coze 平台替代）

| 原系统能力 | Coze 平台替代 |
|-----------|-------------|
| Express 后端服务 | Coze 平台托管 |
| Provider Adapter（Kimi/GLM/MiMo/...） | Coze 平台模型管理（统一为 XiaoMi MiMo 双模型，见 §9） |
| API Key 加密存储（keystore.enc） | Coze 平台密钥管理 |
| 多 Provider fallback（registry.ts） | Coze 平台 fallback |
| IndexedDB 持久化 | Coze 对话历史 + 变量存储 |
| React UI（表单/表格/导出） | Coze 对话界面 + Markdown 输出 |
| OCR（Tesseract.js） | 三档降级策略，见下方"扫描件 PDF 处理流程" |
| Mock 演示模式 | Coze 无直接等效，但可配置测试环境 |

### 11.3 需要特别注意的差异

| 差异点 | 说明 | 处理方式 |
|--------|------|---------|
| 混合模型策略 | 原系统支持多 Provider 动态路由；Coze 平台需在 Skill 节点级分别配置模型 | 纯文本 Skill 走 `mimo-v2.5-pro`（推理），图文 Skill 走 `mimo-v2.5`（多模态），见 §9.3 |
| PDF 章节拆分的模型路由 | 原系统对所有模型发送完整文档；MiMo 双模型需要按能力分割内容 | `pdf2markdown` 插件 + `md-section-splitter` 代码节点将专利内容拆为 `{{textSection}}`（送推理模型）和 `{{figureSection}}`（送多模态模型），见 §4.2 |
| PDF 处理的沙箱降级 | 理想方案的 Python PDF 页切割无法在 Coze 沙箱执行 | 降级为 TextIn `pdf2markdown` 插件预处理 + Python 正则切割 Markdown，图片精度从页面级降为 Markdown 占位符级，见 §4.2 |
| 单条 user message vs system+user 分离 | 原系统合并发送，Coze Skill 支持分离 | 按 §5.3 拆分 Prompt |
| 文件持久化 | 原系统有 IndexedDB 案件管理 | Coze 对话上下文作为临时存储；长期需要配套后端 |
| 导出功能 | 原系统支持 HTML/Markdown 导出 | Coze Bot 以 Markdown 格式输出，用户复制 |
| 附图查看 | 原系统可预览 PDF 页面 | Coze 平台限制，不影响核心功能 |
| OCR | 原系统浏览器端 OCR（Tesseract.js） | 三档降级策略，见下方"扫描件 PDF 处理流程" |
| 多文件关联解读 | 原系统支持跨文件上下文 | Coze 对话的上下文窗口可支持 |
| 容错逻辑（union types, transform） | 原系统 Zod schema 的容错 | Coze 输出格式化需复现此容错（见 §11.4） |

#### 扫描件 PDF 处理流程

原系统通过 Tesseract.js 在浏览器端执行 OCR。Coze 平台不支持浏览器端 OCR，采用三档降级策略：

| 档位 | 触发条件 | 处理方式 | 输出质量 |
|------|---------|---------|---------|
| **Tier 1：原生文字层** | PDF 含文字层（TextIn pdf2markdown 可提取） | 直接提取文本 | 高（精确） |
| **Tier 2：多模态 OCR** | PDF 无文字层 + `mimo-v2.5` 可用 | 将 PDF 页面图片发送给 `mimo-v2.5` 做视觉 OCR | 中高（依赖模型能力） |
| **Tier 3：用户预处理** | PDF 无文字层 + `mimo-v2.5` 不可用 | 提示用户上传已 OCR 的 PDF 或粘贴文本 | 取决于用户 |

**Tier 2 实现方式**：
```
[代码节点] 检测 pdf2markdown 输出质量
  │  输出字符数 < 阈值（如 500 字/页）→ 判定为无文字层
  │
  ▼
[Skill: document-import] 将 PDF 页面作为图片发送给 mimo-v2.5
  │  Prompt: "请提取以下专利文档图片中的全部文字内容"
  │  输出: 提取的文本
  │
  ▼
[代码节点] 合并提取文本 → 进入后续流程
```

### 11.4 移植风险点

1. **长上下文处理**：专利申请文件可达 30-100 页（约 50K-150K tokens）。`mimo-v2.5-pro` 支持 ≥128K context window，但需注意 PDF 拆分后的 `{{textSection}}` 仍可能极长。Skill 的 `maxTokens` 配置需参考 system-specification.md 附录 D 的截断限制。

2. **JSON 输出稳定性**：原系统通过 `extractJsonFromText()` 从混合文本中提取 JSON，通过 Zod union types 和 transform 做容错。Coze 平台的"输出格式化"节点需配置相同的容错逻辑，否则可能因格式偏差导致整个 Workflow 中断。

3. **多文件管理的状态持久化**：原系统将案件/文档/分析结果都存储在 IndexedDB 中，跨会话恢复。Coze 对话不天然具备"案件"概念，需要通过变量/知识库/配套后端来实现。

4. **检索 API 调用**：`extract-search-terms` 和 `llm-filter-results` 需要调用外部专利检索 API。Coze 平台的插件机制可支持 HTTP 调用，但需确认 API 可用性（国内网络环境）。

5. **混合模型 Fallback 的编排复杂度**：当 `mimo-v2.5` 不可用时，`figure-extract` 和 `interpret` 需降级为纯文本模式（`mimo-v2.5-pro`），此时附图理解能力丧失，需在 Bot 对话中通知用户结果不完整。Workflow 中需配置条件分支来处理模型切换，增加了编排复杂度。（详见 §9.5）

---

## 附录 A：Skill Prompt 参考

所有 Skill 的完整 Prompt 模板（System + User）参考 `docs/system-specification.md` 对应章节：

| Skill ID | 参考章节 |
|----------|---------|
| `case-setup` | §3 模块 1：案件基线设置 |
| `document-import` | §4 模块 2：文档导入与 OCR |
| `classify-documents` | §5 模块 3：文档分类 |
| `extract-case-fields` | §3 模块 1：案件基线设置（AI 字段提取部分） |
| `opinion-analysis` | §6 模块 4：审查意见解析 |
| `argument-analysis` | §7 模块 5：答辩理由映射 |
| `interpret` | §8 模块 6：文档解读 |
| `figure-extract` | §9 模块 7：附图提取 |
| `references` | §10 模块 8：文献管理与时间轴校验 |
| `references-timeline` | §10 模块 8：纯函数校验逻辑 |
| `claim-chart` | §11 模块 9：Claim Chart |
| `novelty` | §12 模块 10：新颖性复核 |
| `inventive` | §13 模块 11：创造性三步法复核 |
| `defects` | §14 模块 12：缺陷复查 |
| `reexam-draft` | §15 模块 13：复审意见草稿 |
| `summary` | §16 模块 14：专利申请简述 |
| `extract-search-terms` | §17 模块 15：AI 辅助专利检索（Step 1） |
| `llm-filter-results` | §17 模块 15：AI 辅助专利检索（Step 2） |
| `translate-search-terms` | §17 模块 15：EPO 检索词翻译 |
| `chat` | §18 模块 16：模块对话 |
| `translate` | §20 模块 18：文档翻译 |
| `export` | §19 模块 17：导出（纯前端，无 Prompt） |

## 附录 B：Coze Skill/Workflow 命名规范

| 层级 | 命名格式 | 示例 |
|------|---------|------|
| Bot | 中文描述性名称 | "专利复审 AI 助手" |
| Workflow | kebab-case + 前缀 `wf-` | `wf-full-auto-reexamination` |
| Skill | kebab-case（与原 agent ID 一致） | `opinion-analysis`, `claim-chart` |
| 变量 | camelCase | `rejectionGrounds`, `claimChartResult` |
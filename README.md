# 专利复审 AI 助手

> AI 辅助发明专利复审的 Web 工具，v0.1.0

目标用户：发明专利实质审查员。本工具辅助完成审查意见解析、申请人答辩映射、复审事实复核和逐条回应草稿生成，所有 AI 输出为候选事实整理，需审查员确认。

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
| 文档解读 | AI 交互式理解专利文档，支持追问 | `/cases/:id/interpret` |
| Claim Chart | 权利要求特征拆解，生成特征代码表 | `/cases/:id/claim-chart` |
| 新颖性复核 | 结合申请人答辩逐特征复核公开状态，标记区别特征 | `/cases/:id/novelty` |
| 创造性复核 | 最近现有技术→区别特征→技术启示，并回应创造性答辩 | `/cases/:id/inventive` |
| 缺陷复查 | 对比上次审查意见指出的缺陷，标注是否已克服 | `/cases/:id/defects` |
| 复审意见草稿 | 生成逐条回应格式的复审审查意见草稿 | `/cases/:id/draft` |
| 专利简述 | 生成专利申请简述 | `/cases/:id/summary` |
| 导出 | 导出 HTML 或 Markdown 格式审查辅助材料 | `/cases/:id/export` |
| 案件历史 | 查看和加载历史案件 | `/cases` |
| 设置 | 配置 AI Provider 和 Agent 分配 | `/settings` |

---

## 演示模式 vs 真实模式

### 演示模式（默认）

- 所有 AI 调用返回预置 fixture 数据，不联网、不消耗 Token
- 适合了解功能和演示
- 内置 3 个预置案例：G1（LED 散热装置）、G2（电池装置）、G3（传感器装置）

### 真实模式

- 通过 AI Gateway 调用真实大模型 API
- 需在「设置」页面配置至少一个 Provider 的 API Key
- 支持 6 个 Provider：
  - **Gemini**（Google AI Studio）
  - **Kimi**（Moonshot / 月之暗面）
  - **GLM**（智谱）
  - **MiniMax**
  - **MiMo**（小米 Token Plan）
  - **DeepSeek**
- 支持自动 fallback：429 时切换 Provider，5xx 时指数退避重试（最多 2 次）

切换方式：点击顶部模式横幅 → 确认切换 → 系统检查 API Key 是否已配置。

---

## 设置页面（/settings）

### Provider 配置

- 添加/编辑/删除 AI Provider
- 填写 API Key（内存存储，不写入 localStorage，刷新后需重新输入）
- 配置 Base URL 和模型 ID

### Agent 分配

- 将各功能模块（审查意见解析、答辩映射、文档解读、Claim Chart、新颖性复核、创造性复核、复审意见草稿等）分配给不同 Provider
- 设置 Provider 优先级（fallback 顺序）
- 配置 reasoning level 和 max tokens

---

## 导出功能

导出的 HTML/Markdown 文件包含：
- 案件基线信息
- Claim Chart 特征表
- 审查意见解析和答辩映射结果（如有）
- 新颖性复核结果（如有）
- 区别特征候选（如有）
- 待检索问题清单（如有）
- 法律声明：「本文件为复审辅助素材，不构成法律结论」

文件名格式：`{申请号}_{发明名称}_{类型}_{日期}.html`

---

## 项目结构

```
patentExaminator/
├── client/                # 前端（React 18 + Vite 5 + TypeScript）
│   ├── src/
│   │   ├── components/    # 通用组件（FeedbackButtons, ConfirmModal 等）
│   │   ├── features/      # 功能模块（claims, novelty, inventive, export 等）
│   │   ├── lib/           # 工具库（exportHtml, feedbackRepo 等）
│   │   ├── store/         # Zustand 状态管理
│   │   └── agent/         # AI Agent 客户端
│   └── index.html
├── server/                # 后端（Express + AI Gateway）
│   └── src/
│       ├── providers/     # AI Provider 适配器（Kimi, GLM, MiMo 等）
│       ├── routes/        # API 路由（/api/ai/run, /api/settings）
│       └── security/      # API Key 存储、文本脱敏
├── shared/                # 前后端共享
│   ├── src/types/         # TypeScript 类型定义
│   ├── src/fixtures/      # 预置案例数据（G1/G2/G3 + A1-A3 + E1-E3）
│   └── src/prompts/       # AI Prompt 模板
├── tests/
│   ├── unit/              # 单元测试（Vitest）
│   ├── integration/       # 集成测试
│   ├── evaluation/        # 评测集（9 条自动评分）
│   └── e2e/               # E2E 测试（Playwright）
├── PRD.md                 # 产品需求文档
├── DESIGN.md              # 详细设计文档
└── DEVELOPMENT_PLAN.md    # 开发计划与进度追踪
```

---

## 开发命令

```bash
npm run dev              # 同时启动前端 + 后端开发服务器
npm run dev:client       # 仅启动前端（:5173）
npm run dev:server       # 仅启动后端（:3000）

npm run build            # 生产构建
npm start                # 启动生产服务器

npm test                 # 运行单元测试
npm run test:e2e         # 运行 E2E 测试（Playwright）
npm run test:evaluation  # 运行评测集
npm run test:integration # 运行集成测试

npm run typecheck        # TypeScript 类型检查
npm run lint             # ESLint 检查
npm run format           # Prettier 格式化

npm run verify           # 完整验证（typecheck + lint + test + integration + e2e + evaluation）
```

---

## 预置案例

| 案例 | ID | 说明 |
|------|-----|------|
| G1 | g1-led | LED 散热装置（实用新型） |
| G2 | g2-battery | 电池装置 |
| G3 | g3-sensor | 传感器装置 |
| A1 | a1-func-limit | 功能性限定检测 |
| A2 | a2-boundary-date | 边界日期场景 |
| A3 | a3-priority-date | 优先权日选用 |
| E1 | e1-no-ref | 零对比文件 |
| E2 | e2-ocr | OCR 分支触发 |
| E3 | e3-multi-indep | 多独权识别 |

G1-G3 可在演示模式下直接加载；A1-A3/E1-E3 用于评测集自动评分。

---

## 安全说明

- **演示模式**下不发送任何数据到外部
- API Key 仅存储在服务器内存中，不写入磁盘或 localStorage
- 外发确认弹窗：切换到真实模式时会显示 Provider/Model/Token 预估，需手动确认
- 导出文件包含法律声明，明确标注为「审查辅助素材，不构成法律结论」

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18.3 + TypeScript 5.5 |
| 构建工具 | Vite 5.4 |
| 状态管理 | Zustand 4.5 |
| 后端 | Express 4 |
| AI 适配 | OpenAI-compatible 协议 |
| 运行时校验 | Zod 3.23 |
| 单元测试 | Vitest 2.1 |
| E2E 测试 | Playwright 1.47 |
| 代码规范 | ESLint 8 + Prettier 3 |

---

## 文档

| 文档 | 内容 |
|------|------|
| [PRD.md](./PRD.md) | 产品需求文档 |
| [DESIGN.md](./DESIGN.md) | 详细设计文档 |
| [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) | 开发计划与进度追踪（B-008 后以复审流程为当前实现基线） |

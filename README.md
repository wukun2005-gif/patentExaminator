# 专利复审 AI 助手

> AI 辅助发明专利复审的 Web 工具，v0.1.0

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
| 知识库 | 上传法规文件，AI 检索相关法规注入 prompt 减少幻觉 | `/settings` (知识库 tab) |
| 数据同步 | 跨设备数据同步，服务器 SQLite 存储 | `/settings` (同步 tab) |
| 设置 | 配置 AI Provider、Agent 分配、知识库和同步 | `/settings` |

---

## 安全说明

- API Key 仅存储在服务器内存中，不写入磁盘或 localStorage
- 导出文件包含法律声明，明确标注为「审查辅助素材，不构成法律结论」

---

## 知识库（RAG）

设置页面"知识库"tab 支持上传文件，AI 在分析时自动检索相关知识注入 prompt，减少专业问题幻觉。

**支持的输入格式**：PDF, TXT, MD, DOCX, JSON, Excel, CSV, PNG, 在线 URL

**Embedding 模型**：默认使用本地 BGE-large-zh（Transformers.js），也可配置远程 API。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18.3 + TypeScript 5.5 |
| 构建工具 | Vite 5.4 |
| 状态管理 | Zustand 4.5 |
| 后端 | Express 4 |
| AI 适配 | OpenAI-compatible 协议 |
| 知识库 RAG | Transformers.js (BGE-large-zh) + minisearch (BM25) |
| 运行时校验 | Zod 3.23 |
| 单元测试 | Vitest 2.1 |
| E2E 测试 | Playwright 1.47 |
| 代码规范 | ESLint 8 + Prettier 3 |


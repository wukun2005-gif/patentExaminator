/**
 * 一键演示脚本
 *
 * 流程：真实新建一个空案件 → 逐功能演示：先展示操作入口，模拟点击，
 * 再把源案件对应步骤的数据播种进演示案件（server 深拷贝，零外部 API），
 * 让观众看到每项功能的数据如何一步步产生。演示结束自动删除演示案件。
 *
 * 解说词规范（对齐 docStudio）：只描述 App 功能与画面上的操作，
 * 不出现"演示模式 / 不调用外部 API / 数据回放"之类的工程话术。
 */

export interface DemoCtx {
  /** 可取消的延时 */
  wait(ms: number): Promise<void>;
  /** 光标移到屏幕中央并显示旁白 */
  narrate(text: string, holdMs?: number): Promise<void>;
  /** 光标移到指定元素并显示解说（不点击），元素不存在时退化为中央旁白 */
  point(testid: string, text: string, holdMs?: number): Promise<void>;
  /** 光标移到指定元素、显示解说并真实点击 */
  click(testid: string, text?: string, holdMs?: number): Promise<void>;
  /** 只播放点击动画，不触发真实点击（用于会调外部 API 的按钮） */
  fakeClick(testid: string, text?: string, holdMs?: number): Promise<void>;
  /** 在输入框中逐字输入 */
  typeText(testid: string, text: string): Promise<void>;
  /** 清空输入框 */
  clearInput(testid: string): Promise<void>;
  /** 立即填充输入框的值（用于展示"AI 提取后字段自动填入"） */
  fillInput(testid: string, value: string): Promise<void>;
  /** 一次性填满多个输入框（与真实 AI 提取"同时填充全部字段"的行为一致），光标不逐个移动 */
  fillInputs(entries: Array<[testid: string, value: string]>): Promise<void>;
  /** 点击第一个 testid 以指定前缀开头的元素（用于带动态后缀的按钮，如 view-report-*） */
  clickFirst(testidPrefix: string, text?: string, holdMs?: number): Promise<void>;
  /** 等待元素出现，返回是否存在 */
  waitFor(testid: string, timeoutMs?: number): Promise<boolean>;
  /** 查询元素是否存在 */
  has(testid: string): boolean;
  /** 滚动主内容区 */
  scroll(delta: number): void;
  hideCursor(): void;
  showCursor(): void;
  /** 从当前 URL 提取案件 ID */
  getCaseIdFromUrl(): string | null;
  /** 把刚创建的案件标记为演示案件 */
  adoptDemoCase(caseId: string): Promise<void>;
  /** 播种一个步骤的数据并重新加载案件到各 store */
  seedStep(caseId: string, step: string): Promise<void>;
}

/** 预计总时长（用于进度条线性推进） */
export const DEMO_EXPECTED_DURATION_MS = 260_000;

export async function runDemoScript(ctx: DemoCtx): Promise<void> {
  // ── 开场 ─────────────────────────────────────────────
  await ctx.narrate("专利复审 AI 助手 — 复审全流程智能分析工作台", 2600);

  // ── 新建案件 ─────────────────────────────────────────
  await ctx.click("nav-new-case", "从新建一个复审案件开始", 1500);
  await ctx.waitFor("new-case-page", 6000);
  await ctx.click("btn-create-case", "创建复审案件", 800);
  const setupReady = await ctx.waitFor("page-setup", 10000);
  const caseId = ctx.getCaseIdFromUrl();
  if (!setupReady || !caseId) {
    await ctx.narrate("案件创建失败，演示终止", 2500);
    return;
  }
  await ctx.adoptDemoCase(caseId);

  // ── 复审文件导入 ─────────────────────────────────────
  await ctx.point(
    "page-setup",
    "复审文件导入：审查意见通知书、权利要求书、意见陈述书，一站式上传",
    2800
  );
  await ctx.fakeClick("btn-batch-upload", "批量上传 → AI 自动识别文件类型并归类", 1200);
  await ctx.narrate("文件解析与自动分类中…", 1800);
  await ctx.seedStep(caseId, "documents");
  await ctx.point("page-setup", "5 份案件文件已按角色自动归类，含 2 篇对比文件", 2800);
  await ctx.fakeClick("btn-ai-extract", "AI 提取 → 自动识别案件关键信息", 1000);
  await ctx.narrate("AI 提取中…", 1600);
  await ctx.seedStep(caseId, "case-fields");
  // 表单只在挂载时从案件记录同步一次；真实 AI 提取是一次性填满全部字段，
  // 这里同样一次性填入（光标不逐个跳转），与真实交互保持一致
  await ctx.fillInputs([
    ["input-title", "【演示】一种基于相变材料的LED散热模组"],
    ["input-application-number", "202410567890.1"],
    ["input-applicant", "深圳光明科技有限公司"],
    ["input-application-date", "2024-03-15"],
  ]);
  await ctx.point("input-application-number", "发明名称、申请号、申请人、申请日已一次性自动填入", 2800);

  // ── 文档解读 ─────────────────────────────────────────
  await ctx.click("nav-interpret", undefined, 1400);
  if (await ctx.waitFor("interpret-panel", 8000)) {
    await ctx.point("interpret-panel", "文档解读：AI 逐份提炼每份文件的核心内容与争议焦点", 2600);
    if (ctx.has("btn-start-batch-interpret")) {
      await ctx.fakeClick("btn-start-batch-interpret", "开始文档解读", 900);
    }
    await ctx.narrate("AI 解读中…", 1800);
    await ctx.seedStep(caseId, "interpret");
    if (await ctx.waitFor("interpret-combined-summary", 6000)) {
      await ctx.point("interpret-combined-summary", "合并解读：全案焦点一目了然", 3000);
      ctx.scroll(300);
      await ctx.wait(1200);
      ctx.scroll(-300);
    }
  }

  // ── 审查意见对照 ─────────────────────────────────────
  await ctx.click("nav-opinion-comparison", undefined, 1400);
  if (await ctx.waitFor("opinion-comparison-panel", 8000)) {
    await ctx.point(
      "opinion-comparison-panel",
      "审查意见对照：AI 解析通知书中的驳回理由，并映射请求人的答辩理由",
      2800
    );
    if (ctx.has("run-full-analysis")) {
      await ctx.fakeClick("run-full-analysis", "一键全析", 900);
    }
    await ctx.narrate("AI 解析与映射中…", 1800);
    await ctx.seedStep(caseId, "opinion");
    if (await ctx.waitFor("comparison-results", 6000)) {
      await ctx.point("comparison-results", "3 条驳回理由（RG-1/2/3）已逐条映射答辩要点", 3200);
    }
  }

  // ── 文献清单 ─────────────────────────────────────────
  // 先播种 AI 检索会话，页面挂载时自动恢复"检索完成"界面（检索式 + 各引擎结果）
  await ctx.seedStep(caseId, "references");
  await ctx.click("nav-references", undefined, 1400);
  if (await ctx.waitFor("page-references", 8000)) {
    await ctx.point(
      "page-references",
      "文献清单：2 篇对比文献已由 AI 检索召回并确认 — CN203464217U · CN1536656A",
      3200
    );
    if (await ctx.waitFor("reference-search-panel", 5000)) {
      await ctx.point(
        "reference-search-panel",
        "AI 辅助检索：基于权利要求自动生成检索式，多引擎并行召回候选文献",
        3400
      );
      if (ctx.has("search-summary")) {
        await ctx.point("search-summary", "4 条检索式已完成检索，结果按相关度排序、可溯源", 3000);
      }
    }
  }

  // ── 权利要求特征表 ───────────────────────────────────
  await ctx.click("nav-claim-chart", undefined, 1400);
  await ctx.wait(1200);
  await ctx.narrate("权利要求特征表：把权利要求拆解为可比对的技术特征", 2600);
  if (ctx.has("btn-run-claim-chart")) {
    await ctx.fakeClick("btn-run-claim-chart", "生成权利要求特征表", 900);
  }
  await ctx.narrate("AI 拆解中…", 1800);
  await ctx.seedStep(caseId, "claim-chart");
  if (await ctx.waitFor("claim-chart-table", 6000)) {
    await ctx.point("claim-chart-table", "权利要求 1 拆解为 3 个技术特征（A–C），每个特征可追溯引用", 3200);
  }

  // ── 新颖性复核 ───────────────────────────────────────
  await ctx.click("nav-novelty", undefined, 1400);
  await ctx.wait(1200);
  await ctx.narrate("新颖性复核：逐特征与对比文献对照", 2400);
  const noveltyBtn = ["btn-run-novelty-none"].find((t) => ctx.has(t));
  if (noveltyBtn) await ctx.fakeClick(noveltyBtn, "运行新颖性对照", 900);
  await ctx.narrate("对照分析中…", 1800);
  await ctx.seedStep(caseId, "novelty");
  if (await ctx.waitFor("novelty-comparison-table", 6000)) {
    await ctx.point("novelty-comparison-table", "相同特征与区别特征自动标注，支持两篇文献切换", 3000);
  }

  // ── 创造性复核 ───────────────────────────────────────
  await ctx.click("nav-inventive", undefined, 1400);
  if (await ctx.waitFor("inventive-step-panel", 8000)) {
    await ctx.point(
      "inventive-step-panel",
      "创造性复核（三步法）：最接近现有技术 → 区别特征与客观技术问题 → 显而易见性",
      2800
    );
    if (ctx.has("btn-run-inventive")) {
      await ctx.fakeClick("btn-run-inventive", "运行创造性复核", 900);
    }
    await ctx.narrate("三步法分析中…", 1800);
    await ctx.seedStep(caseId, "inventive");
    if (await ctx.waitFor("candidate-assessment", 6000)) {
      await ctx.point("candidate-assessment", "分析结论与证据链完整呈现", 2800);
    }
  }

  // ── 缺陷复查 ─────────────────────────────────────────
  await ctx.click("nav-defects", undefined, 1400);
  if (await ctx.waitFor("defect-panel", 8000)) {
    await ctx.point("defect-panel", "缺陷复查：权利要求清楚 · 支持 · 必要技术特征", 2600);
    if (ctx.has("btn-run-defect-check")) {
      await ctx.fakeClick("btn-run-defect-check", "运行缺陷复查", 900);
    }
    await ctx.narrate("复查中…", 1800);
    await ctx.seedStep(caseId, "defects");
    if (await ctx.waitFor("defect-table", 6000)) {
      await ctx.point("defect-table", "缺陷逐条列出，可确认处理状态", 2800);
    }
  }

  // ── 复审意见草稿 ─────────────────────────────────────
  await ctx.click("nav-draft", undefined, 1400);
  if (await ctx.waitFor("draft-material-panel", 8000)) {
    await ctx.point("draft-material-panel", "复审意见草稿：自动汇总全案分析结论", 2600);
    if (ctx.has("btn-generate-reexam-draft")) {
      await ctx.fakeClick("btn-generate-reexam-draft", "生成复审意见草稿", 900);
    }
    await ctx.narrate("草稿生成中…", 1800);
    await ctx.seedStep(caseId, "draft");
    if (await ctx.waitFor("section-reexam-draft", 6000)) {
      await ctx.point("section-reexam-draft", "草稿含事实认定、理由与结论，附证据引用", 3000);
    }
  }

  // ── 审查意见简述 ─────────────────────────────────────
  await ctx.click("nav-summary", undefined, 1400);
  if (await ctx.waitFor("summary-panel", 8000)) {
    await ctx.point("summary-panel", "审查意见简述：生成面向请求人的意见概述", 2400);
    if (ctx.has("btn-generate-summary")) {
      await ctx.fakeClick("btn-generate-summary", "生成简述", 900);
    }
    await ctx.narrate("生成中…", 1600);
    await ctx.seedStep(caseId, "summary");
    if (await ctx.waitFor("summary-body", 6000)) {
      await ctx.point("summary-body", "简述与草稿联动，支持差异对照", 2600);
    }
  }

  // ── 导出 ─────────────────────────────────────────────
  await ctx.click("nav-export", undefined, 1400);
  if (await ctx.waitFor("export-panel", 8000)) {
    await ctx.point("export-panel", "导出：一键生成完整 HTML 审查报告", 2800);
  }

  // ── 随案 Chat Agent ──────────────────────────────────
  if (await ctx.waitFor("chat-panel", 5000)) {
    const panel = document.querySelector('[data-testid="chat-panel"]');
    if (panel?.className.includes("collapsed")) {
      await ctx.click("chat-toggle", "随案 AI 助手", 1200);
    } else {
      await ctx.point("chat-panel", "随案 AI 助手：针对当前案件随时提问", 2400);
    }
    if (ctx.has("chat-input")) {
      await ctx.typeText("chat-input", "2026年以来中国和美国最新的专利法规有什么更新？");
      await ctx.fakeClick("btn-send-chat", "发送", 700);
      await ctx.clearInput("chat-input");
      await ctx.narrate("AI 检索知识库与网络资料，生成回答中…", 1800);
      await ctx.seedStep(caseId, "chat");
      await ctx.point(
        "chat-messages",
        "回答基于最新法规资料生成，附完整引用清单，来源逐条可追溯",
        4200
      );
    }
  }

  // ── 知识库 ───────────────────────────────────────────
  await ctx.click("nav-settings", "设置 · 知识库", 1600);
  await ctx.waitFor("settings-page", 6000);
  await ctx.click("tab-knowledge", undefined, 1400);
  if (await ctx.waitFor("knowledge-config-panel", 6000)) {
    await ctx.point(
      "knowledge-config-panel",
      "知识库 — 专利法 · 实施细则 · 审查指南 · 司法解释 · 复审无效典型案例",
      3000
    );
    ctx.scroll(500);
    await ctx.narrate("11 部法律法规 · 1967 个知识条目，全部完成向量化", 3000);
    ctx.scroll(500);
    await ctx.narrate("Embedding + Re-ranker 双引擎，AI 分析时自动检索相关法条", 2800);
    ctx.scroll(-1000);
    await ctx.wait(400);
  }

  // ── 运行时指标 ───────────────────────────────────────
  await ctx.click("tab-metrics", "运行时指标", 1600);
  if (await ctx.waitFor("metrics-dashboard", 6000)) {
    await ctx.point(
      "metrics-dashboard",
      "运行时指标 — 每次 AI 调用的耗时 · Token · 成本 · 成功率全量记录",
      3200
    );
    ctx.scroll(450);
    await ctx.narrate("按模型组合对比，选出最优配置", 2600);
    ctx.scroll(-450);
    await ctx.wait(400);
  }

  // ── 离线评估 ─────────────────────────────────────────
  await ctx.click("tab-eval", "离线评估", 1600);
  if (await ctx.waitFor("offline-eval-panel", 6000)) {
    await ctx.point(
      "offline-eval-panel",
      "离线评估 — 18 题 Golden Set 自动评测检索与回答质量",
      3200
    );
    ctx.scroll(600);
    await ctx.narrate("召回率 · MRR · 忠实度 · 正确性，四维量化跟踪", 2400);
    // 查看最近一次评估的报告内容
    await ctx.clickFirst("view-report-", "打开最近一次评估报告", 1800);
    if (await ctx.waitFor("eval-report-detail", 6000)) {
      await ctx.point(
        "eval-report-detail",
        "评估报告：各模型组合的召回率、忠实度、正确性等得分一览",
        3400
      );
    }
    // 查看该次评估的逐例分析
    await ctx.clickFirst("analysis-", "查看评估分析", 1800);
    if (await ctx.waitFor("eval-analysis-detail", 6000)) {
      await ctx.point(
        "eval-analysis-detail",
        "评估分析：四角度诊断 + 逐例得分明细，低分用例自动标红定位",
        3800
      );
    }
    ctx.scroll(-600);
    await ctx.wait(400);
  }

  // ── 尾声 ─────────────────────────────────────────────
  await ctx.narrate(
    "从复审文件导入 → AI 全链路分析 → 复审意见草稿\n知识库 · 随案助手 · 指标评估全程支撑",
    3400
  );
  await ctx.narrate("专利复审 AI 助手", 1800);
}

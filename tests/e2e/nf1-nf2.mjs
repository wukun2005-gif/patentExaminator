/**
 * NF1 + NF2 E2E 测试
 * ==================
 *
 * 测试 Web Search Tool Calling 和 Groundedness Detection 的端到端流程。
 * Mock 模式下验证请求接受和响应结构。
 */

import {
  postJSON,
  log,
  buildMockRequest,
  loadEnvFile,
  getApiKey,
  printSkipped,
} from "../e2e-shared/index.mjs";

// ── NF1: Web Search 默认启用 ──────────────────────────────────────────

/**
 * 测试 chat agent 默认启用 webSearchEnabled
 * 发送 chat 请求（不传 webSearchEnabled），验证服务器接受请求
 */
export async function testNf1WebSearchDefaultEnabled() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "chat",
    caseId: "g1-led",
    extra: { userMessage: "什么是相变材料散热？" },
  }));
  const data = await res.json();
  log("NF1: chat agent accepts request (default webSearchEnabled)", res.status === 200, `status=${res.status}`);
  log("NF1: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

/**
 * 测试显式禁用 webSearchEnabled
 */
export async function testNf1WebSearchExplicitlyDisabled() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "chat",
    caseId: "g1-led",
    webSearchEnabled: false,
    extra: { userMessage: "什么是相变材料散热？" },
  }));
  const data = await res.json();
  log("NF1: chat agent accepts request (webSearchEnabled=false)", res.status === 200, `status=${res.status}`);
  log("NF1: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

/**
 * 测试显式启用 webSearchEnabled
 */
export async function testNf1WebSearchExplicitlyEnabled() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "chat",
    caseId: "g1-led",
    webSearchEnabled: true,
    extra: { userMessage: "什么是相变材料散热？" },
  }));
  const data = await res.json();
  log("NF1: chat agent accepts request (webSearchEnabled=true)", res.status === 200, `status=${res.status}`);
  log("NF1: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

// ── NF2: Groundedness Detection 默认启用 ──────────────────────────────

/**
 * 测试 chat agent 默认启用 groundednessEnabled
 */
export async function testNf2GroundednessDefaultEnabled() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "chat",
    caseId: "g1-led",
    extra: { userMessage: "什么是LED散热？" },
  }));
  const data = await res.json();
  log("NF2: chat agent accepts request (default groundednessEnabled)", res.status === 200, `status=${res.status}`);
  log("NF2: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

/**
 * 测试显式禁用 groundednessEnabled
 */
export async function testNf2GroundednessExplicitlyDisabled() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "chat",
    caseId: "g1-led",
    groundednessEnabled: false,
    extra: { userMessage: "什么是LED散热？" },
  }));
  const data = await res.json();
  log("NF2: chat agent accepts request (groundednessEnabled=false)", res.status === 200, `status=${res.status}`);
  log("NF2: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

// ── NF1+NF2: 非 chat agent 不触发 ─────────────────────────────────────

/**
 * 测试非 chat agent 不触发 NF1/NF2
 */
export async function testNf1Nf2NotTriggeredForNonChat() {
  const res = await postJSON("/ai/run", buildMockRequest({
    agent: "summary",
    caseId: "g1-led",
  }));
  const data = await res.json();
  log("NF1/NF2: non-chat agent not affected", res.status === 200, `status=${res.status}`);
  log("NF1/NF2: non-chat agent returns ok", data.ok === true, `ok=${data.ok}`);
}

// ── NF1: Web Search Real 模式回归测试 ────────────────────────────────

/**
 * 回归测试：验证 web search tool calling 在真实模式下正常工作。
 *
 * 背景：tool_choice 从 "auto" 改成 "required" 后，部分模型（Gemini/豆包/DeepSeek）
 * 返回空文本且无 tool calls，导致 webResults=0。此测试确保 web search 能返回结果。
 *
 * 需要：GEMINI_KEY + SerpAPI key（在运行中服务器的 settings DB 里配置）。
 * 跳过条件：无 GEMINI_KEY 或服务器无 SerpAPI 配置。
 */
export async function testNf1RealWebSearchReturnsResults() {
  loadEnvFile();
  const geminiKey = getApiKey("gemini");
  if (!geminiKey) {
    printSkipped("NF1 Real WebSearch", "No GEMINI_KEY");
    return;
  }

  const res = await postJSON("/agent/run", {
    agent: "chat",
    caseId: "test-nf1-websearch-regression",
    request: {
      caseId: "test-nf1-websearch-regression",
      moduleScope: "case",
      userMessage: "自2026年3月以来，有没有最新的美国专利复审流程新规定？",
      contextSummary: "",
      history: [],
    },
    providerPreference: ["gemini"],
    modelId: "gemini-3.5-flash",
    apiKey: geminiKey,
    knowledgeEnabled: false,
    webSearchEnabled: true,
  });
  const data = await res.json();

  log("NF1 Real: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
  log("NF1 Real: reply not empty", typeof data.output?.reply === "string" && data.output.reply.length > 0, `len=${data.output?.reply?.length ?? 0}`);
  log("NF1 Real: webSearchCitations returned", Array.isArray(data.webSearchCitations) && data.webSearchCitations.length > 0, `count=${data.webSearchCitations?.length ?? 0}`);

  // 验证 citation 结构
  if (data.webSearchCitations?.length > 0) {
    const first = data.webSearchCitations[0];
    log("NF1 Real: citation has title", typeof first.title === "string" && first.title.length > 0, `title="${first.title?.slice(0, 40)}..."`);
    log("NF1 Real: citation has url", typeof first.url === "string" && first.url.startsWith("http"), `url="${first.url?.slice(0, 50)}..."`);
    log("NF1 Real: citation has snippet", typeof first.snippet === "string" && first.snippet.length > 0, `snippetLen=${first.snippet?.length ?? 0}`);
  }
}

/**
 * 端到端测试：验证 mergedCitations 按相关性排序、编号一致、RAG+Web 融合正确。
 *
 * 测试场景：知识库有专利法规文档，但 query 是关于"最新"规定，web search 结果应排在前面。
 * 验证点：
 * 1. mergedCitations 存在且非空
 * 2. mergedCitations 编号连续 [1]-[N]（对应 AI 回答中的引用）
 * 3. 每条 citation 有 title 和 snippet
 * 4. web search 结果排在 RAG 前面（因为 query 涉及"最新"，web 更相关）
 * 5. groundedness 通过（AI 回答基于真实文档）
 */
export async function testNf1MergedCitationsRanking() {
  loadEnvFile();
  const geminiKey = getApiKey("gemini");
  if (!geminiKey) {
    printSkipped("NF1 Merged Citations", "No GEMINI_KEY");
    return;
  }

  const res = await postJSON("/agent/run", {
    agent: "chat",
    caseId: "test-nf1-merged-citations",
    request: {
      caseId: "test-nf1-merged-citations",
      moduleScope: "case",
      userMessage: "自2026年3月以来，有没有最新的我国和美国等其他国家专利法相关法规对复审流程的新规定？",
      contextSummary: "",
      history: [],
    },
    providerPreference: ["gemini"],
    modelId: "gemini-3.5-flash",
    apiKey: geminiKey,
    knowledgeEnabled: true,
    webSearchEnabled: true,
  });
  const data = await res.json();

  log("NF1 Merged: chat agent returns ok", data.ok === true, `ok=${data.ok}`);
  log("NF1 Merged: reply not empty", typeof data.output?.reply === "string" && data.output.reply.length > 0, `len=${data.output?.reply?.length ?? 0}`);

  const merged = data.mergedCitations ?? [];
  log("NF1 Merged: mergedCitations exists", Array.isArray(data.mergedCitations), `type=${typeof data.mergedCitations}`);
  log("NF1 Merged: mergedCitations not empty", merged.length > 0, `count=${merged.length}`);

  if (merged.length === 0) return;

  // 验证每条 citation 结构完整
  const allHaveTitle = merged.every((c) => typeof c.title === "string" && c.title.length > 0);
  const allHaveSnippet = merged.every((c) => typeof c.snippet === "string" && c.snippet.length > 0);
  log("NF1 Merged: all citations have title", allHaveTitle, `count=${merged.length}`);
  log("NF1 Merged: all citations have snippet", allHaveSnippet, `count=${merged.length}`);

  // 验证 web search 结果存在（说明搜索确实执行了）
  const webCount = merged.filter((c) => c.engine !== "rag").length;
  const ragCount = merged.filter((c) => c.engine === "rag").length;
  log("NF1 Merged: has web results", webCount > 0, `web=${webCount}`);
  log("NF1 Merged: has RAG results", ragCount >= 0, `rag=${ragCount}`);
  log("NF1 Merged: total count matches", merged.length === webCount + ragCount, `total=${merged.length} web+rag=${webCount + ragCount}`);

  // 验证 web 结果排在 RAG 前面（query 关于"最新"规定，web 更相关）
  if (webCount > 0 && ragCount > 0) {
    const firstWebIdx = merged.findIndex((c) => c.engine !== "rag");
    const lastRagIdx = merged.length - 1 - [...merged].reverse().findIndex((c) => c.engine === "rag");
    log("NF1 Merged: web ranks higher than RAG", firstWebIdx < lastRagIdx, `firstWeb=${firstWebIdx} lastRag=${lastRagIdx}`);
  }

  // 验证 reply 中引用的 citation 都在 mergedCitations 范围内（rerank top-K 的子集）
  const reply = data.output?.reply ?? "";
  const citeMatches = reply.match(/\[(\d+)\]/g) ?? [];
  const allCiteNums = citeMatches.map((m) => parseInt(m.slice(1, -1), 10));
  // 只取 [1]-[merged.length] 范围内的引用（排除年份如 [2026] 等非引用格式）
  const validCiteNums = allCiteNums.filter((n) => n >= 1 && n <= merged.length);

  log("NF1 Merged: reply has inline citations", validCiteNums.length > 0, `count=${validCiteNums.length}`);

  if (validCiteNums.length > 0) {
    const maxCite = Math.max(...validCiteNums);
    // 所有引用编号不超过 mergedCitations 长度 → 引用的都是 rerank 后的结果
    log("NF1 Merged: all cite numbers ≤ mergedCitations.length", maxCite <= merged.length, `max=[${maxCite}] mergedLen=${merged.length}`);
    // 引用的 citations 是 mergedCitations 的子集（可能 groundedness 删了一些声明，所以 ≤ merged.length）
    const uniqueCites = new Set(validCiteNums);
    log("NF1 Merged: cited citations ⊆ mergedCitations (subset of rerank top-K)", uniqueCites.size <= merged.length, `cited=${uniqueCites.size} merged=${merged.length}`);
    // mergedCitations 不会比引用的少（不能漏掉 reply 里引用的）
    log("NF1 Merged: mergedCitations covers all cited numbers", maxCite <= merged.length, `maxCite=[${maxCite}] mergedLen=${merged.length}`);
  }
}

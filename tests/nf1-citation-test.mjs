#!/usr/bin/env node
/**
 * NF1 Citation Test - 验证 AI 回答是否包含引用编号
 *
 * 测试目标：
 * 1. Web search 强制执行
 * 2. AI 回答包含 [1] [2] 等引用编号
 * 3. Citations 正确返回
 */

import { postJSON } from "./e2e-shared/http.mjs";
import { getApiKey, loadEnvFile } from "./e2e-shared/env.mjs";
import { log, assert } from "./e2e-shared/test-runner.mjs";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { startIsolatedServer } from "./e2e-shared/server-lifecycle.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, "logs");
mkdirSync(logsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

// 测试配置
const TEST_CONFIG = {
  caseId: `citation-test-${Date.now()}`,
  weakModel: "gemini-3.1-flash-lite-preview",
  providerPreference: ["gemini"],
  timeoutMs: 120000,
};

// 构建请求
function buildRequest(modelId) {
  return {
    agent: "chat",
    caseId: TEST_CONFIG.caseId,
    request: {
      userMessage: "自2026年3月以来，美国专利商标局（USPTO）有哪些关于专利复审的新规定？",
      history: [],
      moduleScope: "检索",
      contextSummary: "",
    },
    providerPreference: TEST_CONFIG.providerPreference,
    modelId: modelId,
    webSearchEnabled: true,
    knowledgeEnabled: false,
    apiKey: getApiKey("gemini"),
  };
}

// 测试: Web search 执行 + Citations 返回 + 引用编号
async function testWebSearchWithCitations(baseUrl) {
  const req = buildRequest(TEST_CONFIG.weakModel);

  log(`\n=== 测试 Web Search + Citations ===`);
  log(`模型: ${req.modelId}`);
  log(`WebSearch: ${req.webSearchEnabled}`);

  const startTime = Date.now();
  const resp = await postJSON("/agent/run", req, baseUrl, TEST_CONFIG.timeoutMs);
  const elapsed = Date.now() - startTime;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const result = await resp.json();
  log(`\n响应结果:`);
  log(`  - ok: ${result.ok}`);
  log(`  - elapsed: ${elapsed}ms`);

  // 检查 webSearchCitations
  const webCitations = result.webSearchCitations || [];
  log(`  - webSearchCitations: ${webCitations.length} 个`);

  // 检查 mergedCitations
  const mergedCitations = result.mergedCitations || [];
  log(`  - mergedCitations: ${mergedCitations.length} 个`);

  // 检查 AI 回答
  const answer = typeof result.output === "string"
    ? result.output
    : (result.output?.reply || result.outputJson?.answer || "");
  log(`\nAI 回答长度: ${answer?.length || 0} 字符`);

  // 检查是否有引用编号
  const answerStr = String(answer || "");
  const citationMatches = answerStr.match(/\[\d+\]/g) || [];
  const uniqueCitations = [...new Set(citationMatches)];
  log(`引用编号: ${uniqueCitations.join(", ") || "无"}`);

  // 保存完整日志
  const logFile = join(logsDir, `citation-test-${timestamp}.log`);
  const logContent = [
    `=== Citation Test ===`,
    `Time: ${new Date().toISOString()}`,
    `Model: ${req.modelId}`,
    `WebSearch: ${req.webSearchEnabled}`,
    ``,
    `=== Response ===`,
    `ok: ${result.ok}`,
    `elapsed: ${elapsed}ms`,
    `webSearchCitations: ${webCitations.length}`,
    `mergedCitations: ${mergedCitations.length}`,
    ``,
    `=== AI Answer ===`,
    answerStr,
    ``,
    `=== Citations Found ===`,
    `Numbers: ${uniqueCitations.join(", ") || "none"}`,
    `Count: ${uniqueCitations.length}`,
    ``,
    `=== Web Search Citations ===`,
    ...webCitations.map((c, i) => `[${i + 1}] ${c.title}: ${c.snippet?.slice(0, 100)}`),
    ``,
    `=== Merged Citations ===`,
    ...mergedCitations.map((c, i) => `[${i + 1}] ${c.title}: ${c.snippet?.slice(0, 100)}`),
  ].join("\n");

  writeFileSync(logFile, logContent);
  log(`\n日志已保存: ${logFile}`);

  // 断言
  assert(result.ok === true, "请求成功");
  assert(webCitations.length > 0, `有 web search citations (实际: ${webCitations.length})`);
  assert(mergedCitations.length > 0, `有 merged citations (实际: ${mergedCitations.length})`);
  assert(uniqueCitations.length > 0, `AI 回答包含引用编号 (实际: ${uniqueCitations.length} 个)`);

  return { success: true, citations: uniqueCitations.length };
}

// 主测试流程
async function main() {
  loadEnvFile();
  log("=== NF1 Citation Test ===");
  log(`测试时间: ${new Date().toISOString()}`);
  log(`弱模型: ${TEST_CONFIG.weakModel}`);
  log("");

  let serverHandle;
  try {
    // 启动隔离服务器
    log("启动隔离服务器...");
    serverHandle = await startIsolatedServer();
    const baseUrl = serverHandle.baseUrl;
    log(`服务器就绪: ${baseUrl}`);

    // 运行测试
    log("\n--- 开始测试 ---");
    const result = await testWebSearchWithCitations(baseUrl);

    log("\n=== 测试总结 ===");
    if (result.success) {
      log("✓ 测试通过");
      log(`  - Web search 执行: 是`);
      log(`  - Citations 返回: 是`);
      log(`  - AI 回答包含引用: ${result.citations} 个`);
    } else {
      log("✗ 测试失败");
      process.exit(1);
    }
  } catch (err) {
    log(`\n✗ 测试异常: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    if (serverHandle?.cleanup) {
      log("\n清理服务器...");
      await serverHandle.cleanup();
    }
  }
}

main();

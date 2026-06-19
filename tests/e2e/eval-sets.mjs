/**
 * Eval Set CRUD E2E 测试 (nf5-2 Phase 1)
 * =======================================
 *
 * 测试 Eval Set 管理的完整流程：
 * 1. 创建 eval set（从 questions 数组）
 * 2. 列出 eval sets
 * 3. 查看 eval set 详情
 * 4. 重命名 eval set
 * 5. 删除 eval set
 * 6. 从 JSON 文件导入 eval set
 *
 * 不需要 API Key（纯 CRUD 操作）
 */

import { postJSON, getJSON, log, getTestBase } from "../e2e-shared/index.mjs";

// ── Sample questions for testing ───────────────────────────

const SAMPLE_QUESTIONS = [
  {
    id: "q-e2e-1",
    agent: "chat",
    query: "什么是专利法第二十二条规定的创造性？",
    expectedAnswer: "创造性是指与现有技术相比...",
    expectedSources: ["专利法_2020修正.txt"],
    expectedArticles: ["专利法第二十二条"],
    category: "创造性",
    difficulty: "medium",
    generatedBy: "mimo",
    sourceType: "kb_only",
    expectedSource: "kb",
    sourceRoutingRationale: "答案来自知识库",
    mustIncludeFacts: ["创造性定义", "突出的实质性特点", "显著的进步"],
    verifiedBy: "auto",
  },
  {
    id: "q-e2e-2",
    agent: "chat",
    query: "专利申请的优先权日如何确定？",
    expectedAnswer: "优先权日是指...",
    expectedSources: ["专利法_2020修正.txt"],
    expectedArticles: ["专利法第二十九条"],
    category: "新颖性",
    difficulty: "hard",
    generatedBy: "gemini",
    sourceType: "web_only",
    expectedSource: "web",
    sourceRoutingRationale: "答案来自 web 搜索",
    mustIncludeFacts: ["优先权日定义", "12个月期限"],
    verifiedBy: "auto",
  },
];

// ── Tests ──────────────────────────────────────────────────

/**
 * 创建 eval set
 */
export async function testEvalSetCreate() {
  const res = await postJSON("/metrics/eval-sets", {
    name: "E2E Test Set",
    questions: SAMPLE_QUESTIONS,
  });
  const data = await res.json();
  const ok = res.ok && data.id && data.questionCount === 2;
  log("EvalSet: Create", ok, ok ? `id=${data.id}, count=${data.questionCount}` : JSON.stringify(data));
  return ok ? data.id : null;
}

/**
 * 列出 eval sets
 */
export async function testEvalSetList() {
  const res = await getJSON("/metrics/eval-sets");
  const data = await res.json();
  const ok = res.ok && Array.isArray(data) && data.length > 0;
  log("EvalSet: List", ok, ok ? `count=${data.length}` : JSON.stringify(data));
  return ok ? data : null;
}

/**
 * 查看 eval set 详情
 */
export async function testEvalSetDetail(setId) {
  if (!setId) {
    log("EvalSet: Detail", true, "skipped (no set ID)");
    return null;
  }
  const res = await getJSON(`/metrics/eval-sets/${setId}`);
  const data = await res.json();
  const ok = res.ok && data.id === setId && Array.isArray(data.questions) && data.questions.length === 2;
  log("EvalSet: Detail", ok, ok ? `id=${data.id}, questions=${data.questions.length}` : JSON.stringify(data));
  return ok ? data : null;
}

/**
 * 重命名 eval set
 */
export async function testEvalSetRename(setId) {
  if (!setId) {
    log("EvalSet: Rename", true, "skipped (no set ID)");
    return false;
  }
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval-sets/${setId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Renamed Set" }),
  });
  const data = await res.json();
  const ok = res.ok && data.ok === true;
  log("EvalSet: Rename", ok, ok ? "renamed to 'E2E Renamed Set'" : JSON.stringify(data));
  return ok;
}

/**
 * 验证重命名生效
 */
export async function testEvalSetRenameVerify(setId) {
  if (!setId) {
    log("EvalSet: Rename Verify", true, "skipped (no set ID)");
    return false;
  }
  const res = await getJSON(`/metrics/eval-sets/${setId}`);
  const data = await res.json();
  const ok = res.ok && data.name === "E2E Renamed Set";
  log("EvalSet: Rename Verify", ok, ok ? `name=${data.name}` : JSON.stringify(data));
  return ok;
}

/**
 * 删除 eval set
 */
export async function testEvalSetDelete(setId) {
  if (!setId) {
    log("EvalSet: Delete", true, "skipped (no set ID)");
    return false;
  }
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval-sets/${setId}`, { method: "DELETE" });
  const data = await res.json();
  const ok = res.ok && data.ok === true;
  log("EvalSet: Delete", ok, ok ? "deleted" : JSON.stringify(data));
  return ok;
}

/**
 * 验证删除生效
 */
export async function testEvalSetDeleteVerify(setId) {
  if (!setId) {
    log("EvalSet: Delete Verify", true, "skipped (no set ID)");
    return false;
  }
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval-sets/${setId}`);
  const ok = res.status === 404;
  log("EvalSet: Delete Verify", ok, ok ? "404 as expected" : `unexpected status ${res.status}`);
  return ok;
}

/**
 * 从 JSON 导入 eval set
 */
export async function testEvalSetImport() {
  const res = await postJSON("/metrics/eval-sets/import", {
    name: "Imported Set",
    questions: SAMPLE_QUESTIONS,
  });
  const data = await res.json();
  const ok = res.ok && data.id && data.count === 2;
  log("EvalSet: Import", ok, ok ? `id=${data.id}, count=${data.count}` : JSON.stringify(data));
  return ok ? data.id : null;
}

/**
 * 清理导入的 eval set
 */
export async function testEvalSetImportCleanup(setId) {
  if (!setId) return;
  const base = getTestBase();
  await fetch(`${base}/metrics/eval-sets/${setId}`, { method: "DELETE" });
  log("EvalSet: Import Cleanup", true, `deleted ${setId}`);
}

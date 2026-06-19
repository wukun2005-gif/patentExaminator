/**
 * Metrics Phase 3 E2E 测试 (nf5-2)
 * ==================================
 *
 * 测试 Phase 3 新增功能：
 * 1. Generator 模型选择（generatorProviderId / generatorModel）
 * 2. Judge 模型选择（judgeConfigs）
 * 3. Eval Set 选择（evalSetId）
 * 4. 比较不同 Run 的 Metrics（GET /metrics/eval/compare）
 * 5. 详细分析报告（GET /metrics/eval/reports/:id/analysis）
 *
 * 参数验证测试不需要 API Key；完整流程测试需要 Key + golden set 数据。
 */

import { postJSON, getJSON, log, getTestBase } from "../e2e-shared/index.mjs";

// ── 参数验证测试（不需要 API Key）────────────────────────────

/**
 * 测试 compare 端点：缺少 runIds 参数返回 400
 */
export async function testCompareMissingRunIds() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/compare`);
  const data = await res.json().catch(() => ({}));
  const ok = res.status === 400 && data.error;
  log("Phase3: Compare missing runIds → 400", ok, ok ? data.error : `status=${res.status}`);
  return ok;
}

/**
 * 测试 compare 端点：只有 1 个 runId 返回 400
 */
export async function testCompareSingleRunId() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/compare?runIds=fake-id-1`);
  const data = await res.json().catch(() => ({}));
  const ok = res.status === 400 && data.error;
  log("Phase3: Compare single runId → 400", ok, ok ? data.error : `status=${res.status}`);
  return ok;
}

/**
 * 测试 compare 端点：不存在的 runId 返回 404
 */
export async function testCompareNonexistentRunIds() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/compare?runIds=nonexistent-1,nonexistent-2`);
  const data = await res.json().catch(() => ({}));
  const ok = res.status === 404 && data.error;
  log("Phase3: Compare nonexistent IDs → 404", ok, ok ? data.error : `status=${res.status}`);
  return ok;
}

/**
 * 测试 analysis 端点：不存在的报告返回 404
 */
export async function testAnalysisNonexistentReport() {
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/reports/nonexistent-id/analysis`);
  const data = await res.json().catch(() => ({}));
  const ok = res.status === 404 && data.error;
  log("Phase3: Analysis nonexistent report → 404", ok, ok ? data.error : `status=${res.status}`);
  return ok;
}

/**
 * 测试 golden-set/generate 端点接受 generatorProviderId 参数
 * （不实际生成，只验证参数不会导致 500）
 */
export async function testGenerateAcceptsProviderParams() {
  // 传一个不存在的 providerId，应该返回 400（未找到 provider），而不是 500
  const res = await postJSON("/metrics/golden-set/generate", {
    generatorProviderId: "nonexistent-provider",
    generatorModel: "test-model",
    questionCount: 5,
  });
  const data = await res.json().catch(() => ({}));
  // 应该是 400（provider 未配置）而不是 500（服务端错误）
  const ok = res.status === 400 && data.error;
  log("Phase3: Generate accepts providerParams → 400", ok, ok ? data.error : `status=${res.status}`);
  return ok;
}

/**
 * 测试 eval/run-async 端点接受 judgeConfigs 和 evalSetId 参数
 */
export async function testEvalAcceptsJudgeConfigs() {
  const res = await postJSON("/metrics/eval/run-async", {
    configs: [{ label: "test", providerId: "test", modelId: "test-model" }],
    judgeConfigs: [
      { providerId: "mimo", modelId: "mimo-v2.5" },
      { providerId: "volcengine", modelId: "doubao-seed-1.6" },
    ],
    evalSetId: "nonexistent-set",
  });
  const data = await res.json().catch(() => ({}));
  // 应该返回 taskId（异步任务）而不是 500
  const ok = res.ok && data.taskId;
  log("Phase3: Eval accepts judgeConfigs + evalSetId", ok, ok ? `taskId=${data.taskId}` : `status=${res.status} ${JSON.stringify(data)}`);
  return ok ? data.taskId : null;
}

/**
 * 测试 eval/run 端点接受 judgeConfigs 参数（同步模式）
 */
export async function testSyncEvalAcceptsJudgeConfigs() {
  const res = await postJSON("/metrics/eval/run", {
    configs: [{ label: "test", providerId: "test", modelId: "test-model" }],
    judgeConfigs: [
      { providerId: "mimo", modelId: "mimo-v2.5" },
    ],
    evalSetId: "nonexistent-set",
  });
  const data = await res.json().catch(() => ({}));
  // 同步模式：evalSetId 不存在时 golden set 为空，应该返回空结果或错误
  // 关键是不应该 500
  const ok = res.status < 500;
  log("Phase3: Sync eval accepts judgeConfigs", ok, ok ? `status=${res.status}` : `status=${res.status}`);
  return ok;
}

// ── 完整流程测试（需要 API Key + golden set 数据）────────────

/**
 * 从已有报告中测试 compare 端点
 * 需要至少 2 个已存在的报告
 */
export async function testCompareWithRealReports() {
  // 先获取已有报告列表
  const reportsRes = await getJSON("/metrics/eval/reports");
  const reports = await reportsRes.json().catch(() => []);

  if (!Array.isArray(reports) || reports.length < 2) {
    log("Phase3: Compare with real reports", true, `skipped (only ${reports?.length ?? 0} reports, need ≥2)`);
    return true;
  }

  const ids = reports.slice(0, 2).map(r => r.runId);
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/compare?runIds=${ids.join(",")}`);
  const data = await res.json().catch(() => ({}));

  const ok = res.ok
    && Array.isArray(data.runs)
    && data.runs.length === 2
    && data.runs[0].runId
    && data.runs[0].configs
    && data.runs[0].timestamp;
  log("Phase3: Compare with real reports", ok, ok ? `${data.runs.length} runs compared` : `status=${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return ok;
}

/**
 * 从已有报告中测试 analysis 端点
 * 需要至少 1 个已存在的报告
 */
export async function testAnalysisWithRealReport() {
  const reportsRes = await getJSON("/metrics/eval/reports");
  const reports = await reportsRes.json().catch(() => []);

  if (!Array.isArray(reports) || reports.length === 0) {
    log("Phase3: Analysis with real report", true, "skipped (no reports)");
    return true;
  }

  const reportId = reports[0].runId;
  const base = getTestBase();
  const res = await fetch(`${base}/metrics/eval/reports/${reportId}/analysis`);
  const data = await res.json().catch(() => ({}));

  const ok = res.ok
    && data.runId === reportId
    && data.breakdowns
    && Array.isArray(data.breakdowns.byCategory)
    && Array.isArray(data.breakdowns.bySourceType)
    && Array.isArray(data.breakdowns.byDifficulty);

  if (ok && data.breakdowns.byCategory.length > 0) {
    const first = data.breakdowns.byCategory[0];
    const hasFields = first.dimension !== undefined
      && typeof first.count === "number"
      && typeof first.avgRecall === "number"
      && typeof first.avgFaithfulness === "number";
    log("Phase3: Analysis with real report", hasFields, hasFields
      ? `${data.breakdowns.byCategory.length} categories, ${data.breakdowns.bySourceType.length} sourceTypes, ${data.breakdowns.byDifficulty.length} difficulties`
      : `missing fields in breakdown: ${JSON.stringify(first)}`);
    return hasFields;
  }

  log("Phase3: Analysis with real report", ok, ok ? "empty breakdowns" : `status=${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return ok;
}

/**
 * 清理：取消 Phase 3 测试产生的异步任务
 */
export async function testPhase3Cleanup() {
  const res = await getJSON("/metrics/tasks");
  const tasks = await res.json().catch(() => []);
  for (const task of (tasks || [])) {
    if (task.status === "running") {
      const endpoint = task.type === "generate"
        ? `/metrics/eval-sets/generate-task/${task.id}/cancel`
        : `/metrics/eval/tasks/${task.id}/cancel`;
      await postJSON(endpoint, {}).catch(() => {});
    }
  }
  log("Phase3: Cleanup", true, "done");
}

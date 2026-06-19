/**
 * E2E tests for async task endpoints (nf5-2 Phase 2)
 *
 * Tests: async generate, progress polling, cancel, async eval, notifications
 */
import { postJSON, getJSON, log } from "../e2e-shared/index.mjs";

// ── Test: Generate task returns taskId ──────────────────

export async function testAsyncGenerateReturnsTaskId() {
  const res = await postJSON("/metrics/eval-sets/generate", {
    name: "E2E Async Test Set",
  });
  const data = await res.json();
  const ok = res.ok && data.taskId && typeof data.taskId === "string";
  log("AsyncTask: Generate returns taskId", ok, ok ? `taskId=${data.taskId}` : JSON.stringify(data));
  return ok ? data.taskId : null;
}

// ── Test: Progress endpoint returns task status ──────────

export async function testAsyncGenerateProgress(taskId) {
  if (!taskId) {
    log("AsyncTask: Generate Progress", true, "skipped (no taskId)");
    return null;
  }
  const res = await getJSON(`/metrics/eval-sets/generate-task/${taskId}/progress`);
  const data = await res.json();
  const ok = res.ok
    && data.id === taskId
    && ["running", "completed", "cancelled", "error"].includes(data.status)
    && data.progress !== undefined
    && typeof data.progress.percent === "number";
  log("AsyncTask: Generate Progress", ok, ok ? `status=${data.status}, percent=${data.progress.percent}` : JSON.stringify(data));
  return ok ? data : null;
}

// ── Test: Cancel running task ────────────────────────────

export async function testAsyncCancelGenerate() {
  // 创建一个新任务
  const createRes = await postJSON("/metrics/eval-sets/generate", {
    name: "E2E Cancel Test Set",
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.taskId) {
    log("AsyncTask: Cancel Generate", false, `create failed: ${JSON.stringify(createData)}`);
    return null;
  }
  const taskId = createData.taskId;

  // 等一小段时间确保任务启动
  await new Promise((r) => setTimeout(r, 300));

  // 取消任务（注意：任务可能已经完成/失败，cancel 可能返回 404）
  const cancelRes = await postJSON(`/metrics/eval-sets/generate-task/${taskId}/cancel`, {});
  const cancelData = await cancelRes.json();

  // 如果 cancel 成功，验证状态变为 cancelled
  // 如果任务已经完成/失败，cancel 返回 404 也是正常的
  if (cancelRes.ok) {
    await new Promise((r) => setTimeout(r, 300));
    const progressRes = await getJSON(`/metrics/eval-sets/generate-task/${taskId}/progress`);
    const progressData = await progressRes.json();
    const ok = progressData.status === "cancelled";
    log("AsyncTask: Cancel Generate", ok, ok ? "cancelled" : `unexpected status: ${progressData.status}`);
    return ok;
  } else {
    // 任务可能已经终态
    const progressRes = await getJSON(`/metrics/eval-sets/generate-task/${taskId}/progress`);
    const progressData = await progressRes.json();
    const ok = progressData.status !== "running";
    log("AsyncTask: Cancel Generate", ok, `task already ${progressData.status} (cancel returned 404, which is OK)`);
    return ok;
  }
}

// ── Test: Async eval returns taskId ──────────────────────

export async function testAsyncEvalReturnsTaskId() {
  const res = await postJSON("/metrics/eval/run-async", {
    configs: [{ label: "test-config", providerId: "test", modelId: "test-model" }],
  });
  const data = await res.json();
  const ok = res.ok && data.taskId && typeof data.taskId === "string";
  log("AsyncTask: Eval returns taskId", ok, ok ? `taskId=${data.taskId}` : JSON.stringify(data));
  return ok ? data.taskId : null;
}

// ── Test: Eval progress endpoint ─────────────────────────

export async function testAsyncEvalProgress(taskId) {
  if (!taskId) {
    log("AsyncTask: Eval Progress", true, "skipped (no taskId)");
    return null;
  }
  const res = await getJSON(`/metrics/eval/tasks/${taskId}/progress`);
  const data = await res.json();
  const ok = res.ok
    && data.id === taskId
    && ["running", "completed", "cancelled", "error"].includes(data.status);
  log("AsyncTask: Eval Progress", ok, ok ? `status=${data.status}` : JSON.stringify(data));
  return ok ? data : null;
}

// ── Test: Cancel eval task ───────────────────────────────

export async function testAsyncCancelEval(taskId) {
  if (!taskId) {
    log("AsyncTask: Cancel Eval", true, "skipped (no taskId)");
    return null;
  }
  const cancelRes = await postJSON(`/metrics/eval/tasks/${taskId}/cancel`, {});
  const cancelData = await cancelRes.json();

  if (cancelRes.ok) {
    await new Promise((r) => setTimeout(r, 300));
    const progressRes = await getJSON(`/metrics/eval/tasks/${taskId}/progress`);
    const progressData = await progressRes.json();
    const ok = progressData.status === "cancelled";
    log("AsyncTask: Cancel Eval", ok, ok ? "cancelled" : `unexpected status: ${progressData.status}`);
    return ok;
  } else {
    // 任务可能已经终态
    const progressRes = await getJSON(`/metrics/eval/tasks/${taskId}/progress`);
    const progressData = await progressRes.json();
    const ok = progressData.status !== "running";
    log("AsyncTask: Cancel Eval", ok, `task already ${progressData.status} (cancel returned 404, which is OK)`);
    return ok;
  }
}

// ── Test: Tasks list endpoint ────────────────────────────

export async function testAsyncTasksList() {
  const res = await getJSON("/metrics/tasks");
  const tasks = await res.json();
  const ok = res.ok && Array.isArray(tasks);
  log("AsyncTask: Tasks List", ok, ok ? `count=${tasks.length}` : JSON.stringify(tasks));
  return ok ? tasks : null;
}

// ── Test: Notifications SSE stream ───────────────────────

export async function testAsyncNotificationsSSE() {
  try {
    const { getTestBase } = await import("../e2e-shared/env.mjs");
    const base = getTestBase();
    const url = `${base}/notifications/stream`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      const ok = res.ok && res.headers.get("content-type")?.includes("text/event-stream");
      log("AsyncTask: SSE Stream", ok, ok ? "connected" : `status=${res.status}, ct=${res.headers.get("content-type")}`);
      return ok;
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  } catch (err) {
    log("AsyncTask: SSE Stream", false, err.message);
    return false;
  }
}

// ── Cleanup: 取消所有剩余任务 ────────────────────────────

export async function testAsyncCleanup() {
  const res = await getJSON("/metrics/tasks");
  const tasks = await res.json();
  for (const task of (tasks || [])) {
    if (task.status === "running") {
      const endpoint = task.type === "generate"
        ? `/metrics/eval-sets/generate-task/${task.id}/cancel`
        : `/metrics/eval/tasks/${task.id}/cancel`;
      await postJSON(endpoint, {}).catch(() => {});
    }
  }
  log("AsyncTask: Cleanup", true, "done");
}

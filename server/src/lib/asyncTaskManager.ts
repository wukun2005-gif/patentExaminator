/**
 * AsyncTaskManager — 内存异步任务管理器
 *
 * 管理长时间运行的任务（eval set 生成、离线评估），
 * 支持进度跟踪、取消（AbortController）、任务生命周期管理。
 *
 * 任务存在内存中，服务重启后清空（eval 结果已持久化到 DB）。
 */
import { logger } from "./logger.js";

// ── Types ──────────────────────────────────────────────

export type TaskType = "generate" | "evaluate";
export type TaskStatus = "running" | "completed" | "cancelled" | "error";

export interface TaskProgress {
  current: number;
  total: number;
  phase: string;       // 当前阶段描述，如 "生成第 3/21 题"
  percent: number;     // 0-100
}

export interface AsyncTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: TaskProgress;
  result?: unknown;
  error?: string;
  startedAt: string;
  updatedAt: string;
  /** 关联的 eval set ID（generate 任务） */
  evalSetId?: string;
}

/** 传递给执行函数的上下文 */
export interface TaskContext {
  taskId: string;
  signal: AbortSignal;
  /** 更新进度（current 会自动 +1，也可手动设置） */
  updateProgress: (phase: string, current?: number, total?: number) => void;
  /** 标记完成 */
  complete: (result: unknown) => void;
  /** 标记失败 */
  fail: (error: string) => void;
}

// ── Manager ────────────────────────────────────────────

const tasks = new Map<string, AsyncTask>();
const controllers = new Map<string, AbortController>();

/** 生成 datetime-based 任务 ID */
function makeTaskId(type: TaskType): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${type}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 获取当前本地时间 ISO 字符串 */
function localISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offset) / 60));
  const offM = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${offH}:${offM}`;
}

/**
 * 创建并启动一个异步任务。
 *
 * @param type - 任务类型
 * @param fn - 执行函数，接收 TaskContext，内部可通过 ctx 更新进度/完成/失败
 * @param evalSetId - 关联的 eval set ID（可选）
 * @returns taskId
 */
export function createTask(
  type: TaskType,
  fn: (ctx: TaskContext) => Promise<void>,
  evalSetId?: string,
): string {
  const taskId = makeTaskId(type);
  const controller = new AbortController();
  controllers.set(taskId, controller);

  const now = localISO();
  const task: AsyncTask = {
    id: taskId,
    type,
    status: "running",
    progress: { current: 0, total: 0, phase: "初始化", percent: 0 },
    startedAt: now,
    updatedAt: now,
    ...(evalSetId !== undefined ? { evalSetId } : {}),
  };
  tasks.set(taskId, task);

  logger.info(`[AsyncTask] Created ${type} task: ${taskId}${evalSetId ? ` (evalSet=${evalSetId})` : ""}`);

  // 异步执行（不 await，fire-and-forget）
  const ctx: TaskContext = {
    taskId,
    signal: controller.signal,
    updateProgress: (phase, current, total) => {
      const t = tasks.get(taskId);
      if (!t) return;
      if (current !== undefined) t.progress.current = current;
      if (total !== undefined) t.progress.total = total;
      t.progress.phase = phase;
      t.progress.percent = t.progress.total > 0
        ? Math.round((t.progress.current / t.progress.total) * 100)
        : 0;
      t.updatedAt = localISO();
    },
    complete: (result) => {
      const t = tasks.get(taskId);
      if (!t || t.status !== "running") return;
      t.status = "completed";
      t.progress.percent = 100;
      t.result = result;
      t.updatedAt = localISO();
      logger.info(`[AsyncTask] Completed: ${taskId}`);
      // 通知（Phase 2.4: notificationManager 集成）
      notifyListeners(taskId, t);
    },
    fail: (error) => {
      const t = tasks.get(taskId);
      if (!t || t.status !== "running") return;
      t.status = "error";
      t.error = error;
      t.updatedAt = localISO();
      logger.error(`[AsyncTask] Failed: ${taskId} — ${error}`);
      notifyListeners(taskId, t);
    },
  };

  // 监听取消信号
  controller.signal.addEventListener("abort", () => {
    const t = tasks.get(taskId);
    if (!t || t.status !== "running") return;
    t.status = "cancelled";
    t.updatedAt = localISO();
    logger.info(`[AsyncTask] Cancelled: ${taskId}`);
    notifyListeners(taskId, t);
  });

  // 启动执行
  fn(ctx).catch((err) => {
    ctx.fail(err instanceof Error ? err.message : String(err));
  }).finally(() => {
    controllers.delete(taskId);
  });

  return taskId;
}

/** 取消任务 */
export function cancelTask(taskId: string): boolean {
  const controller = controllers.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** 获取任务状态 */
export function getTask(taskId: string): AsyncTask | undefined {
  return tasks.get(taskId);
}

/** 列出所有任务（最近的在前） */
export function listTasks(type?: TaskType): AsyncTask[] {
  const all = Array.from(tasks.values());
  const filtered = type ? all.filter(t => t.type === type) : all;
  return filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** 清理已完成/取消/失败的任务（保留最近 N 个） */
export function cleanupTasks(maxKeep = 50): number {
  const sorted = Array.from(tasks.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let removed = 0;
  for (let i = maxKeep; i < sorted.length; i++) {
    const t = sorted[i];
    if (t && t.status !== "running") {
      tasks.delete(t.id);
      removed++;
    }
  }
  return removed;
}

// ── Notification listeners ─────────────────────────────

type TaskListener = (taskId: string, task: AsyncTask) => void;
const listeners = new Set<TaskListener>();

/** 注册任务状态变更监听器（用于 SSE 推送通知） */
export function onTaskEvent(listener: TaskListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyListeners(taskId: string, task: AsyncTask) {
  for (const listener of listeners) {
    try {
      listener(taskId, task);
    } catch (e) {
      logger.warn(`[AsyncTask] Listener error: ${e}`);
    }
  }
}

/** 重置所有任务（测试用） */
export function resetTasksForTesting(): void {
  for (const c of controllers.values()) c.abort();
  tasks.clear();
  controllers.clear();
  listeners.clear();
}

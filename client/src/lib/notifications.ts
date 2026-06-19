/**
 * Notifications SSE Client
 *
 * 订阅 /api/notifications/stream 接收异步任务完成/失败/取消通知。
 * 浏览器支持 EventSource 时用 SSE，否则回退到轮询。
 */

export interface TaskNotification {
  type: "task-completed" | "task-error" | "task-cancelled";
  taskId: string;
  taskType: "generate" | "evaluate";
  status: string;
  progress: { current: number; total: number; phase: string; percent: number };
  result?: unknown;
  error?: string;
  evalSetId?: string;
  updatedAt: string;
}

export type NotificationHandler = (notification: TaskNotification) => void;

const handlers = new Set<NotificationHandler>();
let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let active = false;

/** 注册通知回调 */
export function onNotification(handler: NotificationHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** 启动通知连接 */
export function connectNotifications(): void {
  if (active) return;
  active = true;

  if (typeof EventSource !== "undefined") {
    connectSSE();
  } else {
    startPolling();
  }
}

/** 断开通知连接 */
export function disconnectNotifications(): void {
  active = false;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function emit(data: TaskNotification) {
  for (const handler of handlers) {
    handler(data);
  }
}

// ── SSE 模式（支持 EventSource 的浏览器） ──

function connectSSE(): void {
  eventSource = new EventSource("/api/notifications/stream");

  for (const eventType of ["task-completed", "task-error", "task-cancelled"]) {
    eventSource.addEventListener(eventType, (event: MessageEvent) => {
      try {
        emit(JSON.parse(event.data) as TaskNotification);
      } catch {}
    });
  }

  // 浏览器原生自动重连；如果连接永久断开（readyState === CLOSED），降级为轮询
  eventSource.onerror = () => {
    if (!active) return;
    if (eventSource?.readyState === EventSource.CLOSED) {
      eventSource.close();
      eventSource = null;
      startPolling();
    }
  };
}

// ── 轮询降级（老旧浏览器或 SSE 永久断开） ──

const POLL_INTERVAL_MS = 3000;

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!active) return;
    try {
      const res = await fetch("/api/metrics/tasks");
      if (!res.ok) return;
      const data = await res.json();
      const tasks = data.tasks as Array<{
        id: string;
        type: string;
        status: string;
        progress: TaskNotification["progress"];
        result?: unknown;
        error?: string;
        evalSetId?: string;
        updatedAt: string;
      }>;
      for (const t of tasks) {
        if (t.status === "completed" || t.status === "error" || t.status === "cancelled") {
          const base = {
            type: (t.status === "completed"
              ? "task-completed"
              : t.status === "cancelled"
                ? "task-cancelled"
                : "task-error") as TaskNotification["type"],
            taskId: t.id,
            taskType: t.type as "generate" | "evaluate",
            status: t.status,
            progress: t.progress,
            updatedAt: t.updatedAt,
          };
          emit({
            ...base,
            ...(t.result !== undefined ? { result: t.result } : {}),
            ...(t.error !== undefined ? { error: t.error } : {}),
            ...(t.evalSetId !== undefined ? { evalSetId: t.evalSetId } : {}),
          });
        }
      }
    } catch {}
  }, POLL_INTERVAL_MS);
}

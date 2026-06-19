/**
 * Notifications SSE Endpoint
 *
 * 提供 Server-Sent Events 推送，当异步任务完成/失败/取消时通知客户端。
 *
 * 协议：
 * - 每个 SSE event 的 data 是 JSON 字符串
 * - event 类型: task-completed, task-error, task-cancelled
 * - 客户端通过 GET /api/notifications/stream 订阅
 */
import { Router, type Request, type Response } from "express";
import { onTaskEvent } from "../lib/asyncTaskManager.js";
import { logger } from "../lib/logger.js";

export const notificationsRouter = Router();

// GET /api/notifications/stream
// SSE 端点：客户端订阅任务状态变更通知
notificationsRouter.get("/notifications/stream", (req: Request, res: Response) => {
  // 设置 SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",  // 禁用 nginx 缓冲
  });

  // 发送初始连接确认
  res.write("data: {\"type\":\"connected\"}\n\n");

  // 心跳：每 30 秒发送一次，防止连接被代理/负载均衡器断开
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30_000);

  // 监听任务状态变更
  const unsubscribe = onTaskEvent((_taskId, task) => {
    // 只推送终态任务（completed/error/cancelled）
    if (task.status === "running") return;

    const eventType = `task-${task.status}`;
    const data = JSON.stringify({
      type: eventType,
      taskId: task.id,
      taskType: task.type,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      evalSetId: task.evalSetId,
      updatedAt: task.updatedAt,
    });

    res.write(`event: ${eventType}\ndata: ${data}\n\n`);
  });

  // 客户端断开连接时清理
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.debug("[SSE] Client disconnected from notifications stream");
  });
});

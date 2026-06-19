/**
 * Unit tests for AsyncTaskManager
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  cancelTask,
  getTask,
  listTasks,
  resetTasksForTesting,
  onTaskEvent,
  type AsyncTask,
} from "../../server/src/lib/asyncTaskManager.js";

describe("AsyncTaskManager", () => {
  beforeEach(() => {
    resetTasksForTesting();
  });

  it("createTask creates a running task", async () => {
    let resolveFn: () => void;
    const blocker = new Promise<void>((r) => { resolveFn = r; });

    const taskId = createTask("generate", async (ctx) => {
      await blocker;
      ctx.complete({ count: 5 });
    });

    expect(taskId).toBeTruthy();
    const task = getTask(taskId);
    expect(task).toBeDefined();
    expect(task!.status).toBe("running");
    expect(task!.type).toBe("generate");

    // 清理
    resolveFn!();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("task completes with result", async () => {
    const taskId = createTask("evaluate", async (ctx) => {
      ctx.updateProgress("处理中", 1, 3);
      ctx.complete({ runId: "test-run" });
    });

    await new Promise((r) => setTimeout(r, 50));

    const task = getTask(taskId);
    expect(task!.status).toBe("completed");
    expect(task!.progress.percent).toBe(100);
    expect(task!.result).toEqual({ runId: "test-run" });
  });

  it("task fails with error", async () => {
    const taskId = createTask("generate", async (ctx) => {
      ctx.fail("Provider 不可用");
    });

    await new Promise((r) => setTimeout(r, 50));

    const task = getTask(taskId);
    expect(task!.status).toBe("error");
    expect(task!.error).toBe("Provider 不可用");
  });

  it("cancelTask aborts a running task", async () => {
    const taskId = createTask("generate", async (ctx) => {
      // 模拟长时间任务
      await new Promise((resolve, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
        setTimeout(resolve, 10_000);
      });
    });

    await new Promise((r) => setTimeout(r, 20));
    const ok = cancelTask(taskId);
    expect(ok).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    const task = getTask(taskId);
    expect(task!.status).toBe("cancelled");
  });

  it("cancelTask returns false for non-existent task", () => {
    expect(cancelTask("non-existent")).toBe(false);
  });

  it("updateProgress updates task progress", async () => {
    let resolveFn: () => void;
    const blocker = new Promise<void>((r) => { resolveFn = r; });

    const taskId = createTask("generate", async (ctx) => {
      ctx.updateProgress("第 1 题", 1, 10);
      ctx.updateProgress("第 5 题", 5, 10);
      await blocker;
      ctx.complete({});
    });

    await new Promise((r) => setTimeout(r, 50));

    const task = getTask(taskId);
    expect(task!.progress.current).toBe(5);
    expect(task!.progress.total).toBe(10);
    expect(task!.progress.phase).toBe("第 5 题");
    expect(task!.progress.percent).toBe(50);

    // 完成后 percent 变为 100
    resolveFn!();
    await new Promise((r) => setTimeout(r, 50));
    expect(getTask(taskId)!.progress.percent).toBe(100);
  });

  it("listTasks filters by type", async () => {
    createTask("generate", async (ctx) => ctx.complete({}));
    createTask("evaluate", async (ctx) => ctx.complete({}));
    createTask("generate", async (ctx) => ctx.complete({}));

    await new Promise((r) => setTimeout(r, 50));

    expect(listTasks().length).toBe(3);
    expect(listTasks("generate").length).toBe(2);
    expect(listTasks("evaluate").length).toBe(1);
  });

  it("onTaskEvent fires on task completion", async () => {
    const events: AsyncTask[] = [];
    const unsub = onTaskEvent((_id, task) => events.push({ ...task }));

    const _taskId = createTask("generate", async (ctx) => {
      ctx.complete({ count: 10 });
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(events.length).toBe(1);
    expect(events[0]!.status).toBe("completed");
    expect(events[0]!.result).toEqual({ count: 10 });

    unsub();
  });

  it("onTaskEvent fires on task error", async () => {
    const events: AsyncTask[] = [];
    const unsub = onTaskEvent((_id, task) => events.push({ ...task }));

    createTask("evaluate", async (ctx) => {
      ctx.fail("API 超时");
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(events.length).toBe(1);
    expect(events[0]!.status).toBe("error");
    expect(events[0]!.error).toBe("API 超时");

    unsub();
  });

  it("unhandled rejection in fn auto-fails task", async () => {
    const taskId = createTask("generate", async () => {
      throw new Error("unexpected crash");
    });

    await new Promise((r) => setTimeout(r, 100));

    const task = getTask(taskId);
    expect(task!.status).toBe("error");
    expect(task!.error).toBe("unexpected crash");
  });
});

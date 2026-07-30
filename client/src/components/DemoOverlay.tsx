import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { installDemoGuard, uninstallDemoGuard } from "../demo/demoGuard";
import {
  runDemoScript,
  DEMO_EXPECTED_DURATION_MS,
  type DemoCtx,
} from "../demo/demoScript";
import { loadCaseById } from "../lib/caseLoader";
import { createLogger } from "../lib/logger";

const log = createLogger("DemoOverlay");

interface DemoOverlayProps {
  onStop: () => void;
}

const CURSOR_MOVE_MS = 650;

/** 光标安全边距：保证光标与解说气泡始终完整落在视口内（不被视口边缘/浏览器边框裁切） */
const CURSOR_MARGIN_X = 24;
const CURSOR_MARGIN_TOP = 110;
const CURSOR_MARGIN_BOTTOM = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function findByTestId(testid: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

/** 用原生 setter 写 React 受控输入框并触发 input 事件 */
function setNativeInputValue(el: HTMLElement, value: string): void {
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function DemoOverlay({ onStop }: DemoOverlayProps) {
  const [cursor, setCursor] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [cursorVisible, setCursorVisible] = useState(true);
  const [clicking, setClicking] = useState(false);
  const [tooltip, setTooltip] = useState("");
  const [progress, setProgress] = useState(0);

  const cancelledRef = useRef(false);
  const stoppedRef = useRef(false);
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const startTimeRef = useRef(Date.now());
  const stopRef = useRef<() => void>(() => {});
  /** 演示过程中新建的演示案件 ID（结束时删除） */
  const demoCaseIdRef = useRef<string | null>(null);

  // ── 可取消延时 ────────────────────────────────────────
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const id = setTimeout(() => {
        timeoutIdsRef.current.delete(id);
        if (cancelledRef.current) reject(new Error("demo-cancelled"));
        else resolve();
      }, ms);
      timeoutIdsRef.current.add(id);
    });

  // ── 进度条 ───────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.min(1, elapsed / DEMO_EXPECTED_DURATION_MS));
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // ── 光标移动 ─────────────────────────────────────────
  const moveCursorTo = async (x: number, y: number, text?: string): Promise<void> => {
    setCursor({ x, y });
    if (text !== undefined) setTooltip(text);
    await wait(CURSOR_MOVE_MS);
  };

  /** 移动光标到元素中心（坐标钳制在视口安全区内） */
  const moveToEl = async (el: HTMLElement, text?: string): Promise<void> => {
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    // 等滚动稳定后取坐标
    await wait(120);
    const rect = el.getBoundingClientRect();
    const x = clamp(
      rect.left + rect.width / 2,
      CURSOR_MARGIN_X,
      window.innerWidth - CURSOR_MARGIN_X
    );
    const y = clamp(
      rect.top + Math.min(rect.height / 2, 40),
      CURSOR_MARGIN_TOP,
      window.innerHeight - CURSOR_MARGIN_BOTTOM
    );
    await moveCursorTo(x, y, text);
  };

  const moveToElement = async (testid: string, text?: string): Promise<boolean> => {
    const el = findByTestId(testid);
    if (!el) return false;
    await moveToEl(el, text);
    return true;
  };

  const playClickAnimation = async (): Promise<void> => {
    setClicking(true);
    await wait(180);
    await wait(220);
    setClicking(false);
  };

  // ── DemoCtx 原语实现 ─────────────────────────────────
  const ctx: DemoCtx = {
    wait,

    async narrate(text, holdMs = 3000) {
      await moveCursorTo(window.innerWidth / 2, window.innerHeight * 0.42, text);
      await wait(holdMs);
    },

    async point(testid, text, holdMs = 3000) {
      const found = await moveToElement(testid, text);
      if (!found) await moveCursorTo(window.innerWidth / 2, window.innerHeight * 0.42, text);
      await wait(holdMs);
    },

    async click(testid, text, holdMs = 1200) {
      // 无解说词的点击：清掉上一条旁白，避免翻页过渡期间显示过时文本
      if (text === undefined) setTooltip("");
      const found = await moveToElement(testid, text);
      if (!found) {
        log(`click: 元素不存在 [${testid}]，跳过`);
        return;
      }
      await playClickAnimation();
      findByTestId(testid)?.click();
      await wait(holdMs);
    },

    async fakeClick(testid, text, holdMs = 1200) {
      // 只播放点击动画，不触发真实点击（真实点击会调外部 API，由 seedStep 注入数据）
      if (text === undefined) setTooltip("");
      const found = await moveToElement(testid, text);
      if (!found) {
        log(`fakeClick: 元素不存在 [${testid}]，跳过`);
        return;
      }
      await playClickAnimation();
      await wait(holdMs);
    },

    async typeText(testid, text) {
      // 清掉上一条解说，避免气泡遮挡正在输入的内容
      setTooltip("");
      const found = await moveToElement(testid);
      if (!found) return;
      const el = findByTestId(testid);
      if (!el) return;
      el.focus();
      for (const ch of text) {
        if (cancelledRef.current) throw new Error("demo-cancelled");
        setNativeInputValue(el, (el as HTMLInputElement).value + ch);
        await wait(70);
      }
      await wait(300);
    },

    async clearInput(testid) {
      const el = findByTestId(testid);
      if (!el) return;
      setNativeInputValue(el, "");
      await wait(150);
    },

    async fillInput(testid, value) {
      // 清掉上一条解说，避免气泡遮挡填入过程
      setTooltip("");
      const found = await moveToElement(testid);
      if (!found) return;
      const el = findByTestId(testid);
      if (!el) return;
      el.focus();
      setNativeInputValue(el, value);
      await wait(250);
    },

    async fillInputs(entries) {
      // 一次性填满多个字段：光标保持在原位（上一步"AI 提取中…"的中央位置），
      // 与真实 AI 提取"同时填充全部字段"的行为一致
      setTooltip("");
      for (const [testid, value] of entries) {
        if (cancelledRef.current) throw new Error("demo-cancelled");
        const el = findByTestId(testid);
        if (!el) continue;
        setNativeInputValue(el, value);
      }
      await wait(600);
    },

    async clickFirst(testidPrefix, text, holdMs = 1200) {
      // 点击第一个 testid 以指定前缀开头的元素（用于带动态后缀的按钮）
      if (text === undefined) setTooltip("");
      const el = document.querySelector<HTMLElement>(`[data-testid^="${testidPrefix}"]`);
      if (!el) {
        log(`clickFirst: 无匹配元素 [${testidPrefix}*]，跳过`);
        return;
      }
      await moveToEl(el, text);
      await playClickAnimation();
      el.click();
      await wait(holdMs);
    },

    async waitFor(testid, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (cancelledRef.current) throw new Error("demo-cancelled");
        if (findByTestId(testid)) return true;
        await wait(200);
      }
      log(`waitFor: 等待超时 [${testid}]`);
      return false;
    },

    has(testid) {
      return findByTestId(testid) !== null;
    },

    scroll(delta) {
      const main = document.querySelector<HTMLElement>(".app-shell__main");
      if (main) main.scrollBy({ top: delta, behavior: "smooth" });
      else window.scrollBy({ top: delta, behavior: "smooth" });
    },

    hideCursor() {
      setCursorVisible(false);
    },
    showCursor() {
      setCursorVisible(true);
    },

    getCaseIdFromUrl() {
      const m = window.location.pathname.match(/\/cases\/([^/]+)/);
      return m?.[1] ?? null;
    },

    async adoptDemoCase(caseId) {
      demoCaseIdRef.current = caseId;
      const res = await fetch("/api/demo/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (!res.ok) throw new Error(`adopt 失败: ${res.status}`);
      await loadCaseById(caseId);
    },

    async seedStep(caseId, step) {
      const res = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, step }),
      });
      if (!res.ok) {
        log(`seedStep(${step}) 失败: ${res.status}`);
        return;
      }
      // 重新加载案件数据到所有 store，页面随即渲染出"刚生成"的数据
      await loadCaseById(caseId);
      await wait(600);
    },
  };

  // ── 启动 / 停止 ──────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false;
    stoppedRef.current = false;
    startTimeRef.current = Date.now();
    demoCaseIdRef.current = null;
    installDemoGuard();

    // 停止 = 通知父组件卸载本组件；实际清理由下方 cleanup 执行
    const stop = () => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      onStop();
    };
    stopRef.current = stop;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKeyDown);

    // 清理上次可能遗留的演示案件（如浏览器中途关闭）
    fetch("/api/demo/cleanup-stale", { method: "POST" }).catch(() => undefined);

    // URL 监视：演示期间一旦发现新建的案件 ID 就登记，确保任何时机中断
    // （包括脚本还没来得及 adopt 就 ESC）都能删除演示案件
    const caseIdWatcher = setInterval(() => {
      const m = window.location.pathname.match(/\/cases\/([^/]+)/);
      if (m?.[1] && m[1] !== "new") {
        demoCaseIdRef.current = m[1];
      }
    }, 250);

    (async () => {
      try {
        await wait(600);
        await runDemoScript(ctx);
      } catch (e) {
        if (!(e instanceof Error && e.message === "demo-cancelled")) {
          log("演示脚本异常:", e);
        }
      } finally {
        stop();
      }
    })();

    return () => {
      // 清理：取消脚本、卸载守卫、删除演示案件。
      // 注意：不能在这里调用 onStop —— React StrictMode 开发模式会模拟卸载一次，
      // 若 cleanup 调 onStop 会让演示在启动瞬间被关闭（生产构建无此行为）。
      cancelledRef.current = true;
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current.clear();
      clearInterval(caseIdWatcher);
      window.removeEventListener("keydown", onKeyDown);
      uninstallDemoGuard();
      const demoCaseId = demoCaseIdRef.current;
      if (demoCaseId) {
        fetch(`/api/demo/case/${encodeURIComponent(demoCaseId)}`, { method: "DELETE" }).catch(
          (e) => log("删除演示案件失败:", e)
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      {/* 全屏遮罩：拦截用户点击（点击任意处退出演示）；脚本用 el.click() 不受影响 */}
      <div
        className="demo-mask"
        onClick={() => stopRef.current()}
        data-testid="demo-mask"
      />
      {/* 顶部进度条 */}
      <div className="demo-progress">
        <div className="demo-progress__bar" style={{ width: `${progress * 100}%` }} />
      </div>
      {/* 演示控制提示 */}
      <div className="demo-badge" data-testid="demo-badge">
        演示中 · ESC 退出
      </div>
      {/* 假光标 + 解说气泡 */}
      {cursorVisible && (
        <div
          className={`demo-cursor${clicking ? " demo-cursor--clicking" : ""}`}
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          data-testid="demo-cursor"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" className="demo-cursor__arrow">
            <path
              d="M5 3l14 7.5-6.2 1.8L9.5 19 5 3z"
              fill="#1a73e8"
              stroke="#fff"
              strokeWidth="1.5"
            />
          </svg>
          {clicking && <span className="demo-cursor__ripple" />}
          {tooltip && (
            <div
              className={
                "demo-tooltip" +
                (cursor.x > window.innerWidth - 480 ? " demo-tooltip--flip-x" : "") +
                (cursor.y > window.innerHeight - 220 ? " demo-tooltip--flip-y" : "")
              }
              data-testid="demo-tooltip"
            >
              {tooltip}
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}

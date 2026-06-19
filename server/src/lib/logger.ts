type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const timestamp = `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
}

// ── Log capture (用于 eval 等场景捕获全部 server 日志写入文件) ──
let captureBuffer: string[] | null = null;
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

/**
 * 开始捕获所有 console.* 输出。捕获期间其他请求的日志也会被包含。
 * 必须与 stopCapture() 配对使用。
 */
export function startCapture(): void {
  captureBuffer = [];
  // 拦截 console.* 以捕获 ProviderAdapter 等直接使用 console 的模块
  console.log = (...args: unknown[]) => { captureBuffer!.push(args.map(String).join(" ")); originalConsole.log(...args); };
  console.info = (...args: unknown[]) => { captureBuffer!.push(args.map(String).join(" ")); originalConsole.info(...args); };
  console.warn = (...args: unknown[]) => { captureBuffer!.push(args.map(String).join(" ")); originalConsole.warn(...args); };
  console.error = (...args: unknown[]) => { captureBuffer!.push(args.map(String).join(" ")); originalConsole.error(...args); };
  console.debug = (...args: unknown[]) => { captureBuffer!.push(args.map(String).join(" ")); originalConsole.debug(...args); };
}

/**
 * 停止捕获并返回所有捕获的日志内容。恢复原始 console.* 方法。
 */
export function stopCapture(): string {
  const content = captureBuffer?.join("\n") ?? "";
  captureBuffer = null;
  // 恢复原始 console 方法
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
  return content;
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.debug(formatMessage("debug", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("info")) console.info(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("error")) console.error(formatMessage("error", message, meta));
  }
};

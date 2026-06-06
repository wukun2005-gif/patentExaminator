/**
 * E2E 测试隔离服务器生命周期管理
 * B-042: 确保测试永远不访问 data/patent-examiner.db
 *
 * 启动独立的 server 子进程，通过 SYNC_DB_PATH / KNOWLEDGE_DB_PATH
 * 环境变量指向临时目录，实现与 app 生产数据库完全隔离。
 */
import { spawn } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, openSync, closeSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

const PORT_RANGE_START = 13000;
const PORT_RANGE_SIZE = 5000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_MAX_ATTEMPTS = 30;

/** 当前活跃的服务器引用，用于崩溃清理 */
let activeServer = null;

/**
 * 启动隔离的 E2E 测试服务器
 * @returns {{ port: number, baseUrl: string, cleanup: () => Promise<void> }}
 */
export async function startIsolatedServer() {
  // 1. 创建临时目录
  const tmpDir = mkdtempSync(join(tmpdir(), "patent-examiner-e2e-"));
  const dataDir = join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const port = PORT_RANGE_START + Math.floor(Math.random() * PORT_RANGE_SIZE);

  const syncDbPath = join(dataDir, "patent-examiner.db");
  const knowledgeDbPath = join(dataDir, "knowledge.db");

  console.log(`[server-lifecycle] Starting isolated server on port ${port}`);
  console.log(`[server-lifecycle] Temp dir: ${tmpDir}`);

  // 2. 子进程 stdout/stderr 重定向到临时日志文件（避免 Claude Code tasks 目录 ENOSPC）
  const serverLogPath = join(tmpDir, "server.log");
  const serverLogFd = openSync(serverLogPath, "w");

  // 2. Spawn server 子进程
  console.log(`[server-lifecycle] Parent TEST_BASE=${process.env.TEST_BASE ?? "(unset)"}`);
  const child = spawn("node", ["--import", "tsx", "server/src/index.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      SYNC_DB_PATH: syncDbPath,
      SYNC_DB_DIR: dataDir,
      KNOWLEDGE_DB_PATH: knowledgeDbPath,
      KNOWLEDGE_DB_DIR: dataDir,
    },
    stdio: ["ignore", serverLogFd, serverLogFd],
    cwd: PROJECT_ROOT,
  });

  activeServer = { child, tmpDir, serverLogPath, serverLogFd };

  child.on("exit", (code, signal) => {
    if (activeServer?.child === child) {
      activeServer = null;
    }
    if (code !== null && code !== 0) {
      console.error(`[server-lifecycle] Server exited with code ${code}`);
    }
  });

  // 3. 等待服务器就绪
  const baseUrl = `http://localhost:${port}/api`;
  const healthUrl = `${baseUrl}/health`;

  for (let attempt = 1; attempt <= HEALTH_CHECK_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        console.log(`[server-lifecycle] Server ready on port ${port}`);
        break;
      }
    } catch {
      // 服务器还没启动，继续等待
    }

    if (attempt === HEALTH_CHECK_MAX_ATTEMPTS) {
      // 清理并报错
      await doCleanup(child, tmpDir);
      throw new Error(
        `[server-lifecycle] Server failed to start after ${HEALTH_CHECK_MAX_ATTEMPTS} attempts`
      );
    }

    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }

  // 4. 返回 cleanup 函数
  const cleanup = async () => {
    await doCleanup(child, tmpDir);
    activeServer = null;
  };

  return { port, baseUrl, cleanup };
}

/**
 * 清理：kill 子进程 + 删除临时目录
 */
async function doCleanup(child, tmpDir) {
  // Kill 子进程
  if (child && !child.killed) {
    child.kill("SIGTERM");
    // 等待 3 秒，超时则 SIGKILL
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 3000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // 关闭日志文件描述符
  try {
    if (activeServer?.serverLogFd) {
      closeSync(activeServer.serverLogFd);
    }
  } catch {}

  // 删除临时目录
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    console.log(`[server-lifecycle] Cleaned up temp dir: ${tmpDir}`);
  } catch (err) {
    console.error(`[server-lifecycle] Failed to clean temp dir: ${err.message}`);
  }
}

/**
 * 打印服务器日志（测试失败时调用，便于调试）
 */
export function dumpServerLog() {
  if (!activeServer?.serverLogPath) return;
  try {
    const log = readFileSync(activeServer.serverLogPath, "utf-8");
    if (log.trim()) {
      console.log(`\n[server-lifecycle] === Server Log (last 100 lines) ===`);
      const lines = log.trim().split("\n");
      for (const line of lines.slice(-100)) {
        console.log(`[server] ${line}`);
      }
      console.log(`[server-lifecycle] === End Server Log ===\n`);
    }
  } catch {}
}

// 崩溃清理：确保进程退出时清理子进程和临时文件
function registerCleanupHandlers() {
  const cleanup = () => {
    if (activeServer) {
      const { child, tmpDir, serverLogFd } = activeServer;
      try {
        if (child && !child.killed) child.kill("SIGKILL");
      } catch {}
      try {
        if (serverLogFd) closeSync(serverLogFd);
      } catch {}
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      activeServer = null;
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

registerCleanupHandlers();

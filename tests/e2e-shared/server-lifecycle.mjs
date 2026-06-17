/**
 * E2E 测试隔离服务器生命周期管理
 * B-042: 确保测试永远不访问 data/patent-examiner.db
 *
 * 启动独立的 server 子进程，通过 SYNC_DB_PATH / KNOWLEDGE_DB_PATH
 * 环境变量指向临时目录，实现与 app 生产数据库完全隔离。
 */
import { spawn } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, openSync, closeSync, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

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
 * @param {object} [options]
 * @param {boolean} [options.copyProductionDb=false] - 是否复制生产 DB 副本（settings、知识库、案件数据）
 * @returns {{ port: number, baseUrl: string, cleanup: () => Promise<void> }}
 */
export async function startIsolatedServer(options = {}) {
  // 1. 创建临时目录
  const tmpDir = mkdtempSync(join(tmpdir(), "patent-examiner-e2e-"));
  const dataDir = join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const port = PORT_RANGE_START + Math.floor(Math.random() * PORT_RANGE_SIZE);

  const syncDbPath = join(dataDir, "patent-examiner.db");
  const knowledgeDbPath = join(dataDir, "knowledge.db");

  // 1.5 可选：复制生产 DB 副本
  console.log(`[server-lifecycle] copyProductionDb option: ${options.copyProductionDb === true}`);
  if (options.copyProductionDb) {
    const prodSyncDb = join(PROJECT_ROOT, "server", "data", "patent-examiner.db");
    const prodKnowledgeDb = join(PROJECT_ROOT, "server", "data", "knowledge.db");
    console.log(`[server-lifecycle] PROJECT_ROOT: ${PROJECT_ROOT}`);
    console.log(`[server-lifecycle] prodSyncDb: ${prodSyncDb} exists=${existsSync(prodSyncDb)}`);
    console.log(`[server-lifecycle] prodKnowledgeDb: ${prodKnowledgeDb} exists=${existsSync(prodKnowledgeDb)}`);

    // 用 SQLite backup API 复制 DB，确保 WAL 中未 checkpoint 的数据也被完整复制。
    // 直接 copyFileSync 只复制主 .db 文件会丢失 WAL 中的最新写入。
    const backupDb = async (src, dst) => {
      const srcDb = new Database(src, { readonly: true });
      try {
        await srcDb.backup(dst);  // better-sqlite3 backup API，自动处理 WAL
      } finally {
        srcDb.close();
      }
    };

    if (existsSync(prodSyncDb)) {
      const srcSize = statSync(prodSyncDb).size;
      await backupDb(prodSyncDb, syncDbPath);
      const dstSize = statSync(syncDbPath).size;
      console.log(`[server-lifecycle] Backed up sync DB: ${srcSize} bytes → ${dstSize} bytes`);
    } else {
      console.error(`[server-lifecycle] WARNING: production sync DB not found, isolated server will start with empty DB`);
    }
    if (existsSync(prodKnowledgeDb)) {
      const srcSize = statSync(prodKnowledgeDb).size;
      await backupDb(prodKnowledgeDb, knowledgeDbPath);
      const dstSize = statSync(knowledgeDbPath).size;
      console.log(`[server-lifecycle] Backed up knowledge DB: ${srcSize} bytes → ${dstSize} bytes`);
    } else {
      console.error(`[server-lifecycle] WARNING: production knowledge DB not found, isolated server will start with empty KB`);
    }
  }

  // 2. 子进程 stdout/stderr 重定向到持久化日志目录
  const logDir = join(PROJECT_ROOT, "tests", "logs");
  mkdirSync(logDir, { recursive: true });

  // 清理非当天的旧日志
  const _now = new Date();
  const todayPrefix = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  try {
    for (const file of readdirSync(logDir)) {
      if (file.startsWith("e2e-") && file.endsWith(".log") && !file.includes(todayPrefix)) {
        rmSync(join(logDir, file));
      }
    }
  } catch {}

  const _d = new Date();
  const _pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${_d.getFullYear()}-${_pad(_d.getMonth() + 1)}-${_pad(_d.getDate())}T${_pad(_d.getHours())}-${_pad(_d.getMinutes())}-${_pad(_d.getSeconds())}`;
  const serverLogPath = join(logDir, `e2e-${timestamp}.log`);
  const serverLogFd = openSync(serverLogPath, "w");

  console.log(`[server-lifecycle] Starting isolated server on port ${port}`);
  console.log(`[server-lifecycle] Temp dir: ${tmpDir}`);
  console.log(`[server-lifecycle] Server log: ${serverLogPath}`);

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
      await doCleanup(child, tmpDir, serverLogPath);
      throw new Error(
        `[server-lifecycle] Server failed to start after ${HEALTH_CHECK_MAX_ATTEMPTS} attempts`
      );
    }

    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }

  // 4. 返回 cleanup 函数
  const cleanup = async () => {
    await doCleanup(child, tmpDir, serverLogPath);
    activeServer = null;
  };

  return { port, baseUrl, cleanup };
}

/**
 * 清理：kill 子进程 + 删除临时数据目录（保留日志）
 */
async function doCleanup(child, tmpDir, serverLogPath) {
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

  // 删除临时数据目录（保留日志在 tests/logs/）
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    console.log(`[server-lifecycle] Cleaned up temp dir: ${tmpDir}`);
  } catch (err) {
    console.error(`[server-lifecycle] Failed to clean temp dir: ${err.message}`);
  }

  // 输出日志路径供排查
  if (serverLogPath && existsSync(serverLogPath)) {
    console.log(`[server-lifecycle] Server log preserved: ${serverLogPath}`);
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

/**
 * 获取完整的 server log 内容（用于写入测试日志文件）
 * @returns {string|null}
 */
export function getServerLog() {
  if (!activeServer?.serverLogPath) return null;
  try {
    return readFileSync(activeServer.serverLogPath, "utf-8");
  } catch {
    return null;
  }
}

// 崩溃清理：确保进程退出时清理子进程和临时数据（保留日志）
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
      // 只删临时数据目录，日志已持久化到 tests/logs/
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

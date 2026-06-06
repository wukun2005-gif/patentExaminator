/**
 * 审计日志 — 记录 settings 数据库的每次 CRUD 操作
 * 日志文件: server/data/settings-audit.log
 */
import { appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "../../data");
const LOG_FILE = join(LOG_DIR, "settings-audit.log");

try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* exists */ }

export interface AuditEntry {
  op: "GET" | "GET_ALL" | "CREATE" | "UPDATE" | "DELETE" | "DELETE_ALL" | "QUERY";
  store: string;
  recordId?: string;
  caller: string;
  dataBefore?: unknown;
  dataAfter?: unknown;
  result?: string;
}

export function writeAudit(entry: AuditEntry): void {
  // B-042: 测试模式下不写入用户审计日志
  // 审计日志的目的是监控用户数据库的操作，测试数据库的操作不应记录
  const isTestMode = (globalThis as Record<string, unknown>).__TEST_SYNC_DB_PATH__ !== undefined;
  if (isTestMode) return;

  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, ...entry });
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch (e) {
    console.error("[auditLog] write failed:", e);
  }
}

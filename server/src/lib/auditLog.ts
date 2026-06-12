/**
 * 审计日志 — 记录所有用户数据库 store 的每次 CRUD 操作
 * 日志文件: server/data/db-audit.log
 * 轮转: 超过 MAX_SIZE 后归档为 db-audit.1.log（仅保留 1 个备份）
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "../../data");
const LOG_FILE = join(LOG_DIR, "db-audit.log");
const BACKUP_FILE = join(LOG_DIR, "db-audit.1.log");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FIELD_LEN = 500; // dataBefore/dataAfter 单字段最大字符数
const MAX_SETTINGS_FIELD_LEN = 4000; // settings store 的 JSON 通常较大，放宽限制

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

/** 截断过大的数据字段，避免单行日志膨胀。settings store 使用更大的上限 */
function truncateData(data: unknown, store?: string): unknown {
  if (data === undefined || data === null) return data;
  const json = JSON.stringify(data);
  const limit = store === "settings" ? MAX_SETTINGS_FIELD_LEN : MAX_FIELD_LEN;
  if (json.length <= limit) return data;
  // settings 数据截断时，先提取 providers 摘要再截断
  if (store === "settings" && typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    if (Array.isArray(obj.providers)) {
      summary.providers = obj.providers.map((p: Record<string, unknown>) => ({
        providerId: p.providerId,
        enabled: p.enabled,
        hasKey: !!(p.apiKeyRef && p.apiKeyRef !== ""),
        modelCount: Array.isArray(p.modelIds) ? p.modelIds.length : 0,
      }));
    }
    if (obj.mode) summary.mode = obj.mode;
    return { _summary: summary, _truncated: json.slice(0, limit) + `… (${json.length} chars total)` };
  }
  return json.slice(0, limit) + `… (${json.length} chars truncated)`;
}

/** 超过阈值时轮转日志文件 */
function rotateIfNeeded(): void {
  try {
    const stat = statSync(LOG_FILE);
    if (stat.size >= MAX_SIZE) {
      try { renameSync(LOG_FILE, BACKUP_FILE); } catch { /* backup may not exist */ }
    }
  } catch { /* file may not exist yet */ }
}

export function writeAudit(entry: AuditEntry): void {
  // B-042: 测试模式下不写入用户审计日志
  // 审计日志的目的是监控用户数据库的操作，测试数据库的操作不应记录
  const isTestMode = (globalThis as Record<string, unknown>).__TEST_SYNC_DB_PATH__ !== undefined;
  if (isTestMode) return;

  const ts = new Date().toISOString();
  const line = JSON.stringify({
    ts,
    ...entry,
    dataBefore: truncateData(entry.dataBefore, entry.store),
    dataAfter: truncateData(entry.dataAfter, entry.store),
  });
  try {
    rotateIfNeeded();
    appendFileSync(LOG_FILE, line + "\n");
  } catch (e) {
    console.error("[auditLog] write failed:", e);
  }
}

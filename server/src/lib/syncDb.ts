/**
 * 服务器端同步数据库 — SQLite 单文件存储
 * 用于跨设备数据同步，无认证，单用户场景
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "patent-examiner.db");

let db: Database.Database | null = null;

/** 获取或初始化 SQLite 数据库 */
export function getSyncDb(): Database.Database {
  if (db) return db;

  // 确保 data 目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 初始化表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_data (
      store_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (store_name, record_id)
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_files (
      file_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  logger.info(`Sync database initialized at ${DB_PATH}`);
  return db;
}

/** 获取最后同步时间 */
export function getLastSyncTime(): string | null {
  const db = getSyncDb();
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync'").get() as { value: string } | undefined;
  return row?.value ?? null;
}

/** 更新最后同步时间 */
export function updateLastSyncTime(): void {
  const db = getSyncDb();
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)").run(now);
}

/** 上传全部数据（批量 upsert） */
export function uploadAllData(stores: Record<string, Array<{ id: string; data: unknown }>>): { uploaded: number } {
  const db = getSyncDb();
  const upsert = db.prepare("INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now'))");

  let total = 0;
  const transaction = db.transaction(() => {
    for (const [storeName, records] of Object.entries(stores)) {
      for (const record of records) {
        upsert.run(storeName, record.id, JSON.stringify(record.data));
        total++;
      }
    }
    updateLastSyncTime();
  });

  transaction();
  logger.info(`Uploaded ${total} records across ${Object.keys(stores).length} stores`);
  return { uploaded: total };
}

/** 下载全部数据 */
export function downloadAllData(): Record<string, Array<{ id: string; data: unknown }>> {
  const db = getSyncDb();
  const rows = db.prepare("SELECT store_name, record_id, data FROM sync_data").all() as Array<{
    store_name: string;
    record_id: string;
    data: string;
  }>;

  const result: Record<string, Array<{ id: string; data: unknown }>> = {};
  for (const row of rows) {
    try {
      if (!result[row.store_name]) result[row.store_name] = [];
      (result[row.store_name] ?? []).push({
        id: row.record_id,
        data: JSON.parse(row.data),
      });
    } catch {
      logger.warn(`Skipping corrupted record: store=${row.store_name}, id=${row.record_id}`);
    }
  }

  logger.info(`Downloaded ${rows.length} records across ${Object.keys(result).length} stores`);
  return result;
}

/** 获取同步状态 */
export function getSyncStatus(): { lastSync: string | null; totalRecords: number; stores: string[] } {
  const db = getSyncDb();
  const lastSync = getLastSyncTime();
  const countRow = db.prepare("SELECT COUNT(*) as count FROM sync_data").get() as { count: number };
  const storeRows = db.prepare("SELECT DISTINCT store_name FROM sync_data").all() as Array<{ store_name: string }>;

  return {
    lastSync,
    totalRecords: countRow.count,
    stores: storeRows.map((r) => r.store_name),
  };
}

// B-026: saveFile、readFile、listFiles 函数已删除（死代码）

/** 关闭数据库 */
export function closeSyncDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info("Sync database closed");
  }
}

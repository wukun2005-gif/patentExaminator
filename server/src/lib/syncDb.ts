/**
 * 服务器端同步数据库 — SQLite 单文件存储
 * 用于跨设备数据同步，无认证，单用户场景
 * MIGRATE-001: 主存储从 IndexedDB 迁移到 SQLite
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";

// 支持通过环境变量指定数据库路径（测试隔离）
const DATA_DIR = process.env.SYNC_DB_DIR ?? path.resolve(process.cwd(), "data");
const DB_PATH = process.env.SYNC_DB_PATH ?? path.join(DATA_DIR, "patent-examiner.db");

let db: Database.Database | null = null;

/** 获取或初始化 SQLite 数据库 */
export function getSyncDb(): Database.Database {
  if (db) return db;

  // B-042: 支持测试注入的自定义路径
  const testPath = (globalThis as Record<string, unknown>).__TEST_SYNC_DB_PATH__ as string | undefined;
  const effectivePath = testPath ?? DB_PATH;

  // 确保 data 目录存在（内存数据库跳过）
  if (effectivePath !== ":memory:") {
    const dir = path.dirname(effectivePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(effectivePath);
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
  `);

  logger.info(`Sync database initialized at ${DB_PATH}`);
  return db;
}

/** 获取最后同步时间 */
function getLastSyncTime(): string | null {
  const db = getSyncDb();
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync'").get() as { value: string } | undefined;
  return row?.value ?? null;
}

/** 更新最后同步时间 */
function updateLastSyncTime(): void {
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

/**
 * 重置数据库连接（仅测试用）
 * B-042: 测试数据库隔离机制 — 允许测试注入自定义数据库路径
 */
function _resetSyncDbForTesting(customPath?: string): void {
  if (db) {
    db.close();
    db = null;
  }
  if (customPath !== undefined) {
    // 覆盖模块级 DB_PATH（通过 monkey-patch）
    (globalThis as Record<string, unknown>).__TEST_SYNC_DB_PATH__ = customPath;
  }
}

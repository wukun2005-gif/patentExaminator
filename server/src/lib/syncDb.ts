/**
 * 服务器端同步数据库 — SQLite 单文件存储
 * 用于跨设备数据同步，无认证，单用户场景
 * MIGRATE-001: 主存储从 IndexedDB 迁移到 SQLite
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger.js";
import { writeAudit } from "./auditLog.js";

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
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (store_name, record_id)
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metrics_runs (
      id            TEXT PRIMARY KEY,
      timestamp     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      agent         TEXT NOT NULL,
      case_id       TEXT NOT NULL DEFAULT '',
      provider_id   TEXT NOT NULL,
      model_id      TEXT NOT NULL,
      search_provider TEXT DEFAULT '',
      reranker_type TEXT DEFAULT '',
      embedding_model TEXT DEFAULT '',
      duration_ms   INTEGER NOT NULL DEFAULT 0,
      ttft_ms       INTEGER DEFAULT 0,
      tool_rounds   INTEGER DEFAULT 0,
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens  INTEGER DEFAULT 0,
      thinking_tokens INTEGER DEFAULT 0,
      rag_citation_count INTEGER DEFAULT 0,
      top_citation_score REAL DEFAULT 0,
      web_top_score REAL DEFAULT 0,
      fusion_top_score REAL DEFAULT 0,
      web_search_count INTEGER DEFAULT 0,
      web_search_rounds INTEGER DEFAULT 0,
      grounding_score REAL DEFAULT -1,
      grounding_verdict TEXT DEFAULT '',
      removed_claims_count INTEGER DEFAULT 0,
      success       INTEGER NOT NULL DEFAULT 1,
      error_type    TEXT DEFAULT '',
      error_code    TEXT DEFAULT '',
      attempts_json TEXT DEFAULT '[]',
      timings_json  TEXT DEFAULT '{}',
      user_feedback TEXT DEFAULT '',
      experiment_id TEXT DEFAULT '',
      variant       TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics_runs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_metrics_agent ON metrics_runs(agent);
    CREATE INDEX IF NOT EXISTS idx_metrics_model ON metrics_runs(provider_id, model_id);

    CREATE TABLE IF NOT EXISTS metrics_golden_set (
      id            TEXT PRIMARY KEY,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      agent         TEXT NOT NULL,
      query         TEXT NOT NULL,
      expected_answer TEXT NOT NULL,
      expected_sources TEXT DEFAULT '[]',
      expected_articles TEXT DEFAULT '[]',
      category      TEXT DEFAULT '',
      difficulty    TEXT DEFAULT 'medium',
      generated_by  TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS metrics_eval_sets (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      question_count INTEGER NOT NULL DEFAULT 0,
      source_type_distribution TEXT DEFAULT '{}',
      status        TEXT NOT NULL DEFAULT 'ready',
      error_message TEXT DEFAULT '',
      metadata      TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS metrics_golden_runs (
      id            TEXT PRIMARY KEY,
      golden_id     TEXT NOT NULL REFERENCES metrics_golden_set(id),
      run_id        TEXT,
      timestamp     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      config_json   TEXT NOT NULL,
      recall_at_k   REAL DEFAULT 0,
      mrr           REAL DEFAULT 0,
      ndcg_at_k     REAL DEFAULT 0,
      faithfulness  REAL DEFAULT 0,
      groundedness  REAL DEFAULT 0,
      actual_answer TEXT DEFAULT '',
      actual_sources TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS metrics_eval_run_meta (
      run_id            TEXT PRIMARY KEY,
      report_json_path  TEXT DEFAULT '',
      log_path          TEXT DEFAULT '',
      duration_ms       INTEGER DEFAULT 0
    );
  `);

  // ── 增量 schema 升级：为已有表添加新列 ──
  upgradeGoldenSetSchema(db);
  upgradeGoldenRunsSchema(db);
  upgradeEvalSetsSchema(db);
  upgradeEvalRunMetaSchema(db);

  logger.info(`Sync database initialized at ${DB_PATH}`);
  return db;
}

/**
 * 增量升级 metrics_golden_set 表 — 添加 nf5 新列
 * 使用 ALTER TABLE ADD COLUMN（SQLite 安全增量操作）
 */
function upgradeGoldenSetSchema(db: Database.Database): void {
  const existingCols = new Set(
    (db.prepare("PRAGMA table_info('metrics_golden_set')").all() as Array<{ name: string }>)
      .map((c) => c.name)
  );

  const columnsToAdd: Array<{ name: string; def: string }> = [
    { name: "source_type",             def: "TEXT DEFAULT 'kb_only'" },
    { name: "expected_source",         def: "TEXT DEFAULT 'kb'" },
    { name: "source_routing_rationale", def: "TEXT DEFAULT ''" },
    { name: "must_include_facts",      def: "TEXT DEFAULT '[]'" },
    { name: "relevance_grading",       def: "TEXT DEFAULT '[]'" },
    { name: "verified_by",             def: "TEXT DEFAULT 'auto'" },
    { name: "context_chunk_ids",       def: "TEXT DEFAULT '[]'" },
    { name: "eval_set_id",             def: "TEXT DEFAULT ''" },
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      db.exec(`ALTER TABLE metrics_golden_set ADD COLUMN ${col.name} ${col.def}`);
      logger.info(`[SyncDb] Added column metrics_golden_set.${col.name}`);
    }
  }
}

/**
 * 增量升级 metrics_golden_runs 表 — 添加 nf5 新指标列
 */
function upgradeGoldenRunsSchema(db: Database.Database): void {
  const existingCols = new Set(
    (db.prepare("PRAGMA table_info('metrics_golden_runs')").all() as Array<{ name: string }>)
      .map((c) => c.name)
  );

  const columnsToAdd: Array<{ name: string; def: string }> = [
    { name: "answer_correctness",           def: "REAL DEFAULT 0" },
    { name: "fact_coverage",                def: "REAL DEFAULT 0" },
    { name: "article_accuracy",             def: "REAL DEFAULT 0" },
    { name: "source_routing_accuracy",      def: "REAL DEFAULT 0" },
    { name: "source_attribution_accuracy",  def: "REAL DEFAULT 0" },
    { name: "conflict_resolution",          def: "REAL DEFAULT 0" },
    { name: "refusal_accuracy",             def: "REAL DEFAULT 0" },
    { name: "kb_hit_rate",                  def: "REAL DEFAULT 0" },
    { name: "web_hit_rate",                 def: "REAL DEFAULT 0" },
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      db.exec(`ALTER TABLE metrics_golden_runs ADD COLUMN ${col.name} ${col.def}`);
      logger.info(`[SyncDb] Added column metrics_golden_runs.${col.name}`);
    }
  }
}

/**
 * 增量升级 metrics_eval_sets 表 — nf5-2 Phase 1
 * 确保 eval_set_id 索引存在
 */
function upgradeEvalSetsSchema(db: Database.Database): void {
  // 确保 eval_set_id 索引存在（用于按 eval set 查询 questions）
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_golden_set_eval_set_id ON metrics_golden_set(eval_set_id)`);
  } catch { /* index may already exist */ }
}

/**
 * 增量升级 metrics_eval_run_meta 表 — 添加 duration_ms 列
 */
function upgradeEvalRunMetaSchema(db: Database.Database): void {
  // 先确保表存在
  db.exec(`CREATE TABLE IF NOT EXISTS metrics_eval_run_meta (
    run_id TEXT PRIMARY KEY, report_json_path TEXT DEFAULT '', log_path TEXT DEFAULT '', duration_ms INTEGER DEFAULT 0
  )`);
  const existingCols = new Set(
    (db.prepare("PRAGMA table_info('metrics_eval_run_meta')").all() as Array<{ name: string }>)
      .map((c) => c.name)
  );
  if (!existingCols.has("duration_ms")) {
    db.exec(`ALTER TABLE metrics_eval_run_meta ADD COLUMN duration_ms INTEGER DEFAULT 0`);
    logger.info(`[SyncDb] Added column metrics_eval_run_meta.duration_ms`);
  }
}

/**
 * 获取 metrics 数据库实例
 * 返回与 getSyncDb() 相同的 SQLite 连接（所有表在同一个数据库中），
 * 但提供独立的语义名称以便 metrics 代码中更清晰地表达意图
 */
export function getMetricsDb(): Database.Database {
  return getSyncDb();
}

/** 保存评估报告的文件路径和耗时（run 级元数据） */
export function saveEvalRunMeta(runId: string, reportJsonPath: string, logPath: string, durationMs: number = 0): void {
  const db = getSyncDb();
  db.prepare(
    `INSERT OR REPLACE INTO metrics_eval_run_meta (run_id, report_json_path, log_path, duration_ms) VALUES (?, ?, ?, ?)`
  ).run(runId, reportJsonPath, logPath, durationMs);
}

/** 获取所有 run 的文件路径和耗时元数据 */
export function getEvalRunMetas(): Map<string, { reportJsonPath: string; logPath: string; durationMs: number }> {
  const db = getSyncDb();
  const rows = db.prepare(`SELECT run_id, report_json_path, log_path, duration_ms FROM metrics_eval_run_meta`).all() as Array<{
    run_id: string; report_json_path: string; log_path: string; duration_ms: number;
  }>;
  const map = new Map<string, { reportJsonPath: string; logPath: string; durationMs: number }>();
  for (const r of rows) {
    map.set(r.run_id, { reportJsonPath: r.report_json_path, logPath: r.log_path, durationMs: r.duration_ms ?? 0 });
  }
  return map;
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
  const upsert = db.prepare("INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))");
  const selectPrev = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?");

  let total = 0;
  const transaction = db.transaction(() => {
    for (const [storeName, records] of Object.entries(stores)) {
      for (const record of records) {
        // 读取写入前的数据（审计用）
        let dataBefore: unknown = undefined;
        const prev = selectPrev.get(storeName, record.id) as { data: string } | undefined;
        if (prev) try { dataBefore = JSON.parse(prev.data); } catch { /* ignore */ }

        upsert.run(storeName, record.id, JSON.stringify(record.data));
        total++;

        writeAudit({ op: "CREATE", store: storeName, recordId: record.id, caller: "sync/upload", dataBefore, dataAfter: record.data, result: "OK" });
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
 * 使用方式：在测试 beforeAll 中调用 resetSyncDbForTesting(":memory:") 注入内存数据库
 */
export function resetSyncDbForTesting(customPath?: string): void {
  if (db) {
    db.close();
    db = null; // 同时重置 metrics 表（与 sync 表共享同一连接）
  }
  if (customPath !== undefined) {
    // 覆盖模块级 DB_PATH（通过 monkey-patch）
    (globalThis as Record<string, unknown>).__TEST_SYNC_DB_PATH__ = customPath;
  }
}

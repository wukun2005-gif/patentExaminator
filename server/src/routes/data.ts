/**
 * 数据 CRUD API 路由 — MIGRATE-001: 主存储从 IndexedDB 迁移到 SQLite
 * 提供通用的 CRUD 操作，替代客户端 IndexedDB
 */
import { Router } from "express";
import express from "express";
import {
  getSyncDb,
} from "../lib/syncDb.js";
import { logger } from "../lib/logger.js";

export const dataRouter = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GET /api/data/:store — 获取指定 store 的所有记录 */
dataRouter.get("/data/:store", (req, res) => {
  try {
    const { store } = req.params;
    const db = getSyncDb();
    const rows = db.prepare("SELECT record_id, data FROM sync_data WHERE store_name = ?").all(store) as Array<{
      record_id: string;
      data: string;
    }>;

    const records: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      try {
        records.push({ id: row.record_id, ...JSON.parse(row.data) });
      } catch {
        logger.warn(`Corrupted JSON in store=${store} record=${row.record_id}, skipping`);
      }
    }

    res.json({ ok: true, records });
  } catch (err) {
    logger.error("Data get error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/data/:store/query — 按字段过滤记录（内存过滤，适合小数据集） */
dataRouter.post("/data/:store/query", express.json(), (req, res) => {
  try {
    const { store } = req.params;
    const { field, value } = req.body as { field: string; value: unknown };

    if (!field) {
      res.status(400).json({ ok: false, error: "Missing 'field'" });
      return;
    }

    const db = getSyncDb();
    const rows = db.prepare("SELECT record_id, data FROM sync_data WHERE store_name = ?").all(store) as Array<{
      record_id: string;
      data: string;
    }>;

    const records: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      try {
        const record = { id: row.record_id, ...JSON.parse(row.data) };
        if (record[field] === value) records.push(record);
      } catch {
        logger.warn(`Corrupted JSON in store=${store} record=${row.record_id}, skipping`);
      }
    }

    res.json({ ok: true, records });
  } catch (err) {
    logger.error("Data query error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/data/:store/:id — 获取指定记录 */
dataRouter.get("/data/:store/:id", (req, res) => {
  try {
    const { store, id } = req.params;
    const db = getSyncDb();
    const row = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as {
      data: string;
    } | undefined;

    if (!row) {
      res.status(404).json({ ok: false, error: "Record not found" });
      return;
    }

    let record: Record<string, unknown>;
    try {
      record = { id, ...JSON.parse(row.data) };
    } catch {
      logger.warn(`Corrupted JSON in store=${store} record=${id}`);
      res.status(500).json({ ok: false, error: "Corrupted data" });
      return;
    }
    res.json({ ok: true, record });
  } catch (err) {
    logger.error("Data get error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/data/:store — 创建记录 */
dataRouter.post("/data/:store", express.json(), (req, res) => {
  try {
    const { store } = req.params;
    const { id, ...data } = req.body;

    if (!id) {
      res.status(400).json({ ok: false, error: "Missing 'id' field" });
      return;
    }

    const db = getSyncDb();
    db.prepare("INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now'))")
      .run(store, id, JSON.stringify(data));

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data create error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** PUT /api/data/:store/:id — 更新记录 */
dataRouter.put("/data/:store/:id", express.json(), (req, res) => {
  try {
    const { store, id } = req.params;
    const data = req.body;

    const db = getSyncDb();
    const result = db.prepare("UPDATE sync_data SET data = ?, updated_at = datetime('now') WHERE store_name = ? AND record_id = ?")
      .run(JSON.stringify(data), store, id);

    if (result.changes === 0) {
      res.status(404).json({ ok: false, error: "Record not found" });
      return;
    }

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data update error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/data/:store/:id — 删除记录 */
dataRouter.delete("/data/:store/:id", (req, res) => {
  try {
    const { store, id } = req.params;

    const db = getSyncDb();
    const result = db.prepare("DELETE FROM sync_data WHERE store_name = ? AND record_id = ?")
      .run(store, id);

    if (result.changes === 0) {
      res.status(404).json({ ok: false, error: "Record not found" });
      return;
    }

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data delete error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/data/:store — 删除指定 store 的所有记录 */
dataRouter.delete("/data/:store", (req, res) => {
  try {
    const { store } = req.params;

    const db = getSyncDb();
    const result = db.prepare("DELETE FROM sync_data WHERE store_name = ?")
      .run(store);

    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    logger.error("Data delete error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

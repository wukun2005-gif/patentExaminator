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
import { clearSettingsCache } from "../lib/orchestrator.js";
import { writeAudit } from "../lib/auditLog.js";
import { dataQueryInputSchema, dataCreateInputSchema, storeNameSchema, recordIdSchema, dataUpdateInputSchema } from "../../../shared/src/schemas/api-input.schema.js";

export const dataRouter = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GET /api/data/:store — 获取指定 store 的所有记录 */
dataRouter.get("/data/:store", (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    if (!storeParsed.success) {
      res.status(400).json({ ok: false, error: storeParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
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

    writeAudit({ op: "GET_ALL", store, caller: req.header("X-Caller") ?? "unknown", result: `${records.length} records` });
    res.json({ ok: true, records });
  } catch (err) {
    logger.error("Data get error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/data/:store/query — 按字段过滤记录（内存过滤，适合小数据集） */
dataRouter.post("/data/:store/query", express.json(), (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    if (!storeParsed.success) {
      res.status(400).json({ ok: false, error: storeParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const parsed = dataQueryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { field, value } = parsed.data;

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
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    const idParsed = recordIdSchema.safeParse(req.params.id);
    if (!storeParsed.success || !idParsed.success) {
      const issues = [...(storeParsed.success ? [] : storeParsed.error.issues), ...(idParsed.success ? [] : idParsed.error.issues)];
      res.status(400).json({ ok: false, error: issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const id = idParsed.data;
    const db = getSyncDb();
    const row = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as {
      data: string;
    } | undefined;

    if (!row) {
      writeAudit({ op: "GET", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", result: "NOT_FOUND" });
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
    writeAudit({ op: "GET", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", dataAfter: record, result: "OK" });
    res.json({ ok: true, record });
  } catch (err) {
    logger.error("Data get error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/data/:store — 创建记录 */
dataRouter.post("/data/:store", express.json(), (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    if (!storeParsed.success) {
      res.status(400).json({ ok: false, error: storeParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const parsed = dataCreateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { id, ...data } = parsed.data;

    const db = getSyncDb();

    // 读取写入前的数据（审计用）
    let dataBefore: unknown = undefined;
    const prev = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as { data: string } | undefined;
    if (prev) try { dataBefore = JSON.parse(prev.data); } catch { /* ignore */ }

    db.prepare("INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))")
      .run(store, id, JSON.stringify(data));

    // settings 更新时清除 orchestrator 缓存
    if (store === "settings") clearSettingsCache();

    writeAudit({ op: "CREATE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", dataBefore, dataAfter: data, result: "OK" });

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data create error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** PUT /api/data/:store/:id — 更新记录 */
dataRouter.put("/data/:store/:id", express.json(), (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    const idParsed = recordIdSchema.safeParse(req.params.id);
    const bodyParsed = dataUpdateInputSchema.safeParse(req.body);
    if (!storeParsed.success || !idParsed.success || !bodyParsed.success) {
      const issues = [...(storeParsed.success ? [] : storeParsed.error.issues), ...(idParsed.success ? [] : idParsed.error.issues), ...(bodyParsed.success ? [] : bodyParsed.error.issues)];
      res.status(400).json({ ok: false, error: issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const id = idParsed.data;
    const data = bodyParsed.data;

    const db = getSyncDb();

    // 读取更新前的数据（审计用）
    let dataBefore: unknown = undefined;
    const prev = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as { data: string } | undefined;
    if (prev) try { dataBefore = JSON.parse(prev.data); } catch { /* ignore */ }

    const result = db.prepare("UPDATE sync_data SET data = ?, updated_at = datetime('now','localtime') WHERE store_name = ? AND record_id = ?")
      .run(JSON.stringify(data), store, id);

    if (result.changes === 0) {
      writeAudit({ op: "UPDATE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", result: "NOT_FOUND" });
      res.status(404).json({ ok: false, error: "Record not found" });
      return;
    }

    if (store === "settings") clearSettingsCache();

    writeAudit({ op: "UPDATE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", dataBefore, dataAfter: data, result: "OK" });

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data update error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** PATCH /api/data/:store/:id — 部分更新记录（deep merge），仅 settings store 支持 */
dataRouter.patch("/data/:store/:id", express.json(), (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    const idParsed = recordIdSchema.safeParse(req.params.id);
    if (!storeParsed.success || !idParsed.success) {
      const issues = [...(storeParsed.success ? [] : storeParsed.error.issues), ...(idParsed.success ? [] : idParsed.error.issues)];
      res.status(400).json({ ok: false, error: issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const id = idParsed.data;

    if (store !== "settings") {
      res.status(405).json({ ok: false, error: "PATCH only supported for settings store" });
      return;
    }

    const db = getSyncDb();
    const row = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as { data: string } | undefined;

    let existing: Record<string, unknown> = {};
    if (row) {
      try { existing = JSON.parse(row.data); } catch { /* ignore */ }
    }

    const patch = req.body as Record<string, unknown>;
    // Deep merge: 顶层字段用 patch 覆盖，数组字段直接替换
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "id") continue; // id 不覆盖
      if (Array.isArray(value)) {
        merged[key] = value; // 数组直接替换
      } else if (value && typeof value === "object" && !Array.isArray(value) && existing[key] && typeof existing[key] === "object" && !Array.isArray(existing[key])) {
        merged[key] = { ...(existing[key] as Record<string, unknown>), ...value }; // 对象 deep merge
      } else {
        merged[key] = value; // 标量直接替换
      }
    }

    db.prepare("INSERT OR REPLACE INTO sync_data (store_name, record_id, data, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))")
      .run(store, id, JSON.stringify(merged));

    // settings 更新时清除 orchestrator 缓存
    if (store === "settings") clearSettingsCache();

    writeAudit({ op: "UPDATE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", dataBefore: existing, dataAfter: patch, result: "OK (PATCH)" });

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data patch error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/data/:store/:id — 删除记录 */
dataRouter.delete("/data/:store/:id", (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    const idParsed = recordIdSchema.safeParse(req.params.id);
    if (!storeParsed.success || !idParsed.success) {
      const issues = [...(storeParsed.success ? [] : storeParsed.error.issues), ...(idParsed.success ? [] : idParsed.error.issues)];
      res.status(400).json({ ok: false, error: issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;
    const id = idParsed.data;

    const db = getSyncDb();

    // 读取删除前的数据（审计用）
    let dataBefore: unknown = undefined;
    const prev = db.prepare("SELECT data FROM sync_data WHERE store_name = ? AND record_id = ?").get(store, id) as { data: string } | undefined;
    if (prev) try { dataBefore = JSON.parse(prev.data); } catch { /* ignore */ }

    const result = db.prepare("DELETE FROM sync_data WHERE store_name = ? AND record_id = ?")
      .run(store, id);

    if (result.changes === 0) {
      writeAudit({ op: "DELETE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", result: "NOT_FOUND" });
      res.status(404).json({ ok: false, error: "Record not found" });
      return;
    }

    writeAudit({ op: "DELETE", store, recordId: id, caller: req.header("X-Caller") ?? "unknown", dataBefore, result: "OK" });

    res.json({ ok: true, id });
  } catch (err) {
    logger.error("Data delete error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** DELETE /api/data/:store — 删除指定 store 的所有记录 */
dataRouter.delete("/data/:store", (req, res) => {
  try {
    const storeParsed = storeNameSchema.safeParse(req.params.store);
    if (!storeParsed.success) {
      res.status(400).json({ ok: false, error: storeParsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const store = storeParsed.data;

    const db = getSyncDb();

    // 读取删除前的数据（审计用）
    const rows = db.prepare("SELECT record_id, data FROM sync_data WHERE store_name = ?").all(store) as Array<{ record_id: string; data: string }>;
    const dataBefore = rows.map(r => { try { return { id: r.record_id, ...JSON.parse(r.data) }; } catch { return { id: r.record_id }; } });

    const result = db.prepare("DELETE FROM sync_data WHERE store_name = ?")
      .run(store);

    writeAudit({ op: "DELETE_ALL", store, caller: req.header("X-Caller") ?? "unknown", dataBefore, result: `deleted ${result.changes}` });

    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    logger.error("Data delete error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

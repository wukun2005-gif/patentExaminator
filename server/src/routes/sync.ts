/**
 * 同步 API 路由 — 跨设备数据同步
 * 无认证，单用户场景
 */
import { Router } from "express";
import express from "express";
import {
  uploadAllData,
  downloadAllData,
  getSyncStatus,
} from "../lib/syncDb.js";
import { logger } from "../lib/logger.js";

export const syncRouter = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 文件上传配置（最大 100MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/** GET /api/sync/status — 获取同步状态 */
syncRouter.get("/sync/status", (_req, res) => {
  try {
    const status = getSyncStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    logger.error("Sync status error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** POST /api/sync/upload — 上传全部数据 */
syncRouter.post("/sync/upload", express.json({ limit: "50mb" }), (req, res) => {
  try {
    const { stores } = req.body as { stores: Record<string, Array<{ id: string; data: unknown }>> };
    if (!stores || typeof stores !== "object") {
      res.status(400).json({ ok: false, error: "Missing 'stores' field" });
      return;
    }

    const result = uploadAllData(stores);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("Sync upload error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/sync/download — 下载全部数据 */
syncRouter.get("/sync/download", (_req, res) => {
  try {
    const stores = downloadAllData();
    res.json({ ok: true, stores });
  } catch (err) {
    logger.error("Sync download error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

// B-026: sync/files 端点已删除（死代码，客户端只用 JSON 级批量同步）

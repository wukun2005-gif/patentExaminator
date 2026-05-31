/**
 * 同步 API 路由 — 跨设备数据同步
 * 无认证，单用户场景
 */
import { Router } from "express";
import express from "express";
import multer from "multer";
import {
  uploadAllData,
  downloadAllData,
  getSyncStatus,
  saveFile,
  readFile,
  listFiles,
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

/** POST /api/sync/files — 上传文件 */
syncRouter.post("/sync/files", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }

    const fileId = req.body.fileId ?? `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = req.file.originalname;
    const fileType = req.file.mimetype;

    saveFile(fileId, fileName, fileType, req.file.buffer);
    res.json({ ok: true, fileId, fileName, fileSize: req.file.size });
  } catch (err) {
    logger.error("File upload error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/sync/files/:id — 下载文件 */
syncRouter.get("/sync/files/:id", (req, res) => {
  try {
    const data = readFile(req.params.id);
    if (!data) {
      res.status(404).json({ ok: false, error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (err) {
    logger.error("File download error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

/** GET /api/sync/files — 列出所有文件 */
syncRouter.get("/sync/files", (_req, res) => {
  try {
    const files = listFiles();
    res.json({ ok: true, files });
  } catch (err) {
    logger.error("File list error: " + errMsg(err));
    res.status(500).json({ ok: false, error: errMsg(err) });
  }
});

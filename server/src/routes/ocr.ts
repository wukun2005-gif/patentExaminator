/**
 * OCR API 路由 — MIGRATE-002: OCR 从前端迁移到后端
 * 使用 Node.js Tesseract 进行 OCR
 */
import { Router } from "express";
import multer from "multer";
import { createWorker } from "tesseract.js";
import { logger } from "../lib/logger.js";

export const ocrRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/** POST /api/ocr — 执行 OCR */
ocrRouter.post("/ocr", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }

    const lang = (req.body.lang as string) ?? "chi_sim+eng";
    const file = req.file;

    logger.info(`OCR request: ${file.originalname} (${file.size} bytes, lang: ${lang})`);

    // 创建 Tesseract worker
    const worker = await createWorker(lang);

    try {
      // 执行 OCR
      const { data } = await worker.recognize(file.buffer);

      const result = {
        text: data.text,
        pageTexts: [data.text],
        confidence: data.confidence,
      };

      logger.info(`OCR completed: ${file.originalname} - ${data.confidence}% confidence, ${data.text.length} chars`);

      res.json({ ok: true, ...result });
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    logger.error("OCR error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

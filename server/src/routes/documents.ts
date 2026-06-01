/**
 * 文档处理 API 路由 — MIGRATE-003: PDF 文本提取迁移到后端
 * 使用 Node.js pdfjs-dist 进行 PDF 文本提取
 */
import { Router } from "express";
import express from "express";
import multer from "multer";
import { logger } from "../lib/logger.js";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/** POST /api/documents/extract-pdf — 提取 PDF 文本 */
documentsRouter.post("/documents/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }

    const file = req.file;
    logger.info(`PDF extraction request: ${file.originalname} (${file.size} bytes)`);

    // 动态导入 pdfjs-dist
    const pdfjsLib = await import("pdfjs-dist");

    const buffer = file.buffer;
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    const pageTexts: string[] = [];
    const pages: Array<{ pageNumber: number; startOffset: number; endOffset: number }> = [];
    let totalLength = 0;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => ("str" in item ? item.str : ""))
        .join(" ");

      const startOffset = totalLength;
      pageTexts.push(pageText);
      totalLength += pageText.length + 1; // +1 for newline separator

      pages.push({
        pageNumber: i,
        startOffset,
        endOffset: totalLength - 1
      });
    }

    const text = pageTexts.join("\n").trim();

    // Heuristic: if average characters per page < 40, likely no text layer
    const avgCharsPerPage = text.length / (pdf.numPages || 1);
    const hasTextLayer = avgCharsPerPage >= 40;

    logger.info(`PDF extraction completed: ${file.originalname} - ${pdf.numPages} pages, ${text.length} chars, hasTextLayer: ${hasTextLayer}`);

    res.json({
      ok: true,
      text,
      pages,
      hasTextLayer,
      pageCount: pdf.numPages,
    });
  } catch (err) {
    logger.error("PDF extraction error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

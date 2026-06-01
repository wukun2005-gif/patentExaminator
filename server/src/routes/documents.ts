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

/** POST /api/documents/extract-docx — 提取 DOCX 文本 */
documentsRouter.post("/documents/extract-docx", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }

    const file = req.file;
    logger.info(`DOCX extraction request: ${file.originalname} (${file.size} bytes)`);

    // 动态导入 mammoth
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });

    const text = result.value.trim();

    logger.info(`DOCX extraction completed: ${file.originalname} - ${text.length} chars`);

    res.json({
      ok: true,
      text,
    });
  } catch (err) {
    logger.error("DOCX extraction error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/documents/extract-html — 提取 HTML 文本 */
documentsRouter.post("/documents/extract-html", express.json(), async (req, res) => {
  try {
    const { html } = req.body as { html: string };
    if (!html) {
      res.status(400).json({ ok: false, error: "Missing html field" });
      return;
    }

    logger.info(`HTML extraction request: ${html.length} chars`);

    // 使用 cheerio 解析 HTML
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // 移除 script 和 style 元素
    $("script, style").remove();

    // 提取文本
    const text = ($.text())
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    logger.info(`HTML extraction completed: ${text.length} chars`);

    res.json({
      ok: true,
      text,
    });
  } catch (err) {
    logger.error("HTML extraction error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/documents/parse-claims — 解析权利要求 */
documentsRouter.post("/documents/parse-claims", express.json(), async (req, res) => {
  try {
    const { text, caseId } = req.body as { text: string; caseId: string };
    if (!text || !caseId) {
      res.status(400).json({ ok: false, error: "Missing text or caseId" });
      return;
    }

    logger.info(`Parse claims request: caseId=${caseId}, text=${text.length} chars`);

    const { parseClaims } = await import("../lib/claimParser.js");
    const result = parseClaims(text, caseId);

    logger.info(`Parse claims completed: ${result.claims.length} claims, ${result.warnings.length} warnings`);

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    logger.error("Parse claims error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * 文档处理 API 路由 — MIGRATE-003: PDF 文本提取迁移到后端
 * 使用 Node.js pdfjs-dist 进行 PDF 文本提取
 */
import { Router } from "express";
import express from "express";
import multer from "multer";
import { createRequire } from "module";
import path from "path";
import { logger } from "../lib/logger.js";
import {
  documentsExtractHtmlInputSchema,
  documentsExtractFromUrlInputSchema,
  documentsParseClaimsInputSchema,
  documentsMatchCitationInputSchema,
  documentsBuildTextIndexInputSchema,
} from "@shared/schemas/api-input.schema.js";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const FILE_SIZE_MAX = 100 * 1024 * 1024; // 100MB

/** POST /api/documents/extract-pdf — 提取 PDF 文本 */
documentsRouter.post("/documents/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "No file provided" });
      return;
    }
    if (req.file.size > FILE_SIZE_MAX) {
      res.status(400).json({ ok: false, error: "File too large (max 100MB)" });
      return;
    }
    if (req.file.mimetype !== "application/pdf") {
      res.status(400).json({ ok: false, error: "Invalid file type, expected PDF" });
      return;
    }

    const file = req.file;
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    logger.info(`PDF extraction request: ${originalName} (${file.size} bytes)`);

    // 动态导入 pdfjs-dist（Node.js 必须用 legacy build）
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const require = createRequire(import.meta.url);
    const pdfWorkerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerPath;

    const buffer = file.buffer;
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
      standardFontDataUrl: path.join(pdfjsDir, "standard_fonts") + "/",
    }).promise;

    const pageTexts: string[] = [];
    const pages: Array<{ pageNumber: number; startOffset: number; endOffset: number }> = [];
    let totalLength = 0;

    // Suppress pdfjs-dist internal warnings (e.g. font null-ref) during text extraction
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? "");
      if (msg.includes("getTextContent") || msg.includes("GetTextContent")) return;
      originalWarn.apply(console, args);
    };
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
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
    } finally {
      console.warn = originalWarn;
    }

    const text = pageTexts.join("\n").trim();

    // Heuristic: if average characters per page < 40, likely no text layer
    const avgCharsPerPage = text.length / (pdf.numPages || 1);
    const hasTextLayer = avgCharsPerPage >= 40;

    logger.info(`PDF extraction completed: ${originalName} - ${pdf.numPages} pages, ${text.length} chars, hasTextLayer: ${hasTextLayer}`);

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
    if (req.file.size > FILE_SIZE_MAX) {
      res.status(400).json({ ok: false, error: "File too large (max 100MB)" });
      return;
    }
    const validDocxMimetypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream", // some browsers/clients send generic mimetype
    ];
    if (!validDocxMimetypes.includes(req.file.mimetype)) {
      res.status(400).json({ ok: false, error: "Invalid file type, expected DOCX" });
      return;
    }

    const file = req.file;
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    logger.info(`DOCX extraction request: ${originalName} (${file.size} bytes)`);

    // 动态导入 mammoth
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });

    const text = result.value.trim();

    logger.info(`DOCX extraction completed: ${originalName} - ${text.length} chars`);

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
    const parsed = documentsExtractHtmlInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { html } = parsed.data;

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

/** POST /api/documents/extract-from-url — 从 URL 抓取并提取文本 */
documentsRouter.post("/documents/extract-from-url", express.json(), async (req, res) => {
  try {
    const parsed = documentsExtractFromUrlInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { url } = parsed.data;

    logger.info(`URL extraction request: ${url}`);

    const { extractFromUrl } = await import("../lib/knowledgeExtract.js");
    const result = await extractFromUrl(url);

    logger.info(`URL extraction completed: ${url} - ${result.text.length} chars, mediaType: ${result.mediaType}`);

    res.json({
      ok: true,
      text: result.text,
    });
  } catch (err) {
    logger.error("URL extraction error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/documents/parse-claims — 解析权利要求 */
documentsRouter.post("/documents/parse-claims", express.json(), async (req, res) => {
  try {
    const parsed = documentsParseClaimsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { text, caseId } = parsed.data;

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

/** POST /api/documents/match-citation — 引用匹配 */
documentsRouter.post("/documents/match-citation", express.json(), async (req, res) => {
  try {
    const parsed = documentsMatchCitationInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { citation, textIndex } = parsed.data;

    logger.info(`Match citation request`);

    const { matchCitation } = await import("../lib/citationMatch.js");
    const result = matchCitation(citation as Parameters<typeof matchCitation>[0], textIndex as Parameters<typeof matchCitation>[1]);

    logger.info(`Match citation completed: ${result.status}, ${result.confidence}`);

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    logger.error("Match citation error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/documents/build-text-index — 构建文本索引 */
documentsRouter.post("/documents/build-text-index", express.json(), async (req, res) => {
  try {
    const parsed = documentsBuildTextIndexInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map(i => i.message).join("; ") });
      return;
    }
    const { text } = parsed.data;

    logger.info(`Build text index request: ${text.length} chars`);

    const { buildTextIndex } = await import("../lib/textIndex.js");
    const result = buildTextIndex(text);

    logger.info(`Build text index completed: ${result.paragraphs.length} paragraphs, ${result.lineMap.length} lines`);

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    logger.error("Build text index error: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

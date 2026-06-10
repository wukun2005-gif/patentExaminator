/**
 * nf3: 聊天附件文件提取路由
 *
 * POST /api/chat/extract — 接受单文件上传，提取文本内容返回给客户端
 * 支持格式：PDF、DOCX、TXT、HTML、图片（PNG/JPG/GIF/WebP/BMP）
 *
 * 设计原则（CLAUDE.md ADR-006）：所有文件处理在 server 端完成，client 只负责 UI。
 */
import { Router } from "express";
import multer from "multer";
import { createRequire } from "module";
import path from "path";
import { logger } from "../lib/logger.js";

export const chatAttachmentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB（聊天附件比文档导入小）
});

const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 支持的文件类型映射 */
const SUPPORTED_MIME_TYPES: Record<string, "pdf" | "docx" | "text" | "html" | "image"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/octet-stream": "docx", // 某些浏览器发送通用 MIME
  "text/plain": "text",
  "text/html": "html",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/bmp": "image",
  "image/tiff": "image",
};

/** 支持的文件扩展名（MIME 不可靠时 fallback） */
const EXTENSION_MAP: Record<string, "pdf" | "docx" | "text" | "html" | "image"> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".doc": "docx",
  ".txt": "text",
  ".html": "html",
  ".htm": "html",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".tiff": "image",
  ".tif": "image",
};

function detectFileType(mimeType: string, fileName: string): "pdf" | "docx" | "text" | "html" | "image" | null {
  // 先按 MIME 类型
  const byMime = SUPPORTED_MIME_TYPES[mimeType];
  if (byMime) return byMime;

  // fallback 按扩展名
  const ext = path.extname(fileName).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/** 从 PDF 提取文本 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  const pdfWorkerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerPath;

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: path.join(pdfjsDir, "standard_fonts") + "/",
  }).promise;

  const pageTexts: string[] = [];
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
      pageTexts.push(pageText);
    }
  } finally {
    console.warn = originalWarn;
  }

  return pageTexts.join("\n").trim();
}

/** 从 DOCX 提取文本 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/** 从 HTML 提取纯文本 */
async function extractHtmlText(buffer: Buffer): Promise<string> {
  const cheerio = await import("cheerio");
  const html = buffer.toString("utf-8");
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $.text()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

/** 从图片提取 base64 */
function extractImageBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * POST /api/chat/extract
 *
 * 接受 multipart/form-data，字段名 "file"
 * 返回：{ ok, text, mimeType, fileName, base64? }
 */
chatAttachmentsRouter.post("/chat/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "未提供文件" });
      return;
    }

    const file = req.file;
    if (file.size > MAX_FILE_SIZE) {
      res.status(400).json({ ok: false, error: "文件过大（最大 20MB）" });
      return;
    }

    const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const fileType = detectFileType(file.mimetype, fileName);

    if (!fileType) {
      res.status(400).json({
        ok: false,
        error: `不支持的文件格式: ${file.mimetype || "未知"}。支持 PDF、DOCX、TXT、HTML 和图片格式。`,
      });
      return;
    }

    logger.info(`[ChatExtract] 提取文件: ${fileName} (${file.mimetype}, ${file.size} bytes, type=${fileType})`);

    let text = "";
    let base64: string | undefined;

    switch (fileType) {
      case "pdf":
        text = await extractPdfText(file.buffer);
        break;
      case "docx":
        text = await extractDocxText(file.buffer);
        break;
      case "text":
        text = file.buffer.toString("utf-8").trim();
        break;
      case "html":
        text = await extractHtmlText(file.buffer);
        break;
      case "image":
        // 图片：返回 base64 供视觉模型使用，同时返回文件名作为上下文
        base64 = extractImageBase64(file.buffer);
        text = `[用户上传了图片: ${fileName}]`;
        break;
    }

    // 截断过长文本（聊天场景不需要全文，保留前 50000 字符）
    const MAX_TEXT_LENGTH = 50000;
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... 文件内容过长，已截断 ...]";
    }

    logger.info(`[ChatExtract] 提取完成: ${fileName} - ${text.length} chars${base64 ? ", 含图片 base64" : ""}`);

    res.json({
      ok: true,
      text,
      mimeType: file.mimetype,
      fileName,
      ...(base64 ? { base64 } : {}),
    });
  } catch (err) {
    logger.error("[ChatExtract] 提取错误: " + (err instanceof Error ? err.message : String(err)));
    res.status(500).json({
      ok: false,
      error: `文件提取失败: ${err instanceof Error ? err.message : "未知错误"}`,
    });
  }
});

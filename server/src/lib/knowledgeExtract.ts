/**
 * 服务端知识库处理 — 提取、切片、向量化、存储
 */
import type { KnowledgeSource as _KnowledgeSource, KnowledgeChunk as _KnowledgeChunk, KnowledgeVector as _KnowledgeVector, KnowledgeConfig as _KnowledgeConfig } from "@shared/types/knowledge";
import { logger } from "./logger.js";

// ── 提取 ──────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  mediaType: "text" | "table" | "image";
}

export async function extractText(fileBuffer: Buffer, fileName: string): Promise<ExtractionResult> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    return extractPdf(fileBuffer);
  } else if (ext === "docx" || ext === "doc") {
    return extractDocx(fileBuffer);
  } else if (ext === "json") {
    return { text: fileBuffer.toString("utf-8"), mediaType: "text" };
  } else if (ext === "xlsx" || ext === "xls") {
    return extractExcel(fileBuffer);
  } else if (ext === "csv") {
    return { text: fileBuffer.toString("utf-8"), mediaType: "table" };
  } else if (["jpg", "jpeg", "png"].includes(ext)) {
    return { text: `[图片: ${fileName}]`, mediaType: "image" };
  } else {
    return { text: fileBuffer.toString("utf-8"), mediaType: "text" };
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // 静默 pdfjs 警告（字体数据等），只做文本提取不需要渲染
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: { str?: string }) => item.str ?? "").join(" ");
      texts.push(pageText);
    }
    return { text: texts.join("\n\n"), mediaType: "text" };
  } catch (err) {
    logger.warn(`PDF extraction failed: ${err}, falling back to raw text`);
    return { text: buffer.toString("utf-8"), mediaType: "text" };
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, mediaType: "text" };
  } catch (err) {
    logger.warn(`DOCX extraction failed: ${err}`);
    return { text: buffer.toString("utf-8"), mediaType: "text" };
  }
}

async function extractExcel(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0] ?? "";
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const text = data.map((row) =>
      (Array.isArray(row) ? row : [row]).map((c) => String(c ?? "")).join(" | ")
    ).join("\n");
    return { text, mediaType: "table" };
  } catch (err) {
    logger.warn(`Excel extraction failed: ${err}`);
    return { text: buffer.toString("utf-8"), mediaType: "table" };
  }
}

export async function extractFromUrl(url: string): Promise<ExtractionResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const html = await response.text();
  // Simple HTML to text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, mediaType: "text" };
}

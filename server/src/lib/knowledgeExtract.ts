/**
 * 服务端知识库处理 — 提取、切片、向量化、存储
 */
import { createRequire } from "module";
import path from "path";
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
    const texts: string[] = [];
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
        const content = await page.getTextContent();
        const pageText = reconstructParagraphs(content.items);
        texts.push(pageText);
      }
    } finally {
      console.warn = originalWarn;
    }
    return { text: texts.join("\n\n"), mediaType: "text" };
  } catch (err) {
    logger.warn(`PDF extraction failed: ${err}, falling back to raw text`);
    return { text: buffer.toString("utf-8"), mediaType: "text" };
  }
}

/** PDF 段落重建：基于文本项的垂直位置检测段落边界 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconstructParagraphs(items: any[]): string {
  if (items.length === 0) return "";

  const lines: Array<{ text: string; y: number }> = [];
  let currentLine = "";
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  for (const item of items) {
    const text = "str" in item ? (item as { str: string }).str : "";
    if (!text) continue;

    // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    const transform = "transform" in item ? (item as { transform: number[] }).transform : undefined;
    const y = transform?.[5] ?? 0;
    const x = transform?.[4] ?? 0;

    // 检测换行：Y 坐标变化超过阈值
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.trim()) {
        lines.push({ text: currentLine.trim(), y: lastY });
      }
      currentLine = text;
    } else {
      // 同一行：检查水平间距（检测列间距或段落缩进）
      if (lastEndX !== null && x - lastEndX > 20) {
        // 大间距：可能是新段落或列
        currentLine += "  " + text;
      } else {
        currentLine += text;
      }
    }
    lastY = y;
    lastEndX = x + text.length * 5; // 估算文本结束位置
  }
  if (currentLine.trim() && lastY !== null) {
    lines.push({ text: currentLine.trim(), y: lastY });
  }

  // 检测段落边界：基于行间距
  const paragraphs: string[] = [];
  let currentPara = "";
  let lastLineY: number | null = null;

  for (const line of lines) {
    if (lastLineY !== null) {
      const gap = lastLineY - line.y; // PDF 坐标系 Y 轴向下
      if (gap > 15) {
        // 大行间距：新段落
        if (currentPara) paragraphs.push(currentPara);
        currentPara = line.text;
      } else {
        currentPara += line.text;
      }
    } else {
      currentPara = line.text;
    }
    lastLineY = line.y;
  }
  if (currentPara) paragraphs.push(currentPara);

  return paragraphs.join("\n\n");
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
    if (!sheet) return { text: buffer.toString("utf-8"), mediaType: "table" };
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
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

  // 检测 Content-Type，PDF 走专用解析
  const contentType = response.headers.get("content-type") ?? "";
  const isPdfByType = contentType.includes("application/pdf");
  const isPdfByUrl = url.toLowerCase().split("?")[0]?.endsWith(".pdf") ?? false;

  if (isPdfByType || isPdfByUrl) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info(`[URL] PDF detected (${isPdfByType ? "content-type" : "url-ext"}), size=${buffer.length}`);
    return extractPdf(buffer);
  }

  // HTML → 纯文本
  const html = await response.text();
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

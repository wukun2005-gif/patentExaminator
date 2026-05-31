/**
 * 知识库内容提取器 — 支持多格式文件和在线 URL
 */
import type { KnowledgeFileFormat, KnowledgeMediaType } from "@shared/types/knowledge";
import { extractPdfText } from "../pdfText";
import { extractDocxText } from "../docxText";
import { extractHtmlText } from "../htmlText";
import { normalizeText } from "./normalizers";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeExtractor");

export interface ExtractionResult {
  text: string;
  mediaType: KnowledgeMediaType;
  /** 表格模式：每行数据（含表头） */
  rows?: string[][];
  /** 表格模式：列名 */
  columnNames?: string[];
  /** 表格模式：sheet 名 */
  sheetName?: string;
}

// ── 格式推断 ──────────────────────────────────────────

export function inferFileFormat(fileName: string): KnowledgeFileFormat {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, KnowledgeFileFormat> = {
    pdf: "pdf", txt: "txt", md: "md",
    docx: "docx", doc: "doc", json: "json",
    xlsx: "xlsx", xls: "xls", csv: "csv",
    jpg: "jpg", jpeg: "jpeg", png: "png",
  };
  return map[ext] ?? "txt";
}

export function inferMediaType(format: KnowledgeFileFormat): KnowledgeMediaType {
  if (["xlsx", "xls", "csv"].includes(format)) return "table";
  if (["jpg", "jpeg", "png"].includes(format)) return "image";
  return "text";
}

// ── 文本提取 ──────────────────────────────────────────

export async function extractFromFile(file: File): Promise<ExtractionResult> {
  const format = inferFileFormat(file.name);
  const mediaType = inferMediaType(format);

  log(`Extracting ${file.name} (format=${format}, mediaType=${mediaType})`);

  switch (format) {
    case "pdf":
      return extractFromPdf(file);
    case "docx":
    case "doc":
      return extractFromDocx(file);
    case "txt":
    case "md":
      return extractFromText(file);
    case "json":
      return extractFromJson(file);
    case "xlsx":
    case "xls":
      return extractFromExcel(file);
    case "csv":
      return extractFromCsv(file);
    case "jpg":
    case "jpeg":
    case "png":
      return extractFromImage(file);
    default:
      return extractFromText(file);
  }
}

async function extractFromPdf(file: File): Promise<ExtractionResult> {
  const result = await extractPdfText(file);
  return { text: normalizeText(result.text), mediaType: "text" };
}

async function extractFromDocx(file: File): Promise<ExtractionResult> {
  const result = await extractDocxText(file);
  return { text: normalizeText(result.text), mediaType: "text" };
}

async function extractFromText(file: File): Promise<ExtractionResult> {
  const text = await file.text();
  return { text: normalizeText(text), mediaType: "text" };
}

async function extractFromJson(file: File): Promise<ExtractionResult> {
  const raw = await file.text();
  // 保留原始 JSON 文本，chunking 阶段再按 key/数组拆分（不做 normalize，保留 JSON 结构）
  return { text: raw.trim(), mediaType: "text" };
}

// ── 表格提取 ──────────────────────────────────────────

async function extractFromExcel(file: File): Promise<ExtractionResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0] ?? "";
  const sheet = workbook.Sheets[sheetName]!;
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (data.length === 0) {
    return { text: "", mediaType: "table", rows: [], columnNames: [], sheetName };
  }

  const rows = data.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []
  );
  const columnNames = rows[0] ?? [];
  const text = rows.map((row) => row.join(" | ")).join("\n");

  return { text, mediaType: "table", rows, columnNames, sheetName };
}

async function extractFromCsv(file: File): Promise<ExtractionResult> {
  const raw = await file.text();
  const lines = raw.split("\n").filter((l) => l.trim());
  const rows = lines.map((line) => parseCsvLine(line));

  if (rows.length === 0) {
    return { text: "", mediaType: "table", rows: [], columnNames: [] };
  }

  const columnNames = rows[0] ?? [];
  const text = rows.map((row) => row.join(" | ")).join("\n");

  return { text, mediaType: "table", rows, columnNames };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ── 图片提取 ──────────────────────────────────────────

async function extractFromImage(file: File): Promise<ExtractionResult> {
  const Tesseract = await import("tesseract.js");
  const result = await Tesseract.recognize(file, "chi_sim+eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        log(`OCR progress: ${Math.round((m.progress ?? 0) * 100)}%`);
      }
    },
  });
  const text = result.data.text.trim();
  return { text, mediaType: "image" };
}

// ── URL 抓取 ──────────────────────────────────────────

export async function extractFromUrl(url: string): Promise<ExtractionResult> {
  log(`Fetching URL: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const result = extractHtmlText(html);
  return { text: normalizeText(result.text), mediaType: "text" };
}

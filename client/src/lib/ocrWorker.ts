export interface OcrProgress {
  status: string;
  progress: number; // 0-1
  currentPage: number;
  totalPages: number;
}

export interface OcrResult {
  text: string;
  pageTexts: string[];
  confidence: number;
}

/**
 * Run OCR on a PDF file using server-side Tesseract.
 * MIGRATE-002: OCR 从前端迁移到后端
 *
 * @param file - The PDF file to OCR
 * @param lang - Tesseract language code (default: "chi_sim+eng")
 * @param onProgress - Progress callback
 */
export async function runOcr(
  file: File,
  lang: string = "chi_sim+eng",
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  onProgress?.({
    status: "uploading",
    progress: 0,
    currentPage: 0,
    totalPages: 1
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("lang", lang);

  const res = await fetch("/api/ocr", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`OCR failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean; text: string; pageTexts: string[]; confidence: number };

  onProgress?.({
    status: "completed",
    progress: 1,
    currentPage: 1,
    totalPages: 1
  });

  return {
    text: data.text,
    pageTexts: data.pageTexts,
    confidence: data.confidence,
  };
}

/**
 * Compute OCR cache key: sha256(file) + lang + pageCount
 */
export async function computeOcrCacheKey(file: File, lang: string, pageCount: number): Promise<string> {
  const { computeFileHash } = await import("./fileHash");
  const hash = await computeFileHash(file);
  return `${hash}-${lang}-${pageCount}`;
}

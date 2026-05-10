import { createWorker } from "tesseract.js";

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
 * Run OCR on a PDF file using Tesseract.js.
 * Runs entirely in-browser (ADR-006: no cloud OCR).
 *
 * @param file - The PDF file to OCR
 * @param lang - Tesseract language code (default: "chi_sim+eng")
 * @param onProgress - Progress callback
 * @param cacheKey - Optional cache key for OCR cache lookup
 */
export async function runOcr(
  file: File,
  lang: string = "chi_sim+eng",
  onProgress?: (progress: OcrProgress) => void,
  cacheKey?: string
): Promise<OcrResult> {
  // Check OCR cache first
  if (cacheKey) {
    const { readOcrCache } = await import("./repositories/ocrCacheRepo");
    const cached = await readOcrCache(cacheKey);
    if (cached) {
      return { text: cached, pageTexts: [cached], confidence: 100 };
    }
  }

  const worker = await createWorker(lang, undefined, {
    logger: (info: { status: string; progress: number }) => {
      onProgress?.({
        status: info.status,
        progress: info.progress,
        currentPage: 0,
        totalPages: 1
      });
    }
  });

  let imageUrl: string | undefined;
  try {
    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer]);
    imageUrl = URL.createObjectURL(blob);
    const result = await worker.recognize(imageUrl);

    const text = result.data.text;
    const pageTexts = [text];
    const confidence = result.data.confidence;

    if (cacheKey && text) {
      const { writeOcrCache } = await import("./repositories/ocrCacheRepo");
      await writeOcrCache(cacheKey, text);
    }

    return { text, pageTexts, confidence };
  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    await worker.terminate();
  }
}

/**
 * Compute OCR cache key: sha256(file) + lang + pageCount
 */
export async function computeOcrCacheKey(file: File, lang: string, pageCount: number): Promise<string> {
  const { computeFileHash } = await import("./fileHash");
  const hash = await computeFileHash(file);
  return `${hash}-${lang}-${pageCount}`;
}

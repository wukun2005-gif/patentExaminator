import type { TextIndex } from "@shared/types/domain";

/**
 * Build a TextIndex from raw extracted text.
 * MIGRATE-011: 调用后端 API 构建文本索引
 */
export async function buildTextIndex(text: string): Promise<TextIndex> {
  const res = await fetch("/api/documents/build-text-index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Build text index failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean } & TextIndex;
  return {
    pages: data.pages,
    paragraphs: data.paragraphs,
    lineMap: data.lineMap,
  };
}

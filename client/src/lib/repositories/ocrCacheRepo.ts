import { getDB } from "../indexedDb.js";

const OCR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function writeOcrCache(cacheKey: string, text: string): Promise<void> {
  const db = await getDB();
  await db.put("ocrCache", { cacheKey, text, createdAt: Date.now() });
}

export async function readOcrCache(cacheKey: string): Promise<string | null> {
  const db = await getDB();
  const entry = await db.get("ocrCache", cacheKey);
  if (!entry) return null;

  // Check 7-day expiry
  if (Date.now() - entry.createdAt > OCR_CACHE_TTL_MS) {
    await db.delete("ocrCache", cacheKey);
    return null;
  }

  return entry.text;
}

export async function deleteOcrCache(cacheKey: string): Promise<void> {
  const db = await getDB();
  await db.delete("ocrCache", cacheKey);
}

export async function clearExpiredOcrCache(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("ocrCache");
  let cleared = 0;
  const now = Date.now();
  for (const entry of all) {
    if (now - entry.createdAt > OCR_CACHE_TTL_MS) {
      await db.delete("ocrCache", entry.cacheKey);
      cleared++;
    }
  }
  return cleared;
}

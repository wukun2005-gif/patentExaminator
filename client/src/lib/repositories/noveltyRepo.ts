import { getDB } from "../indexedDb.js";
import type { NoveltyComparison } from "@shared/types/domain";

export async function createNovelty(item: NoveltyComparison): Promise<void> {
  const db = await getDB();
  await db.put("novelty", item);
}

export async function readAllNovelty(): Promise<NoveltyComparison[]> {
  const db = await getDB();
  return db.getAll("novelty");
}

export async function readNoveltyByCaseId(caseId: string): Promise<NoveltyComparison[]> {
  const db = await getDB();
  return db.getAllFromIndex("novelty", "by-caseId", caseId);
}

export async function readNoveltyById(id: string): Promise<NoveltyComparison | undefined> {
  const db = await getDB();
  return db.get("novelty", id);
}

export async function updateNovelty(item: NoveltyComparison): Promise<void> {
  const db = await getDB();
  await db.put("novelty", item);
}

export async function deleteNovelty(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("novelty", id);
}

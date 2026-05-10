import { getDB } from "../indexedDb.js";
import type { PatentCase } from "@shared/types/domain";

export async function createCase(item: PatentCase): Promise<void> {
  const db = await getDB();
  await db.put("cases", item);
}

export async function readAllCases(): Promise<PatentCase[]> {
  const db = await getDB();
  return db.getAllFromIndex("cases", "by-updatedAt");
}

export async function readCaseById(id: string): Promise<PatentCase | undefined> {
  const db = await getDB();
  return db.get("cases", id);
}

export async function updateCase(item: PatentCase): Promise<void> {
  const db = await getDB();
  await db.put("cases", { ...item, updatedAt: new Date().toISOString() });
}

export async function deleteCase(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("cases", id);
}

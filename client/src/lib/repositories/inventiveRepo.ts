import { getDB } from "../indexedDb.js";
import type { InventiveStepAnalysis } from "@shared/types/domain";

export async function createInventive(item: InventiveStepAnalysis): Promise<void> {
  const db = await getDB();
  await db.put("inventive", item);
}

export async function readAllInventive(): Promise<InventiveStepAnalysis[]> {
  const db = await getDB();
  return db.getAll("inventive");
}

export async function readInventiveByCaseId(caseId: string): Promise<InventiveStepAnalysis[]> {
  const db = await getDB();
  return db.getAllFromIndex("inventive", "by-caseId", caseId);
}

export async function readInventiveById(id: string): Promise<InventiveStepAnalysis | undefined> {
  const db = await getDB();
  return db.get("inventive", id);
}

export async function updateInventive(item: InventiveStepAnalysis): Promise<void> {
  const db = await getDB();
  await db.put("inventive", item);
}

export async function deleteInventive(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("inventive", id);
}

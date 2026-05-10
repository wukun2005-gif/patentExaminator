import { getDB } from "../indexedDb.js";
import type { SourceDocument } from "@shared/types/domain";

export async function createDocument(item: SourceDocument): Promise<void> {
  const db = await getDB();
  await db.put("documents", item);
}

export async function readAllDocuments(): Promise<SourceDocument[]> {
  const db = await getDB();
  return db.getAll("documents");
}

export async function readDocumentsByCaseId(caseId: string): Promise<SourceDocument[]> {
  const db = await getDB();
  return db.getAllFromIndex("documents", "by-caseId", caseId);
}

export async function readDocumentById(id: string): Promise<SourceDocument | undefined> {
  const db = await getDB();
  return db.get("documents", id);
}

export async function updateDocument(item: SourceDocument): Promise<void> {
  const db = await getDB();
  await db.put("documents", item);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("documents", id);
}

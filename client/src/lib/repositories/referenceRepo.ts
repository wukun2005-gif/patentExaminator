import { getDB } from "../indexedDb.js";
import type { SourceDocument } from "@shared/types/domain";

// ReferenceDocument extends SourceDocument; stored in the same "documents" store
// with role="reference"

export async function readReferencesByCaseId(caseId: string): Promise<SourceDocument[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("documents", "by-caseId", caseId);
  return all.filter((doc) => doc.role === "reference");
}

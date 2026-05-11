import { getDB } from "../indexedDb";
import type { FormalDefect } from "@shared/types/domain";

export async function createDefect(defect: FormalDefect): Promise<void> {
  const db = await getDB();
  await db.put("defects", defect);
}

export async function getDefectsByCaseId(caseId: string): Promise<FormalDefect[]> {
  const db = await getDB();
  return db.getAllFromIndex("defects", "by-caseId", caseId);
}

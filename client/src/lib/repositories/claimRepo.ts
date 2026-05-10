import { getDB } from "../indexedDb.js";
import type { ClaimNode, ClaimFeature } from "@shared/types/domain";

// ClaimNode operations
export async function createClaimNode(item: ClaimNode): Promise<void> {
  const db = await getDB();
  await db.put("claimNodes", item);
}

export async function readClaimNodesByCaseId(caseId: string): Promise<ClaimNode[]> {
  const db = await getDB();
  return db.getAllFromIndex("claimNodes", "by-caseId", caseId);
}

export async function deleteClaimNode(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("claimNodes", id);
}

// ClaimFeature (claimChart) operations
export async function createClaimFeature(item: ClaimFeature): Promise<void> {
  const db = await getDB();
  await db.put("claimCharts", item);
}

export async function readClaimFeaturesByCaseId(caseId: string): Promise<ClaimFeature[]> {
  const db = await getDB();
  return db.getAllFromIndex("claimCharts", "by-caseId", caseId);
}

export async function readClaimFeaturesByClaimNumber(
  caseId: string,
  claimNumber: number
): Promise<ClaimFeature[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("claimCharts", "by-claimNumber", claimNumber);
  return all.filter((f) => f.claimNumber === claimNumber && f.id.startsWith(caseId));
}

export async function updateClaimFeature(item: ClaimFeature): Promise<void> {
  const db = await getDB();
  await db.put("claimCharts", item);
}

export async function deleteClaimFeature(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("claimCharts", id);
}

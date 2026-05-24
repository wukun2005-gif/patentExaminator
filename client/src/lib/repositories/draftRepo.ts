import { getDB } from "../indexedDb.js";
import type { ReexamDraftResponse, SummaryResponse } from "../../agent/contracts.js";

const DRAFT_STORE = "reexamDrafts";
const SUMMARY_STORE = "summaries";

export async function saveReexamDraft(caseId: string, draft: ReexamDraftResponse): Promise<void> {
  const db = await getDB();
  await db.put(DRAFT_STORE, { id: caseId, ...draft });
}

export async function readReexamDraft(caseId: string): Promise<ReexamDraftResponse | undefined> {
  const db = await getDB();
  const record = await db.get(DRAFT_STORE, caseId);
  if (!record) return undefined;
  // Remove the id field that was added for storage
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as ReexamDraftResponse;
}

export async function deleteReexamDraft(caseId: string): Promise<void> {
  const db = await getDB();
  await db.delete(DRAFT_STORE, caseId);
}

export async function saveSummary(caseId: string, summary: SummaryResponse): Promise<void> {
  const db = await getDB();
  await db.put(SUMMARY_STORE, { id: caseId, ...summary });
}

export async function readSummary(caseId: string): Promise<SummaryResponse | undefined> {
  const db = await getDB();
  const record = await db.get(SUMMARY_STORE, caseId);
  if (!record) return undefined;
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as SummaryResponse;
}

export async function deleteSummary(caseId: string): Promise<void> {
  const db = await getDB();
  await db.delete(SUMMARY_STORE, caseId);
}

export async function clearDraftData(caseId: string): Promise<void> {
  await deleteReexamDraft(caseId);
  await deleteSummary(caseId);
}
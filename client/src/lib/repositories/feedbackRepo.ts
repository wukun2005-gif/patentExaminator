import { getDB } from "../indexedDb.js";
import type { FeedbackItem } from "@shared/types/feedback";

export async function createFeedback(item: FeedbackItem): Promise<void> {
  const db = await getDB();
  await db.put("feedback", item);
}

export async function readAllFeedback(): Promise<FeedbackItem[]> {
  const db = await getDB();
  return db.getAll("feedback");
}

export async function readFeedbackByCaseId(caseId: string): Promise<FeedbackItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("feedback", "by-caseId", caseId);
}

export async function updateFeedback(item: FeedbackItem): Promise<void> {
  const db = await getDB();
  await db.put("feedback", item);
}

export async function deleteFeedback(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("feedback", id);
}

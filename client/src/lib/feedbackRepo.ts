import type { FeedbackEntry } from "@shared/types/domain";

const STORAGE_KEY = "patent-examiner-feedback";

function readAll(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FeedbackEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: FeedbackEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getFeedback(targetId: string): FeedbackEntry | undefined {
  return readAll().find((e) => e.targetId === targetId);
}

export function getAllFeedback(): FeedbackEntry[] {
  return readAll();
}

export function saveFeedback(entry: FeedbackEntry): void {
  const all = readAll();
  const idx = all.findIndex((e) => e.targetId === entry.targetId);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  writeAll(all);
}

export function deleteFeedback(targetId: string): void {
  writeAll(readAll().filter((e) => e.targetId !== targetId));
}

export function clearAllFeedback(): void {
  localStorage.removeItem(STORAGE_KEY);
}

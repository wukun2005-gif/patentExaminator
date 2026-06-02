import { create } from "zustand";
import type { ReexamDraftResponse, SummaryResponse } from "@shared/types/api";
import { createLogger } from "../../../lib/logger";
import {
  saveReexamDraft,
  saveSummary,
  clearDraftData as clearDraftDataInDB
} from "../../../lib/repos.js";

const log = createLogger("DraftSlice");

export interface DraftSlice {
  reexamDrafts: Record<string, ReexamDraftResponse>; // caseId → draft
  summaries: Record<string, SummaryResponse>; // caseId → summary
  setReexamDraft: (caseId: string, draft: ReexamDraftResponse) => void;
  loadReexamDraft: (caseId: string, draft: ReexamDraftResponse) => void; // Load from DB without re-saving
  setSummary: (caseId: string, summary: SummaryResponse) => void;
  loadSummary: (caseId: string, summary: SummaryResponse) => void; // Load from DB without re-saving
  clearDraftData: (caseId: string) => void;
}

export const createDraftSlice = (
  set: (fn: (prev: DraftSlice) => Partial<DraftSlice>) => void,
  _get: () => DraftSlice
): DraftSlice => ({
  reexamDrafts: {},
  summaries: {},

  setReexamDraft: (caseId, draft) => {
    saveReexamDraft(caseId, draft).catch((e) => log("error", "saveReexamDraft error:", e));
    set((prev) => ({
      reexamDrafts: { ...prev.reexamDrafts, [caseId]: draft }
    }));
  },
  loadReexamDraft: (caseId, draft) => {
    // Load from DB without re-saving to IndexedDB
    set((prev) => ({
      reexamDrafts: { ...prev.reexamDrafts, [caseId]: draft }
    }));
  },
  setSummary: (caseId, summary) => {
    saveSummary(caseId, summary).catch((e) => log("error", "saveSummary error:", e));
    set((prev) => ({
      summaries: { ...prev.summaries, [caseId]: summary }
    }));
  },
  loadSummary: (caseId, summary) => {
    // Load from DB without re-saving to IndexedDB
    set((prev) => ({
      summaries: { ...prev.summaries, [caseId]: summary }
    }));
  },
  clearDraftData: (caseId) => {
    clearDraftDataInDB(caseId).catch((e) => log("error", "clearDraftData error:", e));
    set((prev) => {
      const nextDrafts = { ...prev.reexamDrafts };
      delete nextDrafts[caseId];
      const nextSummaries = { ...prev.summaries };
      delete nextSummaries[caseId];
      return { reexamDrafts: nextDrafts, summaries: nextSummaries };
    });
  }
});

export const useDraftStore = create<DraftSlice>()((set, get) =>
  createDraftSlice(set, get)
);
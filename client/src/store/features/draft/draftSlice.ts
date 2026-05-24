import { create } from "zustand";
import type { ReexamDraftResponse, SummaryResponse } from "../../../agent/contracts";
import {
  saveReexamDraft,
  saveSummary,
  clearDraftData
} from "../../../lib/repositories/draftRepo.js";

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
    saveReexamDraft(caseId, draft).catch((e) => console.error("[DraftSlice] saveReexamDraft error:", e));
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
    saveSummary(caseId, summary).catch((e) => console.error("[DraftSlice] saveSummary error:", e));
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
    clearDraftData(caseId).catch((e) => console.error("[DraftSlice] clearDraftData error:", e));
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
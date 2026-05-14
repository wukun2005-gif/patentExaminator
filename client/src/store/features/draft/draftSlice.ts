import { create } from "zustand";
import type { ReexamDraftResponse } from "../../../agent/contracts";

export interface DraftSlice {
  reexamDrafts: Record<string, ReexamDraftResponse>; // caseId → draft
  setReexamDraft: (caseId: string, draft: ReexamDraftResponse) => void;
  clearDraftData: (caseId: string) => void;
}

export const createDraftSlice = (
  set: (fn: (prev: DraftSlice) => Partial<DraftSlice>) => void,
  _get: () => DraftSlice
): DraftSlice => ({
  reexamDrafts: {},

  setReexamDraft: (caseId, draft) =>
    set((prev) => ({
      reexamDrafts: { ...prev.reexamDrafts, [caseId]: draft }
    })),

  clearDraftData: (caseId) =>
    set((prev) => {
      const next = { ...prev.reexamDrafts };
      delete next[caseId];
      return { reexamDrafts: next };
    })
});

export const useDraftStore = create<DraftSlice>()((set, get) =>
  createDraftSlice(set, get)
);

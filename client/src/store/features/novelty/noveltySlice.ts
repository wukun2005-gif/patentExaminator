import { create } from "zustand";
import type { NoveltyComparison } from "@shared/types/domain";
import {
  createNovelty,
  updateNovelty,
  deleteNovelty,
  deleteNoveltyByCaseId
} from "../../../lib/repos.js";

import { createLogger } from "../../../lib/logger";

const debugNoveltySliceLog = createLogger("NoveltySlice");

export interface NoveltySlice {
  comparisons: NoveltyComparison[];
  isLoading: boolean;

  setComparisons: (comparisons: NoveltyComparison[]) => void;
  loadComparisons: (comparisons: NoveltyComparison[]) => void; // Load from DB without re-saving
  addComparison: (comparison: NoveltyComparison) => void;
  updateComparison: (comparison: NoveltyComparison) => void;
  removeComparison: (id: string) => void;
  clearComparisonsByCase: (caseId: string) => void;
  setLoading: (v: boolean) => void;
}

export const createNoveltySlice = (
  set: (fn: (prev: NoveltySlice) => Partial<NoveltySlice>) => void,
  _get: () => NoveltySlice
): NoveltySlice => ({
  comparisons: [],
  isLoading: false,

  setComparisons: (comparisons) => {
    debugNoveltySliceLog("setComparisons:", { count: comparisons.length, ids: comparisons.map(c => c.id) });
    // Persist each comparison to IndexedDB
    for (const comp of comparisons) {
      createNovelty(comp).catch((e) => debugNoveltySliceLog("[NoveltySlice] createNovelty error:", e));
    }
    return set(() => ({ comparisons }));
  },
  loadComparisons: (comparisons) => {
    // Load from DB without re-saving to IndexedDB
    debugNoveltySliceLog("loadComparisons:", { count: comparisons.length, ids: comparisons.map(c => c.id) });
    return set(() => ({ comparisons }));
  },
  addComparison: (comparison) => {
    debugNoveltySliceLog("addComparison:", { id: comparison.id, referenceId: comparison.referenceId, caseId: comparison.caseId });
    createNovelty(comparison).catch((e) => debugNoveltySliceLog("[NoveltySlice] createNovelty error:", e));
    return set((prev) => ({ comparisons: [...prev.comparisons, comparison] }));
  },
  updateComparison: (comparison) => {
    debugNoveltySliceLog("updateComparison:", { id: comparison.id });
    updateNovelty(comparison).catch((e) => debugNoveltySliceLog("[NoveltySlice] updateNovelty error:", e));
    return set((prev) => ({
      comparisons: prev.comparisons.map((c) => (c.id === comparison.id ? comparison : c))
    }));
  },
  removeComparison: (id) => {
    debugNoveltySliceLog("removeComparison 被调用:", { id });
    deleteNovelty(id).catch((e) => debugNoveltySliceLog("[NoveltySlice] deleteNovelty error:", e));
    const before = _get().comparisons.map(c => c.id);
    const result = set((prev) => {
      const after = prev.comparisons.filter((c) => c.id !== id);
      debugNoveltySliceLog("removeComparison 执行:", { before, after: after.map(c => c.id), removed: id });
      return { comparisons: after };
    });
    return result;
  },
  clearComparisonsByCase: (caseId) => {
    debugNoveltySliceLog("clearComparisonsByCase:", { caseId });
    deleteNoveltyByCaseId(caseId).catch((e) => debugNoveltySliceLog("[NoveltySlice] deleteNoveltyByCaseId error:", e));
    return set((prev) => ({
      comparisons: prev.comparisons.filter((c) => c.caseId !== caseId)
    }));
  },
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useNoveltyStore = create<NoveltySlice>()((set, get) => createNoveltySlice(set, get));
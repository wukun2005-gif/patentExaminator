import { create } from "zustand";
import type { NoveltyComparison } from "@shared/types/domain";

// DEBUG: 调试 bug 18 - 删除对比文件后无法再加载再比较
const DEBUG_NOVELTY_SLICE = true;

function debugNoveltySliceLog(...args: unknown[]) {
  if (DEBUG_NOVELTY_SLICE) {
    console.log("[NoveltySlice]", ...args);
  }
}

export interface NoveltySlice {
  comparisons: NoveltyComparison[];
  isLoading: boolean;

  setComparisons: (comparisons: NoveltyComparison[]) => void;
  addComparison: (comparison: NoveltyComparison) => void;
  updateComparison: (comparison: NoveltyComparison) => void;
  removeComparison: (id: string) => void;
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
    return set(() => ({ comparisons }));
  },
  addComparison: (comparison) => {
    debugNoveltySliceLog("addComparison:", { id: comparison.id, referenceId: comparison.referenceId, caseId: comparison.caseId });
    return set((prev) => ({ comparisons: [...prev.comparisons, comparison] }));
  },
  updateComparison: (comparison) => {
    debugNoveltySliceLog("updateComparison:", { id: comparison.id });
    return set((prev) => ({
      comparisons: prev.comparisons.map((c) => (c.id === comparison.id ? comparison : c))
    }));
  },
  removeComparison: (id) => {
    debugNoveltySliceLog("removeComparison 被调用:", { id });
    const before = _get().comparisons.map(c => c.id);
    const result = set((prev) => {
      const after = prev.comparisons.filter((c) => c.id !== id);
      debugNoveltySliceLog("removeComparison 执行:", { before, after: after.map(c => c.id), removed: id });
      return { comparisons: after };
    });
    return result;
  },
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useNoveltyStore = create<NoveltySlice>()((set, get) => createNoveltySlice(set, get));

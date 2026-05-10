import { create } from "zustand";
import type { NoveltyComparison } from "@shared/types/domain";

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

  setComparisons: (comparisons) => set(() => ({ comparisons })),
  addComparison: (comparison) =>
    set((prev) => ({ comparisons: [...prev.comparisons, comparison] })),
  updateComparison: (comparison) =>
    set((prev) => ({
      comparisons: prev.comparisons.map((c) => (c.id === comparison.id ? comparison : c))
    })),
  removeComparison: (id) =>
    set((prev) => ({ comparisons: prev.comparisons.filter((c) => c.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useNoveltyStore = create<NoveltySlice>()((set, get) => createNoveltySlice(set, get));

import { create } from "zustand";
import type { FormalDefect } from "@shared/types/domain";

export interface DefectsSlice {
  defects: FormalDefect[];
  isLoading: boolean;

  setDefects: (defects: FormalDefect[]) => void;
  addDefect: (defect: FormalDefect) => void;
  updateDefect: (defect: FormalDefect) => void;
  removeDefect: (id: string) => void;
  setLoading: (v: boolean) => void;
}

export const createDefectsSlice = (
  set: (fn: (prev: DefectsSlice) => Partial<DefectsSlice>) => void,
  _get: () => DefectsSlice
): DefectsSlice => ({
  defects: [],
  isLoading: false,

  setDefects: (defects) => set(() => ({ defects })),
  addDefect: (defect) => set((prev) => ({ defects: [...prev.defects, defect] })),
  updateDefect: (defect) =>
    set((prev) => ({
      defects: prev.defects.map((d) => (d.id === defect.id ? defect : d))
    })),
  removeDefect: (id) =>
    set((prev) => ({ defects: prev.defects.filter((d) => d.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useDefectsStore = create<DefectsSlice>()((set, get) =>
  createDefectsSlice(set, get)
);

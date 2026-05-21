import { create } from "zustand";
import type { InventiveStepAnalysis } from "@shared/types/domain";

export interface InventiveSlice {
  analyses: InventiveStepAnalysis[];
  isLoading: boolean;

  setAnalyses: (analyses: InventiveStepAnalysis[]) => void;
  addAnalysis: (analysis: InventiveStepAnalysis) => void;
  updateAnalysis: (analysis: InventiveStepAnalysis) => void;
  removeAnalysis: (id: string) => void;
  setLoading: (v: boolean) => void;
}

export const createInventiveSlice = (
  set: (fn: (prev: InventiveSlice) => Partial<InventiveSlice>) => void,
  _get: () => InventiveSlice
): InventiveSlice => ({
  analyses: [],
  isLoading: false,

  setAnalyses: (analyses) => {
    console.log("[InventiveSlice] setAnalyses:", analyses.map(a => ({ id: a.id, closestPriorArtId: a.closestPriorArtId })));
    set(() => ({ analyses }));
  },
  addAnalysis: (analysis) => {
    console.log("[InventiveSlice] addAnalysis:", { id: analysis.id, closestPriorArtId: analysis.closestPriorArtId });
    set((prev) => ({ analyses: [...prev.analyses, analysis] }));
  },
  updateAnalysis: (analysis) => {
    console.log("[InventiveSlice] updateAnalysis called:", { 
      id: analysis.id, 
      closestPriorArtId: analysis.closestPriorArtId,
      fullAnalysis: analysis
    });
    set((prev) => {
      const newAnalyses = prev.analyses.map((a) => (a.id === analysis.id ? analysis : a));
      console.log("[InventiveSlice] updateAnalysis result:", newAnalyses.map(a => ({ id: a.id, closestPriorArtId: a.closestPriorArtId })));
      return { analyses: newAnalyses };
    });
  },
  removeAnalysis: (id) =>
    set((prev) => ({ analyses: prev.analyses.filter((a) => a.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useInventiveStore = create<InventiveSlice>()((set, get) =>
  createInventiveSlice(set, get)
);

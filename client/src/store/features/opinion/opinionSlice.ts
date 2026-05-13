import { create } from "zustand";
import type { ArgumentMapping, OfficeActionAnalysis } from "@shared/types/domain";

export interface OpinionSlice {
  officeActionAnalysis: OfficeActionAnalysis | null;
  argumentMappings: ArgumentMapping[];
  isLoading: boolean;

  setOfficeActionAnalysis: (analysis: OfficeActionAnalysis) => void;
  setArgumentMappings: (mappings: ArgumentMapping[]) => void;
  addArgumentMapping: (mapping: ArgumentMapping) => void;
  clearReexamData: () => void;
  setLoading: (v: boolean) => void;
}

export const createOpinionSlice = (
  set: (fn: (prev: OpinionSlice) => Partial<OpinionSlice>) => void,
  _get: () => OpinionSlice
): OpinionSlice => ({
  officeActionAnalysis: null,
  argumentMappings: [],
  isLoading: false,

  setOfficeActionAnalysis: (analysis) => set(() => ({ officeActionAnalysis: analysis })),
  setArgumentMappings: (mappings) => set(() => ({ argumentMappings: mappings })),
  addArgumentMapping: (mapping) =>
    set((prev) => ({ argumentMappings: [...prev.argumentMappings, mapping] })),
  clearReexamData: () =>
    set(() => ({ officeActionAnalysis: null, argumentMappings: [] })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useOpinionStore = create<OpinionSlice>()((set, get) =>
  createOpinionSlice(set, get)
);

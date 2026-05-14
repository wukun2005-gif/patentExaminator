import { create } from "zustand";
import type {
  ArgumentMapping,
  OfficeActionAnalysis,
  RejectionGround,
  RejectionCitedReference
} from "@shared/types/domain";

export interface OpinionSlice {
  officeActionAnalysis: OfficeActionAnalysis | null;
  argumentMappings: ArgumentMapping[];
  unmappedGrounds: string[];
  isLoading: boolean;

  setOfficeActionAnalysis: (analysis: OfficeActionAnalysis) => void;
  setArgumentMappings: (mappings: ArgumentMapping[]) => void;
  setUnmappedGrounds: (codes: string[]) => void;
  addArgumentMapping: (mapping: ArgumentMapping) => void;
  updateArgumentMapping: (code: string, patch: Partial<ArgumentMapping>) => void;
  removeArgumentMapping: (code: string) => void;
  updateRejectionGround: (code: string, patch: Partial<RejectionGround>) => void;
  removeRejectionGround: (code: string) => void;
  addRejectionGround: (ground: RejectionGround) => void;
  addCitedRef: (ref: RejectionCitedReference) => void;
  removeCitedRef: (pubNumber: string) => void;
  clearReexamData: () => void;
  setLoading: (v: boolean) => void;
}

export const createOpinionSlice = (
  set: (fn: (prev: OpinionSlice) => Partial<OpinionSlice>) => void,
  _get: () => OpinionSlice
): OpinionSlice => ({
  officeActionAnalysis: null,
  argumentMappings: [],
  unmappedGrounds: [],
  isLoading: false,

  setOfficeActionAnalysis: (analysis) => set(() => ({ officeActionAnalysis: analysis })),
  setArgumentMappings: (mappings) => set(() => ({ argumentMappings: mappings })),
  setUnmappedGrounds: (codes) => set(() => ({ unmappedGrounds: codes })),

  addArgumentMapping: (mapping) =>
    set((prev) => ({ argumentMappings: [...prev.argumentMappings, mapping] })),

  updateArgumentMapping: (code, patch) =>
    set((prev) => ({
      argumentMappings: prev.argumentMappings.map((m) =>
        m.rejectionGroundCode === code ? { ...m, ...patch } : m
      )
    })),

  removeArgumentMapping: (code) =>
    set((prev) => ({
      argumentMappings: prev.argumentMappings.filter((m) => m.rejectionGroundCode !== code)
    })),

  updateRejectionGround: (code, patch) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      return {
        officeActionAnalysis: {
          ...prev.officeActionAnalysis,
          rejectionGrounds: prev.officeActionAnalysis.rejectionGrounds.map((g) =>
            g.code === code ? { ...g, ...patch } : g
          )
        }
      };
    }),

  removeRejectionGround: (code) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      return {
        officeActionAnalysis: {
          ...prev.officeActionAnalysis,
          rejectionGrounds: prev.officeActionAnalysis.rejectionGrounds.filter(
            (g) => g.code !== code
          )
        }
      };
    }),

  addRejectionGround: (ground) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      return {
        officeActionAnalysis: {
          ...prev.officeActionAnalysis,
          rejectionGrounds: [...prev.officeActionAnalysis.rejectionGrounds, ground]
        }
      };
    }),

  addCitedRef: (ref) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      return {
        officeActionAnalysis: {
          ...prev.officeActionAnalysis,
          citedReferences: [...prev.officeActionAnalysis.citedReferences, ref]
        }
      };
    }),

  removeCitedRef: (pubNumber) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      return {
        officeActionAnalysis: {
          ...prev.officeActionAnalysis,
          citedReferences: prev.officeActionAnalysis.citedReferences.filter(
            (r) => r.publicationNumber !== pubNumber
          )
        }
      };
    }),

  clearReexamData: () =>
    set(() => ({ officeActionAnalysis: null, argumentMappings: [], unmappedGrounds: [] })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useOpinionStore = create<OpinionSlice>()((set, get) =>
  createOpinionSlice(set, get)
);

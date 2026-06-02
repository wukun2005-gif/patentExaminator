import { create } from "zustand";
import type {
  ArgumentMapping,
  OfficeActionAnalysis,
  RejectionGround,
  RejectionCitedReference
} from "@shared/types/domain";
import {
  saveOpinionAnalysis,
  saveArgumentMappings,
  deleteArgumentMappings,
  clearOpinionData
} from "../../../lib/repos.js";
import { saveRunMarker } from "../../../lib/repos.js";
import { createLogger } from "../../../lib/logger";

const log = createLogger("OpinionSlice");

export interface OpinionSlice {
  officeActionAnalysis: OfficeActionAnalysis | null;
  argumentMappings: ArgumentMapping[];
  unmappedGrounds: string[];
  isLoading: boolean;
  argumentRanCases: string[];

  setOfficeActionAnalysis: (analysis: OfficeActionAnalysis) => void;
  loadOfficeActionAnalysis: (analysis: OfficeActionAnalysis) => void; // Load from DB without re-saving
  setArgumentMappings: (mappings: ArgumentMapping[]) => void;
  loadArgumentMappings: (mappings: ArgumentMapping[]) => void; // Load from DB without re-saving
  setUnmappedGrounds: (codes: string[]) => void;
  addArgumentMapping: (mapping: ArgumentMapping) => void;
  updateArgumentMapping: (code: string, patch: Partial<ArgumentMapping>) => void;
  removeArgumentMapping: (code: string) => void;
  updateRejectionGround: (code: string, patch: Partial<RejectionGround>) => void;
  removeRejectionGround: (code: string) => void;
  addRejectionGround: (ground: RejectionGround) => void;
  addCitedRef: (ref: RejectionCitedReference) => void;
  removeCitedRef: (pubNumber: string) => void;
  clearReexamData: (caseId?: string) => void;
  setLoading: (v: boolean) => void;
  setArgumentRanCases: (caseIds: string[]) => void;
  addArgumentRanCase: (caseId: string) => void;
}

export const createOpinionSlice = (
  set: (fn: (prev: OpinionSlice) => Partial<OpinionSlice>) => void,
  _get: () => OpinionSlice
): OpinionSlice => ({
  officeActionAnalysis: null,
  argumentMappings: [],
  unmappedGrounds: [],
  isLoading: false,
  argumentRanCases: [],

  setOfficeActionAnalysis: (analysis) => {
    saveOpinionAnalysis(analysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
    set(() => ({ officeActionAnalysis: analysis }));
  },
  loadOfficeActionAnalysis: (analysis) => {
    set(() => ({ officeActionAnalysis: analysis }));
  },
  setArgumentMappings: (mappings) => {
    if (mappings.length > 0 && mappings[0]?.caseId) {
      saveArgumentMappings(mappings).catch((e) => log("error", "saveArgumentMappings error:", e));
    } else if (mappings.length === 0) {
      const caseId = _get().argumentMappings[0]?.caseId;
      if (caseId) {
        deleteArgumentMappings(caseId).catch((e) => log("error", "deleteArgumentMappings error:", e));
      }
    }
    set(() => ({ argumentMappings: mappings }));
  },
  loadArgumentMappings: (mappings) => {
    set(() => ({ argumentMappings: mappings }));
  },
  setUnmappedGrounds: (codes) => set(() => ({ unmappedGrounds: codes })),

  addArgumentMapping: (mapping) => {
    set((prev) => {
      const newMappings = [...prev.argumentMappings, mapping];
      saveArgumentMappings(newMappings).catch((e) => log("error", "saveArgumentMappings error:", e));
      return { argumentMappings: newMappings };
    });
  },

  updateArgumentMapping: (code, patch) =>
    set((prev) => {
      const newMappings = prev.argumentMappings.map((m) =>
        m.rejectionGroundCode === code ? { ...m, ...patch } : m
      );
      if (newMappings.length > 0 && newMappings[0]?.caseId) {
        saveArgumentMappings(newMappings).catch((e) => log("error", "saveArgumentMappings error:", e));
      }
      return { argumentMappings: newMappings };
    }),

  removeArgumentMapping: (code) =>
    set((prev) => {
      const newMappings = prev.argumentMappings.filter((m) => m.rejectionGroundCode !== code);
      const firstMapping = prev.argumentMappings[0];
      if (firstMapping?.caseId) {
        deleteArgumentMappings(firstMapping.caseId).catch((e) => log("error", "deleteArgumentMappings error:", e));
        if (newMappings.length > 0) {
          saveArgumentMappings(newMappings).catch((e) => log("error", "saveArgumentMappings error:", e));
        }
      }
      return { argumentMappings: newMappings };
    }),

  updateRejectionGround: (code, patch) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      const newAnalysis = {
        ...prev.officeActionAnalysis,
        rejectionGrounds: prev.officeActionAnalysis.rejectionGrounds.map((g) =>
          g.code === code ? { ...g, ...patch } : g
        )
      };
      saveOpinionAnalysis(newAnalysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
      return { officeActionAnalysis: newAnalysis };
    }),

  removeRejectionGround: (code) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      const newAnalysis = {
        ...prev.officeActionAnalysis,
        rejectionGrounds: prev.officeActionAnalysis.rejectionGrounds.filter(
          (g) => g.code !== code
        )
      };
      saveOpinionAnalysis(newAnalysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
      return { officeActionAnalysis: newAnalysis };
    }),

  addRejectionGround: (ground) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      const newAnalysis = {
        ...prev.officeActionAnalysis,
        rejectionGrounds: [...prev.officeActionAnalysis.rejectionGrounds, ground]
      };
      saveOpinionAnalysis(newAnalysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
      return { officeActionAnalysis: newAnalysis };
    }),

  addCitedRef: (ref) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      const newAnalysis = {
        ...prev.officeActionAnalysis,
        citedReferences: [...prev.officeActionAnalysis.citedReferences, ref]
      };
      saveOpinionAnalysis(newAnalysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
      return { officeActionAnalysis: newAnalysis };
    }),

  removeCitedRef: (pubNumber) =>
    set((prev) => {
      if (!prev.officeActionAnalysis) return {};
      const newAnalysis = {
        ...prev.officeActionAnalysis,
        citedReferences: prev.officeActionAnalysis.citedReferences.filter(
          (r) => r.publicationNumber !== pubNumber
        )
      };
      saveOpinionAnalysis(newAnalysis).catch((e) => log("error", "saveOpinionAnalysis error:", e));
      return { officeActionAnalysis: newAnalysis };
    }),

  clearReexamData: (caseId) => {
    if (caseId) {
      clearOpinionData(caseId).catch((e) => log("error", "clearOpinionData error:", e));
    }
    set(() => ({ officeActionAnalysis: null, argumentMappings: [], unmappedGrounds: [] }));
  },
  setLoading: (v) => set(() => ({ isLoading: v })),
  setArgumentRanCases: (caseIds) => set(() => ({ argumentRanCases: caseIds })),
  addArgumentRanCase: (caseId) => {
    saveRunMarker(caseId, "argumentMapping").catch((e) => log("error", "saveRunMarker error:", e));
    set((prev) => ({
      argumentRanCases: prev.argumentRanCases.includes(caseId) ? prev.argumentRanCases : [...prev.argumentRanCases, caseId]
    }));
  }
});

export const useOpinionStore = create<OpinionSlice>()((set, get) =>
  createOpinionSlice(set, get)
);
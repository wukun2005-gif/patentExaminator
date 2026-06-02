import { create } from "zustand";
import type { FormalDefect } from "@shared/types/domain";
import {
  createDefect,
  updateDefect,
  deleteDefect,
  deleteDefectsByCaseId
} from "../../../lib/repos.js";
import { saveRunMarker } from "../../../lib/repos.js";
import { createLogger } from "../../../lib/logger";

const log = createLogger("DefectsSlice");

export interface DefectsSlice {
  defects: FormalDefect[];
  isLoading: boolean;
  ranCases: string[];

  setDefects: (defects: FormalDefect[]) => void;
  loadDefects: (defects: FormalDefect[]) => void; // Load from DB without re-saving
  addDefect: (defect: FormalDefect) => void;
  updateDefect: (defect: FormalDefect) => void;
  removeDefect: (id: string) => void;
  clearDefectsByCase: (caseId: string) => void;
  setLoading: (v: boolean) => void;
  setRanCases: (caseIds: string[]) => void;
  addRanCase: (caseId: string) => void;
}

export const createDefectsSlice = (
  set: (fn: (prev: DefectsSlice) => Partial<DefectsSlice>) => void,
  _get: () => DefectsSlice
): DefectsSlice => ({
  defects: [],
  isLoading: false,
  ranCases: [],

  setDefects: (defects) => {
    for (const defect of defects) {
      createDefect(defect).catch(log);
    }
    set(() => ({ defects }));
  },
  loadDefects: (defects) => {
    set(() => ({ defects }));
  },
  addDefect: (defect) => {
    createDefect(defect).catch(log);
    set((prev) => ({ defects: [...prev.defects, defect] }));
  },
  updateDefect: (defect) => {
    updateDefect(defect).catch(log);
    set((prev) => ({
      defects: prev.defects.map((d) => (d.id === defect.id ? defect : d))
    }));
  },
  removeDefect: (id) => {
    deleteDefect(id).catch(log);
    set((prev) => ({ defects: prev.defects.filter((d) => d.id !== id) }));
  },
  clearDefectsByCase: (caseId) => {
    deleteDefectsByCaseId(caseId).catch(log);
    set((prev) => ({ defects: prev.defects.filter((d) => d.caseId !== caseId) }));
  },
  setLoading: (v) => set(() => ({ isLoading: v })),
  setRanCases: (caseIds) => set(() => ({ ranCases: caseIds })),
  addRanCase: (caseId) => {
    saveRunMarker(caseId, "defects").catch(log);
    set((prev) => ({
      ranCases: prev.ranCases.includes(caseId) ? prev.ranCases : [...prev.ranCases, caseId]
    }));
  }
});

export const useDefectsStore = create<DefectsSlice>()((set, get) =>
  createDefectsSlice(set, get)
);
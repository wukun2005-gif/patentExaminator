import { create } from "zustand";
import type { PatentCase, CaseWorkflowState } from "@shared/types/domain";

export interface CaseSlice {
  currentCase: PatentCase | null;
  cases: PatentCase[];
  isLoading: boolean;

  setCurrentCase: (c: PatentCase | null) => void;
  setCases: (cases: PatentCase[]) => void;
  setLoading: (v: boolean) => void;
  updateWorkflowState: (state: CaseWorkflowState) => void;
}

export const createCaseSlice = (
  set: (fn: (prev: CaseSlice) => Partial<CaseSlice>) => void,
  _get: () => CaseSlice
): CaseSlice => ({
  currentCase: null,
  cases: [],
  isLoading: false,

  setCurrentCase: (c) => set(() => ({ currentCase: c })),
  setCases: (cases) => set(() => ({ cases })),
  setLoading: (v) => set(() => ({ isLoading: v })),
  updateWorkflowState: (state) =>
    set((prev) => ({
      currentCase: prev.currentCase
        ? { ...prev.currentCase, workflowState: state, updatedAt: new Date().toISOString() }
        : null
    }))
});

export const useCaseStore = create<CaseSlice>()((set, get) => createCaseSlice(set, get));

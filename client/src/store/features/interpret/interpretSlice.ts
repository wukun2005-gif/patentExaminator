import { create } from "zustand";

export interface InterpretSlice {
  interpretSummaries: Record<string, string>; // caseId → summary
  setInterpretSummary: (caseId: string, summary: string) => void;
  clearInterpretData: (caseId: string) => void;
}

export const createInterpretSlice = (
  set: (fn: (prev: InterpretSlice) => Partial<InterpretSlice>) => void,
  _get: () => InterpretSlice
): InterpretSlice => ({
  interpretSummaries: {},

  setInterpretSummary: (caseId, summary) =>
    set((prev) => ({
      interpretSummaries: { ...prev.interpretSummaries, [caseId]: summary }
    })),

  clearInterpretData: (caseId) =>
    set((prev) => {
      const next = { ...prev.interpretSummaries };
      delete next[caseId];
      return { interpretSummaries: next };
    })
});

export const useInterpretStore = create<InterpretSlice>()((set, get) =>
  createInterpretSlice(set, get)
);

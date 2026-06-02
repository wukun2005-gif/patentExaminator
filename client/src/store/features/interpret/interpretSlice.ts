import { create } from "zustand";
import {
  saveInterpretSummaries,
  deleteInterpretSummaries
} from "../../../lib/repos.js";
import { createLogger } from "../../../lib/logger";

const log = createLogger("InterpretSlice");

export const LEGACY_INTERPRET_KEY = "__legacy__";

export interface InterpretSlice {
  interpretSummaries: Record<string, Record<string, string>>; // caseId → documentId → summary
  setInterpretSummary: (caseId: string, documentId: string, summary: string) => void;
  clearInterpretData: (caseId: string) => void;
  loadInterpretSummaries: (caseId: string, summaries: Record<string, string>) => void; // for loading from DB without re-saving
}

export const createInterpretSlice = (
  set: (fn: (prev: InterpretSlice) => Partial<InterpretSlice>) => void,
  _get: () => InterpretSlice
): InterpretSlice => ({
  interpretSummaries: {},

  setInterpretSummary: (caseId, documentId, summary) => {
    // Update Zustand store
    let nextSummaries: Record<string, string> = {};
    set((prev) => {
      nextSummaries = {
        ...(prev.interpretSummaries[caseId] ?? {}),
        [documentId]: summary
      };
      return {
        interpretSummaries: { ...prev.interpretSummaries, [caseId]: nextSummaries }
      };
    });
    // Persist to IndexedDB (async, fire-and-forget)
    saveInterpretSummaries(caseId, nextSummaries).catch((err) => {
      log(`Failed to save interpret summaries for case ${caseId}:`, err);
    });
  },

  loadInterpretSummaries: (caseId, summaries) =>
    set((prev) => ({
      interpretSummaries: { ...prev.interpretSummaries, [caseId]: summaries }
    })),

  clearInterpretData: (caseId) => {
    set((prev) => {
      const next = { ...prev.interpretSummaries };
      delete next[caseId];
      return { interpretSummaries: next };
    });
    // Delete from IndexedDB (async, fire-and-forget)
    deleteInterpretSummaries(caseId).catch((err) => {
      log(`Failed to delete interpret summaries for case ${caseId}:`, err);
    });
  }
});

export const useInterpretStore = create<InterpretSlice>()((set, get) =>
  createInterpretSlice(set, get)
);

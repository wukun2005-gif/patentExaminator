import { create } from "zustand";
import type { ReferenceDocument } from "@shared/types/domain";

export interface ReferencesSlice {
  references: ReferenceDocument[];
  candidates: ReferenceDocument[];
  isLoading: boolean;
  isSearching: boolean;

  setReferences: (refs: ReferenceDocument[]) => void;
  addReference: (ref: ReferenceDocument) => void;
  updateReference: (ref: ReferenceDocument) => void;
  removeReference: (id: string) => void;
  setLoading: (v: boolean) => void;

  setCandidates: (candidates: ReferenceDocument[]) => void;
  acceptCandidate: (candidateId: string) => void;
  rejectCandidate: (candidateId: string) => void;
  clearCandidates: () => void;
  setIsSearching: (v: boolean) => void;
}

export const createReferencesSlice = (
  set: (fn: (prev: ReferencesSlice) => Partial<ReferencesSlice>) => void,
  _get: () => ReferencesSlice
): ReferencesSlice => ({
  references: [],
  candidates: [],
  isLoading: false,
  isSearching: false,

  setReferences: (references) => set(() => ({ references })),
  addReference: (ref) => set((prev) => ({ references: [...prev.references, ref] })),
  updateReference: (ref) =>
    set((prev) => ({
      references: prev.references.map((r) => (r.id === ref.id ? ref : r))
    })),
  removeReference: (id) =>
    set((prev) => ({ references: prev.references.filter((r) => r.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v })),

  setCandidates: (candidates) => set(() => ({ candidates })),
  acceptCandidate: (candidateId) =>
    set((prev) => {
      const candidate = prev.candidates.find((c) => c.id === candidateId);
      if (!candidate) return prev;
      const accepted: ReferenceDocument = {
        ...candidate,
        source: "ai-search" as const,
        candidateStatus: "accepted" as const
      };
      return {
        references: [...prev.references, accepted],
        candidates: prev.candidates.filter((c) => c.id !== candidateId)
      };
    }),
  rejectCandidate: (candidateId) =>
    set((prev) => ({ candidates: prev.candidates.filter((c) => c.id !== candidateId) })),
  clearCandidates: () => set(() => ({ candidates: [] })),
  setIsSearching: (v) => set(() => ({ isSearching: v }))
});

export const useReferencesStore = create<ReferencesSlice>()((set, get) =>
  createReferencesSlice(set, get)
);

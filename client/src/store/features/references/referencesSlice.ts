import { create } from "zustand";
import type { ReferenceDocument } from "@shared/types/domain";

export interface ReferencesSlice {
  references: ReferenceDocument[];
  isLoading: boolean;

  setReferences: (refs: ReferenceDocument[]) => void;
  addReference: (ref: ReferenceDocument) => void;
  updateReference: (ref: ReferenceDocument) => void;
  removeReference: (id: string) => void;
  setLoading: (v: boolean) => void;
}

export const createReferencesSlice = (
  set: (fn: (prev: ReferencesSlice) => Partial<ReferencesSlice>) => void,
  _get: () => ReferencesSlice
): ReferencesSlice => ({
  references: [],
  isLoading: false,

  setReferences: (references) => set(() => ({ references })),
  addReference: (ref) => set((prev) => ({ references: [...prev.references, ref] })),
  updateReference: (ref) =>
    set((prev) => ({
      references: prev.references.map((r) => (r.id === ref.id ? ref : r))
    })),
  removeReference: (id) =>
    set((prev) => ({ references: prev.references.filter((r) => r.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useReferencesStore = create<ReferencesSlice>()((set, get) =>
  createReferencesSlice(set, get)
);

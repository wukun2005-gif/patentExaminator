import { create } from "zustand";
import type { SourceDocument } from "@shared/types/domain";

export interface DocumentsSlice {
  documents: SourceDocument[];
  isLoading: boolean;

  setDocuments: (docs: SourceDocument[]) => void;
  addDocument: (doc: SourceDocument) => void;
  updateDocument: (doc: SourceDocument) => void;
  removeDocument: (id: string) => void;
  setLoading: (v: boolean) => void;
}

export const createDocumentsSlice = (
  set: (fn: (prev: DocumentsSlice) => Partial<DocumentsSlice>) => void,
  _get: () => DocumentsSlice
): DocumentsSlice => ({
  documents: [],
  isLoading: false,

  setDocuments: (documents) => set(() => ({ documents })),
  addDocument: (doc) => set((prev) => ({ documents: [...prev.documents, doc] })),
  updateDocument: (doc) =>
    set((prev) => ({
      documents: prev.documents.map((d) => (d.id === doc.id ? doc : d))
    })),
  removeDocument: (id) =>
    set((prev) => ({ documents: prev.documents.filter((d) => d.id !== id) })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useDocumentsStore = create<DocumentsSlice>()((set, get) =>
  createDocumentsSlice(set, get)
);

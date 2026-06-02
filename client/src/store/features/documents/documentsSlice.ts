import { create } from "zustand";
import type { SourceDocument } from "@shared/types/domain";
import {
  createDocument,
  updateDocument as updateDocumentInDB,
  deleteDocument
} from "../../../lib/repos";
import { createLogger } from "../../../lib/logger";

const log = createLogger("DocumentsSlice");

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
  addDocument: (doc) => {
    set((prev) => ({ documents: [...prev.documents, doc] }));
    createDocument(doc).catch((e) => log("error", "IDB createDocument error:", e));
  },
  updateDocument: (doc) => {
    set((prev) => ({
      documents: prev.documents.map((d) => (d.id === doc.id ? doc : d))
    }));
    updateDocumentInDB(doc).catch((e) => log("error", "IDB updateDocument error:", e));
  },
  removeDocument: (id) => {
    set((prev) => ({ documents: prev.documents.filter((d) => d.id !== id) }));
    deleteDocument(id).catch((e) => log("error", "IDB deleteDocument error:", e));
  },
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useDocumentsStore = create<DocumentsSlice>()((set, get) =>
  createDocumentsSlice(set, get)
);

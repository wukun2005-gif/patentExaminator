import { create } from "zustand";
import type { ReferenceDocument } from "@shared/types/domain";
import {
  createDocument,
  updateDocument as updateDocumentInDB,
  deleteDocument
} from "../../../lib/repos";
import { createLogger } from "../../../lib/logger";

const debugRefLog = createLogger("ReferencesSlice");

export interface ProviderResult {
  providerId: string;
  providerName: string;
  resultCount: number;
  candidateCount: number;
}

export type SearchStep = "idle" | "extracting" | "editing" | "searching" | "done";

export interface ReferencesSlice {
  references: ReferenceDocument[];
  candidates: ReferenceDocument[];
  isLoading: boolean;
  isSearching: boolean;

  // nf-7: 检索会话状态
  searchTerms: string[];
  searchStep: SearchStep;
  searchSessionId: string | null;
  providerResults: ProviderResult[];

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

  // nf-7 actions
  setSearchTerms: (terms: string[]) => void;
  setSearchStep: (step: SearchStep) => void;
  setSearchSessionId: (id: string | null) => void;
  setProviderResults: (results: ProviderResult[]) => void;
  addSearchTerm: (term: string) => void;
  updateSearchTerm: (index: number, term: string) => void;
  removeSearchTerm: (index: number) => void;
}

export const createReferencesSlice = (
  set: (fn: (prev: ReferencesSlice) => Partial<ReferencesSlice>) => void,
  _get: () => ReferencesSlice
): ReferencesSlice => ({
  references: [],
  candidates: [],
  isLoading: false,
  isSearching: false,

  // nf-7
  searchTerms: [],
  searchStep: "idle",
  searchSessionId: null,
  providerResults: [],

  setReferences: (references) => {
    debugRefLog("setReferences:", { count: references.length, ids: references.map(r => r.id) });
    return set(() => ({ references }));
  },
  addReference: (ref) => {
    debugRefLog("addReference:", { id: ref.id, title: ref.title ?? ref.fileName });
    set((prev) => ({ references: [...prev.references, ref] }));
    createDocument(ref).catch((e) => debugRefLog("[ReferencesSlice] IDB createDocument error:", e));
  },
  updateReference: (ref) => {
    debugRefLog("updateReference:", { id: ref.id, title: ref.title ?? ref.fileName });
    set((prev) => ({
      references: prev.references.map((r) => (r.id === ref.id ? ref : r))
    }));
    updateDocumentInDB(ref).catch((e) => debugRefLog("[ReferencesSlice] IDB updateDocument error:", e));
  },
  removeReference: (id) => {
    debugRefLog("removeReference 被调用:", { id });
    const before = _get().references.map(r => r.id);
    set((prev) => {
      const after = prev.references.filter((r) => r.id !== id);
      debugRefLog("removeReference 执行:", { before, after: after.map(r => r.id), removed: id });
      return { references: after };
    });
    deleteDocument(id).catch((e) => debugRefLog("[ReferencesSlice] IDB deleteDocument error:", e));
  },
  setLoading: (v) => set(() => ({ isLoading: v })),

  setCandidates: (candidates) => set(() => ({ candidates })),
  acceptCandidate: (candidateId) => {
    const state = _get();
    const candidate = state.candidates.find((c) => c.id === candidateId);
    if (!candidate) return;
    const accepted: ReferenceDocument = {
      ...candidate,
      source: "ai-search" as const,
      candidateStatus: "accepted" as const
    };
    set((prev) => ({
      references: [...prev.references, accepted],
      candidates: prev.candidates.filter((c) => c.id !== candidateId)
    }));
    createDocument(accepted).catch((e) => debugRefLog("[ReferencesSlice] IDB createDocument (accept) error:", e));
  },
  rejectCandidate: (candidateId) =>
    set((prev) => ({ candidates: prev.candidates.filter((c) => c.id !== candidateId) })),
  clearCandidates: () => set(() => ({ candidates: [] })),
  setIsSearching: (v) => set(() => ({ isSearching: v })),

  // nf-7 actions
  setSearchTerms: (terms) => set(() => ({ searchTerms: terms })),
  setSearchStep: (step) => set(() => ({ searchStep: step })),
  setSearchSessionId: (id) => set(() => ({ searchSessionId: id })),
  setProviderResults: (results) => set(() => ({ providerResults: results })),
  addSearchTerm: (term) => set((prev) => ({ searchTerms: [...prev.searchTerms, term] })),
  updateSearchTerm: (index, term) =>
    set((prev) => ({
      searchTerms: prev.searchTerms.map((t, i) => (i === index ? term : t))
    })),
  removeSearchTerm: (index) =>
    set((prev) => ({
      searchTerms: prev.searchTerms.filter((_, i) => i !== index)
    }))
});

export const useReferencesStore = create<ReferencesSlice>()((set, get) =>
  createReferencesSlice(set, get)
);

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock documentRepo functions that the slices now call
const mockCreateDocument = vi.fn().mockResolvedValue(undefined);
const mockUpdateDocument = vi.fn().mockResolvedValue(undefined);
const mockDeleteDocument = vi.fn().mockResolvedValue(undefined);

vi.mock("@client/lib/repos", () => ({
  createDocument: (...args: unknown[]) => mockCreateDocument(...args),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
  readDocumentsByCaseId: vi.fn().mockResolvedValue([]),
  readDocumentById: vi.fn().mockResolvedValue(undefined),
  readAllDocuments: vi.fn().mockResolvedValue([])
}));

import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useReferencesStore } from "@client/store/features/references/referencesSlice";
import type { SourceDocument, ReferenceDocument } from "@shared/types/domain";

function makeDoc(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    caseId: "case-1",
    role: "application",
    fileName: "test.pdf",
    fileType: "application/pdf",
    extractedText: "test text",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

function makeRef(overrides: Partial<ReferenceDocument> = {}): ReferenceDocument {
  return {
    id: "ref-1",
    caseId: "case-1",
    role: "reference",
    fileName: "reference.pdf",
    fileType: "application/pdf",
    extractedText: "ref text",
    createdAt: "2024-01-01T00:00:00Z",
    source: "user-upload",
    ...overrides
  };
}

describe("documentsSlice IDB persistence (TC-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentsStore.setState({ documents: [], isLoading: false });
  });

  it("addDocument calls IDB createDocument", () => {
    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);
    expect(mockCreateDocument).toHaveBeenCalledOnce();
    expect(mockCreateDocument).toHaveBeenCalledWith(doc);
  });

  it("updateDocument calls IDB updateDocument", () => {
    const doc = makeDoc();
    useDocumentsStore.setState({ documents: [doc] });

    const updated = { ...doc, fileName: "updated.pdf" };
    useDocumentsStore.getState().updateDocument(updated);
    expect(mockUpdateDocument).toHaveBeenCalledOnce();
    expect(mockUpdateDocument).toHaveBeenCalledWith(updated);
  });

  it("removeDocument calls IDB deleteDocument", () => {
    const doc = makeDoc();
    useDocumentsStore.setState({ documents: [doc] });

    useDocumentsStore.getState().removeDocument("doc-1");
    expect(mockDeleteDocument).toHaveBeenCalledOnce();
    expect(mockDeleteDocument).toHaveBeenCalledWith("doc-1");
  });

  it("setDocuments does NOT call IDB (hydration only)", () => {
    const docs = [makeDoc({ id: "d1" }), makeDoc({ id: "d2" })];
    useDocumentsStore.getState().setDocuments(docs);
    expect(mockCreateDocument).not.toHaveBeenCalled();
    expect(mockUpdateDocument).not.toHaveBeenCalled();
  });

  it("addDocument updates in-memory state correctly", () => {
    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);
    expect(useDocumentsStore.getState().documents).toHaveLength(1);
    expect(useDocumentsStore.getState().documents[0]!.id).toBe("doc-1");
  });

  it("removeDocument updates in-memory state correctly", () => {
    useDocumentsStore.setState({ documents: [makeDoc({ id: "d1" }), makeDoc({ id: "d2" })] });
    useDocumentsStore.getState().removeDocument("d1");
    expect(useDocumentsStore.getState().documents).toHaveLength(1);
    expect(useDocumentsStore.getState().documents[0]!.id).toBe("d2");
  });

  it("IDB error does not break in-memory state", async () => {
    mockCreateDocument.mockRejectedValueOnce(new Error("IDB full"));

    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);

    // In-memory state should still be updated even when IDB fails
    expect(useDocumentsStore.getState().documents).toHaveLength(1);

    // Wait for the rejected promise to be caught (no crash)
    await new Promise((r) => setTimeout(r, 10));
    expect(useDocumentsStore.getState().documents).toHaveLength(1);
  });
});

describe("referencesSlice IDB persistence (TC-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReferencesStore.setState({
      references: [],
      candidates: [],
      isLoading: false,
      isSearching: false,
      searchTerms: [],
      searchStep: "idle",
      searchSessionId: null,
      providerResults: []
    });
  });

  it("addReference calls IDB createDocument", () => {
    const ref = makeRef();
    useReferencesStore.getState().addReference(ref);
    expect(mockCreateDocument).toHaveBeenCalledOnce();
    expect(mockCreateDocument).toHaveBeenCalledWith(ref);
  });

  it("updateReference calls IDB updateDocument", () => {
    const ref = makeRef();
    useReferencesStore.setState({ references: [ref] });

    const updated = { ...ref, title: "Updated Title" };
    useReferencesStore.getState().updateReference(updated);
    expect(mockUpdateDocument).toHaveBeenCalledOnce();
    expect(mockUpdateDocument).toHaveBeenCalledWith(updated);
  });

  it("removeReference calls IDB deleteDocument", () => {
    const ref = makeRef();
    useReferencesStore.setState({ references: [ref] });

    useReferencesStore.getState().removeReference("ref-1");
    expect(mockDeleteDocument).toHaveBeenCalledOnce();
    expect(mockDeleteDocument).toHaveBeenCalledWith("ref-1");
  });

  it("acceptCandidate creates accepted reference in IDB", () => {
    const candidate = makeRef({ id: "cand-1", candidateStatus: "pending" });
    useReferencesStore.setState({ candidates: [candidate] });

    useReferencesStore.getState().acceptCandidate("cand-1");

    expect(mockCreateDocument).toHaveBeenCalledOnce();
    const callArg = mockCreateDocument.mock.calls[0]![0] as ReferenceDocument;
    expect(callArg.id).toBe("cand-1");
    expect(callArg.source).toBe("ai-search");
    expect(callArg.candidateStatus).toBe("accepted");
  });

  it("acceptCandidate moves candidate to references in memory", () => {
    const candidate = makeRef({ id: "cand-1", candidateStatus: "pending" });
    useReferencesStore.setState({ candidates: [candidate] });

    useReferencesStore.getState().acceptCandidate("cand-1");

    expect(useReferencesStore.getState().references).toHaveLength(1);
    expect(useReferencesStore.getState().references[0]!.id).toBe("cand-1");
    expect(useReferencesStore.getState().candidates).toHaveLength(0);
  });

  it("setReferences does NOT call IDB (hydration only)", () => {
    const refs = [makeRef({ id: "r1" }), makeRef({ id: "r2" })];
    useReferencesStore.getState().setReferences(refs);
    expect(mockCreateDocument).not.toHaveBeenCalled();
    expect(mockUpdateDocument).not.toHaveBeenCalled();
  });

  it("IDB error does not break in-memory state", async () => {
    mockCreateDocument.mockRejectedValueOnce(new Error("IDB full"));

    const ref = makeRef();
    useReferencesStore.getState().addReference(ref);

    // In-memory state should still be updated even when IDB fails
    expect(useReferencesStore.getState().references).toHaveLength(1);

    // Wait for the rejected promise to be caught (no crash)
    await new Promise((r) => setTimeout(r, 10));
    expect(useReferencesStore.getState().references).toHaveLength(1);
  });
});

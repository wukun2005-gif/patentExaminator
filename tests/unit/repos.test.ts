/**
 * repos.test.ts — Data Access Layer CRUD Tests
 * ==============================================
 * Tests the core CRUD operations in repos.ts against the server API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getAll, query, getById, create, update, remove, clearStore,
  createCase, readAllCases, readCaseById, updateCase, deleteCase,
  createDocument, readAllDocuments, readDocumentsByCaseId, readDocumentById,
  updateDocument, deleteDocument
} from "@client/lib/repos";

const API_BASE = "/api/data";

describe("repos.ts — Core CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, records: [] }) });
  });

  // ── getAll ──────────────────────────────────────────────────────────

  describe("getAll", () => {
    it("fetches all records from a store", async () => {
      const records = [{ id: "1", name: "test" }, { id: "2", name: "test2" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records })
      });

      const result = await getAll("cases");
      expect(result).toEqual(records);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases`);
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(getAll("cases")).rejects.toThrow("Failed to get cases: 500");
    });
  });

  // ── query ──────────────────────────────────────────────────────────

  describe("query", () => {
    it("queries records by field and value", async () => {
      const records = [{ id: "1", caseId: "c1" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records })
      });

      const result = await query("documents", "caseId", "c1");
      expect(result).toEqual(records);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "caseId", value: "c1" })
      });
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      await expect(query("documents", "caseId", "c1")).rejects.toThrow("Failed to query documents: 400");
    });
  });

  // ── getById ────────────────────────────────────────────────────────

  describe("getById", () => {
    it("returns a record by id", async () => {
      const record = { id: "1", name: "test" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record })
      });

      const result = await getById("cases", "1");
      expect(result).toEqual(record);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases/1`);
    });

    it("returns null on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await getById("cases", "nonexistent");
      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(getById("cases", "1")).rejects.toThrow("Failed to get cases/1: 500");
    });
  });

  // ── create ─────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a record via POST", async () => {
      const record = { id: "1", name: "test" };
      await create("cases", record);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      await expect(create("cases", { id: "1" })).rejects.toThrow("Failed to create cases: 400");
    });
  });

  // ── update ─────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates a record via PUT", async () => {
      await update("cases", "1", { name: "updated" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases/1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "updated" })
      });
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      await expect(update("cases", "1", {})).rejects.toThrow("Failed to update cases/1: 400");
    });
  });

  // ── remove ─────────────────────────────────────────────────────────

  describe("remove", () => {
    it("deletes a record via DELETE", async () => {
      await remove("cases", "1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases/1`, {
        method: "DELETE"
      });
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(remove("cases", "1")).rejects.toThrow("Failed to delete cases/1: 500");
    });
  });

  // ── clearStore ─────────────────────────────────────────────────────

  describe("clearStore", () => {
    it("clears a store via DELETE", async () => {
      await clearStore("cases");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases`, {
        method: "DELETE"
      });
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(clearStore("cases")).rejects.toThrow("Failed to clear cases: 500");
    });
  });
});

describe("repos.ts — Domain Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, records: [] }) });
  });

  // ── Case CRUD ──────────────────────────────────────────────────────

  describe("Case CRUD", () => {
    const mockCase = {
      id: "case-1",
      title: "Test Case",
      applicationNumber: "CN2023100000001",
      createdAt: "2023-01-01T00:00:00.000Z",
      updatedAt: "2023-01-01T00:00:00.000Z"
    };

    it("createCase calls POST", async () => {
      await createCase(mockCase as any);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases`, expect.objectContaining({ method: "POST" }));
    });

    it("readAllCases returns all cases", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockCase] })
      });
      const result = await readAllCases();
      expect(result).toEqual([mockCase]);
    });

    it("readCaseById returns a case", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record: mockCase })
      });
      const result = await readCaseById("case-1");
      expect(result).toEqual(mockCase);
    });

    it("readCaseById returns undefined on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await readCaseById("nonexistent");
      expect(result).toBeUndefined();
    });

    it("updateCase calls PUT", async () => {
      await updateCase(mockCase as any);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases/case-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteCase calls DELETE", async () => {
      await deleteCase("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/cases/case-1`, { method: "DELETE" });
    });
  });

  // ── Document CRUD ──────────────────────────────────────────────────

  describe("Document CRUD", () => {
    const mockDoc = {
      id: "doc-1",
      caseId: "case-1",
      role: "application",
      fileName: "test.pdf",
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: "2023-01-01T00:00:00.000Z"
    };

    it("createDocument calls POST", async () => {
      await createDocument(mockDoc as any);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents`, expect.objectContaining({ method: "POST" }));
    });

    it("readAllDocuments returns all documents", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockDoc] })
      });
      const result = await readAllDocuments();
      expect(result).toEqual([mockDoc]);
    });

    it("readDocumentsByCaseId filters by caseId", async () => {
      const otherDoc = { ...mockDoc, id: "doc-2", caseId: "case-2" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockDoc, otherDoc] })
      });
      const result = await readDocumentsByCaseId("case-1");
      expect(result).toEqual([mockDoc]);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents`);
    });

    it("readDocumentById returns a document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record: mockDoc })
      });
      const result = await readDocumentById("doc-1");
      expect(result).toEqual(mockDoc);
    });

    it("updateDocument calls PUT", async () => {
      await updateDocument(mockDoc as any);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents/doc-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteDocument calls DELETE", async () => {
      await deleteDocument("doc-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents/doc-1`, { method: "DELETE" });
    });
  });
});

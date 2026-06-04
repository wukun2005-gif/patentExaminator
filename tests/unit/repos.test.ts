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
  getAll, query, getById, create, update, remove,
  createCase, readAllCases, readCaseById, updateCase, deleteCase,
  createDocument, readDocumentsByCaseId,
  updateDocument, deleteDocument, readReferencesByCaseId,
  createClaimNode, readClaimNodesByCaseId, deleteClaimNode,
  createClaimFeature, readClaimFeaturesByCaseId, updateClaimFeature, deleteClaimFeature, deleteClaimFeaturesByCaseId,
  createNovelty, readNoveltyByCaseId, updateNovelty, deleteNovelty, deleteNoveltyByCaseId,
  createInventive, readInventiveByCaseId, updateInventive, deleteInventive, deleteInventiveByCaseId,
  createDefect, getDefectsByCaseId, updateDefect, deleteDefect, deleteDefectsByCaseId,
  saveReexamDraft, readReexamDraft, clearDraftData,
  saveSummary, readSummary,
  createSession, getSessionsByCaseId, deleteSession, updateSession, deleteMessagesBySessionId,
  createMessage, getMessagesBySessionId,
  saveOpinionAnalysis, readOpinionAnalysis, saveArgumentMappings, readArgumentMappings, deleteArgumentMappings, clearOpinionData,
  saveInterpretSummaries, readInterpretSummaries, deleteInterpretSummaries,
  saveRunMarker, getRunMarkersByCaseId,
  createSearchSession, updateSearchSession, getLatestSearchSession
} from "@client/lib/repos";
import type {
  PatentCase, SourceDocument, ClaimNode, ClaimFeature,
  FormalDefect, NoveltyComparison, InventiveStepAnalysis,
  ChatSession, ChatMessage, SearchSession,
  OfficeActionAnalysis, ArgumentMapping
} from "@shared/types/domain";
import type { ReexamDraftResponse, SummaryResponse } from "@shared/types/api";

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
      await createCase(mockCase as PatentCase);
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
      await updateCase(mockCase as PatentCase);
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
      await createDocument(mockDoc as SourceDocument);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents`, expect.objectContaining({ method: "POST" }));
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

    it("updateDocument calls PUT", async () => {
      await updateDocument(mockDoc as SourceDocument);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents/doc-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteDocument calls DELETE", async () => {
      await deleteDocument("doc-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/documents/doc-1`, { method: "DELETE" });
    });

    it("readReferencesByCaseId filters by role=reference", async () => {
      const ref = { id: "ref-1", caseId: "case-1", role: "reference" };
      const app = { id: "app-1", caseId: "case-1", role: "application" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [ref, app] })
      });
      const result = await readReferencesByCaseId("case-1");
      expect(result).toEqual([ref]);
    });
  });

  // ── Claim CRUD ──────────────────────────────────────────────────────

  describe("Claim CRUD", () => {
    const mockNode: ClaimNode = {
      id: "node-1", caseId: "case-1", claimNumber: 1,
      type: "independent", rawText: "test claim"
    } as ClaimNode;

    const mockFeature: ClaimFeature = {
      id: "feat-1", caseId: "case-1", claimNumber: 1,
      featureCode: "A", description: "feature desc"
    } as ClaimFeature;

    it("createClaimNode calls POST", async () => {
      await createClaimNode(mockNode);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimNodes`, expect.objectContaining({ method: "POST" }));
    });

    it("readClaimNodesByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockNode] })
      });
      const result = await readClaimNodesByCaseId("case-1");
      expect(result).toEqual([mockNode]);
    });

    it("deleteClaimNode calls DELETE", async () => {
      await deleteClaimNode("node-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimNodes/node-1`, { method: "DELETE" });
    });

    it("createClaimFeature calls POST", async () => {
      await createClaimFeature(mockFeature);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimCharts`, expect.objectContaining({ method: "POST" }));
    });

    it("readClaimFeaturesByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockFeature] })
      });
      const result = await readClaimFeaturesByCaseId("case-1");
      expect(result).toEqual([mockFeature]);
    });

    it("updateClaimFeature calls PUT", async () => {
      await updateClaimFeature(mockFeature);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimCharts/feat-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteClaimFeature calls DELETE", async () => {
      await deleteClaimFeature("feat-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimCharts/feat-1`, { method: "DELETE" });
    });

    it("deleteClaimFeaturesByCaseId deletes all matching features", async () => {
      const f1 = { ...mockFeature, id: "f1" };
      const f2 = { ...mockFeature, id: "f2" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [f1, f2] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteClaimFeaturesByCaseId("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimCharts/f1`, { method: "DELETE" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/claimCharts/f2`, { method: "DELETE" });
    });
  });

  // ── Novelty CRUD ────────────────────────────────────────────────────

  describe("Novelty CRUD", () => {
    const mockNovelty = { id: "nov-1", caseId: "case-1", featureCode: "A" } as NoveltyComparison;

    it("createNovelty calls POST", async () => {
      await createNovelty(mockNovelty);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/novelty`, expect.objectContaining({ method: "POST" }));
    });

    it("readNoveltyByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockNovelty] })
      });
      expect(await readNoveltyByCaseId("case-1")).toEqual([mockNovelty]);
    });

    it("updateNovelty calls PUT", async () => {
      await updateNovelty(mockNovelty);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/novelty/nov-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteNovelty calls DELETE", async () => {
      await deleteNovelty("nov-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/novelty/nov-1`, { method: "DELETE" });
    });

    it("deleteNoveltyByCaseId deletes all matching", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "n1" }, { id: "n2" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteNoveltyByCaseId("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/novelty/n1`, { method: "DELETE" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/novelty/n2`, { method: "DELETE" });
    });
  });

  // ── Inventive CRUD ──────────────────────────────────────────────────

  describe("Inventive CRUD", () => {
    const mockInventive = { id: "inv-1", caseId: "case-1" } as InventiveStepAnalysis;

    it("createInventive calls POST", async () => {
      await createInventive(mockInventive);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/inventive`, expect.objectContaining({ method: "POST" }));
    });

    it("readInventiveByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockInventive] })
      });
      expect(await readInventiveByCaseId("case-1")).toEqual([mockInventive]);
    });

    it("updateInventive calls PUT", async () => {
      await updateInventive(mockInventive);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/inventive/inv-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteInventive calls DELETE", async () => {
      await deleteInventive("inv-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/inventive/inv-1`, { method: "DELETE" });
    });

    it("deleteInventiveByCaseId deletes all matching", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "i1" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteInventiveByCaseId("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/inventive/i1`, { method: "DELETE" });
    });
  });

  // ── Defect CRUD ─────────────────────────────────────────────────────

  describe("Defect CRUD", () => {
    const mockDefect = { id: "def-1", caseId: "case-1", category: "clarity" } as FormalDefect;

    it("createDefect calls POST", async () => {
      await createDefect(mockDefect);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/defects`, expect.objectContaining({ method: "POST" }));
    });

    it("getDefectsByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockDefect] })
      });
      expect(await getDefectsByCaseId("case-1")).toEqual([mockDefect]);
    });

    it("updateDefect calls PUT", async () => {
      await updateDefect(mockDefect);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/defects/def-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteDefect calls DELETE", async () => {
      await deleteDefect("def-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/defects/def-1`, { method: "DELETE" });
    });

    it("deleteDefectsByCaseId deletes all matching", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "d1" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteDefectsByCaseId("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/defects/d1`, { method: "DELETE" });
    });
  });

  // ── Draft Repo ──────────────────────────────────────────────────────

  describe("Draft Repo", () => {
    it("saveReexamDraft creates with caseId as id", async () => {
      const draft = { responseItems: [], overallAssessment: "ok" } as unknown as ReexamDraftResponse;
      await saveReexamDraft("case-1", draft);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/reexamDrafts`, expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "case-1", ...draft })
      }));
    });

    it("readReexamDraft returns record without id field", async () => {
      const record = { id: "case-1", responseItems: [], overallAssessment: "ok" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record })
      });
      const result = await readReexamDraft("case-1");
      expect(result).toEqual({ responseItems: [], overallAssessment: "ok" });
      expect(result).not.toHaveProperty("id");
    });

    it("readReexamDraft returns undefined on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await readReexamDraft("nonexistent")).toBeUndefined();
    });

    it("clearDraftData deletes both draft and summary", async () => {
      // deleteReexamDraft
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      // deleteSummary
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await clearDraftData("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/reexamDrafts/case-1`, { method: "DELETE" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/summaries/case-1`, { method: "DELETE" });
    });
  });

  // ── Summary Repo ────────────────────────────────────────────────────

  describe("Summary Repo", () => {
    it("saveSummary creates with caseId as id", async () => {
      const summary = { body: "summary text" } as unknown as SummaryResponse;
      await saveSummary("case-1", summary);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/summaries`, expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "case-1", ...summary })
      }));
    });

    it("readSummary returns record without id field", async () => {
      const record = { id: "case-1", body: "text" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record })
      });
      const result = await readSummary("case-1");
      expect(result).toEqual({ body: "text" });
    });

    it("readSummary returns undefined on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await readSummary("nonexistent")).toBeUndefined();
    });
  });

  // ── Chat Repo ───────────────────────────────────────────────────────

  describe("Chat Repo", () => {
    const mockSession: ChatSession = {
      id: "sess-1", caseId: "case-1", title: "test", createdAt: "2023-01-01"
    } as ChatSession;
    const mockMessage: ChatMessage = {
      id: "msg-1", sessionId: "sess-1", role: "user", content: "hello", createdAt: "2023-01-01"
    } as ChatMessage;

    it("createSession calls POST", async () => {
      await createSession(mockSession);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatSessions`, expect.objectContaining({ method: "POST" }));
    });

    it("getSessionsByCaseId queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockSession] })
      });
      expect(await getSessionsByCaseId("case-1")).toEqual([mockSession]);
    });

    it("deleteSession calls DELETE", async () => {
      await deleteSession("sess-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatSessions/sess-1`, { method: "DELETE" });
    });

    it("updateSession calls PUT", async () => {
      await updateSession(mockSession);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatSessions/sess-1`, expect.objectContaining({ method: "PUT" }));
    });

    it("deleteMessagesBySessionId deletes all messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "m1" }, { id: "m2" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteMessagesBySessionId("sess-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatMessages/m1`, { method: "DELETE" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatMessages/m2`, { method: "DELETE" });
    });

    it("createMessage calls POST", async () => {
      await createMessage(mockMessage);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/chatMessages`, expect.objectContaining({ method: "POST" }));
    });

    it("getMessagesBySessionId queries by sessionId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockMessage] })
      });
      expect(await getMessagesBySessionId("sess-1")).toEqual([mockMessage]);
    });
  });

  // ── Opinion Repo ────────────────────────────────────────────────────

  describe("Opinion Repo", () => {
    const mockAnalysis = {
      id: "oa-1", caseId: "case-1", createdAt: "2023-01-01T00:00:00Z"
    } as OfficeActionAnalysis;
    const mockMapping = {
      id: "am-1", caseId: "case-1", rejectionGroundCode: "RG-1"
    } as ArgumentMapping;

    it("saveOpinionAnalysis calls POST", async () => {
      await saveOpinionAnalysis(mockAnalysis);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/opinionAnalyses`, expect.objectContaining({ method: "POST" }));
    });

    it("readOpinionAnalysis returns latest by createdAt", async () => {
      const older = { ...mockAnalysis, id: "oa-old", createdAt: "2022-01-01T00:00:00Z" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [older, mockAnalysis] })
      });
      const result = await readOpinionAnalysis("case-1");
      expect(result?.id).toBe("oa-1");
    });

    it("readOpinionAnalysis returns null when empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [] })
      });
      expect(await readOpinionAnalysis("case-1")).toBeNull();
    });

    it("saveArgumentMappings creates each mapping", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await saveArgumentMappings([mockMapping, { ...mockMapping, id: "am-2" }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("readArgumentMappings queries by caseId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [mockMapping] })
      });
      expect(await readArgumentMappings("case-1")).toEqual([mockMapping]);
    });

    it("deleteArgumentMappings deletes all matching", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "a1" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteArgumentMappings("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/argumentMappings/a1`, { method: "DELETE" });
    });

    it("clearOpinionData deletes both analyses and mappings", async () => {
      // deleteOpinionAnalysis query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "oa-1" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      // deleteArgumentMappings query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ id: "am-1" }] })
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await clearOpinionData("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/opinionAnalyses/oa-1`, { method: "DELETE" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/argumentMappings/am-1`, { method: "DELETE" });
    });
  });

  // ── Interpret Repo ──────────────────────────────────────────────────

  describe("Interpret Repo", () => {
    it("saveInterpretSummaries creates with metadata", async () => {
      await saveInterpretSummaries("case-1", { doc1: "summary" });
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/interpretSummaries`, expect.objectContaining({ method: "POST" }));
      const body = JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
      expect(body.caseId).toBe("case-1");
      expect(body.summaries).toEqual({ doc1: "summary" });
    });

    it("readInterpretSummaries returns summaries field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record: { id: "case-1", summaries: { doc1: "s" } } })
      });
      expect(await readInterpretSummaries("case-1")).toEqual({ doc1: "s" });
    });

    it("readInterpretSummaries handles legacy summary field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, record: { id: "case-1", summary: "old" } })
      });
      expect(await readInterpretSummaries("case-1")).toEqual({ __legacy__: "old" });
    });

    it("readInterpretSummaries returns empty object on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await readInterpretSummaries("nonexistent")).toEqual({});
    });

    it("deleteInterpretSummaries calls DELETE", async () => {
      await deleteInterpretSummaries("case-1");
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/interpretSummaries/case-1`, { method: "DELETE" });
    });
  });

  // ── Run Marker Repo ─────────────────────────────────────────────────

  describe("Run Marker Repo", () => {
    it("saveRunMarker creates composite id", async () => {
      await saveRunMarker("case-1", "novelty");
      const body = JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
      expect(body.id).toBe("case-1::novelty");
      expect(body.caseId).toBe("case-1");
      expect(body.module).toBe("novelty");
    });

    it("getRunMarkersByCaseId returns module names", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [{ module: "novelty" }, { module: "inventive" }] })
      });
      expect(await getRunMarkersByCaseId("case-1")).toEqual(["novelty", "inventive"]);
    });
  });

  // ── Search Session Repo ─────────────────────────────────────────────

  describe("Search Session Repo", () => {
    const mockSearchSession: SearchSession = {
      id: "ss-1", caseId: "case-1", query: "test", updatedAt: "2023-06-01T00:00:00Z"
    } as SearchSession;

    it("createSearchSession calls POST", async () => {
      await createSearchSession(mockSearchSession);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/searchSessions`, expect.objectContaining({ method: "POST" }));
    });

    it("updateSearchSession calls PUT with updatedAt", async () => {
      await updateSearchSession(mockSearchSession);
      expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/searchSessions/ss-1`, expect.objectContaining({ method: "PUT" }));
      const body = JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
      expect(body).toHaveProperty("updatedAt");
    });

    it("getLatestSearchSession returns most recent session", async () => {
      const older = { ...mockSearchSession, id: "ss-old", updatedAt: "2023-01-01T00:00:00Z" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [older, mockSearchSession] })
      });
      const result = await getLatestSearchSession("case-1");
      expect(result?.id).toBe("ss-1");
    });

    it("getLatestSearchSession returns undefined when no sessions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [] })
      });
      expect(await getLatestSearchSession("case-1")).toBeUndefined();
    });
  });
});

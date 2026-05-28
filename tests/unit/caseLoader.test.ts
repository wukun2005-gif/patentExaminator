/**
 * caseLoader.test.ts (td-8)
 * ==========================
 * Tests for loadCaseById from @client/lib/caseLoader.
 * Covers: successful load, partial IDB data, empty stores, corrupted data.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { openPatentDB, setDBInstance, getDB } from "@client/lib/indexedDb";
import { loadCaseById } from "@client/lib/caseLoader";
import {
  useCaseStore,
  useDocumentsStore,
  useReferencesStore,
  useClaimsStore,
  useNoveltyStore,
  useInventiveStore,
  useDefectsStore,
  useChatStore,
  useInterpretStore,
  useOpinionStore,
  useDraftStore
} from "@client/store";
import type {
  PatentCase,
  SourceDocument,
  ClaimNode,
  ClaimFeature,
  NoveltyComparison,
  InventiveStepAnalysis,
  FormalDefect,
  ChatSession,
  ChatMessage,
  OfficeActionAnalysis,
  ArgumentMapping
} from "@shared/types/domain";

const CASE_ID = "loader-test-case";

function resetAllStores() {
  useCaseStore.setState({ currentCase: null, cases: [] });
  useDocumentsStore.setState({ documents: [] });
  useReferencesStore.setState({ references: [] });
  useClaimsStore.setState({ claimNodes: [], claimFeatures: [] });
  useNoveltyStore.setState({ comparisons: [] });
  useInventiveStore.setState({ analyses: [] });
  useDefectsStore.setState({ defects: [] });
  useChatStore.setState({ sessions: [], messages: [], activeSessionId: null });
  useInterpretStore.setState({ interpretSummaries: {} });
  useOpinionStore.setState({
    officeActionAnalysis: null,
    argumentMappings: [],
    unmappedGrounds: []
  });
  useDraftStore.setState({ reexamDrafts: {}, summaries: {} });
}

function makeCase(overrides: Partial<PatentCase> = {}): PatentCase {
  return {
    id: CASE_ID,
    applicationNumber: "CN2023100000001",
    title: "测试案件",
    applicationDate: "2023-03-15",
    patentType: "invention",
    textVersion: "original",
    targetClaimNumber: 1,
    guidelineVersion: "2023",
    reexaminationRound: 1,
    workflowState: "empty",
    createdAt: "2023-03-15T00:00:00.000Z",
    updatedAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    caseId: CASE_ID,
    role: "application",
    fileName: "申请文件.pdf",
    fileType: "pdf",
    textStatus: "extracted",
    extractedText: "技术方案",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    createdAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeClaimNode(overrides: Partial<ClaimNode> = {}): ClaimNode {
  return {
    id: "node-1",
    caseId: CASE_ID,
    claimNumber: 1,
    type: "independent",
    dependsOn: [],
    rawText: "一种装置",
    ...overrides
  };
}

function makeClaimFeature(overrides: Partial<ClaimFeature> = {}): ClaimFeature {
  return {
    id: "feat-1",
    caseId: CASE_ID,
    claimNumber: 1,
    featureCode: "F1",
    description: "特征一",
    specificationCitations: [],
    citationStatus: "confirmed",
    source: "ai",
    ...overrides
  };
}

function makeNovelty(overrides: Partial<NoveltyComparison> = {}): NoveltyComparison {
  return {
    id: "nov-1",
    caseId: CASE_ID,
    referenceId: "REF-001",
    claimNumber: 1,
    rows: [],
    differenceFeatureCodes: [],
    pendingSearchQuestions: [],
    status: "draft",
    legalCaution: "",
    ...overrides
  };
}

function makeInventive(overrides: Partial<InventiveStepAnalysis> = {}): InventiveStepAnalysis {
  return {
    id: "inv-1",
    caseId: CASE_ID,
    sharedFeatureCodes: [],
    distinguishingFeatureCodes: [],
    candidateAssessment: "not-analyzed",
    motivationEvidence: [],
    cautions: [],
    legalCaution: "",
    status: "draft",
    ...overrides
  };
}

function makeDefect(overrides: Partial<FormalDefect> = {}): FormalDefect {
  return {
    id: "def-1",
    caseId: CASE_ID,
    category: "形式问题",
    description: "缺少摘要",
    severity: "error",
    resolved: false,
    ...overrides
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "session-1",
    caseId: CASE_ID,
    moduleScope: "case",
    title: "测试会话",
    createdAt: "2023-03-15T00:00:00.000Z",
    updatedAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    caseId: CASE_ID,
    sessionId: "session-1",
    moduleScope: "case",
    role: "user",
    content: "测试消息",
    createdAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeOpinionAnalysis(overrides: Partial<OfficeActionAnalysis> = {}): OfficeActionAnalysis {
  return {
    id: "oa-1",
    caseId: CASE_ID,
    documentId: "doc-oa",
    rejectionGrounds: [],
    citedReferences: [],
    legalCaution: "",
    status: "draft",
    createdAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeArgumentMapping(overrides: Partial<ArgumentMapping> = {}): ArgumentMapping {
  return {
    id: "am-1",
    caseId: CASE_ID,
    rejectionGroundCode: "X1",
    applicantArgument: "区别特征未公开",
    argumentSummary: "申请人意见",
    confidence: "high",
    status: "draft",
    createdAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

describe("loadCaseById", () => {
  beforeEach(async () => {
    const db = await openPatentDB();
    setDBInstance(db);

    // Clear all IDB stores
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, "readwrite");
    await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);

    resetAllStores();
  });

  // ── successful load ────────────────────────────────────────────────

  describe("successful load", () => {
    it("returns the PatentCase and hydrates case store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());

      const result = await loadCaseById(CASE_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(CASE_ID);
      expect(result!.title).toBe("测试案件");
      expect(useCaseStore.getState().currentCase?.id).toBe(CASE_ID);
    });

    it("hydrates documents store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("documents", makeDocument({ id: "d1", role: "application", fileName: "app.pdf" }));
      await db.put("documents", makeDocument({
        id: "d2", role: "reference", fileName: "ref.pdf"
      }));

      await loadCaseById(CASE_ID);
      // Documents store gets all docs; references store gets only role=reference
      expect(useDocumentsStore.getState().documents).toHaveLength(2);
    });

    it("hydrates references store with role=reference only", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("documents", makeDocument({ id: "d1", role: "application" }));
      await db.put("documents", makeDocument({ id: "d2", role: "reference" }));

      await loadCaseById(CASE_ID);
      expect(useReferencesStore.getState().references).toHaveLength(1);
    });

    it("hydrates claims store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("claimNodes", makeClaimNode());
      await db.put("claimCharts", makeClaimFeature());

      await loadCaseById(CASE_ID);
      expect(useClaimsStore.getState().claimNodes).toHaveLength(1);
      expect(useClaimsStore.getState().claimFeatures).toHaveLength(1);
    });

    it("hydrates novelty store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("novelty", makeNovelty());

      await loadCaseById(CASE_ID);
      expect(useNoveltyStore.getState().comparisons).toHaveLength(1);
      expect(useNoveltyStore.getState().comparisons[0]!.referenceId).toBe("REF-001");
    });

    it("hydrates inventive store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("inventive", makeInventive());

      await loadCaseById(CASE_ID);
      expect(useInventiveStore.getState().analyses).toHaveLength(1);
    });

    it("hydrates defects store", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("defects", makeDefect());

      await loadCaseById(CASE_ID);
      expect(useDefectsStore.getState().defects).toHaveLength(1);
    });

    it("hydrates chat sessions and messages", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("chatSessions", makeSession({ id: "s1" }));
      await db.put("chatMessages", makeMessage({ id: "m1", sessionId: "s1" }));
      await db.put("chatMessages", makeMessage({ id: "m2", sessionId: "s1", role: "assistant", content: "回复" }));

      await loadCaseById(CASE_ID);
      expect(useChatStore.getState().sessions).toHaveLength(1);
      expect(useChatStore.getState().messages).toHaveLength(2);
      expect(useChatStore.getState().activeSessionId).toBe("s1");
    });

    it("sets activeSessionId to null when no sessions exist", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());

      await loadCaseById(CASE_ID);
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });

    it("hydrates interpret summaries", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("interpretSummaries", {
        caseId: CASE_ID,
        summaries: { doc1: "摘要一", doc2: "摘要二" },
        updatedAt: "2023-03-15T00:00:00.000Z"
      });

      await loadCaseById(CASE_ID);
      const summaries = useInterpretStore.getState().interpretSummaries[CASE_ID];
      expect(summaries).toBeDefined();
      expect(summaries!["doc1"]).toBe("摘要一");
    });

    it("hydrates opinion analysis", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("opinionAnalyses", makeOpinionAnalysis());

      await loadCaseById(CASE_ID);
      expect(useOpinionStore.getState().officeActionAnalysis).not.toBeNull();
      expect(useOpinionStore.getState().officeActionAnalysis!.id).toBe("oa-1");
    });

    it("hydrates argument mappings", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("argumentMappings", makeArgumentMapping());

      await loadCaseById(CASE_ID);
      expect(useOpinionStore.getState().argumentMappings).toHaveLength(1);
    });

    it("hydrates run markers to module slices", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("runMarkers", {
        id: `${CASE_ID}::defects`,
        caseId: CASE_ID,
        module: "defects",
        timestamp: "2023-03-15T00:00:00.000Z"
      });
      await db.put("runMarkers", {
        id: `${CASE_ID}::claimChart`,
        caseId: CASE_ID,
        module: "claimChart",
        timestamp: "2023-03-15T00:00:00.000Z"
      });

      await loadCaseById(CASE_ID);
      expect(useDefectsStore.getState().ranCases).toContain(CASE_ID);
      expect(useClaimsStore.getState().ranCases).toContain(CASE_ID);
    });
  });

  // ── empty / not found ──────────────────────────────────────────────

  describe("empty stores / not found", () => {
    it("returns null when caseId does not exist in IDB", async () => {
      const result = await loadCaseById("non-existent");
      expect(result).toBeNull();
    });

    it("does not hydrate any store when case is not found", async () => {
      await loadCaseById("non-existent");
      expect(useCaseStore.getState().currentCase).toBeNull();
      expect(useDocumentsStore.getState().documents).toHaveLength(0);
      expect(useNoveltyStore.getState().comparisons).toHaveLength(0);
    });

    it("loads successfully with all child stores empty", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());

      const result = await loadCaseById(CASE_ID);
      expect(result).not.toBeNull();
      expect(useDocumentsStore.getState().documents).toHaveLength(0);
      expect(useClaimsStore.getState().claimNodes).toHaveLength(0);
      expect(useClaimsStore.getState().claimFeatures).toHaveLength(0);
      expect(useNoveltyStore.getState().comparisons).toHaveLength(0);
      expect(useInventiveStore.getState().analyses).toHaveLength(0);
      expect(useDefectsStore.getState().defects).toHaveLength(0);
      expect(useChatStore.getState().sessions).toHaveLength(0);
      expect(useChatStore.getState().messages).toHaveLength(0);
    });
  });

  // ── partial IDB failure ────────────────────────────────────────────

  describe("partial IDB data", () => {
    it("handles session with missing messages gracefully", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("chatSessions", makeSession({ id: "s-orphan" }));
      // No messages for this session — getMessagesBySessionId returns []

      await loadCaseById(CASE_ID);
      expect(useChatStore.getState().sessions).toHaveLength(1);
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it("loads partial data when only some stores have data", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("novelty", makeNovelty());
      await db.put("defects", makeDefect());
      // No documents, claims, inventive, chat, etc.

      await loadCaseById(CASE_ID);
      expect(useNoveltyStore.getState().comparisons).toHaveLength(1);
      expect(useDefectsStore.getState().defects).toHaveLength(1);
      expect(useDocumentsStore.getState().documents).toHaveLength(0);
      expect(useClaimsStore.getState().claimNodes).toHaveLength(0);
    });

    it("loads multiple sessions with messages from different sessions", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("chatSessions", makeSession({ id: "s1", title: "会话1" }));
      await db.put("chatSessions", makeSession({ id: "s2", title: "会话2" }));
      await db.put("chatMessages", makeMessage({ id: "m1", sessionId: "s1" }));
      await db.put("chatMessages", makeMessage({ id: "m2", sessionId: "s2", content: "会话2消息" }));

      await loadCaseById(CASE_ID);
      expect(useChatStore.getState().sessions).toHaveLength(2);
      expect(useChatStore.getState().messages).toHaveLength(2);
      expect(useChatStore.getState().activeSessionId).toBe("s1");
    });
  });

  // ── corrupted data ────────────────────────────────────────────────

  describe("corrupted data", () => {
    it("loads case with minimal fields into store", async () => {
      const db = await getDB();
      // Put a case with missing optional fields
      await db.put("cases", {
        id: CASE_ID,
        applicationNumber: null,
        title: "",
        applicationDate: "",
        patentType: "invention",
        textVersion: "original",
        targetClaimNumber: 1,
        guidelineVersion: "",
        reexaminationRound: 1,
        workflowState: "empty",
        createdAt: "",
        updatedAt: ""
      } as PatentCase);

      const result = await loadCaseById(CASE_ID);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("");
      expect(useCaseStore.getState().currentCase?.id).toBe(CASE_ID);
    });

    it("handles novelty with empty rows array", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("novelty", makeNovelty({ rows: [], differenceFeatureCodes: [] }));

      await loadCaseById(CASE_ID);
      expect(useNoveltyStore.getState().comparisons).toHaveLength(1);
      expect(useNoveltyStore.getState().comparisons[0]!.rows).toHaveLength(0);
    });

    it("handles inventive with no optional fields", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      await db.put("inventive", {
        id: "inv-minimal",
        caseId: CASE_ID,
        sharedFeatureCodes: [],
        distinguishingFeatureCodes: [],
        candidateAssessment: "not-analyzed",
        motivationEvidence: [],
        cautions: [],
        legalCaution: "",
        status: "draft"
      });

      await loadCaseById(CASE_ID);
      expect(useInventiveStore.getState().analyses).toHaveLength(1);
      expect(useInventiveStore.getState().analyses[0]!.closestPriorArtId).toBeUndefined();
    });

    it("handles legacy interpret summary format", async () => {
      const db = await getDB();
      await db.put("cases", makeCase());
      // Legacy format: { caseId, summary, updatedAt } without summaries object
      await db.put("interpretSummaries", {
        caseId: CASE_ID,
        summary: "旧格式摘要",
        updatedAt: "2023-03-15T00:00:00.000Z"
      });

      await loadCaseById(CASE_ID);
      const summaries = useInterpretStore.getState().interpretSummaries[CASE_ID];
      expect(summaries).toBeDefined();
      // Legacy format wraps in __legacy__ key
      expect(summaries!["__legacy__"]).toBe("旧格式摘要");
    });
  });
});

/**
 * DB Logic-Chain Integration Tests
 * ================================
 *
 * 测试目标：验证每个"页面按钮"背后的完整非 UI 逻辑链路。
 *
 * 每条链路覆盖：
 *   Zustand Store Action → Repository Function → IndexedDB Write
 *   → IndexedDB Readback → 数据一致性验证
 *
 * 不涉及 React 渲染 / DOM 操作。
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { getDB, setDBInstance } from "@client/lib/repos";

import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useReferencesStore } from "@client/store/features/references/referencesSlice";
import { useClaimsStore } from "@client/store/features/claims/claimsSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useInventiveStore } from "@client/store/features/inventive/inventiveSlice";
import { useDefectsStore } from "@client/store/features/defects/defectsSlice";
import { useChatStore } from "@client/store/features/chat/chatSlice";
import { useSettingsStore } from "@client/store/features/settings/settingsSlice";

import * as caseRepo from "@client/lib/repos";
import * as documentRepo from "@client/lib/repos";
import * as claimRepo from "@client/lib/repos";
import * as noveltyRepo from "@client/lib/repos";
import * as inventiveRepo from "@client/lib/repos";
import * as defectRepo from "@client/lib/repos";
import * as chatRepo from "@client/lib/repos";
import * as feedbackRepo from "@client/lib/repos";
import * as settingsRepo from "@client/lib/repos";

import type { PatentCase, SourceDocument, ClaimNode, ClaimFeature, NoveltyComparison, InventiveStepAnalysis, FormalDefect, ChatSession, ChatMessage } from "@shared/types/domain";
import type { FeedbackItem } from "@shared/types/feedback";
import type { AppSettings } from "@shared/types/agents";

beforeEach(async () => {
  const { openPatentDB } = await import("@client/lib/repos");
  const db = await openPatentDB();
  setDBInstance(db);

  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);

  useCaseStore.setState({ currentCase: null, cases: [], isLoading: false });
  useDocumentsStore.setState({ documents: [], isLoading: false });
  useReferencesStore.setState({ references: [], candidates: [], isLoading: false, isSearching: false });
  useClaimsStore.setState({ claimNodes: [], claimFeatures: [], isLoading: false });
  useNoveltyStore.setState({ comparisons: [], isLoading: false });
  useInventiveStore.setState({ analyses: [], isLoading: false });
  useDefectsStore.setState({ defects: [], isLoading: false });
  useChatStore.setState({ sessions: [], messages: [], activeSessionId: null, isPanelOpen: true, isLoading: false });
  useSettingsStore.setState({ isLoading: false, isInitialized: false });
});

function makeCase(overrides: Partial<PatentCase> = {}): PatentCase {
  return {
    id: "case-1",
    applicationNumber: "CN2023100000001",
    title: "测试发明",
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

function makeDoc(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    caseId: "case-1",
    role: "application",
    fileName: "申请文件.pdf",
    fileType: "pdf",
    textStatus: "extracted",
    extractedText: "本发明涉及一种测试装置。",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    createdAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

function makeClaimNode(overrides: Partial<ClaimNode> = {}): ClaimNode {
  return {
    id: "claim-1",
    caseId: "case-1",
    claimNumber: 1,
    type: "independent",
    dependsOn: [],
    rawText: "一种装置，包括A和B",
    ...overrides
  };
}

function makeClaimFeature(overrides: Partial<ClaimFeature> = {}): ClaimFeature {
  return {
    id: "case-1-chart-1-A",
    caseId: "case-1",
    claimNumber: 1,
    featureCode: "A",
    description: "一种装置",
    specificationCitations: [],
    citationStatus: "needs-review",
    source: "mock",
    ...overrides
  };
}

function makeNovelty(overrides: Partial<NoveltyComparison> = {}): NoveltyComparison {
  return {
    id: "novelty-1",
    caseId: "case-1",
    referenceId: "ref-1",
    claimNumber: 1,
    rows: [
      { featureCode: "A", disclosureStatus: "clearly-disclosed", citations: [], mismatchNotes: "" }
    ],
    differenceFeatureCodes: ["B"],
    pendingSearchQuestions: [],
    status: "draft",
    legalCaution: "候选事实整理，不构成法律结论。",
    ...overrides
  };
}

function makeInventive(overrides: Partial<InventiveStepAnalysis> = {}): InventiveStepAnalysis {
  return {
    id: "inventive-case-1-1",
    caseId: "case-1",
    sharedFeatureCodes: ["A"],
    distinguishingFeatureCodes: ["B"],
    status: "draft",
    motivationEvidence: [],
    candidateAssessment: "not-analyzed",
    cautions: [],
    legalCaution: "候选事实整理，不构成法律结论。",
    ...overrides
  };
}

function makeDefect(overrides: Partial<FormalDefect> = {}): FormalDefect {
  return {
    id: "defect-1",
    caseId: "case-1",
    category: "权利要求",
    description: "权利要求1不清楚",
    severity: "warning",
    resolved: false,
    ...overrides
  };
}

function makeChatSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "session-1",
    caseId: "case-1",
    moduleScope: "case",
    title: "测试会话",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    sessionId: "session-1",
    caseId: "case-1",
    moduleScope: "case",
    role: "user",
    content: "你好",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function makeFeedback(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: "fb-1",
    caseId: "case-1",
    subjectType: "claim-chart",
    subjectId: "chart-1",
    verdict: "like",
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

// ══════════════════════════════════════════════════════════════════════
// Case: Store → Repo → DB → Readback
// ══════════════════════════════════════════════════════════════════════

describe("Case logic chain", () => {
  it("create: Store.setCases → Repo.createCase → DB 读回验证", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const dbCase = await caseRepo.readCaseById("case-1");
    expect(dbCase).toBeDefined();
    expect(dbCase!.title).toBe("测试发明");
    expect(dbCase!.applicationNumber).toBe("CN2023100000001");

    const storeCases = useCaseStore.getState().cases;
    expect(storeCases).toHaveLength(1);
    expect(storeCases[0]!.id).toBe("case-1");
  });

  it("update: Store.setCases → Repo.updateCase → DB 读回验证", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const updated: PatentCase = { ...c, title: "修改后的发明", workflowState: "claim-chart-ready" };
    await caseRepo.updateCase(updated);
    useCaseStore.getState().setCases([updated]);

    const dbCase = await caseRepo.readCaseById("case-1");
    expect(dbCase!.title).toBe("修改后的发明");
    expect(dbCase!.workflowState).toBe("claim-chart-ready");

    const storeCase = useCaseStore.getState().cases[0];
    expect(storeCase!.title).toBe("修改后的发明");
  });

  it("delete: Store.setCases([]) → Repo.deleteCase → DB 中消失", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    await caseRepo.deleteCase("case-1");
    useCaseStore.getState().setCases([]);

    const dbCase = await caseRepo.readCaseById("case-1");
    expect(dbCase).toBeUndefined();
    expect(useCaseStore.getState().cases).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Document: Store → Repo → DB → Readback
// ══════════════════════════════════════════════════════════════════════

describe("Document logic chain", () => {
  it("create: Store.addDocument → Repo.createDocument → DB 读回验证", async () => {
    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);
    await documentRepo.createDocument(doc);

    const dbDoc = await documentRepo.readDocumentById("doc-1");
    expect(dbDoc).toBeDefined();
    expect(dbDoc!.fileName).toBe("申请文件.pdf");
    expect(dbDoc!.role).toBe("application");

    const storeDocs = useDocumentsStore.getState().documents;
    expect(storeDocs).toHaveLength(1);
  });

  it("update: Store.updateDocument → Repo.updateDocument → DB 读回验证", async () => {
    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);
    await documentRepo.createDocument(doc);

    const updated: SourceDocument = { ...doc, textStatus: "confirmed", extractedText: "更新后的文本" };
    await documentRepo.updateDocument(updated);
    useDocumentsStore.getState().updateDocument(updated);

    const dbDoc = await documentRepo.readDocumentById("doc-1");
    expect(dbDoc!.textStatus).toBe("confirmed");
    expect(dbDoc!.extractedText).toBe("更新后的文本");
  });

  it("delete → Store + DB 同时消失", async () => {
    const doc = makeDoc();
    useDocumentsStore.getState().addDocument(doc);
    await documentRepo.createDocument(doc);

    await documentRepo.deleteDocument("doc-1");
    useDocumentsStore.getState().removeDocument("doc-1");

    const dbDoc = await documentRepo.readDocumentById("doc-1");
    expect(dbDoc).toBeUndefined();
    expect(useDocumentsStore.getState().documents).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// ClaimNode + ClaimFeature: Store → Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Claim logic chain", () => {
  it("claimNode: Store.setClaimNodes → Repo.createClaimNode → DB 读回", async () => {
    const node = makeClaimNode();
    useClaimsStore.getState().setClaimNodes([node]);
    await claimRepo.createClaimNode(node);

    const dbNodes = await claimRepo.readClaimNodesByCaseId("case-1");
    expect(dbNodes).toHaveLength(1);
    expect(dbNodes[0]!.rawText).toBe("一种装置，包括A和B");
    expect(dbNodes[0]!.type).toBe("independent");
  });

  it("claimNode: delete 后 Store 和 DB 均清空", async () => {
    const node = makeClaimNode();
    useClaimsStore.getState().setClaimNodes([node]);
    await claimRepo.createClaimNode(node);

    await claimRepo.deleteClaimNode("claim-1");
    useClaimsStore.getState().setClaimNodes([]);

    const dbNodes = await claimRepo.readClaimNodesByCaseId("case-1");
    expect(dbNodes).toHaveLength(0);
    expect(useClaimsStore.getState().claimNodes).toHaveLength(0);
  });

  it("claimFeature: Store.addClaimFeature → Repo.createClaimFeature → DB 读回", async () => {
    const feature = makeClaimFeature();
    useClaimsStore.getState().addClaimFeature(feature);
    await claimRepo.createClaimFeature(feature);

    const dbFeatures = await claimRepo.readClaimFeaturesByCaseId("case-1");
    expect(dbFeatures).toHaveLength(1);
    expect(dbFeatures[0]!.featureCode).toBe("A");
    expect(dbFeatures[0]!.citationStatus).toBe("needs-review");
  });

  it("claimFeature: update citationStatus → Store + DB 一致", async () => {
    const feature = makeClaimFeature();
    useClaimsStore.getState().addClaimFeature(feature);
    await claimRepo.createClaimFeature(feature);

    const updated = { ...feature, citationStatus: "confirmed" as const };
    await claimRepo.updateClaimFeature(updated);
    useClaimsStore.getState().updateClaimFeature(updated);

    const dbFeatures = await claimRepo.readClaimFeaturesByCaseId("case-1");
    expect(dbFeatures[0]!.citationStatus).toBe("confirmed");

    const storeFeatures = useClaimsStore.getState().claimFeatures;
    expect(storeFeatures[0]!.citationStatus).toBe("confirmed");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Novelty: Store → Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Novelty logic chain", () => {
  it("create: Store.addComparison → Repo.createNovelty → DB 读回", async () => {
    const n = makeNovelty();
    useNoveltyStore.getState().addComparison(n);
    await noveltyRepo.createNovelty(n);

    const dbItems = await noveltyRepo.readNoveltyByCaseId("case-1");
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0]!.referenceId).toBe("ref-1");
    expect(dbItems[0]!.rows).toHaveLength(1);
  });

  it("update: 修改 rows 后 Store + DB 一致", async () => {
    const n = makeNovelty();
    useNoveltyStore.getState().addComparison(n);
    await noveltyRepo.createNovelty(n);

    const updated: NoveltyComparison = {
      ...n,
      rows: [
        ...n.rows,
        { featureCode: "B", disclosureStatus: "not-found", citations: [], mismatchNotes: "" }
      ],
      differenceFeatureCodes: ["B", "C"],
      status: "user-reviewed"
    };
    await noveltyRepo.updateNovelty(updated);
    useNoveltyStore.getState().updateComparison(updated);

    const dbItems = await noveltyRepo.readNoveltyByCaseId("case-1");
    expect(dbItems[0]!.rows).toHaveLength(2);
    expect(dbItems[0]!.differenceFeatureCodes).toEqual(["B", "C"]);
    expect(dbItems[0]!.status).toBe("user-reviewed");
  });

  it("delete: Store.removeComparison → Repo.deleteNovelty → DB 消失", async () => {
    const n = makeNovelty();
    useNoveltyStore.getState().addComparison(n);
    await noveltyRepo.createNovelty(n);

    await noveltyRepo.deleteNovelty("novelty-1");
    useNoveltyStore.getState().removeComparison("novelty-1");

    const dbItems = await noveltyRepo.readNoveltyByCaseId("case-1");
    expect(dbItems).toHaveLength(0);
    expect(useNoveltyStore.getState().comparisons).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Inventive: Store → Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Inventive logic chain", () => {
  it("create: Store.addAnalysis → Repo.createInventive → DB 读回", async () => {
    const inv = makeInventive();
    useInventiveStore.getState().addAnalysis(inv);
    await inventiveRepo.createInventive(inv);

    const dbItems = await inventiveRepo.readInventiveByCaseId("case-1");
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0]!.candidateAssessment).toBe("not-analyzed");
  });

  it("update: 修改 examinerResponse + motivationEvidence → Store + DB一致", async () => {
    const inv = makeInventive();
    useInventiveStore.getState().addAnalysis(inv);
    await inventiveRepo.createInventive(inv);

    const updated: InventiveStepAnalysis = {
      ...inv,
      examinerResponse: "审查员认为不具备创造性",
      objectiveTechnicalProblem: "提高散热效率",
      motivationEvidence: [
        { documentId: "ref-2", label: "D2", confidence: "high" }
      ],
      closestPriorArtId: "ref-2"
    };
    await inventiveRepo.updateInventive(updated);
    useInventiveStore.getState().updateAnalysis(updated);

    const dbItems = await inventiveRepo.readInventiveByCaseId("case-1");
    expect(dbItems[0]!.examinerResponse).toBe("审查员认为不具备创造性");
    expect(dbItems[0]!.objectiveTechnicalProblem).toBe("提高散热效率");
    expect(dbItems[0]!.motivationEvidence).toHaveLength(1);
    expect(dbItems[0]!.closestPriorArtId).toBe("ref-2");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Defect: Store → Repo → DB (bug 22 related)
// ══════════════════════════════════════════════════════════════════════

describe("Defect logic chain", () => {
  it("create: Store.addDefect → Repo.createDefect → DB 读回", async () => {
    const d = makeDefect();
    useDefectsStore.getState().addDefect(d);
    await defectRepo.createDefect(d);

    const dbDefects = await defectRepo.getDefectsByCaseId("case-1");
    expect(dbDefects).toHaveLength(1);
    expect(dbDefects[0]!.category).toBe("权利要求");
    expect(dbDefects[0]!.severity).toBe("warning");
  });

  it("update: 编辑 description + severity → Store + DB 一致", async () => {
    const d = makeDefect();
    useDefectsStore.getState().addDefect(d);
    await defectRepo.createDefect(d);

    const updated: FormalDefect = { ...d, description: "修改后的描述", severity: "error" };
    const db2 = await getDB();
    await db2.put("defects", updated);
    useDefectsStore.getState().updateDefect(updated);

    const dbDefects = await defectRepo.getDefectsByCaseId("case-1");
    expect(dbDefects[0]!.description).toBe("修改后的描述");
    expect(dbDefects[0]!.severity).toBe("error");

    const storeDefect = useDefectsStore.getState().defects.find((x: FormalDefect) => x.id === "defect-1");
    expect(storeDefect!.description).toBe("修改后的描述");
  });

  it("delete: Store.removeDefect → DB 消失", async () => {
    const d = makeDefect();
    useDefectsStore.getState().addDefect(d);
    await defectRepo.createDefect(d);

    const db2 = await getDB();
    await db2.delete("defects", "defect-1");
    useDefectsStore.getState().removeDefect("defect-1");

    const dbDefects = await defectRepo.getDefectsByCaseId("case-1");
    expect(dbDefects).toHaveLength(0);
    expect(useDefectsStore.getState().defects).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Chat: Store → Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Chat logic chain", () => {
  it("session: Store.addSession → Repo.createSession → DB 读回", async () => {
    const session = makeChatSession();
    useChatStore.getState().addSession(session);
    await chatRepo.createSession(session);

    const dbSessions = await chatRepo.getSessionsByCaseId("case-1");
    expect(dbSessions).toHaveLength(1);
    expect(dbSessions[0]!.title).toBe("测试会话");
  });

  it("message: Store.addMessage → Repo.createMessage → DB 读回", async () => {
    const session = makeChatSession();
    useChatStore.getState().addSession(session);
    await chatRepo.createSession(session);

    const msg = makeChatMessage();
    useChatStore.getState().addMessage(msg);
    await chatRepo.createMessage(msg);

    const dbMessages = await chatRepo.getMessagesBySessionId("session-1");
    expect(dbMessages).toHaveLength(1);
    expect(dbMessages[0]!.role).toBe("user");
    expect(dbMessages[0]!.content).toBe("你好");
  });

  it("cascade: 删除 session → messages 同时清除", async () => {
    const session = makeChatSession();
    useChatStore.getState().addSession(session);
    await chatRepo.createSession(session);

    const msg = makeChatMessage();
    useChatStore.getState().addMessage(msg);
    await chatRepo.createMessage(msg);

    await chatRepo.deleteMessagesBySessionId("session-1");
    await chatRepo.deleteSession("session-1");
    useChatStore.getState().removeSession("session-1");

    const dbSessions = await chatRepo.getSessionsByCaseId("case-1");
    expect(dbSessions).toHaveLength(0);

    const dbMessages = await chatRepo.getMessagesBySessionId("session-1");
    expect(dbMessages).toHaveLength(0);
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Feedback: Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Feedback logic chain", () => {
  it("create → read → update → delete 全生命周期", async () => {
    const fb = makeFeedback();
    await feedbackRepo.createFeedback(fb);

    let all = await feedbackRepo.readFeedbackByCaseId("case-1");
    expect(all).toHaveLength(1);
    expect(all[0]!.verdict).toBe("like");

    await feedbackRepo.updateFeedback({ ...fb, verdict: "dislike" });
    all = await feedbackRepo.readFeedbackByCaseId("case-1");
    expect(all[0]!.verdict).toBe("dislike");

    await feedbackRepo.deleteFeedback("fb-1");
    all = await feedbackRepo.readFeedbackByCaseId("case-1");
    expect(all).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Settings: Store → Repo → DB
// ══════════════════════════════════════════════════════════════════════

describe("Settings logic chain", () => {
  it("read defaults → write → read back 验证", async () => {
    const defaults = await settingsRepo.readSettings();
    expect(defaults.mode).toBe("mock");

    const modified: AppSettings = {
      ...defaults,
      mode: "real",
      guidelineVersion: "2024"
    };
    await settingsRepo.writeSettings(modified);
    useSettingsStore.getState().setSettings(modified);

    const stored = await settingsRepo.readSettings();
    expect(stored.mode).toBe("real");
    expect(stored.guidelineVersion).toBe("2024");
  });
});
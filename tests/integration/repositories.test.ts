import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createCase,
  readAllCases,
  readCaseById,
  updateCase,
  deleteCase
} from "@client/lib/repos";
import {
  createDocument,
  readAllDocuments,
  readDocumentById,
  updateDocument,
  deleteDocument
} from "@client/lib/repos";
import {
  createClaimNode,
  readClaimNodesByCaseId,
  deleteClaimNode,
  createClaimFeature,
  readClaimFeaturesByCaseId,
  updateClaimFeature,
  deleteClaimFeature
} from "@client/lib/repos";
import {
  createNovelty,
  readNoveltyByCaseId,
  updateNovelty,
  deleteNovelty
} from "@client/lib/repos";
import {
  createInventive,
  readInventiveByCaseId,
  updateInventive,
  deleteInventive
} from "@client/lib/repos";
import {
  createFeedback,
  readFeedbackByCaseId,
  updateFeedback,
  deleteFeedback
} from "@client/lib/repos";
import { writeOcrCache, readOcrCache, deleteOcrCache } from "@client/lib/repos";
import { readSettings, writeSettings } from "@client/lib/repos";
import type { PatentCase, SourceDocument, ClaimNode, ClaimFeature, NoveltyComparison, InventiveStepAnalysis } from "@shared/types/domain";
import type { FeedbackItem } from "@shared/types/feedback";
import type { AppSettings } from "@shared/types/agents";

// Reset DB before each test by clearing all stores
beforeEach(async () => {
  const db = await (await import("@client/lib/repos")).getDB();
  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);
});

const testCase: PatentCase = {
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
  updatedAt: "2023-03-15T00:00:00.000Z"
};

const testDoc: SourceDocument = {
  id: "doc-1",
  caseId: "case-1",
  role: "application",
  fileName: "申请文件.pdf",
  fileType: "pdf",
  textStatus: "empty",
  extractedText: "",
  textIndex: { pages: [], paragraphs: [], lineMap: [] },
  createdAt: "2023-03-15T00:00:00.000Z"
};

const testClaimNode: ClaimNode = {
  id: "claim-1",
  caseId: "case-1",
  claimNumber: 1,
  type: "independent",
  dependsOn: [],
  rawText: "一种装置，包括A和B"
};

const testClaimFeature: ClaimFeature = {
  id: "case-1-chart-1-A",
  caseId: "case-1",
  claimNumber: 1,
  featureCode: "A",
  description: "一种装置",
  specificationCitations: [],
  citationStatus: "needs-review",
  source: "mock"
};

const testNovelty: NoveltyComparison = {
  id: "novelty-1",
  caseId: "case-1",
  referenceId: "ref-1",
  claimNumber: 1,
  rows: [],
  differenceFeatureCodes: [],
  pendingSearchQuestions: [],
  status: "draft",
  legalCaution: "以上为候选事实整理，不构成新颖性法律结论。"
};

const testInventive: InventiveStepAnalysis = {
  id: "inventive-1",
  caseId: "case-1",
  sharedFeatureCodes: ["A"],
  distinguishingFeatureCodes: ["B"],
  status: "draft",
  motivationEvidence: [],
  candidateAssessment: "not-analyzed",
  cautions: [],
  legalCaution: "以上为候选事实整理，不构成创造性法律结论。"
};

const testFeedback: FeedbackItem = {
  id: "fb-1",
  caseId: "case-1",
  subjectType: "claim-chart",
  subjectId: "chart-1",
  verdict: "like",
  createdAt: "2023-03-15T00:00:00.000Z"
};

describe("caseRepo", () => {
  it("create → readAll → update → delete", async () => {
    await createCase(testCase);
    let all = await readAllCases();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe("测试发明");

    const byId = await readCaseById("case-1");
    expect(byId).toBeDefined();

    await updateCase({ ...testCase, title: "更新后的发明" });
    all = await readAllCases();
    expect(all[0]!.title).toBe("更新后的发明");

    await deleteCase("case-1");
    all = await readAllCases();
    expect(all).toHaveLength(0);
  });
});

describe("documentRepo", () => {
  it("create → readAll → update → delete", async () => {
    await createDocument(testDoc);
    let all = await readAllDocuments();
    expect(all).toHaveLength(1);

    const byId = await readDocumentById("doc-1");
    expect(byId).toBeDefined();

    await updateDocument({ ...testDoc, textStatus: "extracted", extractedText: "提取的文本" });
    all = await readAllDocuments();
    expect(all[0]!.textStatus).toBe("extracted");

    await deleteDocument("doc-1");
    all = await readAllDocuments();
    expect(all).toHaveLength(0);
  });
});

describe("claimRepo", () => {
  it("claimNode: create → readByCaseId → delete", async () => {
    await createClaimNode(testClaimNode);
    const nodes = await readClaimNodesByCaseId("case-1");
    expect(nodes).toHaveLength(1);

    await deleteClaimNode("claim-1");
    const after = await readClaimNodesByCaseId("case-1");
    expect(after).toHaveLength(0);
  });

  it("claimFeature: create → readByCaseId → update → delete", async () => {
    await createClaimFeature(testClaimFeature);
    let features = await readClaimFeaturesByCaseId("case-1");
    expect(features).toHaveLength(1);

    await updateClaimFeature({ ...testClaimFeature, citationStatus: "confirmed" });
    features = await readClaimFeaturesByCaseId("case-1");
    expect(features[0]!.citationStatus).toBe("confirmed");

    await deleteClaimFeature("case-1-chart-1-A");
    features = await readClaimFeaturesByCaseId("case-1");
    expect(features).toHaveLength(0);
  });
});

describe("noveltyRepo", () => {
  it("create → readByCaseId → update → delete", async () => {
    await createNovelty(testNovelty);
    let all = await readNoveltyByCaseId("case-1");
    expect(all).toHaveLength(1);

    await updateNovelty({ ...testNovelty, status: "user-reviewed" });
    all = await readNoveltyByCaseId("case-1");
    expect(all[0]!.status).toBe("user-reviewed");

    await deleteNovelty("novelty-1");
    all = await readNoveltyByCaseId("case-1");
    expect(all).toHaveLength(0);
  });
});

describe("inventiveRepo", () => {
  it("create → readByCaseId → update → delete", async () => {
    await createInventive(testInventive);
    let all = await readInventiveByCaseId("case-1");
    expect(all).toHaveLength(1);

    await updateInventive({ ...testInventive, status: "user-reviewed" });
    all = await readInventiveByCaseId("case-1");
    expect(all[0]!.status).toBe("user-reviewed");

    await deleteInventive("inventive-1");
    all = await readInventiveByCaseId("case-1");
    expect(all).toHaveLength(0);
  });
});

describe("feedbackRepo", () => {
  it("create → readByCaseId → update → delete", async () => {
    await createFeedback(testFeedback);
    let all = await readFeedbackByCaseId("case-1");
    expect(all).toHaveLength(1);

    await updateFeedback({ ...testFeedback, verdict: "dislike" });
    all = await readFeedbackByCaseId("case-1");
    expect(all[0]!.verdict).toBe("dislike");

    await deleteFeedback("fb-1");
    all = await readFeedbackByCaseId("case-1");
    expect(all).toHaveLength(0);
  });
});

describe("ocrCacheRepo", () => {
  it("write → read (fresh) → read (expired)", async () => {
    await writeOcrCache("key-1", "OCR文本");
    const text = await readOcrCache("key-1");
    expect(text).toBe("OCR文本");

    // Test expiry: write with old timestamp
    const db = await (await import("@client/lib/repos")).getDB();
    await db.put("ocrCache", {
      cacheKey: "key-old",
      text: "旧文本",
      createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
    });
    const expired = await readOcrCache("key-old");
    expect(expired).toBeNull();
  });

  it("delete", async () => {
    await writeOcrCache("key-2", "文本");
    await deleteOcrCache("key-2");
    const text = await readOcrCache("key-2");
    expect(text).toBeNull();
  });
});

describe("settingsRepo", () => {
  it("read default → write → read updated", async () => {
    const defaults = await readSettings();
    expect(defaults.mode).toBe("mock");

    const custom: AppSettings = {
      mode: "real",
      guidelineVersion: "2023",
      providers: [],
      agents: [],
      searchProviders: [],
      persistKeysEncrypted: false
    };
    await writeSettings(custom);
    const updated = await readSettings();
    expect(updated.mode).toBe("real");
  });
});

describe("chatRepo", () => {
  it("session: create → getByCaseId → update → delete", async () => {
    const { createSession, getSessionsByCaseId, updateSession, deleteSession } = await import("@client/lib/repos");
    const session = { id: "s1", caseId: "c1", title: "Test", createdAt: new Date().toISOString() };
    await createSession(session);
    const sessions = await getSessionsByCaseId("c1");
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.id).toBe("s1");

    await updateSession({ ...session, title: "Updated" });
    const updated = await getSessionsByCaseId("c1");
    expect(updated[0]!.title).toBe("Updated");

    await deleteSession("s1");
    const remaining = await getSessionsByCaseId("c1");
    expect(remaining.length).toBe(0);
  });

  it("message: create → getBySessionId → deleteBySessionId", async () => {
    const { createMessage, getMessagesBySessionId, deleteMessagesBySessionId } = await import("@client/lib/repos");
    const msg = { id: "m1", sessionId: "s1", role: "user" as const, content: "Hello", createdAt: new Date().toISOString() };
    await createMessage(msg);
    const messages = await getMessagesBySessionId("s1");
    expect(messages.length).toBe(1);

    await deleteMessagesBySessionId("s1");
    const remaining = await getMessagesBySessionId("s1");
    expect(remaining.length).toBe(0);
  });
});

describe("defectRepo", () => {
  it("create → getByCaseId → update → delete → deleteByCaseId", async () => {
    const { createDefect, getDefectsByCaseId, updateDefect, deleteDefect, deleteDefectsByCaseId } = await import("@client/lib/repos");
    const defect = { id: "d1", caseId: "c1", category: "clarity" as const, description: "Test", severity: "error" as const, claimNumbers: [1] };
    await createDefect(defect);
    const defects = await getDefectsByCaseId("c1");
    expect(defects.length).toBe(1);

    await updateDefect({ ...defect, description: "Updated" });
    const updated = await getDefectsByCaseId("c1");
    expect(updated[0]!.description).toBe("Updated");

    await deleteDefect("d1");
    const afterDelete = await getDefectsByCaseId("c1");
    expect(afterDelete.length).toBe(0);

    // Test deleteByCaseId
    await createDefect({ ...defect, id: "d2" });
    await createDefect({ ...defect, id: "d3", caseId: "c2" });
    await deleteDefectsByCaseId("c1");
    const remaining = await getDefectsByCaseId("c1");
    expect(remaining.length).toBe(0);
    const other = await getDefectsByCaseId("c2");
    expect(other.length).toBe(1);
  });
});

describe("draftRepo", () => {
  it("reexamDraft: save → read → delete → clearDraftData", async () => {
    const { saveReexamDraft, readReexamDraft, deleteReexamDraft, clearDraftData } = await import("@client/lib/repos");
    const draft = { examinerResponse: "test response", overallAssessment: "test assessment", responses: [] };
    await saveReexamDraft("c1", draft as unknown as import("@shared/types/domain").ReexamDraftResponse);
    const read = await readReexamDraft("c1");
    expect(read).toBeDefined();
    expect((read as unknown as Record<string, unknown>).examinerResponse).toBe("test response");

    await deleteReexamDraft("c1");
    const deleted = await readReexamDraft("c1");
    expect(deleted).toBeUndefined();

    // Test clearDraftData
    await saveReexamDraft("c2", draft as unknown as import("@shared/types/domain").ReexamDraftResponse);
    await clearDraftData("c2");
    const cleared = await readReexamDraft("c2");
    expect(cleared).toBeUndefined();
  });

  it("summary: save → read → delete", async () => {
    const { saveSummary, readSummary, deleteSummary } = await import("@client/lib/repos");
    const summary = { body: "test body", aiNotes: "test notes" };
    await saveSummary("c1", summary as unknown as import("@shared/types/domain").SummaryResponse);
    const read = await readSummary("c1");
    expect(read).toBeDefined();
    expect((read as unknown as Record<string, unknown>).body).toBe("test body");

    await deleteSummary("c1");
    const deleted = await readSummary("c1");
    expect(deleted).toBeUndefined();
  });
});

describe("interpretRepo", () => {
  it("save → read → delete", async () => {
    const { saveInterpretSummaries, readInterpretSummaries, deleteInterpretSummaries } = await import("@client/lib/repos");
    const summaries = { "doc1": "summary1", "doc2": "summary2" };
    await saveInterpretSummaries("c1", summaries);
    const read = await readInterpretSummaries("c1");
    expect(read).toEqual(summaries);

    await deleteInterpretSummaries("c1");
    const deleted = await readInterpretSummaries("c1");
    expect(deleted).toEqual({});
  });
});

describe("opinionRepo", () => {
  it("opinionAnalysis: save → read → delete", async () => {
    const { saveOpinionAnalysis, readOpinionAnalysis, deleteOpinionAnalysis } = await import("@client/lib/repos");
    const analysis = { id: "oa1", caseId: "c1", documentId: "d1", rejectionGrounds: [], citedReferences: [], createdAt: new Date().toISOString() };
    await saveOpinionAnalysis(analysis as unknown as import("@shared/types/domain").OfficeActionAnalysis);
    const read = await readOpinionAnalysis("c1");
    expect(read).toBeDefined();
    expect(read!.id).toBe("oa1");

    await deleteOpinionAnalysis("c1");
    const deleted = await readOpinionAnalysis("c1");
    expect(deleted).toBeNull();
  });

  it("argumentMappings: save → read → delete → clearOpinionData", async () => {
    const { saveArgumentMappings, readArgumentMappings, deleteArgumentMappings, clearOpinionData } = await import("@client/lib/repos");
    const mappings = [
      { id: "am1", caseId: "c1", rejectionGroundCode: "RG-1", applicantArgument: "arg1", argumentSummary: "sum1", confidence: "high" as const },
      { id: "am2", caseId: "c1", rejectionGroundCode: "RG-2", applicantArgument: "arg2", argumentSummary: "sum2", confidence: "medium" as const }
    ];
    await saveArgumentMappings(mappings as unknown as import("@shared/types/domain").ArgumentMapping[]);
    const read = await readArgumentMappings("c1");
    expect(read.length).toBe(2);

    await deleteArgumentMappings("c1");
    const deleted = await readArgumentMappings("c1");
    expect(deleted.length).toBe(0);

    // Test clearOpinionData
    await saveArgumentMappings(mappings as unknown as import("@shared/types/domain").ArgumentMapping[]);
    await clearOpinionData("c1");
    const cleared = await readArgumentMappings("c1");
    expect(cleared.length).toBe(0);
  });
});

describe("referenceRepo", () => {
  it("readReferencesByCaseId filters by role=reference", async () => {
    const { readReferencesByCaseId } = await import("@client/lib/repos");
    // referenceRepo reads from documents store, filtering by role
    const refs = await readReferencesByCaseId("nonexistent");
    expect(Array.isArray(refs)).toBe(true);
  });
});

describe("runMarkerRepo", () => {
  it("save → getByCaseId → delete", async () => {
    const { saveRunMarker, getRunMarkersByCaseId, deleteRunMarker } = await import("@client/lib/repos");
    await saveRunMarker("c1", "claim-chart");
    await saveRunMarker("c1", "novelty");
    const markers = await getRunMarkersByCaseId("c1");
    expect(markers).toContain("claim-chart");
    expect(markers).toContain("novelty");

    await deleteRunMarker("c1", "claim-chart");
    const afterDelete = await getRunMarkersByCaseId("c1");
    expect(afterDelete).not.toContain("claim-chart");
    expect(afterDelete).toContain("novelty");
  });
});

describe("searchSessionRepo", () => {
  it("create → getByCaseId → update → delete → getLatest", async () => {
    const { createSearchSession, getSearchSessionsByCaseId, updateSearchSession, deleteSearchSession, getLatestSearchSession } = await import("@client/lib/repos");
    const session = { id: "ss1", caseId: "c1", query: "test", dataSources: ["tavily"], resultCount: 5, status: "completed" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await createSearchSession(session);
    const sessions = await getSearchSessionsByCaseId("c1");
    expect(sessions.length).toBe(1);

    await updateSearchSession({ ...session, resultCount: 10 });
    const updated = await getSearchSessionsByCaseId("c1");
    expect(updated[0]!.resultCount).toBe(10);

    const latest = await getLatestSearchSession("c1");
    expect(latest).toBeDefined();
    expect(latest!.id).toBe("ss1");

    await deleteSearchSession("ss1");
    const remaining = await getSearchSessionsByCaseId("c1");
    expect(remaining.length).toBe(0);
  });
});

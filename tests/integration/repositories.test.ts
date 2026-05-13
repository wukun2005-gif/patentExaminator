import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createCase,
  readAllCases,
  readCaseById,
  updateCase,
  deleteCase
} from "@client/lib/repositories/caseRepo";
import {
  createDocument,
  readAllDocuments,
  readDocumentById,
  updateDocument,
  deleteDocument
} from "@client/lib/repositories/documentRepo";
import {
  createClaimNode,
  readClaimNodesByCaseId,
  deleteClaimNode,
  createClaimFeature,
  readClaimFeaturesByCaseId,
  updateClaimFeature,
  deleteClaimFeature
} from "@client/lib/repositories/claimRepo";
import {
  createNovelty,
  readNoveltyByCaseId,
  updateNovelty,
  deleteNovelty
} from "@client/lib/repositories/noveltyRepo";
import {
  createInventive,
  readInventiveByCaseId,
  updateInventive,
  deleteInventive
} from "@client/lib/repositories/inventiveRepo";
import {
  createFeedback,
  readFeedbackByCaseId,
  updateFeedback,
  deleteFeedback
} from "@client/lib/repositories/feedbackRepo";
import { writeOcrCache, readOcrCache, deleteOcrCache } from "@client/lib/repositories/ocrCacheRepo";
import { readSettings, writeSettings } from "@client/lib/repositories/settingsRepo";
import type { PatentCase, SourceDocument, ClaimNode, ClaimFeature, NoveltyComparison, InventiveStepAnalysis } from "@shared/types/domain";
import type { FeedbackItem } from "@shared/types/feedback";
import type { AppSettings } from "@shared/types/agents";

// Reset DB before each test by clearing all stores
beforeEach(async () => {
  const db = await (await import("@client/lib/indexedDb")).getDB();
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
    const db = await (await import("@client/lib/indexedDb")).getDB();
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

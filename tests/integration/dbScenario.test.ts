/**
 * DB Scenario Regression Tests
 * =============================
 *
 * 针对已修复bug的回归测试，确保 Database CRUD 问题不复现：
 *   Bug 18: 删除对比文件后无法再加载再比较
 *   Bug 19: Store 状态与 DB 不一致（级联清理未同步）
 *   Bug 21: 数据保存后读取不一致
 *   Bug 22: 缺陷数据保存后丢失/不更新
 *
 * 每个场景都不涉及 UI，直接调用 Store + Repo + DB 验证全链路。
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { getDB, setDBInstance } from "@client/lib/repos";

import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useReferencesStore } from "@client/store/features/references/referencesSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useDefectsStore } from "@client/store/features/defects/defectsSlice";
import { useChatStore } from "@client/store/features/chat/chatSlice";

import * as caseRepo from "@client/lib/repos";
import * as referenceRepo from "@client/lib/repos";
import * as documentRepo from "@client/lib/repos";
import * as noveltyRepo from "@client/lib/repos";
import * as defectRepo from "@client/lib/repos";
import * as chatRepo from "@client/lib/repos";

import type {
  PatentCase, ReferenceDocument, SourceDocument, NoveltyComparison,
  FormalDefect, ChatSession, ChatMessage
} from "@shared/types/domain";

beforeEach(async () => {
  const { openPatentDB } = await import("@client/lib/repos");
  const db = await openPatentDB();
  setDBInstance(db);

  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);

  useCaseStore.setState({ currentCase: null, cases: [], isLoading: false });
  useReferencesStore.setState({ references: [], candidates: [], isLoading: false, isSearching: false });
  useNoveltyStore.setState({ comparisons: [], isLoading: false });
  useDocumentsStore.setState({ documents: [], isLoading: false });
  useDefectsStore.setState({ defects: [], isLoading: false });
  useChatStore.setState({ sessions: [], messages: [], activeSessionId: null, isPanelOpen: true, isLoading: false });
});

// ══════════════════════════════════════════════════════════════════════
// Helper factories
// ══════════════════════════════════════════════════════════════════════

const CASE_ID = "bug-test-case";

function makeCase(): PatentCase {
  return {
    id: CASE_ID,
    applicationNumber: "CN2023100000000",
    title: "回归测试发明",
    applicationDate: "2023-01-01",
    patentType: "invention",
    textVersion: "original",
    targetClaimNumber: 1,
    guidelineVersion: "2023",
    reexaminationRound: 1,
    workflowState: "empty",
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
  };
}

function makeReference(refId: string, overrides: Partial<ReferenceDocument> = {}): ReferenceDocument {
  return {
    id: refId,
    caseId: CASE_ID,
    role: "reference",
    fileName: `对比文件-${refId}.pdf`,
    fileType: "pdf",
    textStatus: "extracted",
    extractedText: "内容...",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    createdAt: "2023-01-01T00:00:00.000Z",
    timelineStatus: "available",
    publicationDateConfidence: "high",
    ...overrides,
  };
}

function makeNovelty(refId: string): NoveltyComparison {
  return {
    id: `novelty-${refId}`,
    caseId: CASE_ID,
    referenceId: refId,
    claimNumber: 1,
    rows: [
      { featureCode: "A", disclosureStatus: "clearly-disclosed", citations: [], mismatchNotes: "" }
    ],
    differenceFeatureCodes: ["B"],
    pendingSearchQuestions: [],
    status: "draft",
    legalCaution: "候选事实整理，不构成法律结论。",
  };
}

// ══════════════════════════════════════════════════════════════════════
// Bug 18: 删除对比文件后无法再加载再比较
// ══════════════════════════════════════════════════════════════════════

describe("Bug 18 Regression: Delete reference and reload", () => {
  it("删除对比文件 A → 验证 Store/DB 均消失 → 重新添加对比文件 A → 可正常加载", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const refA = makeReference("ref-A");
    await documentRepo.createDocument(refA);
    useReferencesStore.getState().addReference(refA);

    expect(useReferencesStore.getState().references).toHaveLength(1);
    let dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(1);
    expect(dbRefs[0]!.id).toBe("ref-A");

    await documentRepo.deleteDocument("ref-A");
    useReferencesStore.getState().removeReference("ref-A");

    expect(useReferencesStore.getState().references).toHaveLength(0);
    dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(0);

    const refA2 = makeReference("ref-A");
    await documentRepo.createDocument(refA2);
    useReferencesStore.getState().addReference(refA2);

    expect(useReferencesStore.getState().references).toHaveLength(1);
    expect(useReferencesStore.getState().references[0]!.id).toBe("ref-A");

    dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(1);
  });

  it("删除对比文件后 → 关联的新颖性对照应可独立操作", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const refA = makeReference("ref-A");
    await documentRepo.createDocument(refA);
    useReferencesStore.getState().addReference(refA);

    const refB = makeReference("ref-B");
    await documentRepo.createDocument(refB);
    useReferencesStore.getState().addReference(refB);

    const novA = makeNovelty("ref-A");
    await noveltyRepo.createNovelty(novA);
    useNoveltyStore.getState().addComparison(novA);

    const novB = makeNovelty("ref-B");
    await noveltyRepo.createNovelty(novB);
    useNoveltyStore.getState().addComparison(novB);

    await documentRepo.deleteDocument("ref-A");
    useReferencesStore.getState().removeReference("ref-A");

    const dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(1);
    expect(dbRefs[0]!.id).toBe("ref-B");

    const storeRefs = useReferencesStore.getState().references;
    expect(storeRefs).toHaveLength(1);

    const dbNovelties = await noveltyRepo.readNoveltyByCaseId(CASE_ID);
    expect(dbNovelties).toHaveLength(2);
  });

  it("多次删除-重建循环后 Store 与 DB 保持一致", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    for (let i = 1; i <= 3; i++) {
      const ref = makeReference(`ref-cycle`);
      await documentRepo.createDocument(ref);
      useReferencesStore.getState().addReference(ref);

      expect(useReferencesStore.getState().references).toHaveLength(1);

      await documentRepo.deleteDocument(`ref-cycle`);
      useReferencesStore.getState().removeReference(`ref-cycle`);

      expect(useReferencesStore.getState().references).toHaveLength(0);

      const dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
      expect(dbRefs).toHaveLength(0);
    }

    const ref = makeReference(`ref-cycle`);
    await documentRepo.createDocument(ref);
    useReferencesStore.getState().addReference(ref);

    expect(useReferencesStore.getState().references).toHaveLength(1);
    const dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Bug 19: Store 状态与 DB 不一致（级联清理未同步）
// ══════════════════════════════════════════════════════════════════════

describe("Bug 19 Regression: Cascade cleanup sync", () => {
  it("删除 Case → 相关 Chat sessions/messages 应在 Store 和 DB 中清除", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const session: ChatSession = {
      id: "session-1",
      caseId: CASE_ID,
      moduleScope: "case",
      title: "测试会话",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await chatRepo.createSession(session);
    useChatStore.getState().addSession(session);

    const msg: ChatMessage = {
      id: "msg-1",
      sessionId: "session-1",
      caseId: CASE_ID,
      moduleScope: "case",
      role: "user",
      content: "你好",
      createdAt: new Date().toISOString(),
    };
    await chatRepo.createMessage(msg);
    useChatStore.getState().addMessage(msg);

    await chatRepo.deleteMessagesBySessionId("session-1");
    await chatRepo.deleteSession("session-1");
    await caseRepo.deleteCase(CASE_ID);

    useChatStore.getState().removeSession("session-1");
    useCaseStore.getState().setCases([]);

    expect(useChatStore.getState().sessions).toHaveLength(0);
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useCaseStore.getState().cases).toHaveLength(0);

    const dbSessions = await chatRepo.getSessionsByCaseId(CASE_ID);
    expect(dbSessions).toHaveLength(0);

    const dbMessages = await chatRepo.getMessagesBySessionId("session-1");
    expect(dbMessages).toHaveLength(0);

    const dbCase = await caseRepo.readCaseById(CASE_ID);
    expect(dbCase).toBeUndefined();
  });

  it("级联操作后重新创建同 ID 的实体不冲突", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    await caseRepo.deleteCase(CASE_ID);
    useCaseStore.getState().setCases([]);

    const c2 = makeCase();
    await caseRepo.createCase(c2);
    useCaseStore.getState().setCases([c2]);

    const dbCase = await caseRepo.readCaseById(CASE_ID);
    expect(dbCase).toBeDefined();
    expect(dbCase!.title).toBe("回归测试发明");
    expect(useCaseStore.getState().cases).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Bug 21: 数据保存后读取不一致
// ══════════════════════════════════════════════════════════════════════

describe("Bug 21 Regression: Save then readback consistency", () => {
  it("写入 Case 所有字段 → DB 读回 → 字段一一匹配", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const updated: PatentCase = {
      ...c,
      title: "修改后的标题",
      workflowState: "documents-uploaded",
      examinerNotes: "审查员备注信息",
      reexaminationRound: 2,
    };
    await caseRepo.updateCase(updated);
    useCaseStore.getState().setCases([updated]);

    const dbCase = await caseRepo.readCaseById(CASE_ID);
    expect(dbCase!.title).toBe("修改后的标题");
    expect(dbCase!.workflowState).toBe("documents-uploaded");
    expect(dbCase!.examinerNotes).toBe("审查员备注信息");
    expect(dbCase!.reexaminationRound).toBe(2);
  });

  it("Reference 字段完整性：所有字段写回读回一致", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const ref = makeReference("ref-full", {
      title: "LED散热装置对比文献",
      publicationNumber: "CN112345678A",
      publicationDate: "2021-01-15",
      technicalField: "散热器技术领域",
      summary: "公开了一种散热结构",
      relevanceNotes: "与本申请相关",
    } as Partial<ReferenceDocument>);
    await documentRepo.createDocument(ref);
    useReferencesStore.getState().addReference(ref);

    const dbRefs = await referenceRepo.readReferencesByCaseId(CASE_ID);
    expect(dbRefs).toHaveLength(1);
    const dbRef = dbRefs[0] as SourceDocument & Partial<ReferenceDocument>;
    expect(dbRef.publicationNumber!).toBe("CN112345678A");
    expect(dbRef.title!).toBe("LED散热装置对比文献");
  });

  it("Novelty rows 复杂对象写回读回一致性", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const novelty: NoveltyComparison = {
      id: "novelty-complex",
      caseId: CASE_ID,
      referenceId: "ref-complex",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "clearly-disclosed",
          citations: [
            {
              documentId: "ref-complex",
              label: "D1",
              paragraph: "[0008]",
              quote: "散热翅片与基板连接",
              confidence: "high",
            },
          ],
        },
        {
          featureCode: "B",
          disclosureStatus: "not-found",
          citations: [],
        },
      ],
      differenceFeatureCodes: ["B"],
      pendingSearchQuestions: ["散热效率相关文献"],
      examinerResponse: "需进一步检索",
      status: "draft",
      legalCaution: "候选事实，不构成法律结论。",
    };
    await noveltyRepo.createNovelty(novelty);
    useNoveltyStore.getState().addComparison(novelty);

    const dbItems = await noveltyRepo.readNoveltyByCaseId(CASE_ID);
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0]!.rows).toHaveLength(2);

    const row0 = dbItems[0]!.rows[0];
    expect(row0!.featureCode).toBe("A");
    expect(row0!.disclosureStatus).toBe("clearly-disclosed");
    expect(row0!.citations).toHaveLength(1);
    expect(row0!.citations[0]!.quote).toBe("散热翅片与基板连接");
    expect(row0!.citations[0]!.confidence).toBe("high");

    const row1 = dbItems[0]!.rows[1];
    expect(row1!.featureCode).toBe("B");
    expect(row1!.disclosureStatus).toBe("not-found");

    expect(dbItems[0]!.pendingSearchQuestions).toEqual(["散热效率相关文献"]);
    expect(dbItems[0]!.examinerResponse).toBe("需进一步检索");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Bug 22: 缺陷数据保存后丢失/不更新
// ══════════════════════════════════════════════════════════════════════

describe("Bug 22 Regression: Defect CRUD integrity", () => {
  it("创建缺陷 → 存储到 DB → 读回验证 → Store 和 DB 同步", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const defect: FormalDefect = {
      id: "defect-bug22-1",
      caseId: CASE_ID,
      category: "权利要求",
      description: "权利要求1不清楚，缺少对技术效果的限定",
      severity: "warning",
      resolved: false,
    };
    await defectRepo.createDefect(defect);
    useDefectsStore.getState().addDefect(defect);

    const dbDefects = await defectRepo.getDefectsByCaseId(CASE_ID);
    expect(dbDefects).toHaveLength(1);
    expect(dbDefects[0]!.id).toBe("defect-bug22-1");
    expect(dbDefects[0]!.description).toBe("权利要求1不清楚，缺少对技术效果的限定");
    expect(dbDefects[0]!.severity).toBe("warning");
    expect(dbDefects[0]!.resolved).toBe(false);

    const storeDefect = useDefectsStore.getState().defects[0];
    expect(storeDefect!.description).toBe("权利要求1不清楚，缺少对技术效果的限定");
  });

  it("更新缺陷 → Store + DB 同步（描述、严重性、解决状态均更新）", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    const defect: FormalDefect = {
      id: "defect-bug22-2",
      caseId: CASE_ID,
      category: "说明书",
      description: "说明书第3页存在笔误",
      severity: "info",
      resolved: false,
    };
    await defectRepo.createDefect(defect);
    useDefectsStore.getState().addDefect(defect);

    const db2 = await getDB();
    const updated: FormalDefect = {
      ...defect,
      description: "说明书第3页存在笔误 (已更正)",
      severity: "error",
      resolved: true,
      overcomeStatus: "overcome",
    };
    await db2.put("defects", updated);
    useDefectsStore.getState().updateDefect(updated);

    const dbDefects = await defectRepo.getDefectsByCaseId(CASE_ID);
    expect(dbDefects).toHaveLength(1);
    expect(dbDefects[0]!.description).toBe("说明书第3页存在笔误 (已更正)");
    expect(dbDefects[0]!.severity).toBe("error");
    expect(dbDefects[0]!.resolved).toBe(true);
    expect(dbDefects[0]!.overcomeStatus).toBe("overcome");
  });

  it("批量缺陷：创建多个 → 删一个 → 其余仍在", async () => {
    const c = makeCase();
    await caseRepo.createCase(c);
    useCaseStore.getState().setCases([c]);

    for (let i = 1; i <= 5; i++) {
      const defect: FormalDefect = {
        id: `defect-bug22-${i}`,
        caseId: CASE_ID,
        category: "权利要求",
        description: `缺陷描述 ${i}`,
        severity: "warning",
        resolved: false,
      };
      await defectRepo.createDefect(defect);
      useDefectsStore.getState().addDefect(defect);
    }

    expect(useDefectsStore.getState().defects).toHaveLength(5);

    const db2 = await getDB();
    await db2.delete("defects", "defect-bug22-3");
    useDefectsStore.getState().removeDefect("defect-bug22-3");

    expect(useDefectsStore.getState().defects).toHaveLength(4);
    expect(useDefectsStore.getState().defects.find(d => d.id === "defect-bug22-3")).toBeUndefined();

    const dbDefects = await defectRepo.getDefectsByCaseId(CASE_ID);
    expect(dbDefects).toHaveLength(4);
    expect(dbDefects.find(d => d.id === "defect-bug22-3")).toBeUndefined();

    expect(dbDefects.find(d => d.id === "defect-bug22-1")).toBeDefined();
    expect(dbDefects.find(d => d.id === "defect-bug22-5")).toBeDefined();
  });
});
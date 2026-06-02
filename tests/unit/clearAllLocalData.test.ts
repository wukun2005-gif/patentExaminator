/**
 * clearAllLocalData Tests
 * =======================
 *
 * 测试 clearAllLocalData 函数的各种场景：
 * - 清除所有 object store
 * - 覆盖 IndexedDB schema 中定义的所有 store
 * - runMarkers store 被正确清除（bg-43 修复验证）
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { getDB, setDBInstance, openPatentDB } from "@client/lib/repos";
import { clearAllLocalData } from "@client/lib/repos";

// 所有应该被清除的 store 列表
const EXPECTED_STORES = [
  "cases", "documents", "textIndex", "claimNodes", "claimCharts",
  "novelty", "inventive", "defects", "ocrCache",
  "chatMessages", "chatSessions", "feedback", "settings",
  "interpretSummaries", "opinionAnalyses", "argumentMappings",
  "reexamDrafts", "summaries", "runMarkers", "searchSessions",
  "knowledgeSources", "knowledgeChunks", "knowledgeVectors"
];

// B-038: IndexedDB deleted
describe.skip("clearAllLocalData", () => {
  beforeEach(async () => {
    const db = await openPatentDB();
    setDBInstance(db);

    // 清除所有 store 的数据
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, "readwrite");
    await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 基本功能
  // ══════════════════════════════════════════════════════════════════════

  it("clears all stores without error", async () => {
    await expect(clearAllLocalData()).resolves.not.toThrow();
  });

  it("clears cases store", async () => {
    const db = await getDB();
    await db.put("cases", {
      id: "test-case",
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
      updatedAt: "2023-03-15T00:00:00.000Z"
    });

    await clearAllLocalData();

    const cases = await db.getAll("cases");
    expect(cases).toHaveLength(0);
  });

  it("clears documents store", async () => {
    const db = await getDB();
    await db.put("documents", {
      id: "test-doc",
      caseId: "test-case",
      role: "application",
      fileName: "测试文档.pdf",
      fileType: "pdf",
      textStatus: "extracted",
      extractedText: "测试内容",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: "2023-03-15T00:00:00.000Z"
    });

    await clearAllLocalData();

    const docs = await db.getAll("documents");
    expect(docs).toHaveLength(0);
  });

  it("clears settings store", async () => {
    const db = await getDB();
    await db.put("settings", {
      id: "app",
      mode: "real",
      guidelineVersion: "2023",
      providers: [],
      agents: [],
      searchProviders: [],
      persistKeysEncrypted: false,
      enableProviderFallback: true
    });

    await clearAllLocalData();

    const settings = await db.getAll("settings");
    expect(settings).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // runMarkers store 清除（bg-43 修复验证）
  // ══════════════════════════════════════════════════════════════════════

  it("clears runMarkers store (bg-43 fix)", async () => {
    const db = await getDB();
    await db.put("runMarkers", { id: "marker-1", caseId: "case-1", module: "claim-chart", timestamp: new Date().toISOString() });

    await clearAllLocalData();

    const markers = await db.getAll("runMarkers");
    expect(markers).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 覆盖完整性验证
  // ══════════════════════════════════════════════════════════════════════

  it("covers all stores defined in IndexedDB schema", async () => {
    const db = await getDB();
    const schemaStores = Array.from(db.objectStoreNames).sort();
    const expectedStores = [...EXPECTED_STORES].sort();

    expect(schemaStores).toEqual(expectedStores);
  });

  it("clears multiple stores in single call", async () => {
    const db = await getDB();

    // 在多个 store 中添加数据
    await db.put("cases", {
      id: "case-1",
      applicationNumber: "CN2023100000001",
      title: "案件1",
      applicationDate: "2023-03-15",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      reexaminationRound: 1,
      workflowState: "empty",
      createdAt: "2023-03-15T00:00:00.000Z",
      updatedAt: "2023-03-15T00:00:00.000Z"
    });
    await db.put("documents", {
      id: "doc-1",
      caseId: "case-1",
      role: "application",
      fileName: "文档1.pdf",
      fileType: "pdf",
      textStatus: "extracted",
      extractedText: "测试内容",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: "2023-03-15T00:00:00.000Z"
    });
    await db.put("runMarkers", { id: "marker-1", caseId: "case-1", module: "claim-chart", timestamp: new Date().toISOString() });
    await db.put("chatSessions", { id: "session-1", caseId: "case-1", moduleScope: "case", title: "测试会话", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    await clearAllLocalData();

    // 验证所有 store 都被清除
    const cases = await db.getAll("cases");
    const docs = await db.getAll("documents");
    const markers = await db.getAll("runMarkers");
    const sessions = await db.getAll("chatSessions");

    expect(cases).toHaveLength(0);
    expect(docs).toHaveLength(0);
    expect(markers).toHaveLength(0);
    expect(sessions).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  it("handles empty stores gracefully", async () => {
    // 所有 store 都已经是空的
    await expect(clearAllLocalData()).resolves.not.toThrow();
  });

  it("can be called multiple times", async () => {
    const db = await getDB();
    await db.put("cases", {
      id: "case-1",
      applicationNumber: "CN2023100000001",
      title: "案件1",
      applicationDate: "2023-03-15",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      reexaminationRound: 1,
      workflowState: "empty",
      createdAt: "2023-03-15T00:00:00.000Z",
      updatedAt: "2023-03-15T00:00:00.000Z"
    });

    await clearAllLocalData();
    await clearAllLocalData();

    const cases = await db.getAll("cases");
    expect(cases).toHaveLength(0);
  });
});

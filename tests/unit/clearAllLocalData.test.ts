/**
 * clearAllLocalData Tests (B-038 rewritten)
 * ===========================================
 *
 * 测试 clearAllLocalData 函数的各种场景：
 * - 清除所有 store 通过服务端 API
 * - 覆盖所有 store 的 DELETE 调用
 * - 边界情况处理
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

describe("clearAllLocalData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 基本功能
  // ══════════════════════════════════════════════════════════════════════

  it("clears all stores without error", async () => {
    await expect(clearAllLocalData()).resolves.not.toThrow();
  });

  it("calls DELETE for each store", async () => {
    await clearAllLocalData();

    const deleteCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/") && c[1]?.method === "DELETE"
    );
    expect(deleteCalls).toHaveLength(EXPECTED_STORES.length);
  });

  it("calls correct API endpoints for each store", async () => {
    await clearAllLocalData();

    for (const store of EXPECTED_STORES) {
      const call = mockFetch.mock.calls.find(
        (c: unknown[]) => c[0] === `/api/data/${store}` && c[1]?.method === "DELETE"
      );
      expect(call).toBeDefined();
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // 覆盖完整性验证
  // ══════════════════════════════════════════════════════════════════════

  it("covers all stores defined in the schema", async () => {
    await clearAllLocalData();

    const calledStores = mockFetch.mock.calls
      .filter((c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/") && c[1]?.method === "DELETE")
      .map((c: unknown[]) => (c[0] as string).replace("/api/data/", ""));

    expect(calledStores.sort()).toEqual([...EXPECTED_STORES].sort());
  });

  // ══════════════════════════════════════════════════════════════════════
  // 错误处理
  // ══════════════════════════════════════════════════════════════════════

  it("throws when server returns error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

    await expect(clearAllLocalData()).rejects.toThrow();
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  it("handles empty stores gracefully", async () => {
    await expect(clearAllLocalData()).resolves.not.toThrow();
  });

  it("can be called multiple times", async () => {
    await clearAllLocalData();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });

    await clearAllLocalData();

    const deleteCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/") && c[1]?.method === "DELETE"
    );
    expect(deleteCalls).toHaveLength(EXPECTED_STORES.length);
  });
});

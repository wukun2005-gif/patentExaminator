/**
 * presetLoader.test.ts (B-038 rewritten)
 * ========================================
 *
 * 测试 loadPresetCase 函数的各种场景：
 * - 创建案件和关联数据
 * - 写入正确的 repos 调用次数
 * - hydrate Zustand stores
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

// Mock idbWriteGuard
vi.mock("@client/lib/idbWriteGuard", () => ({
  idbWriteGuard: vi.fn(() => vi.fn())
}));

// Track all fetch calls
const createdRecords: Array<{ store: string; data: Record<string, unknown> }> = [];
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { loadPresetCase } from "@client/lib/presetLoader";
import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useClaimsStore } from "@client/store/features/claims/claimsSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useInventiveStore } from "@client/store/features/inventive/inventiveSlice";

describe("loadPresetCase", () => {
  beforeEach(() => {
    // Reset stores
    useCaseStore.setState({ currentCase: null, cases: [] });
    useClaimsStore.setState({ claimNodes: [], claimFeatures: [] });
    useNoveltyStore.setState({ comparisons: [] });
    useInventiveStore.setState({ analyses: [] });
    vi.clearAllMocks();
    createdRecords.length = 0;

    // Mock fetch: track POST /api/data/{store} as creates, return ok for everything
    mockFetch.mockImplementation((url: string, options?: { method?: string; body?: string }) => {
      const method = options?.method ?? "GET";
      if (method === "POST" && url.match(/\/api\/data\/[^/]+$/) && !url.includes("/query")) {
        const store = url.replace("/api/data/", "");
        if (options?.body) {
          createdRecords.push({ store, data: JSON.parse(options.body) });
        }
      }
      // For readCaseById on subsequent loads, return 404 (first load)
      if (method === "GET" && url.match(/\/api\/data\/cases\//)) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ ok: false })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, records: [] })
      });
    });
  });

  it("returns preset case ID", async () => {
    const caseId = await loadPresetCase();
    expect(caseId).toBe("preset-demo-001");
  });

  it("calls createCase with preset data", async () => {
    await loadPresetCase();
    const caseCreate = createdRecords.find((r) => r.store === "cases");
    expect(caseCreate).toBeDefined();
    expect(caseCreate!.data.id).toBe("preset-demo-001");
    expect(caseCreate!.data.title).toBe("一种LED散热装置");
  });

  it("creates application document and reference documents", async () => {
    await loadPresetCase();
    const docCreates = createdRecords.filter((r) => r.store === "documents");
    expect(docCreates).toHaveLength(4);
  });

  it("creates claim nodes", async () => {
    await loadPresetCase();
    const nodeCreates = createdRecords.filter((r) => r.store === "claimNodes");
    expect(nodeCreates).toHaveLength(2);
  });

  it("creates claim features", async () => {
    await loadPresetCase();
    const featureCreates = createdRecords.filter((r) => r.store === "claimCharts");
    expect(featureCreates).toHaveLength(8);
  });

  it("creates novelty comparison", async () => {
    await loadPresetCase();
    const noveltyCreates = createdRecords.filter((r) => r.store === "novelty");
    expect(noveltyCreates).toHaveLength(1);
    expect(noveltyCreates[0]!.data.caseId).toBe("preset-demo-001");
    expect(noveltyCreates[0]!.data.differenceFeatureCodes).toEqual(["E", "F", "G", "H"]);
  });

  it("creates inventive analysis", async () => {
    await loadPresetCase();
    const inventiveCreates = createdRecords.filter((r) => r.store === "inventive");
    expect(inventiveCreates).toHaveLength(1);
    expect(inventiveCreates[0]!.data.candidateAssessment).toBe("possibly-inventive");
  });

  it("hydrates case store", async () => {
    await loadPresetCase();
    const state = useCaseStore.getState();
    expect(state.currentCase).not.toBeNull();
    expect(state.currentCase!.id).toBe("preset-demo-001");
    expect(state.cases).toHaveLength(1);
  });

  it("hydrates claims store", async () => {
    await loadPresetCase();
    const state = useClaimsStore.getState();
    expect(state.claimNodes).toHaveLength(2);
    expect(state.claimFeatures).toHaveLength(8);
    expect(state.claimFeatures[0]!.featureCode).toBe("A");
  });

  it("hydrates novelty store", async () => {
    await loadPresetCase();
    const state = useNoveltyStore.getState();
    expect(state.comparisons).toHaveLength(1);
    expect(state.comparisons[0]!.differenceFeatureCodes).toEqual(["E", "F", "G", "H"]);
  });

  it("hydrates inventive store", async () => {
    await loadPresetCase();
    const state = useInventiveStore.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0]!.distinguishingFeatureCodes).toEqual(["E", "F", "G", "H"]);
  });
});

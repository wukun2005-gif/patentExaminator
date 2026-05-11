import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all repos
vi.mock("@client/lib/repositories/caseRepo", () => ({
  createCase: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@client/lib/repositories/documentRepo", () => ({
  createDocument: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@client/lib/repositories/claimRepo", () => ({
  createClaimNode: vi.fn().mockResolvedValue(undefined),
  createClaimFeature: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@client/lib/repositories/noveltyRepo", () => ({
  createNovelty: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@client/lib/repositories/inventiveRepo", () => ({
  createInventive: vi.fn().mockResolvedValue(undefined)
}));

// Mock IndexedDB for store slices
vi.mock("@client/lib/indexedDb", () => ({
  getDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined)
  }),
  openPatentDB: vi.fn(),
  setDBInstance: vi.fn()
}));

import { loadPresetCase } from "@client/lib/presetLoader";
import { createCase } from "@client/lib/repositories/caseRepo";
import { createDocument } from "@client/lib/repositories/documentRepo";
import { createClaimNode, createClaimFeature } from "@client/lib/repositories/claimRepo";
import { createNovelty } from "@client/lib/repositories/noveltyRepo";
import { createInventive } from "@client/lib/repositories/inventiveRepo";
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
  });

  it("returns preset case ID", async () => {
    const caseId = await loadPresetCase();
    expect(caseId).toBe("preset-demo-001");
  });

  it("calls createCase with preset data", async () => {
    await loadPresetCase();
    expect(createCase).toHaveBeenCalledOnce();
    const arg = vi.mocked(createCase).mock.calls[0][0];
    expect(arg.id).toBe("preset-demo-001");
    expect(arg.title).toBe("一种LED散热装置");
  });

  it("creates application document and reference documents", async () => {
    await loadPresetCase();
    // 1 application doc + 1 reference doc = 2 calls
    expect(createDocument).toHaveBeenCalledTimes(2);
  });

  it("creates claim nodes", async () => {
    await loadPresetCase();
    expect(createClaimNode).toHaveBeenCalledTimes(2); // claim 1 + claim 2
  });

  it("creates claim features", async () => {
    await loadPresetCase();
    expect(createClaimFeature).toHaveBeenCalledTimes(3); // A, B, C
  });

  it("creates novelty comparison", async () => {
    await loadPresetCase();
    expect(createNovelty).toHaveBeenCalledOnce();
    const arg = vi.mocked(createNovelty).mock.calls[0][0];
    expect(arg.caseId).toBe("preset-demo-001");
    expect(arg.differenceFeatureCodes).toEqual(["B", "C"]);
  });

  it("creates inventive analysis", async () => {
    await loadPresetCase();
    expect(createInventive).toHaveBeenCalledOnce();
    const arg = vi.mocked(createInventive).mock.calls[0][0];
    expect(arg.candidateAssessment).toBe("possibly-inventive");
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
    expect(state.claimFeatures).toHaveLength(3);
    expect(state.claimFeatures[0].featureCode).toBe("A");
  });

  it("hydrates novelty store", async () => {
    await loadPresetCase();
    const state = useNoveltyStore.getState();
    expect(state.comparisons).toHaveLength(1);
    expect(state.comparisons[0].differenceFeatureCodes).toEqual(["B", "C"]);
  });

  it("hydrates inventive store", async () => {
    await loadPresetCase();
    const state = useInventiveStore.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0].distinguishingFeatureCodes).toEqual(["B", "C"]);
  });
});

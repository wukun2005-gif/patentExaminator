import { describe, it, expect } from "vitest";

describe("History and Browser Detection modules", () => {
  it("CaseHistoryPanel can be imported", async () => {
    const mod = await import("@client/features/history/CaseHistoryPanel");
    expect(mod.CaseHistoryPanel).toBeDefined();
    expect(typeof mod.CaseHistoryPanel).toBe("function");
  });

  it("BrowserNotice can be imported", async () => {
    const mod = await import("@client/components/BrowserNotice");
    expect(mod.BrowserNotice).toBeDefined();
    expect(typeof mod.BrowserNotice).toBe("function");
  });
});

describe("Case store", () => {
  it("has empty cases by default", async () => {
    const { useCaseStore } = await import("@client/store");
    const state = useCaseStore.getState();
    expect(state.cases).toEqual([]);
  });

  it("can set cases", async () => {
    const { useCaseStore } = await import("@client/store");
    const { setCases } = useCaseStore.getState();
    const testCase = {
      id: "test-case-1",
      applicationNumber: "CN202310001001",
      title: "测试案件",
      applicationDate: "2023-03-15",
      patentType: "invention" as const,
      textVersion: "original" as const,
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      workflowState: "empty" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setCases([testCase]);
    expect(useCaseStore.getState().cases.length).toBe(1);
    expect(useCaseStore.getState().cases[0]!.id).toBe("test-case-1");
    // Clean up
    setCases([]);
  });
});

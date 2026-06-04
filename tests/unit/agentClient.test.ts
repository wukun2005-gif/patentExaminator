import { describe, it, expect, vi, afterEach } from "vitest";
import { agentRun } from "@client/lib/repos";
import type { ClaimChartResponse } from "@shared/types/api";
import type { AppSettings } from "@shared/types/agents";

const MOCK_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  searchProviders: [],
  enableProviderFallback: true,
};

const REAL_SETTINGS: AppSettings = {
  mode: "real",
  guidelineVersion: "2023",
  providers: [{ providerId: "gemini", apiKeyRef: "test-key", modelIds: ["gemini-2.5-flash-lite"], defaultModelId: "gemini-2.5-flash-lite", enabled: true }],
  agents: [],
  searchProviders: [],
  enableProviderFallback: true,
};

describe("agentRun (mock mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mock claim chart features", async () => {
    const result = await agentRun<ClaimChartResponse>("claim-chart", {
      caseId: "g1-led",
      claimText: "一种LED散热装置，包括基板和设置在基板上的散热翅片",
      claimNumber: 1,
      specificationText: "本发明涉及LED散热技术领域"
    }, MOCK_SETTINGS, "g1-led");

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.features[0]!.featureCode).toBeTruthy();
    expect(result.legalCaution).toContain("不构成");
  });

  it("real mode attempts gateway call", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

    await expect(
      agentRun<ClaimChartResponse>("claim-chart", {
        caseId: "case-1",
        claimText: "test",
        claimNumber: 1,
        specificationText: "test"
      }, REAL_SETTINGS, "case-1")
    ).rejects.toThrow();
  }, 15000);

  it("real mode returns ClaimFeature with ids from server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          output: {
            claimNumber: 1,
            features: [
              {
                id: "case-1-chart-1-A",
                featureCode: "A",
                description: "基板",
                source: "ai",
                specificationCitations: [{ label: "[0001]", confidence: "high" }],
                citationStatus: "confirmed"
              }
            ],
            warnings: [{ type: "other", message: "功能语言" }],
            pendingSearchQuestions: ["待查 D1"],
            legalCaution: "候选事实"
          },
          tokenUsage: { input: 100, output: 50, total: 150 },
          attempts: [{ providerId: "gemini", modelId: "gemini-2.5-flash-lite", duration: 100 }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await agentRun<ClaimChartResponse>("claim-chart", {
      caseId: "case-1",
      claimText: "一种装置，包括基板",
      claimNumber: 1,
      specificationText: "[0001] 基板说明"
    }, REAL_SETTINGS, "case-1");

    expect(result.features[0]!.id).toBe("case-1-chart-1-A");
    expect(result.features[0]!.source).toBe("ai");
    expect(result.warnings).toEqual([{ type: "other", message: "功能语言" }]);
  });

  it("real mode throws when gateway returns error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { type: "structure", message: "结构校验失败: features.0.featureCode: Invalid" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      agentRun<ClaimChartResponse>("claim-chart", {
        caseId: "case-1",
        claimText: "test",
        claimNumber: 1,
        specificationText: "test"
      }, REAL_SETTINGS, "case-1")
    ).rejects.toThrow(/结构校验失败/);
  });
});

import { describe, it, expect } from "vitest";
import { agentRun } from "@client/lib/agentApi";
import type { ClaimChartResponse } from "@shared/types/api";
import type { AppSettings } from "@shared/types/agents";

const REAL_SETTINGS: AppSettings = {
  mode: "real",
  guidelineVersion: "2023",
  providers: [{ providerId: "gemini", apiKeyRef: "test-key", modelIds: ["gemini-2.5-flash-lite"], defaultModelId: "gemini-2.5-flash-lite", enabled: true }],
  agents: [],
  searchProviders: [],
  enableProviderFallback: true,
};

describe("agentRun real mode", () => {
  it("throws when gateway returns error", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "no-api-keys", message: "No API keys" } }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    await expect(
      agentRun<ClaimChartResponse>("claim-chart", {
        caseId: "test",
        claimText: "test claim",
        claimNumber: 1,
        specificationText: "test spec"
      }, REAL_SETTINGS, "test")
    ).rejects.toThrow("No API keys");

    global.fetch = originalFetch;
  });

  it("returns parsed JSON on success", async () => {
    const mockResponse = {
      ok: true,
      output: {
        claimNumber: 1,
        features: [
          {
            id: "test-chart-1-A",
            featureCode: "A",
            description: "散热基板",
            source: "ai",
            specificationCitations: [],
            citationStatus: "needs-review"
          }
        ],
        warnings: [],
        pendingSearchQuestions: [],
        legalCaution: "test"
      },
      tokenUsage: { input: 100, output: 50, total: 150 },
      attempts: [{ providerId: "gemini", modelId: "gemini-2.5-flash-lite", duration: 100 }]
    };

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await agentRun<ClaimChartResponse>("claim-chart", {
      caseId: "test",
      claimText: "test claim",
      claimNumber: 1,
      specificationText: "test spec"
    }, REAL_SETTINGS, "test");

    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.id).toBe("test-chart-1-A");
    expect(result.features[0]!.source).toBe("ai");
    global.fetch = originalFetch;
  });

  it("sends correct request format", async () => {
    let capturedBody: unknown;
    const originalFetch = global.fetch;
    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          ok: true,
          output: {
            claimNumber: 1,
            features: [
              {
                id: "g1-led-chart-1-A",
                featureCode: "A",
                description: "LED散热装置",
                source: "ai",
                specificationCitations: [],
                citationStatus: "needs-review"
              }
            ],
            warnings: [],
            pendingSearchQuestions: [],
            legalCaution: "test"
          },
          tokenUsage: { input: 100, output: 50, total: 150 },
          attempts: [{ providerId: "gemini", modelId: "gemini-2.5-flash-lite", duration: 100 }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await agentRun<ClaimChartResponse>("claim-chart", {
      caseId: "g1-led",
      claimText: "一种LED散热装置",
      claimNumber: 1,
      specificationText: "test"
    }, REAL_SETTINGS, "g1-led");

    expect(capturedBody).toMatchObject({
      agent: "claim-chart",
      caseId: "g1-led",
      providerPreference: expect.arrayContaining(["gemini"]),
    });
    global.fetch = originalFetch;
  });
});

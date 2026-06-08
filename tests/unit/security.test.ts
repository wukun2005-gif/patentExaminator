import { describe, it, expect } from "vitest";
import { agentRun, searchWithTerms } from "@client/lib/repos";
import { AiGatewayError } from "@shared/types/api";
import type { ClaimChartResponse, SearchReferencesResponse } from "@shared/types/api";
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
    global.fetch = async (_url) => {
      const url = String(_url);
      if (url.includes("/api/agent/run")) {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

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
      const url = String(_url);
      // Capture the agent request body
      if (url.includes("/api/agent/run")) {
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
      }
      // Settings PATCH (from trackProviderErrors)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  it("propagates attempts when server returns error", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { type: "ai-error", code: "quota-exceeded", message: "Gemini API error 429: quota exceeded" },
          attempts: [
            { providerId: "gemini", ok: false, errorCode: "quota-exceeded", message: "Gemini API error 429: quota exceeded" },
          ],
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );

    try {
      await agentRun<ClaimChartResponse>("claim-chart", {
        caseId: "test",
        claimText: "test claim",
        claimNumber: 1,
        specificationText: "test spec",
      }, REAL_SETTINGS, "test");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AiGatewayError);
      // The error message should contain the actual API error, not just a generic message
      expect((err as AiGatewayError).message).toContain("quota-exceeded");
      expect((err as AiGatewayError).attempts).toHaveLength(1);
      expect((err as AiGatewayError).attempts![0].errorCode).toBe("quota-exceeded");
    }
    global.fetch = originalFetch;
  });

  it("trackProviderErrors adds failed attempts to settings store", async () => {
    const originalFetch = global.fetch;
    // Mock fetch: first call returns search result with failed attempts,
    // second call (PATCH settings) succeeds
    let callCount = 0;
    global.fetch = async (url, _init) => {
      callCount++;
      const urlStr = String(url);
      if (urlStr.includes("/api/search-with-terms")) {
        return new Response(
          JSON.stringify({
            ok: true,
            candidates: [],
            searchQuery: "test",
            attempts: [
              { providerId: "gemini", ok: false, errorCode: "quota-exceeded", message: "429 Too Many Requests" },
              { providerId: "mimo", ok: true },
            ],
          } satisfies SearchReferencesResponse),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // PATCH settings
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await searchWithTerms(
      { caseId: "test", claimText: "test", features: [], searchQueries: ["test"] },
      REAL_SETTINGS
    );

    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts![0].errorCode).toBe("quota-exceeded");

    // trackProviderErrors should have been called → PATCH settings was attempted
    expect(callCount).toBeGreaterThanOrEqual(2); // search + settings PATCH

    global.fetch = originalFetch;
  });

  it("tracks provider errors on success path when fallback recovered", async () => {
    const originalFetch = global.fetch;
    let patchCalled = false;
    let patchBody: unknown;
    global.fetch = async (_url, init) => {
      const url = String(_url);
      if (url.includes("/api/agent/run")) {
        // Server returns ok:true — fallback succeeded, but attempts include the 429 failure
        return new Response(
          JSON.stringify({
            ok: true,
            output: { reply: "test reply" },
            tokenUsage: { input: 100, output: 50, total: 150 },
            attempts: [
              { providerId: "gemini", ok: false, errorCode: "quota-exceeded", message: "Gemini API error 429" },
              { providerId: "gemini", ok: true },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/data/settings")) {
        patchCalled = true;
        patchBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await agentRun<{ reply: string }>("chat", {
      caseId: "test-case",
      message: "test",
    } as unknown as object, REAL_SETTINGS, "test-case");

    // trackProviderErrors should have been called even though the request succeeded
    expect(patchCalled).toBe(true);
    // The PATCH body should contain providerErrorMessages with the 429 error
    const messages = (patchBody as { providerErrorMessages?: Array<{ errorCode?: string }> })?.providerErrorMessages;
    expect(messages).toBeDefined();
    expect(messages!.length).toBeGreaterThanOrEqual(1);
    expect(messages![0].errorCode).toBe("quota-exceeded");

    global.fetch = originalFetch;
  });
});

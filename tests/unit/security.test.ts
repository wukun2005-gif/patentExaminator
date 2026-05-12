import { describe, it, expect } from "vitest";
import { AgentClient } from "@client/agent/AgentClient";

describe("AgentClient real mode", () => {
  it("throws when gateway returns error", async () => {
    // Mock fetch to return error
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "no-api-keys", message: "No API keys" } }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    const client = new AgentClient("real", "http://localhost:3000/api");
    await expect(
      client.runClaimChart({
        caseId: "test",
        claimText: "test claim",
        claimNumber: 1,
        specificationText: "test spec"
      })
    ).rejects.toThrow("No API keys");

    global.fetch = originalFetch;
  });

  it("returns parsed JSON on success", async () => {
    const mockResponse = {
      ok: true,
      provider: "gemini",
      modelId: "gemini-2.5-flash-lite",
      outputJson: {
        features: [],
        warnings: [],
        pendingSearchQuestions: [],
        legalCaution: "test"
      },
      durationMs: 100
    };

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const client = new AgentClient("real", "http://localhost:3000/api");
    const result = await client.runClaimChart({
      caseId: "test",
      claimText: "test claim",
      claimNumber: 1,
      specificationText: "test spec"
    });

    expect(result).toEqual(mockResponse.outputJson);
    global.fetch = originalFetch;
  });

  it("sends correct request format", async () => {
    let capturedBody: unknown;
    const originalFetch = global.fetch;
    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ ok: true, outputJson: { features: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const client = new AgentClient("real", "http://localhost:3000/api");
    await client.runClaimChart({
      caseId: "g1-led",
      claimText: "一种LED散热装置",
      claimNumber: 1,
      specificationText: "test"
    });

    expect(capturedBody).toMatchObject({
      agent: "claim-chart",
      providerPreference: expect.arrayContaining(["gemini"]),
      modelId: "gemini-3.1-flash-lite-preview",
      sanitized: false,
      metadata: {
        caseId: "g1-led",
        moduleScope: "claim-chart"
      }
    });

    global.fetch = originalFetch;
  });
});

describe("Security: localStorage", () => {
  it("T-SEC-09: localStorage does not contain API keys", () => {
    // Check all localStorage keys
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      const value = localStorage.getItem(key) ?? "";
      // Should not contain API key patterns
      expect(value).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(value).not.toMatch(/tp-[A-Za-z0-9]{20,}/);
      expect(value).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
    }
  });
});

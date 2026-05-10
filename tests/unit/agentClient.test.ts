import { describe, it, expect } from "vitest";
import { AgentClient } from "@client/agent/AgentClient";
import { estimateTokens } from "@client/agent/tokenEstimate";

describe("AgentClient (mock mode)", () => {
  it("returns mock claim chart features", async () => {
    const client = new AgentClient("mock");
    const result = await client.runClaimChart({
      caseId: "case-1",
      claimText: "一种LED散热装置，包括基板和设置在基板上的散热翅片",
      claimNumber: 1,
      specificationText: "本发明涉及LED散热技术领域"
    });

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.features[0]!.source).toBe("mock");
    expect(result.legalCaution).toContain("不构成");
  });

  it("real mode throws error", async () => {
    const client = new AgentClient("real");
    await expect(
      client.runClaimChart({
        caseId: "case-1",
        claimText: "test",
        claimNumber: 1,
        specificationText: "test"
      })
    ).rejects.toThrow("real-mode-not-ready");
  });
});

describe("estimateTokens", () => {
  it("estimates Chinese text tokens", () => {
    const tokens = estimateTokens("这是一段中文文本");
    expect(tokens).toBeGreaterThan(0);
  });

  it("estimates English text tokens", () => {
    const tokens = estimateTokens("This is some English text");
    expect(tokens).toBeGreaterThan(0);
  });

  it("estimates mixed text tokens", () => {
    const tokens = estimateTokens("这是mixed中英text混合");
    expect(tokens).toBeGreaterThan(0);
  });

  it("empty string returns 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

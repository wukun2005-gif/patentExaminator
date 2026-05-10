import { describe, it, expect } from "vitest";
import { MockProvider } from "@client/features/mock/MockProvider";
import { loadFixture } from "@client/features/mock/mockRouter";
import { claimChartSchema } from "@shared/schemas/claimChart.schema";

describe("MockProvider", () => {
  it("returns fixture data for claim chart", async () => {
    const provider = new MockProvider({ mode: "none" });
    const result = await provider.runClaimChart({
      caseId: "g1-led",
      claimText: "一种LED散热装置，包括基板和散热翅片",
      claimNumber: 1,
      specificationText: "本实用新型涉及LED散热技术"
    });

    expect(result.features.length).toBeGreaterThan(0);
    expect(result.legalCaution).toContain("不构成");
  });

  it("falls back to g1-led for unknown caseId", async () => {
    const provider = new MockProvider({ mode: "none" });
    const result = await provider.runClaimChart({
      caseId: "unknown-case",
      claimText: "test",
      claimNumber: 1,
      specificationText: "test"
    });

    expect(result.features.length).toBeGreaterThan(0);
  });
});

describe("G1 fixture", () => {
  it("passes claimChartSchema validation", () => {
    const fixture = loadFixture("claim-chart", "g1-led");
    const result = claimChartSchema.safeParse(fixture);
    if (!result.success) console.error("G1 validation errors:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("has features A, B, C", () => {
    const fixture = loadFixture("claim-chart", "g1-led");
    const codes = fixture.features.map((f) => f.featureCode).sort();
    expect(codes).toEqual(["A", "B", "C"]);
  });

  it("all citations have high or medium confidence", () => {
    const fixture = loadFixture("claim-chart", "g1-led");
    for (const feature of fixture.features) {
      for (const citation of feature.specificationCitations) {
        expect(["high", "medium"]).toContain(citation.confidence);
      }
    }
  });
});

describe("G2 fixture", () => {
  it("passes claimChartSchema validation", () => {
    const fixture = loadFixture("claim-chart", "g2-battery");
    const result = claimChartSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

describe("G3 fixture", () => {
  it("passes claimChartSchema validation", () => {
    const fixture = loadFixture("claim-chart", "g3-sensor");
    const result = claimChartSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

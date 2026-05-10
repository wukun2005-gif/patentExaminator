import { describe, it, expect } from "vitest";
import g2Battery from "@shared/fixtures/g2-battery.json";
import type { ClaimChartResponse } from "@client/agent/contracts";
import { evaluateClaimChart } from "../runner";

describe("Evaluation G2 — 电池装置", () => {
  const fixture = g2Battery as unknown as ClaimChartResponse;

  it("G2: claim chart has expected features", () => {
    const codes = fixture.features.map((f) => f.featureCode);
    expect(codes.length).toBeGreaterThan(0);
    const result = evaluateClaimChart("g2", fixture, codes);
    expect(result.overallPassed).toBe(true);
  });

  it("G2: features have descriptions", () => {
    for (const feature of fixture.features) {
      expect(feature.description.length).toBeGreaterThan(0);
    }
  });
});

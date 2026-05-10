import { describe, it, expect } from "vitest";
import g1Led from "@shared/fixtures/g1-led.json";
import type { ClaimChartResponse } from "@client/agent/contracts";
import { evaluateClaimChart } from "../runner";

describe("Evaluation G1 — LED散热装置", () => {
  const fixture = g1Led as unknown as ClaimChartResponse;

  it("G1: claim chart has expected features A/B/C", () => {
    const result = evaluateClaimChart("g1", fixture, ["A", "B", "C"]);
    expect(result.overallPassed).toBe(true);
    expect(result.scores.coverage!.score).toBeGreaterThanOrEqual(0.8);
  });

  it("G1: all features have confirmed citation status", () => {
    for (const feature of fixture.features) {
      expect(feature.citationStatus).toBe("confirmed");
    }
  });

  it("G1: features have specification citations", () => {
    for (const feature of fixture.features) {
      expect(feature.specificationCitations.length).toBeGreaterThan(0);
    }
  });
});

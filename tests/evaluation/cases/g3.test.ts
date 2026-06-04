import { describe, it, expect } from "vitest";
import g3Sensor from "@shared/fixtures/g3-sensor.json";
import type { ClaimChartResponse } from "@shared/types/api";
import { evaluateClaimChart } from "../runner";

describe("Evaluation G3 — 传感器装置", () => {
  const fixture = g3Sensor as unknown as ClaimChartResponse;

  it("G3: claim chart has expected features", () => {
    const codes = fixture.features.map((f) => f.featureCode);
    expect(codes.length).toBeGreaterThan(0);
    const result = evaluateClaimChart("g3", fixture, codes);
    expect(result.overallPassed).toBe(true);
  });
});

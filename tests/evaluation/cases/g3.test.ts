import { describe, it, expect } from "vitest";
import g3Sensor from "@shared/fixtures/g3-sensor.json";
import type { ClaimChartResponse } from "@client/agent/contracts";
import { evaluateClaimChart } from "../runner";

describe("Evaluation G3 — 传感器装置", () => {
  const fixture = g3Sensor as unknown as ClaimChartResponse;

  it("G3: claim chart has expected features", () => {
    const codes = fixture.features.map((f) => f.featureCode);
    expect(codes.length).toBeGreaterThan(0);
    const result = evaluateClaimChart("g3", fixture, codes);
    expect(result.overallPassed).toBe(true);
  });

  it("G3: has defect hints", () => {
    // G3 fixture should have defectHints in the raw JSON
    const raw = g3Sensor as Record<string, unknown>;
    expect(raw.defectHints).toBeDefined();
    expect(Array.isArray(raw.defectHints)).toBe(true);
  });
});

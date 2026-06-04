import { describe, it, expect } from "vitest";
import g3Fixture from "@shared/fixtures/g3-sensor.json";
import { claimChartSchema } from "@shared/schemas/claimChart.schema";

describe("G3 fixture schema validation", () => {
  it("passes claimChartSchema validation", () => {
    const fixture = g3Fixture;
    const result = claimChartSchema.safeParse(fixture);
    if (!result.success) {
      console.error("G3 validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});

describe("Shell module structure", () => {
  it("SummaryPanel can be imported", async () => {
    const mod = await import("@client/features/summary/SummaryPanel");
    expect(mod.SummaryPanel).toBeDefined();
    expect(typeof mod.SummaryPanel).toBe("function");
  });

  it("DraftMaterialPanel can be imported", async () => {
    const mod = await import("@client/features/draft/DraftMaterialPanel");
    expect(mod.DraftMaterialPanel).toBeDefined();
    expect(typeof mod.DraftMaterialPanel).toBe("function");
  });

  it("DefectPanel can be imported", async () => {
    const mod = await import("@client/features/defects/DefectPanel");
    expect(mod.DefectPanel).toBeDefined();
    expect(typeof mod.DefectPanel).toBe("function");
  });
});

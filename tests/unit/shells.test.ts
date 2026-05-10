import { describe, it, expect } from "vitest";
import { loadFixture } from "@client/features/mock/mockRouter";
import { claimChartSchema } from "@shared/schemas/claimChart.schema";

describe("G3 fixture with defectHints", () => {
  it("passes claimChartSchema validation", () => {
    const fixture = loadFixture("claim-chart", "g3-sensor");
    const result = claimChartSchema.safeParse(fixture);
    if (!result.success) {
      console.error("G3 validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("has defectHints field", () => {
    const fixture = loadFixture("claim-chart", "g3-sensor") as unknown as {
      defectHints?: string[];
    };
    expect(fixture.defectHints).toBeDefined();
    expect(fixture.defectHints!.length).toBeGreaterThan(0);
  });

  it("defectHints contains parameter range risk", () => {
    const fixture = loadFixture("claim-chart", "g3-sensor") as unknown as {
      defectHints: string[];
    };
    expect(fixture.defectHints).toContain("参数范围支持不足风险");
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

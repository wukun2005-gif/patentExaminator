import { describe, it, expect } from "vitest";
import { MockProvider } from "@client/features/mock/MockProvider";
import { loadFixture } from "@client/features/mock/mockRouter";
import { noveltySchema } from "@shared/schemas/novelty.schema";

describe("Novelty fixture (G1+D1)", () => {
  it("passes noveltySchema validation", () => {
    const fixture = loadFixture("novelty", "g1-led:g1-ref-d1");
    const result = noveltySchema.safeParse(fixture);
    if (!result.success) {
      console.error("Novelty validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("T-NOV-001: G1+D1 — A=clearly-disclosed, B/C=not-found", () => {
    const fixture = loadFixture("novelty", "g1-led:g1-ref-d1") as unknown as {
      rows: Array<{ featureCode: string; disclosureStatus: string }>;
    };

    const rowA = fixture.rows.find((r) => r.featureCode === "A");
    const rowB = fixture.rows.find((r) => r.featureCode === "B");
    const rowC = fixture.rows.find((r) => r.featureCode === "C");

    expect(rowA?.disclosureStatus).toBe("clearly-disclosed");
    expect(rowB?.disclosureStatus).toBe("not-found");
    expect(rowC?.disclosureStatus).toBe("not-found");
  });

  it("T-NOV-005: differenceFeatureCodes = [B, C] (strict)", () => {
    const fixture = loadFixture("novelty", "g1-led:g1-ref-d1") as unknown as {
      differenceFeatureCodes: string[];
    };

    expect(fixture.differenceFeatureCodes).toEqual(["B", "C"]);
  });

  it("all citations have high or medium confidence", () => {
    const fixture = loadFixture("novelty", "g1-led:g1-ref-d1") as unknown as {
      rows: Array<{ citations: Array<{ confidence: string }> }>;
    };

    for (const row of fixture.rows) {
      for (const citation of row.citations) {
        expect(["high", "medium"]).toContain(citation.confidence);
      }
    }
  });
});

describe("MockProvider.runNovelty", () => {
  it("returns novelty fixture for G1+D1", async () => {
    const provider = new MockProvider({ mode: "none" });
    const result = await provider.runNovelty({
      caseId: "g1-led",
      claimNumber: 1,
      features: [
        { featureCode: "A", description: "一种LED散热装置，包括基板" },
        { featureCode: "B", description: "设置在基板上的散热翅片" },
        { featureCode: "C", description: "散热翅片与基板一体成型" }
      ],
      referenceId: "g1-ref-d1",
      referenceText: "本实用新型提供一种LED散热装置，包括基板"
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.differenceFeatureCodes).toContain("B");
    expect(result.differenceFeatureCodes).toContain("C");
    expect(result.legalCaution).toContain("不构成");
  });

  it("T-NOV-004: fixture with missing paragraph still has rows", () => {
    const fixture = loadFixture("novelty", "g1-led:g1-ref-d1") as unknown as {
      rows: Array<{ featureCode: string; citations: Array<{ confidence: string }> }>;
    };

    // All rows exist
    expect(fixture.rows.length).toBe(3);

    // Rows with empty citations (B, C) are still present
    const rowB = fixture.rows.find((r) => r.featureCode === "B");
    expect(rowB).toBeDefined();
    expect(rowB!.citations).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import inventiveFixture from "@shared/fixtures/inventive-g2.json";
import { inventiveSchema } from "@shared/schemas/inventive.schema";
import { loadFixture } from "@shared/fixtures/loadFixture";

describe("Inventive fixture (G2)", () => {
  it("passes inventiveSchema validation", () => {
    const fixture = inventiveFixture;
    const result = inventiveSchema.safeParse(fixture);
    if (!result.success) {
      console.error("Inventive validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("Step 1: closestPriorArtId is set", () => {
    const fixture = loadFixture("inventive", "g2-battery") as unknown as {
      closestPriorArtId?: string;
    };
    expect(fixture.closestPriorArtId).toBeDefined();
    expect(fixture.closestPriorArtId).toBe("g2-ref-d1");
  });

  it("Step 2: distinguishingFeatureCodes contains B", () => {
    const fixture = loadFixture("inventive", "g2-battery") as unknown as {
      distinguishingFeatureCodes: string[];
      sharedFeatureCodes: string[];
    };
    expect(fixture.sharedFeatureCodes).toContain("A");
    expect(fixture.distinguishingFeatureCodes).toContain("B");
    expect(fixture.distinguishingFeatureCodes).not.toContain("A");
  });

  it("Step 3: motivationEvidence from D2 exists", () => {
    const fixture = loadFixture("inventive", "g2-battery") as unknown as {
      motivationEvidence: Array<{ referenceId: string; label: string; confidence: string }>;
    };
    expect(fixture.motivationEvidence.length).toBeGreaterThan(0);
    const first = fixture.motivationEvidence[0]!;
    expect(first.label).toBe("D2");
    expect(["high", "medium"]).toContain(first.confidence);
  });

  it("candidateAssessment is possibly-lacks-inventiveness", () => {
    const fixture = loadFixture("inventive", "g2-battery") as unknown as {
      candidateAssessment: string;
    };
    expect(fixture.candidateAssessment).toBe("possibly-lacks-inventiveness");
  });

  it("legalCaution contains disclaimer", () => {
    const fixture = loadFixture("inventive", "g2-battery") as unknown as {
      legalCaution: string;
    };
    expect(fixture.legalCaution).toContain("不构成");
  });
});

describe("Inventive fixture for G2", () => {
  it("returns inventive fixture for G2", async () => {
    const result = inventiveFixture as unknown as {
      claimNumber: number;
      sharedFeatureCodes: string[];
      distinguishingFeatureCodes: string[];
      closestPriorArtId: string;
      candidateAssessment: string;
    };

    expect(result.distinguishingFeatureCodes).toContain("B");
    expect(result.candidateAssessment).toBe("possibly-lacks-inventiveness");
    expect(result.legalCaution).toContain("不构成");
  });
});

import { describe, it, expect } from "vitest";
import { MockProvider } from "@client/features/mock/MockProvider";
import { loadFixture } from "@client/features/mock/mockRouter";
import { inventiveSchema } from "@shared/schemas/inventive.schema";

describe("Inventive fixture (G2)", () => {
  it("passes inventiveSchema validation", () => {
    const fixture = loadFixture("inventive", "g2-battery");
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

describe("MockProvider.runInventive", () => {
  it("returns inventive fixture for G2", async () => {
    const provider = new MockProvider({ mode: "none" });
    const result = await provider.runInventive({
      caseId: "g2-battery",
      claimNumber: 1,
      features: [
        { featureCode: "A", description: "一种电池管理系统，包括电池组" },
        { featureCode: "B", description: "电池状态监测模块" }
      ],
      availableReferences: [
        {
          referenceId: "g2-ref-d1",
          label: "D1",
          excerpt: "一种电池管理系统"
        }
      ]
    });

    expect(result.distinguishingFeatureCodes).toContain("B");
    expect(result.candidateAssessment).toBe("possibly-lacks-inventiveness");
    expect(result.legalCaution).toContain("不构成");
  });
});

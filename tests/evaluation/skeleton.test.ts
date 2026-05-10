import { describe, it, expect } from "vitest";
import { z } from "zod";

// Agent response fixtures (G1/G2/G3)
import g1Led from "@shared/fixtures/g1-led.json";
import g2Battery from "@shared/fixtures/g2-battery.json";
import g3Sensor from "@shared/fixtures/g3-sensor.json";

// Evaluation case fixtures (A1-A3, E1-E3)
import a1FuncLimit from "@shared/fixtures/a1-functional-limitation.json";
import a2BoundaryDate from "@shared/fixtures/a2-boundary-date.json";
import a3PriorityDate from "@shared/fixtures/a3-priority-date.json";
import e1NoRef from "@shared/fixtures/e1-no-reference.json";
import e2OcrBranch from "@shared/fixtures/e2-ocr-branch.json";
import e3MultiIndep from "@shared/fixtures/e3-multi-independent.json";

// Schema for G1/G2/G3 agent response fixtures
const claimFeatureSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  claimNumber: z.number(),
  featureCode: z.string(),
  description: z.string(),
  specificationCitations: z.array(z.object({
    documentId: z.string(),
    label: z.string(),
    paragraph: z.string().optional(),
    quote: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"])
  })),
  citationStatus: z.enum(["confirmed", "needs-review", "not-found"]),
  source: z.enum(["ai", "user", "mock"])
});

const claimChartResponseSchema = z.object({
  claimNumber: z.number(),
  features: z.array(claimFeatureSchema)
});

// Schema for A1-A3/E1-E3 evaluation case fixtures
const patentCaseSchema = z.object({
  id: z.string(),
  applicationNumber: z.string(),
  title: z.string(),
  applicationDate: z.string(),
  priorityDate: z.string().optional(),
  patentType: z.enum(["invention"]),
  textVersion: z.string(),
  targetClaimNumber: z.number(),
  guidelineVersion: z.string(),
  workflowState: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const referenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  publicationNumber: z.string(),
  publicationDate: z.string(),
  text: z.string()
});

const evaluationFixtureSchema = z.object({
  case: patentCaseSchema,
  applicationText: z.string().min(10),
  references: z.array(referenceSchema)
});

describe("Evaluation fixtures — schema validation", () => {
  describe("G1/G2/G3 agent response fixtures", () => {
    it("G1 LED fixture passes safeParse", () => {
      const result = claimChartResponseSchema.safeParse(g1Led);
      expect(result.success).toBe(true);
    });

    it("G2 battery fixture passes safeParse", () => {
      const result = claimChartResponseSchema.safeParse(g2Battery);
      expect(result.success).toBe(true);
    });

    it("G3 sensor fixture passes safeParse", () => {
      const result = claimChartResponseSchema.safeParse(g3Sensor);
      expect(result.success).toBe(true);
    });
  });

  describe("A1-A3 acceptance fixtures", () => {
    it("A1 functional limitation fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(a1FuncLimit);
      expect(result.success).toBe(true);
    });

    it("A2 boundary date fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(a2BoundaryDate);
      expect(result.success).toBe(true);
    });

    it("A3 priority date fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(a3PriorityDate);
      expect(result.success).toBe(true);
    });
  });

  describe("E1-E3 evaluation fixtures", () => {
    it("E1 no-reference fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(e1NoRef);
      expect(result.success).toBe(true);
    });

    it("E2 OCR branch fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(e2OcrBranch);
      expect(result.success).toBe(true);
    });

    it("E3 multi-independent fixture passes safeParse", () => {
      const result = evaluationFixtureSchema.safeParse(e3MultiIndep);
      expect(result.success).toBe(true);
    });
  });
});

describe("Evaluation fixtures — content assertions", () => {
  it("A1 contains functional language in claims", () => {
    const text = (a1FuncLimit as { applicationText: string }).applicationText;
    expect(text).toContain("通过预设加密算法");
    expect(text).toContain("权利要求");
  });

  it("A2 has priorityDate", () => {
    const c = (a2BoundaryDate as { case: { priorityDate?: string } }).case;
    expect(c.priorityDate).toBe("2022-07-15");
  });

  it("A3 has priorityDate and references", () => {
    const fixture = a3PriorityDate as { case: { priorityDate?: string }; references: unknown[] };
    expect(fixture.case.priorityDate).toBe("2022-09-20");
    expect(fixture.references.length).toBeGreaterThan(0);
  });

  it("E1 has zero references", () => {
    const fixture = e1NoRef as { references: unknown[] };
    expect(fixture.references).toHaveLength(0);
  });

  it("E2 has OCR config", () => {
    const fixture = e2OcrBranch as { ocrConfig?: { simulateOcrFailure: boolean } };
    expect(fixture.ocrConfig?.simulateOcrFailure).toBe(true);
  });

  it("E3 has multiple independent claims (1, 4, 8)", () => {
    const text = (e3MultiIndep as { applicationText: string }).applicationText;
    // Claim 1: 通信系统
    expect(text).toContain("1. 一种通信系统");
    // Claim 4: 控制方法 (independent)
    expect(text).toContain("4. 一种通信系统的控制方法");
    // Claim 8: another 通信系统 (independent)
    expect(text).toContain("8. 一种通信系统");
  });
});

describe("All 9 fixtures present", () => {
  it("9 fixtures are importable", () => {
    const all = [g1Led, g2Battery, g3Sensor, a1FuncLimit, a2BoundaryDate, a3PriorityDate, e1NoRef, e2OcrBranch, e3MultiIndep];
    expect(all).toHaveLength(9);
    for (const f of all) {
      expect(f).toBeDefined();
      expect(typeof f).toBe("object");
    }
  });
});

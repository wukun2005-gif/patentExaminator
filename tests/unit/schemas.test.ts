import { describe, it, expect } from "vitest";
import {
  claimChartSchema,
  noveltySchema,
  inventiveSchema,
  summarySchema,
  draftSchema,
  exportSchema
} from "@shared/index";

describe("claimChartSchema", () => {
  it("should parse valid claim chart", () => {
    const result = claimChartSchema.safeParse({
      claimNumber: 1,
      features: [
        {
          featureCode: "A",
          description: "一种装置",
          specificationCitations: [
            { label: "说明书第001段", confidence: "high" }
          ],
          citationStatus: "confirmed"
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty features array", () => {
    const result = claimChartSchema.safeParse({
      claimNumber: 1,
      features: []
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid featureCode format", () => {
    const result = claimChartSchema.safeParse({
      claimNumber: 1,
      features: [
        {
          featureCode: "abc",
          description: "test",
          specificationCitations: [],
          citationStatus: "not-found"
        }
      ]
    });
    expect(result.success).toBe(false);
  });
});

describe("noveltySchema", () => {
  it("should parse valid novelty comparison", () => {
    const result = noveltySchema.safeParse({
      referenceId: "ref-1",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "clearly-disclosed",
          citations: [{ label: "D1 §0001", confidence: "high" }]
        }
      ],
      differenceFeatureCodes: ["B"],
      pendingSearchQuestions: []
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid disclosureStatus", () => {
    const result = noveltySchema.safeParse({
      referenceId: "ref-1",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "invalid-status",
          citations: []
        }
      ],
      differenceFeatureCodes: [],
      pendingSearchQuestions: []
    });
    expect(result.success).toBe(false);
  });
});

describe("inventiveSchema", () => {
  it("should parse valid inventive step analysis", () => {
    const result = inventiveSchema.safeParse({
      claimNumber: 1,
      sharedFeatureCodes: ["A", "B"],
      distinguishingFeatureCodes: ["C"]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.candidateAssessment).toBe("not-analyzed");
      expect(result.data.cautions).toEqual([]);
    }
  });

  it("should reject invalid candidateAssessment", () => {
    const result = inventiveSchema.safeParse({
      claimNumber: 1,
      sharedFeatureCodes: [],
      distinguishingFeatureCodes: [],
      candidateAssessment: "invalid"
    });
    expect(result.success).toBe(false);
  });
});

describe("summarySchema", () => {
  it("should parse valid summary", () => {
    const result = summarySchema.safeParse({
      title: "测试发明",
      problem: "解决的问题",
      solution: "技术方案",
      keyFeatures: [{ featureCode: "A", description: "特征A" }]
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const result = summarySchema.safeParse({
      title: "测试发明"
    });
    expect(result.success).toBe(false);
  });
});

describe("draftSchema", () => {
  it("should parse valid draft", () => {
    const result = draftSchema.safeParse({
      sections: {
        body: "正文草稿",
        aiNotes: "AI备注",
        analysisStrategy: "分析策略",
        pendingConfirmation: "待确认事项"
      }
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty sections with defaults", () => {
    const result = draftSchema.safeParse({
      sections: {}
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections.body).toBe("");
    }
  });
});

describe("exportSchema", () => {
  it("should parse valid export config", () => {
    const result = exportSchema.safeParse({
      format: "html",
      caseId: "case-1",
      title: "测试案件",
      content: "<html></html>"
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid format", () => {
    const result = exportSchema.safeParse({
      format: "pdf",
      caseId: "case-1",
      title: "测试案件",
      content: ""
    });
    expect(result.success).toBe(false);
  });
});

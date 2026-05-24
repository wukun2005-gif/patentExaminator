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

  it("should convert paragraph number to string", () => {
    const result = claimChartSchema.safeParse({
      claimNumber: 1,
      features: [
        {
          featureCode: "A",
          description: "一种装置",
          specificationCitations: [
            { label: "说明书第001段", paragraph: 5, confidence: "high" },
            { label: "说明书第002段", paragraph: "0010", confidence: "medium" }
          ],
          citationStatus: "confirmed"
        }
      ]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const feature = result.data.features[0];
      expect(feature).toBeDefined();
      if (feature) {
        const citation0 = feature.specificationCitations[0];
        const citation1 = feature.specificationCitations[1];
        expect(citation0?.paragraph).toBe("5");
        expect(citation1?.paragraph).toBe("0010");
      }
    }
  });

  it("should handle null and undefined paragraph values", () => {
    const result = claimChartSchema.safeParse({
      claimNumber: 1,
      features: [
        {
          featureCode: "A",
          description: "一种装置",
          specificationCitations: [
            { label: "说明书第001段", paragraph: null, confidence: "high" },
            { label: "说明书第002段", paragraph: undefined, confidence: "medium" },
            { label: "说明书第003段", confidence: "low" }
          ],
          citationStatus: "confirmed"
        }
      ]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const feature = result.data.features[0];
      expect(feature).toBeDefined();
      if (feature) {
        const citation0 = feature.specificationCitations[0];
        const citation1 = feature.specificationCitations[1];
        const citation2 = feature.specificationCitations[2];
        expect(citation0?.paragraph).toBeUndefined();
        expect(citation1?.paragraph).toBeUndefined();
        expect(citation2?.paragraph).toBeUndefined();
      }
    }
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
      body: "简述正文内容",
      aiNotes: "AI 备注内容",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const result = summarySchema.safeParse({
      aiNotes: "AI 备注内容"
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

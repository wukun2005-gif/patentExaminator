import { describe, it, expect } from "vitest";
import {
  claimChartSchema,
  noveltySchema,
  inventiveSchema,
  summarySchema,
  reexamDraftSchema,
  defectSchema,
  opinionAnalysisSchema,
  argumentMappingSchema,
  classifyDocumentsOutputSchema,
  extractCaseFieldsSchema,
  searchReferencesFilterSchema,
} from "@shared/index";
import { agentRunInputSchema } from "@shared/schemas/api-input.schema.js";

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
      closestPriorArtId: "ref-1",
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
      closestPriorArtId: "ref-1",
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

describe("reexamDraftSchema", () => {
  it("should parse valid reexam draft", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "D1公开了具体的技术特征内容", confidence: "high" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
  });

  it("should auto-downgrade high confidence to low when quote is too short", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "短", confidence: "high" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("low");
    }
  });

  it("should auto-downgrade medium confidence to low when quote is too short", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-partially-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "短", confidence: "medium" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("low");
    }
  });

  it("should auto-downgrade high confidence to low when quote is missing", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", confidence: "high" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("low");
    }
  });

  it("should keep low confidence unchanged regardless of quote length", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "短", confidence: "low" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("low");
    }
  });

  it("should keep high confidence when quote is exactly 20 characters", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "12345678901234567890", confidence: "high" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("high");
    }
  });

  it("should downgrade high confidence when quote is 19 characters", () => {
    const result = reexamDraftSchema.safeParse({
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "R1",
          category: "novelty",
          applicantArgumentSummary: "申请人答辩摘要",
          examinerResponse: "审查员回应",
          conclusion: "argument-accepted",
          supportingEvidence: [
            { label: "D1 §5", quote: "1234567890123456789", confidence: "high" }
          ]
        }
      ],
      overallAssessment: "综合评估",
      legalCaution: "法律风险提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.responseItems[0];
      const evidence = item?.supportingEvidence?.[0];
      expect(evidence?.confidence).toBe("low");
    }
  });
});

// ── defectSchema ────────────────────────────────────────────

describe("defectSchema", () => {
  it("should parse valid defect output", () => {
    const result = defectSchema.safeParse({
      defects: [
        { category: "clarity", description: "权利要求1不清楚", severity: "warning" }
      ],
      warnings: ["注意事项"],
      legalCaution: "以上为候选事实整理，不构成法律结论。"
    });
    expect(result.success).toBe(true);
  });

  it("should default warnings to empty array", () => {
    const result = defectSchema.safeParse({
      defects: [],
      legalCaution: "法律提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warnings).toEqual([]);
    }
  });

  it("should reject invalid severity", () => {
    const result = defectSchema.safeParse({
      defects: [{ category: "clarity", description: "test", severity: "critical" }],
      warnings: [],
      legalCaution: "test"
    });
    expect(result.success).toBe(false);
  });
});

// ── opinionAnalysisSchema ────────────────────────────────────

describe("opinionAnalysisSchema", () => {
  it("should parse valid opinion analysis", () => {
    const result = opinionAnalysisSchema.safeParse({
      documentId: "doc-1",
      rejectionGrounds: [
        {
          code: "RG-1",
          category: "novelty",
          claimNumbers: [1, 2],
          summary: "缺乏新颖性",
          legalBasis: "专利法第22条第2款"
        }
      ],
      citedReferences: [
        {
          publicationNumber: "CN123456A",
          rejectionGroundCodes: ["RG-1"],
          featureMapping: "D1公开了特征A"
        }
      ],
      legalCaution: "以上为候选事实整理，不构成法律结论。"
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid category", () => {
    const result = opinionAnalysisSchema.safeParse({
      documentId: "doc-1",
      rejectionGrounds: [
        { code: "RG-1", category: "invalid", claimNumbers: [], summary: "test", legalBasis: "test" }
      ],
      citedReferences: [],
      legalCaution: "test"
    });
    expect(result.success).toBe(false);
  });
});

// ── argumentMappingSchema ────────────────────────────────────

describe("argumentMappingSchema", () => {
  it("should parse valid argument mapping", () => {
    const result = argumentMappingSchema.safeParse({
      mappings: [
        {
          rejectionGroundCode: "RG-1",
          applicantArgument: "申请人认为...",
          argumentSummary: "摘要",
          confidence: "high"
        }
      ],
      legalCaution: "法律提示"
    });
    expect(result.success).toBe(true);
  });

  it("should parse string amendedClaims via transform", () => {
    const result = argumentMappingSchema.safeParse({
      mappings: [
        {
          rejectionGroundCode: "RG-1",
          applicantArgument: "申请人认为...",
          argumentSummary: "摘要",
          confidence: "medium",
          amendedClaims: ["修改了权利要求1"]
        }
      ],
      legalCaution: "法律提示"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const claim = result.data.mappings[0]?.amendedClaims?.[0];
      expect(claim).toHaveProperty("changeDescription", "修改了权利要求1");
    }
  });
});

// ── classifyDocumentsOutputSchema ────────────────────────────

describe("classifyDocumentsOutputSchema", () => {
  it("should parse valid classification", () => {
    const result = classifyDocumentsOutputSchema.safeParse({
      classifications: [
        { fileIndex: 0, fileName: "申请书.pdf", role: "application", confidence: "high", reason: "包含权利要求书" }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty classifications", () => {
    const result = classifyDocumentsOutputSchema.safeParse({
      classifications: []
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid role", () => {
    const result = classifyDocumentsOutputSchema.safeParse({
      classifications: [
        { fileIndex: 0, fileName: "test.pdf", role: "invalid-role", confidence: "high", reason: "test" }
      ]
    });
    expect(result.success).toBe(false);
  });
});

// ── extractCaseFieldsSchema ──────────────────────────────────

describe("extractCaseFieldsSchema", () => {
  it("should parse valid case fields", () => {
    const result = extractCaseFieldsSchema.safeParse({
      title: "一种装置",
      applicationNumber: "202410001234.5",
      applicant: "张三",
      applicationDate: "2024-01-01",
      priorityDate: null,
      claims: [
        { claimNumber: 1, type: "independent", dependsOn: [], rawText: "一种装置，包括A和B" }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("should accept null fields", () => {
    const result = extractCaseFieldsSchema.safeParse({
      title: null,
      applicationNumber: null,
      applicant: null,
      applicationDate: null,
      priorityDate: null,
      claims: []
    });
    expect(result.success).toBe(true);
  });
});

// ── searchReferencesFilterSchema ─────────────────────────────

describe("searchReferencesFilterSchema", () => {
  it("should parse valid search references", () => {
    const result = searchReferencesFilterSchema.safeParse({
      candidates: [
        {
          title: "对比文件1",
          publicationNumber: "CN123456A",
          summary: "公开了特征A",
          relevanceScore: 85,
          recommendationReason: "技术领域相同"
        }
      ],
      searchQuery: "装置 A B"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legalCaution).toContain("真实搜索");
    }
  });

  it("should default legalCaution", () => {
    const result = searchReferencesFilterSchema.safeParse({
      candidates: [],
      searchQuery: "test"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legalCaution).toBeTruthy();
    }
  });

  it("should reject candidates exceeding max 10", () => {
    const candidates = Array.from({ length: 11 }, (_, i) => ({
      title: `ref-${i}`,
      publicationNumber: `CN${i}`,
      summary: "test",
      relevanceScore: 50,
      recommendationReason: "test"
    }));
    const result = searchReferencesFilterSchema.safeParse({ candidates, searchQuery: "test" });
    expect(result.success).toBe(false);
  });
});

// ── agentRunInputSchema ──────────────────────────────────────

describe("agentRunInputSchema", () => {
  it("should parse valid agent run input", () => {
    const result = agentRunInputSchema.safeParse({
      agent: "novelty",
      caseId: "case-1",
      request: { features: [] }
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing agent", () => {
    const result = agentRunInputSchema.safeParse({
      caseId: "case-1"
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty agent string", () => {
    const result = agentRunInputSchema.safeParse({
      agent: "",
      caseId: "case-1"
    });
    expect(result.success).toBe(false);
  });
});

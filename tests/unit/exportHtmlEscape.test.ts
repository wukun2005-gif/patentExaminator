/**
 * Export HTML Escape Tests
 * ========================
 *
 * 测试 exportHtml.ts 的 HTML 转义功能：
 * - 验证 escapeHtml 函数正确转义特殊字符
 * - 验证用户/AI 内容中的 HTML 标签被正确转义
 * - 防止 XSS 攻击
 */

import { describe, it, expect } from "vitest";
import { renderCaseHtml, type ExportViewModel } from "@client/lib/exportHtml";

function makeViewModel(overrides: Partial<ExportViewModel> = {}): ExportViewModel {
  return {
    caseData: {
      id: "test-case",
      applicationNumber: "CN2023100000001",
      title: "测试发明",
      applicationDate: "2023-03-15",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      reexaminationRound: 1,
      workflowState: "empty",
      createdAt: "2023-03-15T00:00:00.000Z",
      updatedAt: "2023-03-15T00:00:00.000Z"
    },
    claimFeatures: [],
    noveltyComparisons: [],
    differenceFeatureCodes: [],
    pendingSearchQuestions: [],
    ...overrides
  };
}

describe("exportHtml XSS protection", () => {
  // ══════════════════════════════════════════════════════════════════════
  // escapeHtml 函数测试
  // ══════════════════════════════════════════════════════════════════════

  describe("escapeHtml function", () => {
    it("escapes ampersand", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: "A & B"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toContain("A &amp; B");
      expect(html).not.toContain("A & B");
    });

    it("escapes less than", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: "A < B"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toContain("A &lt; B");
      expect(html).not.toContain("A < B");
    });

    it("escapes greater than", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: "A > B"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toContain("A &gt; B");
      expect(html).not.toContain("A > B");
    });

    it("escapes double quotes", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: 'A "B" C'
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toContain("A &quot;B&quot; C");
      expect(html).not.toContain('A "B" C');
    });

    it("escapes single quotes", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: "A 'B' C"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toContain("A &#039;B&#039; C");
      expect(html).not.toContain("A 'B' C");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // XSS 攻击防护测试
  // ══════════════════════════════════════════════════════════════════════

  describe("XSS attack prevention", () => {
    it("prevents script injection in title", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: '<script>alert("XSS")</script>'
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("prevents img onerror injection", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: '<img src=x onerror=alert("XSS")>'
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });

    it("prevents event handler injection in applicationNumber", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          applicationNumber: '" onmouseover="alert(\'XSS\')"'
        }
      });
      const html = renderCaseHtml(vm);
      // The quotes should be escaped, preventing the attribute breakout
      expect(html).toContain("&quot;");
      // The original malicious string should not appear unescaped
      expect(html).not.toContain('" onmouseover="');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // Claim Feature 转义测试
  // ══════════════════════════════════════════════════════════════════════

  describe("claim feature escaping", () => {
    it("escapes HTML in feature description", () => {
      const vm = makeViewModel({
        claimFeatures: [
          {
            id: "feat-1",
            caseId: "test-case",
            claimNumber: 1,
            featureCode: "A",
            description: '<script>alert("XSS")</script>',
            specificationCitations: [],
            citationStatus: "confirmed",
            source: "mock"
          }
        ]
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in feature code", () => {
      const vm = makeViewModel({
        claimFeatures: [
          {
            id: "feat-1",
            caseId: "test-case",
            claimNumber: 1,
            featureCode: '<img onerror=alert(1)>',
            description: "test",
            specificationCitations: [],
            citationStatus: "confirmed",
            source: "mock"
          }
        ]
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // Novelty Comparison 转义测试
  // ══════════════════════════════════════════════════════════════════════

  describe("novelty comparison escaping", () => {
    it("escapes HTML in citation quote", () => {
      const vm = makeViewModel({
        noveltyComparisons: [
          {
            id: "nov-1",
            caseId: "test-case",
            referenceId: "D1",
            claimNumber: 1,
            rows: [
              {
                featureCode: "A",
                disclosureStatus: "clearly-disclosed",
                citations: [
                  {
                    documentId: "doc-1",
                    label: "D1",
                    quote: '<script>alert("XSS")</script>',
                    confidence: "high"
                  }
                ]
              }
            ],
            differenceFeatureCodes: [],
            pendingSearchQuestions: [],
            status: "draft",
            legalCaution: "test"
          }
        ]
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in reviewer notes", () => {
      const vm = makeViewModel({
        noveltyComparisons: [
          {
            id: "nov-1",
            caseId: "test-case",
            referenceId: "D1",
            claimNumber: 1,
            rows: [
              {
                featureCode: "A",
                disclosureStatus: "clearly-disclosed",
                citations: [],
                reviewerNotes: '<img onerror=alert(1)>'
              }
            ],
            differenceFeatureCodes: [],
            pendingSearchQuestions: [],
            status: "draft",
            legalCaution: "test"
          }
        ]
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // Reexam Draft 转义测试
  // ══════════════════════════════════════════════════════════════════════

  describe("reexam draft escaping", () => {
    it("escapes HTML in examiner response", () => {
      const vm = makeViewModel({
        reexamDraft: {
          claimNumber: 1,
          responseItems: [
            {
              rejectionGroundCode: "RG-1",
              category: "novelty",
              applicantArgumentSummary: "test",
              examinerResponse: '<script>alert("XSS")</script>',
              conclusion: "argument-accepted",
              supportingEvidence: []
            }
          ],
          overallAssessment: "test",
          legalCaution: "test"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in supporting evidence quote", () => {
      const vm = makeViewModel({
        reexamDraft: {
          claimNumber: 1,
          responseItems: [
            {
              rejectionGroundCode: "RG-1",
              category: "novelty",
              applicantArgumentSummary: "test",
              examinerResponse: "test",
              conclusion: "argument-accepted",
              supportingEvidence: [
                {
                  label: "D1",
                  quote: '<img onerror=alert(1)>',
                  confidence: "high"
                }
              ]
            }
          ],
          overallAssessment: "test",
          legalCaution: "test"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // Summary 转义测试
  // ══════════════════════════════════════════════════════════════════════

  describe("summary escaping", () => {
    it("escapes HTML in summary body", () => {
      const vm = makeViewModel({
        summary: {
          body: '<script>alert("XSS")</script>',
          aiNotes: "",
          legalCaution: "test"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in AI notes", () => {
      const vm = makeViewModel({
        summary: {
          body: "test",
          aiNotes: '<img onerror=alert(1)>',
          legalCaution: "test"
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 边界情况
  // ══════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("handles null values gracefully", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toBeDefined();
    });

    it("handles undefined values gracefully", () => {
      const vm = makeViewModel({
        defects: [
          {
            id: "defect-1",
            caseId: "test-case",
            category: "test",
            description: "test",
            severity: "warning",
            resolved: false
          }
        ]
      });
      const html = renderCaseHtml(vm);
      expect(html).toBeDefined();
    });

    it("handles empty strings", () => {
      const vm = makeViewModel({
        caseData: {
          ...makeViewModel().caseData,
          title: ""
        }
      });
      const html = renderCaseHtml(vm);
      expect(html).toBeDefined();
    });
  });
});

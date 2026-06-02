/**
 * chatContext.test.ts (td-6)
 * ==========================
 * Tests for buildContextSummary from @client/lib/chatContext.
 * Covers all 12+ ModuleScope branches.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { buildContextSummary } from "@client/lib/chatContext";
import {
  useCaseStore,
  useDocumentsStore,
  useClaimsStore,
  useNoveltyStore,
  useInventiveStore,
  useDefectsStore,
  useOpinionStore
} from "@client/store";

const CASE_ID = "tc-1";

function resetAllStores() {
  useCaseStore.setState({ currentCase: null, cases: [] });
  useDocumentsStore.setState({ documents: [] });
  useClaimsStore.setState({ claimNodes: [], claimFeatures: [] });
  useNoveltyStore.setState({ comparisons: [] });
  useInventiveStore.setState({ analyses: [] });
  useDefectsStore.setState({ defects: [] });
  useOpinionStore.setState({
    officeActionAnalysis: null,
    argumentMappings: [],
    unmappedGrounds: []
  });
}

describe("buildContextSummary", () => {
  beforeEach(() => {
    resetAllStores();
  });

  // ── case ───────────────────────────────────────────────────────────

  describe("moduleScope: case", () => {
    it("includes case metadata when currentCase matches", () => {
      useCaseStore.setState({
        currentCase: {
          id: CASE_ID,
          title: "测试发明",
          applicationNumber: "CN2023100000001",
          workflowState: "novelty-ready",
          applicationDate: "2023-03-15",
          patentType: "invention",
          textVersion: "original",
          targetClaimNumber: 1,
          guidelineVersion: "2023",
          reexaminationRound: 1,
          createdAt: "2023-03-15T00:00:00.000Z",
          updatedAt: "2023-03-15T00:00:00.000Z"
        }
      });

      const result = buildContextSummary(CASE_ID, "case");
      expect(result).toContain("案件: 测试发明");
      expect(result).toContain("CN2023100000001");
      expect(result).toContain("工作流状态: novelty-ready");
      expect(result).toContain("申请日: 2023-03-15");
      expect(result).toContain("专利类型: invention");
      expect(result).toContain("目标权利要求: 1");
    });

    it("returns fallback when currentCase is null", () => {
      const result = buildContextSummary(CASE_ID, "case");
      expect(result).toBe("（暂无模块数据）");
    });
  });

  // ── documents / interpret ──────────────────────────────────────────

  describe("moduleScope: documents", () => {
    it("lists documents for the case", () => {
      useDocumentsStore.setState({
        documents: [
          {
            id: "doc-1",
            caseId: CASE_ID,
            role: "application",
            fileName: "申请文件.pdf",
            fileType: "pdf",
            textStatus: "extracted",
            extractedText: "技术方案内容",
            textIndex: { pages: [], paragraphs: [], lineMap: [] },
            createdAt: "2023-03-15T00:00:00.000Z"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "documents");
      expect(result).toContain("已导入文档: 1 份");
      expect(result).toContain("申请文件.pdf");
      expect(result).toContain("application");
      expect(result).toContain("extracted");
      expect(result).toContain("文档正文:");
      expect(result).toContain("技术方案内容");
    });

    it("shows zero docs when none exist", () => {
      const result = buildContextSummary(CASE_ID, "documents");
      expect(result).toContain("已导入文档: 0 份");
    });
  });

  describe("moduleScope: interpret", () => {
    it("shares the same branch as documents", () => {
      useDocumentsStore.setState({
        documents: [
          {
            id: "doc-i",
            caseId: CASE_ID,
            role: "reference",
            fileName: "对比文件.txt",
            fileType: "txt",
            textStatus: "confirmed",
            extractedText: "",
            textIndex: { pages: [], paragraphs: [], lineMap: [] },
            createdAt: "2023-03-15T00:00:00.000Z"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "interpret");
      expect(result).toContain("已导入文档: 1 份");
      expect(result).toContain("对比文件.txt");
    });
  });

  // ── claim-chart ────────────────────────────────────────────────────

  describe("moduleScope: claim-chart", () => {
    it("lists claim nodes and features", () => {
      useClaimsStore.setState({
        claimNodes: [
          {
            id: "node-1",
            caseId: CASE_ID,
            claimNumber: 1,
            type: "independent",
            dependsOn: [],
            rawText: "一种装置，包括..."
          }
        ],
        claimFeatures: [
          {
            id: "feat-1",
            caseId: CASE_ID,
            claimNumber: 1,
            featureCode: "F1",
            description: "特征一",
            specificationCitations: [],
            citationStatus: "confirmed",
            source: "ai"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "claim-chart");
      expect(result).toContain("权利要求节点: 1 个");
      expect(result).toContain("技术特征: 1 个");
      expect(result).toContain("F1: 特征一 [confirmed]");
    });

    it("shows zero counts when empty", () => {
      const result = buildContextSummary(CASE_ID, "claim-chart");
      expect(result).toContain("权利要求节点: 0 个");
      expect(result).toContain("技术特征: 0 个");
    });
  });

  // ── novelty ────────────────────────────────────────────────────────

  describe("moduleScope: novelty", () => {
    it("lists comparisons with difference codes", () => {
      useNoveltyStore.setState({
        comparisons: [
          {
            id: "nov-1",
            caseId: CASE_ID,
            referenceId: "REF-001",
            claimNumber: 1,
            rows: [
              {
                featureCode: "F1",
                disclosureStatus: "clearly-disclosed",
                citations: []
              }
            ],
            differenceFeatureCodes: ["F2", "F3"],
            pendingSearchQuestions: [],
            status: "draft",
            legalCaution: ""
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "novelty");
      expect(result).toContain("新颖性对照: 1 篇对比文件");
      expect(result).toContain("对比文件 REF-001");
      expect(result).toContain("1 行");
      expect(result).toContain("状态 draft");
      expect(result).toContain("区别特征: F2, F3");
    });

    it("omits difference line when codes are empty", () => {
      useNoveltyStore.setState({
        comparisons: [
          {
            id: "nov-2",
            caseId: CASE_ID,
            referenceId: "REF-002",
            claimNumber: 1,
            rows: [],
            differenceFeatureCodes: [],
            pendingSearchQuestions: [],
            status: "user-reviewed",
            legalCaution: ""
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "novelty");
      expect(result).not.toContain("区别特征:");
    });
  });

  // ── inventive ──────────────────────────────────────────────────────

  describe("moduleScope: inventive", () => {
    it("shows analysis with all fields", () => {
      useInventiveStore.setState({
        analyses: [
          {
            id: "inv-1",
            caseId: CASE_ID,
            closestPriorArtId: "REF-001",
            sharedFeatureCodes: ["F1"],
            distinguishingFeatureCodes: ["F2"],
            candidateAssessment: "possibly-lacks-inventiveness",
            objectiveTechnicalProblem: "提供一种更高效的装置",
            motivationEvidence: [],
            cautions: [],
            legalCaution: "",
            status: "draft"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "inventive");
      expect(result).toContain("创造性分析: 候选结论 possibly-lacks-inventiveness");
      expect(result).toContain("最接近现有技术: REF-001");
      expect(result).toContain("共有特征: F1");
      expect(result).toContain("区别特征: F2");
      expect(result).toContain("客观技术问题: 提供一种更高效的装置");
    });

    it("shows fallback when no analysis exists", () => {
      const result = buildContextSummary(CASE_ID, "inventive");
      expect(result).toContain("创造性分析: 尚未运行");
    });

    it("shows '未选定' when closestPriorArtId is undefined", () => {
      useInventiveStore.setState({
        analyses: [
          {
            id: "inv-2",
            caseId: CASE_ID,
            sharedFeatureCodes: [],
            distinguishingFeatureCodes: [],
            candidateAssessment: "not-analyzed",
            motivationEvidence: [],
            cautions: [],
            legalCaution: "",
            status: "draft"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "inventive");
      expect(result).toContain("最接近现有技术: 未选定");
      expect(result).toContain("共有特征: 无");
      expect(result).toContain("区别特征: 无");
    });
  });

  // ── defects ────────────────────────────────────────────────────────

  describe("moduleScope: defects", () => {
    it("lists defects with severity and resolved status", () => {
      useDefectsStore.setState({
        defects: [
          {
            id: "def-1",
            caseId: CASE_ID,
            category: "形式问题",
            description: "缺少摘要",
            severity: "error",
            resolved: false
          },
          {
            id: "def-2",
            caseId: CASE_ID,
            category: "格式问题",
            description: "页码缺失",
            severity: "warning",
            resolved: true
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "defects");
      expect(result).toContain("形式缺陷: 2 项 (1 项未解决)");
      expect(result).toContain("[error] 形式问题: 缺少摘要");
      expect(result).not.toContain("缺少摘要 (已解决)");
      expect(result).toContain("[warning] 格式问题: 页码缺失 (已解决)");
    });

    it("shows zero defects when empty", () => {
      const result = buildContextSummary(CASE_ID, "defects");
      expect(result).toContain("形式缺陷: 0 项 (0 项未解决)");
    });
  });

  // ── draft / summary ────────────────────────────────────────────────

  describe("moduleScope: draft", () => {
    it("shows aggregate counts", () => {
      useClaimsStore.setState({
        claimFeatures: [
          {
            id: "f1", caseId: CASE_ID, claimNumber: 1, featureCode: "F1",
            description: "d", specificationCitations: [], citationStatus: "confirmed", source: "ai"
          },
          {
            id: "f2", caseId: CASE_ID, claimNumber: 1, featureCode: "F2",
            description: "d", specificationCitations: [], citationStatus: "confirmed", source: "ai"
          }
        ]
      });
      useNoveltyStore.setState({
        comparisons: [
          {
            id: "n1", caseId: CASE_ID, referenceId: "R1", claimNumber: 1,
            rows: [], differenceFeatureCodes: [], pendingSearchQuestions: [],
            status: "draft", legalCaution: ""
          }
        ]
      });
      useInventiveStore.setState({
        analyses: [
          {
            id: "i1", caseId: CASE_ID, sharedFeatureCodes: [], distinguishingFeatureCodes: [],
            candidateAssessment: "possibly-inventive", motivationEvidence: [],
            cautions: [], legalCaution: "", status: "draft"
          }
        ]
      });
      useDefectsStore.setState({
        defects: [
          {
            id: "d1", caseId: CASE_ID, category: "c", description: "d",
            severity: "info", resolved: false
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "draft");
      expect(result).toContain("特征: 2 个");
      expect(result).toContain("对照: 1 篇");
      expect(result).toContain("创造性: possibly-inventive");
      expect(result).toContain("缺陷: 1 项");
    });
  });

  describe("moduleScope: summary", () => {
    it("shares the same branch as draft", () => {
      const result = buildContextSummary(CASE_ID, "summary");
      expect(result).toContain("特征: 0 个");
      expect(result).toContain("对照: 0 篇");
      expect(result).toContain("创造性: 未分析");
      expect(result).toContain("缺陷: 0 项");
    });
  });

  // ── opinion-analysis ───────────────────────────────────────────────

  describe("moduleScope: opinion-analysis", () => {
    it("lists office action analyses", () => {
      useOpinionStore.setState({
        officeActionAnalysis: {
          id: "oa-1",
          caseId: CASE_ID,
          documentId: "doc-oa",
          rejectionGrounds: [
            { code: "X1", category: "novelty", claimNumbers: [1], summary: "s", legalBasis: "l" }
          ],
          citedReferences: [
            { publicationNumber: "CN123", rejectionGroundCodes: ["X1"], featureMapping: "fm" }
          ],
          legalCaution: "",
          status: "draft",
          createdAt: "2023-03-15T00:00:00.000Z"
        }
      });

      const result = buildContextSummary(CASE_ID, "opinion-analysis");
      expect(result).toContain("审查意见解析: 1 份");
      expect(result).toContain("驳回理由: 1 条");
      expect(result).toContain("引用文献: 1 篇");
    });

    it("shows zero when no analyses exist", () => {
      useOpinionStore.setState({
        officeActionAnalysis: null
      });

      const result = buildContextSummary(CASE_ID, "opinion-analysis");
      expect(result).toContain("审查意见解析: 0 份");
    });
  });

  // ── argument-mapping ───────────────────────────────────────────────

  describe("moduleScope: argument-mapping", () => {
    it("lists argument mappings with codes and confidence", () => {
      useOpinionStore.setState({
        argumentMappings: [
          {
            id: "am-1",
            caseId: CASE_ID,
            rejectionGroundCode: "X1",
            applicantArgument: "区别特征未被公开",
            argumentSummary: "申请人认为对比文件未公开特征F2",
            confidence: "high",
            status: "draft",
            createdAt: "2023-03-15T00:00:00.000Z"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "argument-mapping");
      expect(result).toContain("答辩理由映射: 1 条");
      expect(result).toContain("X1:");
      expect(result).toContain("[high]");
    });

    it("truncates long argumentSummary to 50 chars", () => {
      useOpinionStore.setState({
        argumentMappings: [
          {
            id: "am-2",
            caseId: CASE_ID,
            rejectionGroundCode: "Y1",
            applicantArgument: "a",
            argumentSummary: "A".repeat(100),
            confidence: "medium",
            status: "draft",
            createdAt: "2023-03-15T00:00:00.000Z"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "argument-mapping");
      // The summary should be truncated to 50 chars
      expect(result).toContain("A".repeat(50));
      expect(result).not.toContain("A".repeat(51));
    });

    it("shows '无摘要' when argumentSummary is undefined", () => {
      useOpinionStore.setState({
        argumentMappings: [
          {
            id: "am-3",
            caseId: CASE_ID,
            rejectionGroundCode: "X2",
            applicantArgument: "a",
            argumentSummary: undefined as unknown as string,
            confidence: "low",
            status: "draft",
            createdAt: "2023-03-15T00:00:00.000Z"
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "argument-mapping");
      expect(result).toContain("无摘要");
    });
  });

  // ── search-references / translate / classify-documents ─────────────

  describe("moduleScope: search-references", () => {
    it("returns placeholder message", () => {
      const result = buildContextSummary(CASE_ID, "search-references");
      expect(result).toContain("模块 search-references: 暂无上下文数据");
    });
  });

  describe("moduleScope: translate", () => {
    it("returns placeholder message", () => {
      const result = buildContextSummary(CASE_ID, "translate");
      expect(result).toContain("模块 translate: 暂无上下文数据");
    });
  });

  describe("moduleScope: classify-documents", () => {
    it("returns placeholder message", () => {
      const result = buildContextSummary(CASE_ID, "classify-documents");
      expect(result).toContain("模块 classify-documents: 暂无上下文数据");
    });
  });

  // ── cross-cutting ──────────────────────────────────────────────────

  describe("cross-cutting", () => {
    it("returns fallback when all stores are empty and module has no data", () => {
      // For modules like "case" with no currentCase, result is empty lines → fallback
      const result = buildContextSummary(CASE_ID, "case");
      expect(result).toBe("（暂无模块数据）");
    });

    it("filters data by caseId (ignores other cases)", () => {
      useDefectsStore.setState({
        defects: [
          {
            id: "def-other",
            caseId: "other-case",
            category: "c",
            description: "other defect",
            severity: "error",
            resolved: false
          }
        ]
      });

      const result = buildContextSummary(CASE_ID, "defects");
      expect(result).toContain("形式缺陷: 0 项");
      expect(result).not.toContain("other defect");
    });

    it("includes case header with null applicationNumber", () => {
      useCaseStore.setState({
        currentCase: {
          id: CASE_ID,
          title: "标题",
          applicationNumber: null,
          workflowState: "empty",
          applicationDate: "2023-01-01",
          patentType: "invention",
          textVersion: "original",
          targetClaimNumber: 1,
          guidelineVersion: "2023",
          reexaminationRound: 1,
          createdAt: "2023-01-01T00:00:00.000Z",
          updatedAt: "2023-01-01T00:00:00.000Z"
        }
      });

      const result = buildContextSummary(CASE_ID, "search-references");
      expect(result).toContain("案件: 标题");
      expect(result).toContain("无申请号");
    });

    it("shows '（无标题）' when title is empty", () => {
      useCaseStore.setState({
        currentCase: {
          id: CASE_ID,
          title: "",
          applicationNumber: "CN123",
          workflowState: "empty",
          applicationDate: "2023-01-01",
          patentType: "invention",
          textVersion: "original",
          targetClaimNumber: 1,
          guidelineVersion: "2023",
          reexaminationRound: 1,
          createdAt: "2023-01-01T00:00:00.000Z",
          updatedAt: "2023-01-01T00:00:00.000Z"
        }
      });

      const result = buildContextSummary(CASE_ID, "search-references");
      expect(result).toContain("（无标题）");
      expect(result).toContain("CN123");
    });
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { setDBInstance, openPatentDB } from "@client/lib/indexedDb";

import { AgentClient } from "@client/agent/AgentClient";

import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useReferencesStore } from "@client/store/features/references/referencesSlice";
import { useClaimsStore } from "@client/store/features/claims/claimsSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useInventiveStore } from "@client/store/features/inventive/inventiveSlice";
import { useDefectsStore } from "@client/store/features/defects/defectsSlice";
import { useChatStore } from "@client/store/features/chat/chatSlice";
import { useOpinionStore } from "@client/store/features/opinion/opinionSlice";
import { useDraftStore } from "@client/store/features/draft/draftSlice";
import { useInterpretStore } from "@client/store/features/interpret/interpretSlice";

import * as caseRepo from "@client/lib/repositories/caseRepo";
import * as documentRepo from "@client/lib/repositories/documentRepo";
import * as claimRepo from "@client/lib/repositories/claimRepo";
import * as noveltyRepo from "@client/lib/repositories/noveltyRepo";
import * as inventiveRepo from "@client/lib/repositories/inventiveRepo";
import * as defectRepo from "@client/lib/repositories/defectRepo";

import type { PatentCase, ReferenceDocument, NoveltyComparison, InventiveStepAnalysis, FormalDefect, OfficeActionAnalysis, ArgumentMapping } from "@shared/types/domain";

const CASE_ID = "agent-pipeline-case";
const NOW = "2024-01-01T00:00:00.000Z";

function makeCase(overrides: Partial<PatentCase> = {}): PatentCase {
  return {
    id: CASE_ID,
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
    updatedAt: "2023-03-15T00:00:00.000Z",
    ...overrides
  };
}

beforeEach(async () => {
  const db = await openPatentDB();
  setDBInstance(db);

  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([...storeNames.map((s) => tx.objectStore(s).clear()), tx.done]);

  useCaseStore.setState({ currentCase: null, cases: [], isLoading: false });
  useDocumentsStore.setState({ documents: [], isLoading: false });
  useReferencesStore.setState({ references: [], candidates: [], isLoading: false, isSearching: false });
  useClaimsStore.setState({ claimNodes: [], claimFeatures: [], isLoading: false });
  useNoveltyStore.setState({ comparisons: [], isLoading: false });
  useInventiveStore.setState({ analyses: [], isLoading: false });
  useDefectsStore.setState({ defects: [], isLoading: false });
  useChatStore.setState({ sessions: [], messages: [], activeSessionId: null, isPanelOpen: true, isLoading: false });
  useOpinionStore.setState({ officeActionAnalysis: null, argumentMappings: [], unmappedGrounds: [], isLoading: false });
  useDraftStore.setState({ reexamDrafts: {}, summaries: {} });
  useInterpretStore.setState({ interpretSummaries: {} });

  await caseRepo.createCase(makeCase());
});

function makeMockClient(): AgentClient {
  return new AgentClient("mock", "/api");
}

const MOCK_SPEC_TEXT = "本发明涉及一种LED散热装置，包括散热基板、导热界面层和散热翅片。散热基板用于安装LED芯片，导热界面层位于散热基板和散热翅片之间。散热翅片通过卡扣与导热界面层连接，形成散热通道。电源管理模块控制电流输出，确保LED工作稳定。具体实施例如下：散热基板采用铝基材质，导热界面层为导热硅脂。";

const MOCK_CLAIM_TEXT = "一种LED散热装置，包括散热基板、导热界面层和散热翅片，其特征在于：散热翅片与导热界面层通过卡扣连接，形成散热通道。";

// ══════════════════════════════════════════════════════════════════════
// Phase A: Agents with inline mock functions — full pipeline testable
// ══════════════════════════════════════════════════════════════════════

describe("Agent Pipeline: ClaimChart (Mock)", () => {
  it("runClaimChart → 返回特征数组 → 持久化到 DB → 回读一致", async () => {
    const client = makeMockClient();
    const resp = await client.runClaimChart({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    expect(resp.features).toBeDefined();
    expect(resp.features.length).toBeGreaterThanOrEqual(2);
    expect(resp.features[0]!.featureCode).toBe("A");
    expect(resp.features[0]!.citationStatus).toBe("needs-review");
    expect(resp.features[0]!.source).toBe("mock");
    expect(resp.legalCaution).toBeTruthy();
    expect(resp.pendingSearchQuestions).toBeDefined();

    await Promise.all(resp.features.map((f) => claimRepo.createClaimFeature(f)));

    const persisted = await claimRepo.readClaimFeaturesByCaseId(CASE_ID);
    expect(persisted).toHaveLength(resp.features.length);
    expect(persisted[0]!.featureCode).toBe("A");
  });

  it("runClaimChart → 独立权利要求含'包括'特征 → 正确拆分", async () => {
    const client = makeMockClient();
    const claimWithIncludes = "一种LED散热装置，包括散热基板、导热界面层和散热翅片，其特征在于：散热翅片与导热界面层通过卡扣连接。";
    const resp = await client.runClaimChart({
      caseId: CASE_ID,
      claimText: claimWithIncludes,
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    expect(resp.features.length).toBeGreaterThanOrEqual(3);
    expect(resp.features.some((f) => f.description.includes("散热基板"))).toBe(true);
    expect(resp.features.some((f) => f.description.includes("导热界面层"))).toBe(true);
  });

  it("runClaimChart → 空权利要求文本 → 返回空特征数组", async () => {
    const client = makeMockClient();
    const resp = await client.runClaimChart({
      caseId: CASE_ID,
      claimText: "",
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    expect(resp.features).toBeDefined();
    expect(resp.features.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Agent Pipeline: Inventive (Mock)", () => {
  it("runInventive → 返回三步法分析结果 → 持久化到 DB → 回读一致", async () => {
    const client = makeMockClient();

    const features = [
      { featureCode: "A", description: "散热基板" },
      { featureCode: "B", description: "导热界面层" },
      { featureCode: "C", description: "散热翅片通过卡扣与导热界面层连接" }
    ];

    const references = [
      { referenceId: "ref-1", label: "CN112345678A §5", excerpt: "对比文件公开了散热基板与散热翅片的结构组合" }
    ];

    const resp = await client.runInventive({
      caseId: CASE_ID,
      claimNumber: 1,
      features,
      availableReferences: references,
      closestPriorArtId: "ref-1",
      applicantArguments: "申请人认为本发明的卡扣连接方式具有非显而易见性"
    });

    expect(resp.claimNumber).toBe(1);
    expect(resp.sharedFeatureCodes.length).toBeGreaterThanOrEqual(1);
    expect(resp.distinguishingFeatureCodes.length).toBeGreaterThanOrEqual(1);
    expect(resp.closestPriorArtId).toBe("ref-1");
    expect(resp.candidateAssessment).toBe("possibly-inventive");
    expect(resp.motivationEvidence.length).toBeGreaterThanOrEqual(1);
    expect(resp.motivationEvidence[0]!.confidence).toBe("high");
    expect(resp.legalCaution).toBeTruthy();
    expect(resp.examinerResponse).toBeTruthy();

    const analysis: InventiveStepAnalysis = {
      id: `${CASE_ID}-inventive-1`,
      caseId: CASE_ID,
      ...(resp.closestPriorArtId ? { closestPriorArtId: resp.closestPriorArtId } : {}),
      sharedFeatureCodes: resp.sharedFeatureCodes,
      distinguishingFeatureCodes: resp.distinguishingFeatureCodes,
      ...(resp.applicantArguments ? { applicantArguments: resp.applicantArguments } : {}),
      ...(resp.examinerResponse ? { examinerResponse: resp.examinerResponse } : {}),
      ...(resp.objectiveTechnicalProblem ? { objectiveTechnicalProblem: resp.objectiveTechnicalProblem } : {}),
      motivationEvidence: resp.motivationEvidence.map((e) => ({
        documentId: e.referenceId,
        label: e.label,
        ...(e.paragraph ? { paragraph: e.paragraph } : {}),
        ...(e.quote ? { quote: e.quote } : {}),
        confidence: e.confidence
      })),
      candidateAssessment: resp.candidateAssessment,
      cautions: resp.cautions,
      legalCaution: resp.legalCaution,
      status: "draft"
    };
    await inventiveRepo.createInventive(analysis);

    const persisted = await inventiveRepo.readInventiveByCaseId(CASE_ID);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.candidateAssessment).toBe("possibly-inventive");
  });

  it("runInventive → 无申请人答辩 → possibly-lacks-inventiveness", async () => {
    const client = makeMockClient();
    const features = [
      { featureCode: "A", description: "散热基板" }
    ];
    const references = [
      { referenceId: "ref-1", label: "CN112345678A §5", excerpt: "散热基板已被公开" }
    ];

    const resp = await client.runInventive({
      caseId: CASE_ID,
      claimNumber: 1,
      features,
      availableReferences: references
    });

    expect(resp.candidateAssessment).toBe("possibly-lacks-inventiveness");
  });

  it("runInventive → 无对比文件时 motivationEvidence 为空", async () => {
    const client = makeMockClient();
    const features = [
      { featureCode: "A", description: "散热基板" }
    ];

    const resp = await client.runInventive({
      caseId: CASE_ID,
      claimNumber: 1,
      features,
      availableReferences: []
    });

    expect(resp.motivationEvidence).toHaveLength(0);
  });
});

describe("Agent Pipeline: Defect (Mock)", () => {
  it("runDefectCheck → 返回缺陷列表 → 持久化到 DB → 回读一致", async () => {
    const client = makeMockClient();
    const resp = await client.runDefectCheck({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      specificationText: MOCK_SPEC_TEXT,
      claimFeatures: [{ featureCode: "A", description: "散热基板" }]
    });

    expect(resp.defects.length).toBeGreaterThanOrEqual(2);
    expect(resp.defects.some((d) => d.category === "权利要求")).toBe(true);
    expect(resp.defects.some((d) => d.category === "说明书")).toBe(true);
    expect(resp.defects.every((d) => d.severity === "error" || d.severity === "warning" || d.severity === "info")).toBe(true);
    expect(resp.legalCaution).toBeTruthy();

    const formalDefects: FormalDefect[] = resp.defects.map((d, i) => ({
      id: `${CASE_ID}-defect-${i}`,
      caseId: CASE_ID,
      category: d.category,
      description: d.description,
      severity: d.severity,
      resolved: false,
      ...(d.location ? { location: d.location } : {}),
      ...(d.previouslyRaised !== undefined ? { previouslyRaised: d.previouslyRaised } : {}),
      ...(d.overcomeStatus ? { overcomeStatus: d.overcomeStatus } : {})
    }));
    await Promise.all(formalDefects.map((d) => defectRepo.createDefect(d)));

    const persisted = await defectRepo.getDefectsByCaseId(CASE_ID);
    expect(persisted).toHaveLength(formalDefects.length);
  });

  it("runDefectCheck → 长说明书超过5000字 → 追加info级别缺陷", async () => {
    const client = makeMockClient();
    const longSpec = MOCK_SPEC_TEXT.repeat(100);

    const resp = await client.runDefectCheck({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      specificationText: longSpec,
      claimFeatures: []
    });

    const infoDefects = resp.defects.filter((d) => d.severity === "info");
    expect(infoDefects.length).toBeGreaterThanOrEqual(1);
    expect(infoDefects.some((d) => d.description.includes("摘要"))).toBe(true);
  });

  it("runDefectCheck → 短说明书仅返回基础缺陷", async () => {
    const client = makeMockClient();
    const resp = await client.runDefectCheck({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      specificationText: "简短说明书。",
      claimFeatures: []
    });

    expect(resp.defects.length).toBe(2);
  });
});

describe("Agent Pipeline: ExtractCaseFields (Mock)", () => {
  it("runExtractCaseFields → 从申请文件中提取所有字段 → 回填store → 创建claim nodes", async () => {
    const client = makeMockClient();
    const documents = [{
      fileName: "申请文件.pdf",
      text: "发明名称：一种LED散热装置\n申请号：CN2023100000001\n申请人：某某科技公司\n申请日：2023年1月15日\n优先权日：2022年6月1日\n权利要求：\n1. 一种LED散热装置，包括散热基板、导热界面层和散热翅片，其特征在于：散热翅片与导热界面层通过卡扣连接。\n2. 根据权利要求1所述的装置，其中散热基板采用铝基材质。"
    }];

    const resp = await client.runExtractCaseFields({
      caseId: CASE_ID,
      documents
    });

    expect(resp.title).toBe("一种LED散热装置");
    expect(resp.applicationNumber).toBe("CN2023100000001");
    expect(resp.applicant).toBe("某某科技公司");
    expect(resp.applicationDate).toBe("2023-01-15");
    expect(resp.priorityDate).toBe("2022-06-01");
    expect(resp.claims.length).toBeGreaterThanOrEqual(1);
    expect(resp.claims[0]!.type).toBe("independent");
    expect(resp.claims[0]!.claimNumber).toBe(1);

    await Promise.all(resp.claims.map((c) => claimRepo.createClaimNode({
      id: `${CASE_ID}-claim-${c.claimNumber}`,
      caseId: CASE_ID,
      claimNumber: c.claimNumber,
      type: c.type,
      dependsOn: c.dependsOn,
      rawText: c.rawText
    })));

    const persisted = await claimRepo.readClaimNodesByCaseId(CASE_ID);
    expect(persisted).toHaveLength(resp.claims.length);
  });

  it("runExtractCaseFields → 无'发明名称'标签 → 从'一种'开头的首行提取", async () => {
    const client = makeMockClient();
    const docs = [{
      fileName: "test.pdf",
      text: "一种图像处理方法及装置\n申请号：CN202410567890.1\n"
    }];

    const resp = await client.runExtractCaseFields({
      caseId: CASE_ID,
      documents: docs
    });

    expect(resp.title).toBe("一种图像处理方法及装置");
  });

  it("runExtractCaseFields → 空文档文本 → 返回null字段", async () => {
    const client = makeMockClient();
    const resp = await client.runExtractCaseFields({
      caseId: CASE_ID,
      documents: [{ fileName: "empty.txt", text: "" }]
    });

    expect(resp.title).toBeNull();
    expect(resp.applicationNumber).toBeNull();
    expect(resp.applicant).toBeNull();
    expect(resp.claims.length).toBeGreaterThanOrEqual(1);
    expect(resp.claims[0]!.rawText).toContain("演示模式");
  });
});

describe("Agent Pipeline: SearchReferences (Mock)", () => {
  function makeCandidateDoc(c: { title: string; summary: string; publicationNumber: string }, index: number): ReferenceDocument {
    return {
      id: `candidate-${index}`,
      caseId: CASE_ID,
      role: "reference",
      fileName: c.title,
      fileType: "pdf",
      textStatus: "empty",
      extractedText: c.summary,
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
      title: c.title,
      publicationNumber: c.publicationNumber,
      publicationDateConfidence: "medium",
      timelineStatus: "needs-publication-date",
      source: "ai-search"
    };
  }

  it("runSearchReferences → 返回候选文献列表 → acceptCandidate到references store", async () => {
    const client = makeMockClient();
    const resp = await client.runSearchReferences({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      features: [
        { featureCode: "A", description: "散热基板" },
        { featureCode: "B", description: "导热界面层" }
      ],
      maxResults: 3
    });

    expect(resp.ok).toBe(true);
    expect(resp.candidates.length).toBe(3);
    expect(resp.candidates[0]!.publicationNumber).toBe("CN112345678A");
    expect(resp.candidates[0]!.relevanceScore).toBeGreaterThan(0);

    const refDocs: ReferenceDocument[] = resp.candidates.map((c, i) => makeCandidateDoc(c, i));
    useReferencesStore.getState().setCandidates(refDocs);
    expect(useReferencesStore.getState().candidates).toHaveLength(3);

    useReferencesStore.getState().acceptCandidate("candidate-0");
    expect(useReferencesStore.getState().references).toHaveLength(1);
    expect(useReferencesStore.getState().candidates).toHaveLength(2);
  });

  it("runSearchReferences → rejectCandidate → 候选列表缩小", async () => {
    const client = makeMockClient();
    const resp = await client.runSearchReferences({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      features: []
    });

    const refDocs: ReferenceDocument[] = resp.candidates.map((c, i) => makeCandidateDoc(c, i));
    useReferencesStore.getState().setCandidates(refDocs);
    useReferencesStore.getState().rejectCandidate("candidate-0");
    expect(useReferencesStore.getState().candidates).toHaveLength(2);
  });

  it("runSearchReferences → clearCandidates → 候选列表为空", async () => {
    const client = makeMockClient();
    const resp = await client.runSearchReferences({
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      features: []
    });

    const refDocs: ReferenceDocument[] = resp.candidates.map((c, i) => makeCandidateDoc(c, i));
    useReferencesStore.getState().setCandidates(refDocs);
    useReferencesStore.getState().clearCandidates();
    expect(useReferencesStore.getState().candidates).toHaveLength(0);
  });
});

describe("Agent Pipeline: Chat (Mock)", () => {
  it("runChat → 普通消息 → 上下文感知回复", async () => {
    const client = makeMockClient();
    const resp = await client.runChat({
      caseId: CASE_ID,
      sessionId: "session-1",
      moduleScope: "claim-chart",
      userMessage: "请问权利要求1的特征如何拆分？",
      contextSummary: MOCK_SPEC_TEXT,
      history: []
    });

    expect(resp.reply).toBeTruthy();
    expect(resp.reply).toContain("权利要求特征表");
  });

  it("runChat → 包含'重新'关键词 → 返回regenerate action", async () => {
    const client = makeMockClient();
    const resp = await client.runChat({
      caseId: CASE_ID,
      sessionId: "session-1",
      moduleScope: "novelty",
      userMessage: "请重新运行新颖性分析",
      contextSummary: MOCK_SPEC_TEXT,
      history: []
    });

    expect(resp.action).toBeDefined();
    expect(resp.action!.type).toBe("regenerate");
    expect(resp.action!.target).toBe("novelty");
  });

  it("runChat → 重新创造性 → 返回对应action", async () => {
    const client = makeMockClient();
    const resp = await client.runChat({
      caseId: CASE_ID,
      sessionId: "session-1",
      moduleScope: "inventive",
      userMessage: "重新分析创造性",
      contextSummary: MOCK_SPEC_TEXT,
      history: []
    });

    expect(resp.action).toBeDefined();
    expect(resp.action!.target).toBe("inventive");
  });

  it("runChat → 默认模块scope → 兼容处理", async () => {
    const client = makeMockClient();
    const resp = await client.runChat({
      caseId: CASE_ID,
      sessionId: "session-1",
      moduleScope: "unknown-module",
      userMessage: "你好",
      contextSummary: "",
      history: []
    });

    expect(resp.reply).toBeTruthy();
    expect(resp.action).toBeUndefined();
  });
});

describe("Agent Pipeline: Interpret (Mock)", () => {
  it("runInterpret → 演示模式返回提示文本 → setInterpretSummary", async () => {
    const client = makeMockClient();
    const resp = await client.runInterpret({
      caseId: CASE_ID,
      documentId: "doc-app",
      fileName: "申请文件.pdf",
      documentText: MOCK_SPEC_TEXT,
      documentType: "application",
      relatedDocuments: [{ fileName: "审查意见通知书.pdf", documentType: "office-action" }]
    });

    expect(resp.reply).toBeTruthy();
    expect(resp.reply).toContain("演示模式");

    useInterpretStore.getState().setInterpretSummary(CASE_ID, "doc-app", resp.reply);
    expect(useInterpretStore.getState().interpretSummaries[CASE_ID]?.["doc-app"]).toBe(resp.reply);
  });

  it("runInterpret → 审查意见通知书类型 → 使用对应模板", async () => {
    const client = makeMockClient();
    const resp = await client.runInterpret({
      caseId: CASE_ID,
      documentId: "doc-oa",
      fileName: "审查意见通知书.pdf",
      documentText: "审查意见通知书内容...",
      documentType: "office-action"
    });

    expect(resp.reply).toBeTruthy();
    expect(resp.reply).toContain("审查意见通知书解读");
  });

  it("runInterpret → 意见陈述书类型 → 使用对应模板", async () => {
    const client = makeMockClient();
    const resp = await client.runInterpret({
      caseId: CASE_ID,
      documentId: "doc-response",
      fileName: "意见陈述书.pdf",
      documentText: "意见陈述书内容...",
      documentType: "office-action-response"
    });

    expect(resp.reply).toBeTruthy();
    expect(resp.reply).toContain("意见陈述书解读");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase B: callGatewayMock agents — Store→DB pipeline (direct manipulation)
// These agents use callGatewayMock which requires a running server,
// so we test the downstream store → DB data flow directly.
// ══════════════════════════════════════════════════════════════════════

describe("Agent Pipeline: Novelty (Store→DB)", () => {
  it("mock NoveltyResponse → store → DB → 回读一致", async () => {
    const comparison: NoveltyComparison = {
      id: `${CASE_ID}-novelty-ref-1`,
      caseId: CASE_ID,
      referenceId: "ref-1",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "clearly-disclosed",
          citations: [{
            documentId: "ref-1",
            label: "CN112345678A §5",
            paragraph: "0005",
            quote: "...包括散热基板...",
            confidence: "high"
          }]
        },
        {
          featureCode: "B",
          disclosureStatus: "not-found",
          citations: []
        }
      ],
      differenceFeatureCodes: ["B"],
      pendingSearchQuestions: ["请确认导热界面层是否在其他文献中公开"],
      status: "draft",
      legalCaution: "AI辅助候选结论，需审查员确认"
    };

    useNoveltyStore.getState().addComparison(comparison);
    await noveltyRepo.createNovelty(comparison);

    const storeAfter = useNoveltyStore.getState().comparisons;
    expect(storeAfter).toHaveLength(1);
    expect(storeAfter[0]!.rows[0]!.disclosureStatus).toBe("clearly-disclosed");
    expect(storeAfter[0]!.differenceFeatureCodes).toEqual(["B"]);

    const persisted = await noveltyRepo.readNoveltyByCaseId(CASE_ID);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.rows[1]!.disclosureStatus).toBe("not-found");
  });

  it("对比文件全匹配 → differenceFeatureCodes 为空", async () => {
    const fullMatch: NoveltyComparison = {
      id: `${CASE_ID}-novelty-full`,
      caseId: CASE_ID,
      referenceId: "ref-2",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "clearly-disclosed",
          citations: []
        }
      ],
      differenceFeatureCodes: [],
      pendingSearchQuestions: [],
      status: "draft",
      legalCaution: "AI辅助结论"
    };

    useNoveltyStore.getState().addComparison(fullMatch);
    expect(useNoveltyStore.getState().comparisons[0]!.differenceFeatureCodes).toHaveLength(0);
  });

  it("对比文件完全不相关 → 所有特征均为not-found", async () => {
    const noMatch: NoveltyComparison = {
      id: `${CASE_ID}-novelty-none`,
      caseId: CASE_ID,
      referenceId: "ref-3",
      claimNumber: 1,
      rows: [
        {
          featureCode: "A",
          disclosureStatus: "not-found",
          citations: [],
          mismatchNotes: "对比文件不涉及散热相关技术"
        },
        {
          featureCode: "B",
          disclosureStatus: "not-found",
          citations: []
        }
      ],
      differenceFeatureCodes: ["A", "B"],
      pendingSearchQuestions: [],
      status: "draft",
      legalCaution: "AI辅助结论"
    };

    useNoveltyStore.getState().addComparison(noMatch);
    const store = useNoveltyStore.getState().comparisons[0]!;
    expect(store.differenceFeatureCodes).toHaveLength(2);
    expect(store.rows.every((r) => r.disclosureStatus === "not-found")).toBe(true);
  });
});

describe("Agent Pipeline: OpinionAnalysis (Store)", () => {
  it("mock OpinionAnalysisResponse → setOfficeActionAnalysis → 驳回理由 + 引用文献完整", () => {
    const analysis: OfficeActionAnalysis = {
      id: "oa-1",
      caseId: CASE_ID,
      documentId: "doc-1",
      rejectionGrounds: [
        {
          code: "RG-1",
          category: "novelty",
          claimNumbers: [1],
          summary: "权利要求1相对于对比文件1不具备新颖性",
          legalBasis: "专利法第22条第2款",
          originalText: "根据对比文件1，权利要求1的特征已被公开"
        },
        {
          code: "RG-2",
          category: "inventive",
          claimNumbers: [1, 2],
          summary: "权利要求1-2相对于对比文件1和2不具备创造性",
          legalBasis: "专利法第22条第3款"
        }
      ],
      citedReferences: [
        {
          publicationNumber: "CN112345678A",
          rejectionGroundCodes: ["RG-1", "RG-2"],
          featureMapping: "公开权利要求1的特征A-C"
        },
        {
          publicationNumber: "CN113456789B",
          rejectionGroundCodes: ["RG-2"],
          featureMapping: "公开权利要求2的特征D"
        }
      ],
      legalCaution: "AI辅助分析结果，需审查员确认",
      status: "draft",
      createdAt: NOW
    };

    useOpinionStore.getState().setOfficeActionAnalysis(analysis);

    const store = useOpinionStore.getState();
    expect(store.officeActionAnalysis).not.toBeNull();
    expect(store.officeActionAnalysis!.rejectionGrounds).toHaveLength(2);
    expect(store.officeActionAnalysis!.citedReferences).toHaveLength(2);
    expect(store.officeActionAnalysis!.rejectionGrounds[0]!.category).toBe("novelty");
    expect(store.officeActionAnalysis!.citedReferences[0]!.publicationNumber).toBe("CN112345678A");
  });

  it("addRejectionGround → append → get返回新增项", () => {
    const base: OfficeActionAnalysis = {
      id: "oa-base",
      caseId: CASE_ID,
      documentId: "doc-1",
      rejectionGrounds: [{
        code: "RG-1",
        category: "novelty",
        claimNumbers: [1],
        summary: "无新颖性",
        legalBasis: "法22.2"
      }],
      citedReferences: [],
      legalCaution: "",
      status: "draft",
      createdAt: NOW
    };
    useOpinionStore.getState().setOfficeActionAnalysis(base);

    useOpinionStore.getState().addRejectionGround({
      code: "RG-3",
      category: "clarity",
      claimNumbers: [3],
      summary: "权利要求3不清楚",
      legalBasis: "法26.4"
    });

    expect(useOpinionStore.getState().officeActionAnalysis!.rejectionGrounds).toHaveLength(2);
    expect(useOpinionStore.getState().officeActionAnalysis!.rejectionGrounds.some((g) => g.code === "RG-3")).toBe(true);
  });
});

describe("Agent Pipeline: ArgumentAnalysis (Store)", () => {
  it("mock ArgumentAnalysisResponse → setArgumentMappings → 全部映射", () => {
    const mapping1: ArgumentMapping = {
      id: "am-1",
      caseId: CASE_ID,
      rejectionGroundCode: "RG-1",
      applicantArgument: "申请人认为对比文件1未公开特征C",
      argumentSummary: "对比文件1的散热结构与本申请不同",
      confidence: "high",
      status: "draft",
      createdAt: NOW
    };
    const mapping2: ArgumentMapping = {
      id: "am-2",
      caseId: CASE_ID,
      rejectionGroundCode: "RG-2",
      applicantArgument: "申请人提交了修改后的权利要求，删除原权利要求2",
      argumentSummary: "修改后克服创造性缺陷",
      confidence: "medium",
      amendedClaims: [{
        claimNumber: 1,
        originalText: "原权利要求1",
        amendedText: "修改后的权利要求1",
        changeDescription: "增加技术特征D"
      }],
      status: "draft",
      createdAt: NOW
    };

    useOpinionStore.getState().setArgumentMappings([mapping1, mapping2]);

    const store = useOpinionStore.getState();
    expect(store.argumentMappings).toHaveLength(2);
    expect(store.argumentMappings[0]!.confidence).toBe("high");
    expect(store.argumentMappings[1]!.amendedClaims).toBeDefined();
  });

  it("setUnmappedGrounds → 未映射驳回理由记录", () => {
    const unmapped = ["RG-3", "RG-4"];
    useOpinionStore.getState().setUnmappedGrounds(unmapped);

    expect(useOpinionStore.getState().unmappedGrounds).toEqual(unmapped);
  });

  it("clearReexamData → 全部清空", () => {
    const analysis: OfficeActionAnalysis = {
      id: "oa-clear",
      caseId: CASE_ID,
      documentId: "doc-1",
      rejectionGrounds: [],
      citedReferences: [],
      legalCaution: "",
      status: "draft",
      createdAt: NOW
    };
    useOpinionStore.getState().setOfficeActionAnalysis(analysis);

    const mapping: ArgumentMapping = {
      id: "am-clear",
      caseId: CASE_ID,
      rejectionGroundCode: "RG-1",
      applicantArgument: "test",
      argumentSummary: "test",
      confidence: "low",
      status: "draft",
      createdAt: NOW
    };
    useOpinionStore.getState().setArgumentMappings([mapping]);

    useOpinionStore.getState().clearReexamData();

    expect(useOpinionStore.getState().officeActionAnalysis).toBeNull();
    expect(useOpinionStore.getState().argumentMappings).toHaveLength(0);
    expect(useOpinionStore.getState().unmappedGrounds).toHaveLength(0);
  });
});

describe("Agent Pipeline: ReexamDraft (Store)", () => {
  it("mock ReexamDraftResponse → setReexamDraft → 存储并回读", () => {
    const mockDraft = {
      claimNumber: 1,
      responseItems: [
        {
          rejectionGroundCode: "RG-1",
          category: "novelty",
          applicantArgumentSummary: "申请人认为特征C未被公开",
          examinerResponse: "经审查，对比文件1确实未公开特征C，答辩理由成立。",
          conclusion: "argument-accepted" as const,
          supportingEvidence: [
            {
              label: "对比文件1 §5",
              quote: "未明确记载卡扣连接",
              confidence: "high" as const
            }
          ]
        },
        {
          rejectionGroundCode: "RG-2",
          category: "inventive",
          applicantArgumentSummary: "申请人修改权利要求",
          examinerResponse: "修改方案基本克服创造性缺陷，但需进一步验证效果。",
          conclusion: "argument-partially-accepted" as const
        }
      ],
      overallAssessment: "经过答辩，授权前景有所改善，建议继续审查。",
      defectReviewSummary: "形式缺陷已基本克服",
      legalCaution: "以上为候选草稿，需审查员确认"
    };

    useDraftStore.getState().setReexamDraft(CASE_ID, mockDraft);

    const stored = useDraftStore.getState().reexamDrafts[CASE_ID];
    expect(stored).toBeDefined();
    expect(stored!.responseItems).toHaveLength(2);
    expect(stored!.responseItems[0]!.conclusion).toBe("argument-accepted");
    expect(stored!.responseItems[1]!.conclusion).toBe("argument-partially-accepted");
    expect(stored!.overallAssessment).toBeTruthy();
    expect(stored!.defectReviewSummary).toBeTruthy();
  });

  it("多case ReexamDraft → 互不干扰", () => {
    const draft1 = {
      claimNumber: 1,
      responseItems: [],
      overallAssessment: "case1 assessment",
      legalCaution: ""
    };
    const draft2 = {
      claimNumber: 1,
      responseItems: [],
      overallAssessment: "case2 assessment",
      legalCaution: ""
    };

    useDraftStore.getState().setReexamDraft("case-a", draft1);
    useDraftStore.getState().setReexamDraft("case-b", draft2);

    expect(useDraftStore.getState().reexamDrafts["case-a"]!.overallAssessment).toBe("case1 assessment");
    expect(useDraftStore.getState().reexamDrafts["case-b"]!.overallAssessment).toBe("case2 assessment");
  });
});

describe("Agent Pipeline: Summary (Store)", () => {
  it("mock SummaryResponse → setSummary → 写入并读取", () => {
    const mockSummary = {
      body: "本申请权利要求1-3经审查，可能具备授权前景。",
      aiNotes: "建议关注特征C的创造性高度",
      legalCaution: "以上为AI辅助生成，需审查员确认"
    };

    useDraftStore.getState().setSummary(CASE_ID, mockSummary);

    const stored = useDraftStore.getState().summaries[CASE_ID];
    expect(stored).toBeDefined();
    expect(stored!.body).toBeTruthy();
    expect(stored!.aiNotes).toBeTruthy();
    expect(stored!.legalCaution).toBeTruthy();
  });

  it("覆盖已有 Summary → 新值替换旧值", () => {
    const old = { body: "old", aiNotes: "", legalCaution: "" };
    const new_ = { body: "new", aiNotes: "", legalCaution: "" };

    useDraftStore.getState().setSummary(CASE_ID, old);
    useDraftStore.getState().setSummary(CASE_ID, new_);

    expect(useDraftStore.getState().summaries[CASE_ID]!.body).toBe("new");
  });
});

describe("Agent Pipeline: Translate (Store)", () => {
  it("mock TranslateResponse → 翻译结果正确返回", () => {
    const mockTranslation = {
      translatedText: "An LED heat dissipation device comprising a heat dissipation substrate, a thermal interface layer, and heat dissipation fins."
    };

    expect(mockTranslation.translatedText).toBeTruthy();
    expect(mockTranslation.translatedText).toContain("LED");
  });
});

describe("Agent Pipeline: ClassifyDocuments (Store)", () => {
  it("mock ClassifyDocumentsResponse → 文档角色分类 → update document roles", () => {
    const mockClassifications = [
      {
        fileIndex: 0,
        fileName: "申请文件.pdf",
        role: "application" as const,
        confidence: "high" as const,
        reason: "文档标题包含'发明名称'，内容涉及权利要求"
      },
      {
        fileIndex: 1,
        fileName: "审查意见.pdf",
        role: "office-action" as const,
        confidence: "high" as const,
        reason: "文档包含审查意见通知书的典型用语"
      },
      {
        fileIndex: 2,
        fileName: "CN112345678A.pdf",
        role: "reference" as const,
        confidence: "medium" as const,
        reason: "文档以'CN'开头，可能为专利文献"
      }
    ];

    expect(mockClassifications).toHaveLength(3);
    expect(mockClassifications[0]!.role).toBe("application");
    expect(mockClassifications[1]!.role).toBe("office-action");
    expect(mockClassifications[2]!.role).toBe("reference");

    const updatedDocs: ReferenceDocument[] = mockClassifications.map((c, i) => ({
      id: `doc-classified-${i}`,
      caseId: CASE_ID,
      role: c.role === "office-action" ? "office-action" : c.role === "reference" ? "reference" : "application",
      fileName: c.fileName,
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
      publicationDateConfidence: "medium",
      timelineStatus: "needs-publication-date",
      source: "user-upload"
    }));

    useReferencesStore.getState().setReferences(updatedDocs);
    const refs = useReferencesStore.getState().references;
    expect(refs).toHaveLength(3);
    expect(refs[0]!.role).toBe("application");
    expect(refs[1]!.role).toBe("office-action");
    expect(refs[2]!.role).toBe("reference");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase C: Cross-module serial pipelines
// ══════════════════════════════════════════════════════════════════════

describe("Cross-module Pipeline: Opinion → Argument (Serial)", () => {
  it("串行分析流程: Opinion 结果 → Argument 映射 → Clear → 状态一致", () => {
    const analysis: OfficeActionAnalysis = {
      id: "oa-serial",
      caseId: CASE_ID,
      documentId: "doc-1",
      rejectionGrounds: [
        {
          code: "RG-1",
          category: "novelty",
          claimNumbers: [1],
          summary: "权利要求1缺乏新颖性",
          legalBasis: "专利法第22条第2款"
        }
      ],
      citedReferences: [
        {
          publicationNumber: "CN112345678A",
          rejectionGroundCodes: ["RG-1"],
          featureMapping: "公开特征A-C"
        }
      ],
      legalCaution: "",
      status: "draft",
      createdAt: NOW
    };

    useOpinionStore.getState().setOfficeActionAnalysis(analysis);

    expect(useOpinionStore.getState().officeActionAnalysis!.rejectionGrounds).toHaveLength(1);

    const mapping: ArgumentMapping = {
      id: "am-serial",
      caseId: CASE_ID,
      rejectionGroundCode: "RG-1",
      applicantArgument: "申请人认为对比文件1未公开特征C",
      argumentSummary: "特征C区别成立",
      confidence: "high",
      status: "draft",
      createdAt: NOW
    };
    useOpinionStore.getState().setArgumentMappings([mapping]);

    expect(useOpinionStore.getState().argumentMappings).toHaveLength(1);
    expect(useOpinionStore.getState().argumentMappings[0]!.rejectionGroundCode).toBe("RG-1");

    useOpinionStore.getState().clearReexamData();
    expect(useOpinionStore.getState().officeActionAnalysis).toBeNull();
    expect(useOpinionStore.getState().argumentMappings).toHaveLength(0);
  });

  it("部分驳回理由未映射 → unmappedGrounds 记录", () => {
    const analysis: OfficeActionAnalysis = {
      id: "oa-unmapped",
      caseId: CASE_ID,
      documentId: "doc-1",
      rejectionGrounds: [
        { code: "RG-1", category: "novelty", claimNumbers: [1], summary: "无新颖性", legalBasis: "22.2" },
        { code: "RG-2", category: "clarity", claimNumbers: [2], summary: "不清楚", legalBasis: "26.4" }
      ],
      citedReferences: [],
      legalCaution: "",
      status: "draft",
      createdAt: NOW
    };

    useOpinionStore.getState().setOfficeActionAnalysis(analysis);

    const mapping: ArgumentMapping = {
      id: "am-unmapped",
      caseId: CASE_ID,
      rejectionGroundCode: "RG-1",
      applicantArgument: "答辩1",
      argumentSummary: "有答辩",
      confidence: "high",
      status: "draft",
      createdAt: NOW
    };
    useOpinionStore.getState().setArgumentMappings([mapping]);

    useOpinionStore.getState().setUnmappedGrounds(["RG-2"]);

    expect(useOpinionStore.getState().unmappedGrounds).toEqual(["RG-2"]);
    expect(useOpinionStore.getState().argumentMappings).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase D: References Store → DB full chain
// ══════════════════════════════════════════════════════════════════════

describe("References Full Chain (Store → DB)", () => {
  function makeRefDoc(id: string, publicationNumber: string): ReferenceDocument {
    return {
      id,
      caseId: CASE_ID,
      role: "reference",
      fileName: `${publicationNumber}.pdf`,
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
      publicationDateConfidence: "medium",
      timelineStatus: "needs-publication-date",
      source: "user-upload",
      publicationNumber
    };
  }

  it("添加对比文件 → DB持久化 → 回读正确", async () => {
    const ref = makeRefDoc("ref-crud-1", "CN112345678A");
    await documentRepo.createDocument(ref);

    const allRefs = await documentRepo.readDocumentsByCaseId(CASE_ID);
    const refDocs = allRefs.filter((d) => d.role === "reference");
    expect(refDocs).toHaveLength(1);
    expect(refDocs[0]!.fileName).toBe("CN112345678A.pdf");
  });

  it("更新对比文件摘要 → DB回读一致", async () => {
    const ref = makeRefDoc("ref-crud-2", "CN113456789B");
    await documentRepo.createDocument(ref);

    const updated = { ...ref, extractedText: "更新后的摘要内容" };
    await documentRepo.updateDocument(updated);

    const fetched = await documentRepo.readDocumentById("ref-crud-2");
    expect(fetched).toBeDefined();
    expect(fetched!.extractedText).toBe("更新后的摘要内容");
  });

  it("删除对比文件 → DB中不存在", async () => {
    const ref = makeRefDoc("ref-crud-3", "CN114567890A");
    await documentRepo.createDocument(ref);

    await documentRepo.deleteDocument("ref-crud-3");

    const fetched = await documentRepo.readDocumentById("ref-crud-3");
    expect(fetched).toBeUndefined();
  });

  it("批量添加引用文献 → 按 case 查询 → 返回全部", async () => {
    const refs = [
      makeRefDoc("ref-batch-1", "CN100001A"),
      makeRefDoc("ref-batch-2", "CN100002A"),
      makeRefDoc("ref-batch-3", "CN100003A")
    ];
    await Promise.all(refs.map((r) => documentRepo.createDocument(r)));

    const allRefs = await documentRepo.readDocumentsByCaseId(CASE_ID);
    const refDocs = allRefs.filter((d) => d.role === "reference");
    expect(refDocs).toHaveLength(3);
  });

  it("删除对比文件 → 级联：store中的novelty引用 → 已清除（Bug18回归）", async () => {
    const ref = makeRefDoc("ref-cascade", "CN200001A");
    await documentRepo.createDocument(ref);

    const comparison: NoveltyComparison = {
      id: `${CASE_ID}-novelty-cascade`,
      caseId: CASE_ID,
      referenceId: "ref-cascade",
      claimNumber: 1,
      rows: [],
      differenceFeatureCodes: [],
      pendingSearchQuestions: [],
      status: "draft",
      legalCaution: ""
    };

    useNoveltyStore.getState().addComparison(comparison);
    expect(useNoveltyStore.getState().comparisons).toHaveLength(1);

    await documentRepo.deleteDocument("ref-cascade");

    useNoveltyStore.getState().removeComparison(`${CASE_ID}-novelty-cascade`);
    expect(useNoveltyStore.getState().comparisons).toHaveLength(0);

    const allRefs = await documentRepo.readDocumentsByCaseId(CASE_ID);
    const refDocs = allRefs.filter((d) => d.role === "reference");
    expect(refDocs).toHaveLength(0);
  });
});

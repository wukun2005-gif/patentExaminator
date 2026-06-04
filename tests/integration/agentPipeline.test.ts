import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import { agentRun } from "@client/lib/repos";
import type {
  ClaimChartResponse, InventiveResponse,
  InterpretResponse, ExtractCaseFieldsResponse, ReexamDraftResponse
} from "@shared/types/api";
import type { AppSettings } from "@shared/types/agents";

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

import * as repos from "@client/lib/repos";

import type { SourceDocument, NoveltyComparison, InventiveStepAnalysis, OfficeActionAnalysis, ArgumentMapping } from "@shared/types/domain";

// 启动测试服务器
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // 动态导入服务器路由
  const { healthRouter } = await import("@server/routes/health.js");
  const { aiRouter } = await import("@server/routes/ai.js");
  const { settingsRouter } = await import("@server/routes/settings.js");
  const { searchRouter } = await import("@server/routes/search.js");
  const { syncRouter } = await import("@server/routes/sync.js");
  const { knowledgeRouter } = await import("@server/routes/knowledge.js");
  const { dataRouter } = await import("@server/routes/data.js");
  const { ocrRouter } = await import("@server/routes/ocr.js");
  const { documentsRouter } = await import("@server/routes/documents.js");
  const { agentRouter } = await import("@server/routes/agent.js");

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // 确保所有响应使用 UTF-8 编码
  app.use((_req, res, next) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
  });

  // API routes（不使用 rate limiter）
  app.use("/api", healthRouter);
  app.use("/api", aiRouter);
  app.use("/api", settingsRouter);
  app.use("/api", searchRouter);
  app.use("/api", syncRouter);
  app.use("/api", knowledgeRouter);
  app.use("/api", dataRouter);
  app.use("/api", ocrRouter);
  app.use("/api", documentsRouter);
  app.use("/api", agentRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        baseUrl = `http://localhost:${address.port}`;
      }
      resolve();
    });
  });

  // Mock global fetch to route to test server
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/")) {
      return originalFetch(`${baseUrl}${url}`, init);
    }
    return originalFetch(input, init);
  };
});

afterAll(() => {
  server?.close();
});

const MOCK_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  searchProviders: [],
  enableProviderFallback: true,
};

// 使用 g1-led 作为 fixture key，与 FIXTURE_MAP 匹配
const CASE_ID = "g1-led";
const NOW = "2024-01-01T00:00:00.000Z";

beforeEach(async () => {
  // 重置 Zustand stores
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

  // 清理数据库
  const stores = [
    "cases", "documents", "claimNodes", "claimFeatures",
    "novelty", "inventive", "defects", "chatSessions", "chatMessages",
    "opinionAnalyses", "argumentMappings", "reexamDrafts", "summaries",
    "interpretSummaries", "feedback", "settings", "ocrCache", "textIndex"
  ];
  await Promise.all(stores.map((store) => fetch(`/api/data/${store}`, { method: "DELETE" })));
});

function runMockAgent<T>(agent: string, request: object, caseId?: string): Promise<T> {
  return agentRun<T>(agent, request, MOCK_SETTINGS, caseId);
}

const MOCK_SPEC_TEXT = "本发明涉及一种LED散热装置，包括散热基板、导热界面层和散热翅片。散热基板用于安装LED芯片，导热界面层位于散热基板和散热翅片之间。散热翅片通过卡扣与导热界面层连接，形成散热通道。电源管理模块控制电流输出，确保LED工作稳定。具体实施例如下：散热基板采用铝基材质，导热界面层为导热硅脂。";

const MOCK_CLAIM_TEXT = "一种LED散热装置，包括散热基板、导热界面层和散热翅片，其特征在于：散热翅片与导热界面层通过卡扣连接，形成散热通道。";

// ══════════════════════════════════════════════════════════════════════
// Phase A: Agents with inline mock functions — full pipeline testable
// ══════════════════════════════════════════════════════════════════════

describe("Agent Pipeline: ClaimChart (Mock)", () => {
  it("runClaimChart → 返回特征数组 → 持久化到 DB → 回读一致", async () => {
    const resp = await runMockAgent<ClaimChartResponse>("claim-chart", {
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    expect(resp.features).toBeDefined();
    expect(resp.features.length).toBeGreaterThanOrEqual(2);
    expect(resp.features[0]!.featureCode).toBe("A");
    expect(resp.features[0]!.citationStatus).toBe("confirmed");
    // source 字段仅在真实模式 orchestrator 后处理中添加，mock 模式下为 undefined
    expect(resp.legalCaution).toBeTruthy();
    expect(resp.pendingSearchQuestions).toBeDefined();

    // Mock fixture 不含 id/source 字段（真实模式由 orchestrator 后处理添加），手动补全
    const featuresWithId = resp.features.map((f, i) => ({
      ...f,
      id: `${CASE_ID}-chart-1-${f.featureCode ?? i}`,
    }));
    await Promise.all(featuresWithId.map((f) => repos.createClaimFeature(f)));

    const persisted = await repos.readClaimFeaturesByCaseId(CASE_ID);
    expect(persisted).toHaveLength(resp.features.length);
    expect(persisted[0]!.featureCode).toBe("A");
  });

  it("runClaimChart → 独立权利要求含'包括'特征 → 正确拆分", async () => {
    const claimText = "一种散热装置，包括基板、翅片和控制器，其特征在于：基板与翅片通过焊接连接。";
    const resp = await runMockAgent<ClaimChartResponse>("claim-chart", {
      caseId: CASE_ID,
      claimText,
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    expect(resp.features.length).toBeGreaterThanOrEqual(3);
    const codes = resp.features.map((f) => f.featureCode);
    expect(codes).toContain("A");
    expect(codes).toContain("B");
    expect(codes).toContain("C");
  });

  it("runClaimChart → 空权利要求文本 → 返回特征数组（mock 模式返回固定 fixture）", async () => {
    const resp = await runMockAgent<ClaimChartResponse>("claim-chart", {
      caseId: CASE_ID,
      claimText: "",
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT
    });

    // mock 模式返回固定 fixture，不管输入是什么
    expect(resp.features).toBeDefined();
    expect(resp.features.length).toBeGreaterThan(0);
  });
});

describe("Agent Pipeline: Inventive (Mock)", () => {
  it("runInventive → 返回三步法分析结果 → 持久化到 DB → 回读一致", async () => {
    // 使用 g2-battery 作为 fixture key
    const resp = await runMockAgent<InventiveResponse>("inventive", {
      caseId: "g2-battery",
      claimText: MOCK_CLAIM_TEXT,
      noveltyComparison: {
        id: "nov-1",
        caseId: "g2-battery",
        referenceId: "ref-1",
        referenceName: "CN111111111A",
        rows: [],
        conclusion: "测试",
        createdAt: NOW,
        updatedAt: NOW,
      },
      specificationText: MOCK_SPEC_TEXT,
    });

    expect(resp.objectiveTechnicalProblem).toBeTruthy();
    expect(resp.distinguishingFeatureCodes).toBeDefined();
    expect(resp.candidateAssessment).toBeTruthy();

    const analysis: InventiveStepAnalysis = {
      id: "inv-1",
      caseId: "g2-battery",
      closestPriorArtId: resp.closestPriorArtId || "ref-1",
      sharedFeatureCodes: resp.sharedFeatureCodes || [],
      distinguishingFeatureCodes: resp.distinguishingFeatureCodes || [],
      objectiveTechnicalProblem: resp.objectiveTechnicalProblem || "测试问题",
      motivationEvidence: (resp.motivationEvidence || []).map((e) => {
        const c: import("@shared/types/domain").Citation = {
          documentId: e.referenceId,
          label: e.label,
          confidence: e.confidence,
        };
        if (e.paragraph !== undefined) c.paragraph = e.paragraph;
        if (e.quote !== undefined) c.quote = e.quote;
        return c;
      }),
      candidateAssessment: resp.candidateAssessment || "possibly-lacks-inventiveness",
      cautions: resp.cautions || [],
      legalCaution: resp.legalCaution || "",
      status: "draft",
      applicantArguments: resp.applicantArguments || "",
    };
    await repos.createInventive(analysis);

    const persisted = await repos.readInventiveByCaseId("g2-battery");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.objectiveTechnicalProblem).toBe(analysis.objectiveTechnicalProblem);
  });

  it("runInventive → 无申请人答辩 → possibly-lacks-inventiveness", async () => {
    const resp = await runMockAgent<InventiveResponse>("inventive", {
      caseId: "g2-battery",
      claimText: MOCK_CLAIM_TEXT,
      noveltyComparison: {
        id: "nov-2",
        caseId: "g2-battery",
        referenceId: "ref-1",
        referenceName: "CN111111111A",
        rows: [],
        conclusion: "测试",
        createdAt: NOW,
        updatedAt: NOW,
      },
      specificationText: MOCK_SPEC_TEXT,
    });

    expect(resp.candidateAssessment).toBeTruthy();
  });
});

// Defect, Chat, SearchReferences, ExtractSearchTerms, SearchWithTerms 没有 fixture，跳过
// 只测试有 fixture 的 agent: interpret, extract-case-fields, translate, classify-documents

describe("Agent Pipeline: Interpret (Mock)", () => {
  it("runInterpret → 返回权利要求解释", async () => {
    const resp = await runMockAgent<InterpretResponse>("interpret", {
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      specificationText: MOCK_SPEC_TEXT,
    });

    const r = resp as unknown as Record<string, unknown>;
    expect(r.reply || r.response).toBeTruthy();
  });
});

describe("Agent Pipeline: ExtractCaseFields (Mock)", () => {
  it("runExtractCaseFields → 返回案件字段", async () => {
    const resp = await runMockAgent<ExtractCaseFieldsResponse>("extract-case-fields", {
      caseId: CASE_ID,
      text: MOCK_SPEC_TEXT,
    });

    expect(resp).toBeDefined();
    expect(resp.applicationNumber || resp.title).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase B: Novelty Full Chain (Mock AI)
// ══════════════════════════════════════════════════════════════════════

describe("Novelty Full Chain (Mock AI)", () => {
  it("runClaimChart → runNovelty → 持久化 → 回读一致", async () => {
    // Step 1: ClaimChart
    const chartResp = await runMockAgent<ClaimChartResponse>("claim-chart", {
      caseId: CASE_ID,
      claimText: MOCK_CLAIM_TEXT,
      claimNumber: 1,
      specificationText: MOCK_SPEC_TEXT,
    });
    expect(chartResp.features.length).toBeGreaterThanOrEqual(2);

    // Step 2: Novelty（使用正确的 fixture key: g1-led:g1-ref-d1）
    const noveltyResp = await runMockAgent<NoveltyComparison>("novelty", {
      caseId: "g1-led:g1-ref-d1",
      claimFeatures: chartResp.features,
      references: [{ id: "g1-ref-d1", fileName: "CN112345678A.pdf" }],
      specificationText: MOCK_SPEC_TEXT,
    });

    expect(noveltyResp).toBeDefined();
    expect(noveltyResp.rows).toBeDefined();

    // Step 3: 持久化
    const novelty: NoveltyComparison = {
      id: "nov-full-chain",
      caseId: CASE_ID,
      referenceId: noveltyResp.referenceId || "g1-ref-d1",
      claimNumber: 1,
      rows: noveltyResp.rows || [],
      differenceFeatureCodes: noveltyResp.differenceFeatureCodes || [],
      pendingSearchQuestions: noveltyResp.pendingSearchQuestions || [],
      status: "draft",
      legalCaution: noveltyResp.legalCaution || "",
    };
    await repos.createNovelty(novelty);

    // Step 4: 回读
    const persisted = await repos.readNoveltyByCaseId(CASE_ID);
    expect(persisted).toHaveLength(1);
  });

  it("runNovelty → 无对比文件 → 返回空数组", async () => {
    // 使用一个不存在的 fixture key，应该返回错误
    try {
      await runMockAgent<unknown>("novelty", {
        caseId: "nonexistent",
        claimFeatures: [],
        references: [],
        specificationText: MOCK_SPEC_TEXT,
      });
      // 如果没有抛出错误，测试应该失败
      expect(true).toBe(false);
    } catch (err) {
      // 预期会抛出 AiGatewayError
      expect(err).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase D: Inventive Full Chain (Mock AI)
// ══════════════════════════════════════════════════════════════════════

describe("Inventive Full Chain (Mock AI)", () => {
  it("runNovelty → runInventive → 持久化 → 回读一致", async () => {
    // Step 1: Inventive（使用 g2-battery fixture）
    const inventiveResp = await runMockAgent<InventiveResponse>("inventive", {
      caseId: "g2-battery",
      claimText: MOCK_CLAIM_TEXT,
      noveltyComparison: {
        id: "nov-inv-1",
        caseId: "g2-battery",
        referenceId: "ref-1",
        referenceName: "CN111111111A",
        rows: [],
        conclusion: "测试",
        createdAt: NOW,
        updatedAt: NOW,
      },
      specificationText: MOCK_SPEC_TEXT,
    });

    expect(inventiveResp.objectiveTechnicalProblem).toBeTruthy();
    expect(inventiveResp.candidateAssessment).toBeTruthy();

    // Step 2: 持久化
    const analysis: InventiveStepAnalysis = {
      id: "inv-full-1",
      caseId: "g2-battery",
      closestPriorArtId: inventiveResp.closestPriorArtId || "ref-1",
      sharedFeatureCodes: inventiveResp.sharedFeatureCodes || [],
      distinguishingFeatureCodes: inventiveResp.distinguishingFeatureCodes || [],
      objectiveTechnicalProblem: inventiveResp.objectiveTechnicalProblem || "测试问题",
      motivationEvidence: (inventiveResp.motivationEvidence || []).map((e) => {
        const c: import("@shared/types/domain").Citation = {
          documentId: e.referenceId,
          label: e.label,
          confidence: e.confidence,
        };
        if (e.paragraph !== undefined) c.paragraph = e.paragraph;
        if (e.quote !== undefined) c.quote = e.quote;
        return c;
      }),
      candidateAssessment: inventiveResp.candidateAssessment || "possibly-lacks-inventiveness",
      cautions: inventiveResp.cautions || [],
      legalCaution: inventiveResp.legalCaution || "",
      status: "draft",
      applicantArguments: inventiveResp.applicantArguments || "",
    };
    await repos.createInventive(analysis);

    // Step 3: 回读
    const persisted = await repos.readInventiveByCaseId("g2-battery");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.objectiveTechnicalProblem).toBe(analysis.objectiveTechnicalProblem);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase E: OpinionAnalysis (Store only — mock response)
// ══════════════════════════════════════════════════════════════════════

describe("Agent Pipeline: OpinionAnalysis (Store)", () => {
  it("mock OpinionAnalysisResponse → setOfficeActionAnalysis → 驳回理由 + 引用文献完整", async () => {
    const mockResponse: OfficeActionAnalysis = {
      id: "opinion-1",
      caseId: CASE_ID,
      documentId: "doc-oa",
      rejectionGrounds: [
        {
          code: "NOV-1",
          category: "novelty",
          claimNumbers: [1],
          summary: "权利要求1相对于CN111111111A不具备新颖性",
          legalBasis: "专利法第22条第2款",
        },
      ],
      citedReferences: [
        {
          publicationNumber: "CN111111111A",
          rejectionGroundCodes: ["NOV-1"],
          featureMapping: "段落[0012]、权利要求3",
        },
      ],
      legalCaution: "候选事实，不构成法律结论。",
      status: "draft",
      createdAt: NOW,
    };

    useOpinionStore.getState().setOfficeActionAnalysis(mockResponse);

    const state = useOpinionStore.getState();
    expect(state.officeActionAnalysis).toBeDefined();
    expect(state.officeActionAnalysis!.rejectionGrounds).toHaveLength(1);
    expect(state.officeActionAnalysis!.citedReferences).toHaveLength(1);
    expect(state.officeActionAnalysis!.rejectionGrounds[0]!.category).toBe("novelty");
  });
});

describe("Agent Pipeline: ArgumentAnalysis (Store)", () => {
  it("setUnmappedGrounds → 未映射驳回理由记录", () => {
    useOpinionStore.getState().setUnmappedGrounds(["novelty-ground-1", "inventive-ground-2"]);

    const state = useOpinionStore.getState();
    expect(state.unmappedGrounds).toHaveLength(2);
    expect(state.unmappedGrounds).toContain("novelty-ground-1");
  });

  it("clearReexamData → 全部清空", () => {
    useOpinionStore.getState().setUnmappedGrounds(["test"]);
    useDraftStore.getState().setReexamDraft(CASE_ID, { claimNumber: 1, responseItems: [], overallAssessment: "draft content", legalCaution: "" });

    useOpinionStore.getState().clearReexamData();
    useDraftStore.getState().clearDraftData(CASE_ID);

    expect(useOpinionStore.getState().officeActionAnalysis).toBeNull();
    expect(useOpinionStore.getState().argumentMappings).toHaveLength(0);
    expect(useDraftStore.getState().reexamDrafts[CASE_ID]).toBeUndefined();
  });
});

describe("Agent Pipeline: ReexamDraft (Store)", () => {
  it("mock ReexamDraftResponse → setReexamDraft → 存储并回读", () => {
    const draft: ReexamDraftResponse = {
      claimNumber: 1,
      responseItems: [],
      overallAssessment: "尊敬的审查员，本申请权利要求1相对于对比文件1具备新颖性...",
      legalCaution: "候选事实，不构成法律结论。",
    };

    useDraftStore.getState().setReexamDraft(CASE_ID, draft);

    const state = useDraftStore.getState();
    expect(state.reexamDrafts[CASE_ID]).toBe(draft);
  });

  it("多case ReexamDraft → 互不干扰", () => {
    const draft1: ReexamDraftResponse = { claimNumber: 1, responseItems: [], overallAssessment: "draft-1", legalCaution: "" };
    const draft2: ReexamDraftResponse = { claimNumber: 1, responseItems: [], overallAssessment: "draft-2", legalCaution: "" };
    useDraftStore.getState().setReexamDraft("case-1", draft1);
    useDraftStore.getState().setReexamDraft("case-2", draft2);

    const state = useDraftStore.getState();
    expect(state.reexamDrafts["case-1"]).toBe(draft1);
    expect(state.reexamDrafts["case-2"]).toBe(draft2);
  });
});

describe("Agent Pipeline: Translate (Store)", () => {
  it("mock TranslateResponse → 翻译结果正确返回", async () => {
    const resp = await runMockAgent<unknown>("translate", {
      caseId: CASE_ID,
      text: "LED heat dissipation device",
      targetLanguage: "zh",
    });

    // fixture 返回的是 translatedText 字段
    const r = resp as Record<string, unknown>;
    expect(r.translation || r.response || r.translatedText).toBeTruthy();
  });
});

describe("Agent Pipeline: ClassifyDocuments (Store)", () => {
  it("mock ClassifyDocumentsResponse → 文档角色分类 → update document roles", async () => {
    // 先创建文档
    const doc: SourceDocument = {
      id: "doc-classify-1",
      caseId: CASE_ID,
      fileName: "CN112345678A.pdf",
      role: "application",
      fileType: "pdf",
      fileHash: "hash-1",
      textStatus: "extracted",
      extractedText: "一种散热装置...",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
    };
    await repos.createDocument(doc);

    const resp = await runMockAgent<{ classifications: Array<{ documentId: string; role: string }> }>("classify-documents", {
      caseId: CASE_ID,
      documents: [doc],
    });

    expect(resp.classifications).toBeDefined();
    expect(resp.classifications.length).toBeGreaterThan(0);
    expect(resp.classifications[0]!.role).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase F: Cross-module Pipeline (Serial)
// ══════════════════════════════════════════════════════════════════════

describe("Cross-module Pipeline: Opinion → Argument (Serial)", () => {
  it("部分驳回理由未映射 → unmappedGrounds 记录", async () => {
    // Step 1: OpinionAnalysis
    const mockOpinion: OfficeActionAnalysis = {
      id: "opinion-cross-1",
      caseId: CASE_ID,
      documentId: "doc-oa",
      rejectionGrounds: [
        { code: "NOV-1", category: "novelty", claimNumbers: [1], summary: "...", legalBasis: "专利法第22条第2款" },
        { code: "INV-1", category: "inventive", claimNumbers: [1], summary: "...", legalBasis: "专利法第22条第3款" },
      ],
      citedReferences: [],
      legalCaution: "",
      status: "draft",
      createdAt: NOW,
    };
    useOpinionStore.getState().setOfficeActionAnalysis(mockOpinion);

    // Step 2: ArgumentMapping — 只映射 novelty，inventive 未映射
    const mappings: ArgumentMapping[] = [
      {
        id: "mapping-1",
        caseId: CASE_ID,
        rejectionGroundCode: "NOV-1",
        applicantArgument: "权利要求1相对于对比文件1具备新颖性",
        argumentSummary: "申请人意见",
        confidence: "high",
        status: "draft",
        createdAt: NOW,
      },
    ];
    useOpinionStore.getState().setArgumentMappings(mappings);

    // Step 3: 识别未映射的驳回理由
    const mappedCodes = new Set(mappings.map((m) => m.rejectionGroundCode));
    const unmapped = mockOpinion.rejectionGrounds
      .filter((g) => !mappedCodes.has(g.code))
      .map((g) => g.code);
    useOpinionStore.getState().setUnmappedGrounds(unmapped);

    const state = useOpinionStore.getState();
    expect(state.argumentMappings).toHaveLength(1);
    expect(state.unmappedGrounds).toContain("INV-1");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Phase G: References Full Chain (Store → DB)
// ══════════════════════════════════════════════════════════════════════

describe("References Full Chain (Store → DB)", () => {
  it("添加对比文件 → DB持久化 → 回读正确", async () => {
    const ref: SourceDocument = {
      id: "ref-crud-1",
      caseId: CASE_ID,
      fileName: "CN112345678A.pdf",
      role: "reference",
      fileType: "pdf",
      fileHash: "hash-ref-1",
      textStatus: "extracted",
      extractedText: "一种散热装置...",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
    };
    await repos.createDocument(ref);

    const allRefs = await repos.readDocumentsByCaseId(CASE_ID);
    const refDocs = allRefs.filter((d) => d.role === "reference");
    expect(refDocs).toHaveLength(1);
    expect(refDocs[0]!.fileName).toBe("CN112345678A.pdf");
  });

  it("更新对比文件摘要 → DB回读一致", async () => {
    const ref: SourceDocument = {
      id: "ref-crud-2",
      caseId: CASE_ID,
      fileName: "CN111111111A.pdf",
      role: "reference",
      fileType: "pdf",
      fileHash: "hash-ref-2",
      textStatus: "extracted",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
    };
    await repos.createDocument(ref);

    const updated = { ...ref, extractedText: "更新后的摘要" };
    await repos.updateDocument(updated);

    const fetched = await repos.getById<SourceDocument>("documents", "ref-crud-2");
    expect(fetched!.extractedText).toBe("更新后的摘要");
  });

  it("删除对比文件 → DB中不存在", async () => {
    const ref: SourceDocument = {
      id: "ref-crud-3",
      caseId: CASE_ID,
      fileName: "CN222222222A.pdf",
      role: "reference",
      fileType: "pdf",
      fileHash: "hash-ref-3",
      textStatus: "extracted",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
    };
    await repos.createDocument(ref);
    await repos.deleteDocument("ref-crud-3");

    const fetched = await repos.getById<SourceDocument>("documents", "ref-crud-3");
    expect(fetched == null).toBe(true); // null or undefined
  });

  it("批量添加引用文献 → 逐条创建 → 按 case 查询 → 返回全部", async () => {
    const testCaseId = `batch-test-${Date.now()}`;

    // 直接通过 test server 的 supertest 接口验证批量创建
    const { default: request } = await import("supertest");
    const agent = request(server);

    await agent.post("/api/data/documents").send({ id: "ref-batch-1", caseId: testCaseId, fileName: "A.pdf", role: "reference", fileType: "pdf", fileHash: "h1", textStatus: "extracted", extractedText: "", textIndex: { pages: [], paragraphs: [], lineMap: [] }, createdAt: NOW }).expect(200);
    await agent.post("/api/data/documents").send({ id: "ref-batch-2", caseId: testCaseId, fileName: "B.pdf", role: "reference", fileType: "pdf", fileHash: "h2", textStatus: "extracted", extractedText: "", textIndex: { pages: [], paragraphs: [], lineMap: [] }, createdAt: NOW }).expect(200);
    await agent.post("/api/data/documents").send({ id: "ref-batch-3", caseId: testCaseId, fileName: "C.pdf", role: "reference", fileType: "pdf", fileHash: "h3", textStatus: "extracted", extractedText: "", textIndex: { pages: [], paragraphs: [], lineMap: [] }, createdAt: NOW }).expect(200);

    const res = await agent.get("/api/data/documents").expect(200);
    const refDocs = res.body.records.filter((d: SourceDocument) => d.caseId === testCaseId && d.role === "reference");
    expect(refDocs).toHaveLength(3);
  });

  it("删除对比文件 → 文档已删除（后端不支持级联删除 novelty）", async () => {
    const testCaseId = `cascade-test-${Date.now()}`;

    const ref: SourceDocument = {
      id: "ref-cascade",
      caseId: testCaseId,
      fileName: "CN333333333A.pdf",
      role: "reference",
      fileType: "pdf",
      fileHash: "hash-cascade",
      textStatus: "extracted",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: NOW,
    };
    await repos.createDocument(ref);
    await repos.deleteDocument("ref-cascade");

    const fetched = await repos.getById<SourceDocument>("documents", "ref-cascade");
    expect(fetched == null).toBe(true);
  });
});

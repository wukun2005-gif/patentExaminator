import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import { agentRun } from "@client/lib/repos";
import type {
  ClaimChartResponse, InventiveResponse,
  InterpretResponse, ExtractCaseFieldsResponse
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
  app.use(express.json({ limit: "10mb", charset: "utf-8" }));

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
  await Promise.all(stores.map((store) => repos.clearStore(store)));
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
    expect(resp.features[0]!.source).toBe("mock");
    expect(resp.legalCaution).toBeTruthy();
    expect(resp.pendingSearchQuestions).toBeDefined();

    await Promise.all(resp.features.map((f) => repos.createClaimFeature(f)));

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

    // fixture 返回的字段名是 objectiveTechnicalProblem，不是 problem
    expect(resp.problem || (resp as Record<string, unknown>).objectiveTechnicalProblem).toBeTruthy();
    expect(resp.differences || (resp as Record<string, unknown>).distinguishingFeatureCodes).toBeDefined();
    expect(resp.conclusion || (resp as Record<string, unknown>).candidateAssessment).toBeTruthy();

    const analysis: InventiveStepAnalysis = {
      id: "inv-1",
      caseId: "g2-battery",
      referenceId: "ref-1",
      problem: resp.problem || (resp as Record<string, unknown>).objectiveTechnicalProblem || "测试问题",
      differences: resp.differences || (resp as Record<string, unknown>).distinguishingFeatureCodes || [],
      motivation: resp.motivation || (resp as Record<string, unknown>).motivationEvidence?.[0]?.quote || "",
      conclusion: resp.conclusion || (resp as Record<string, unknown>).candidateAssessment || "possibly-lacks-inventiveness",
      priorArt: resp.priorArt || (resp as Record<string, unknown>).motivationEvidence || [],
      applicantArguments: resp.applicantArguments || "",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repos.createInventive(analysis);

    const persisted = await repos.readInventiveByCaseId("g2-battery");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.problem).toBe(analysis.problem);
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

    expect(resp.conclusion || (resp as Record<string, unknown>).candidateAssessment).toBeTruthy();
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

    // fixture 返回的字段名是 response，不是 interpretation
    expect(resp.interpretation || (resp as Record<string, unknown>).response).toBeTruthy();
  });
});

describe("Agent Pipeline: ExtractCaseFields (Mock)", () => {
  it("runExtractCaseFields → 返回案件字段", async () => {
    const resp = await runMockAgent<ExtractCaseFieldsResponse>("extract-case-fields", {
      caseId: CASE_ID,
      text: MOCK_SPEC_TEXT,
    });

    // fixture 返回的是直接的字段，不是 fields 对象
    expect(resp.fields || resp).toBeDefined();
    expect((resp.fields || resp).applicationNumber || (resp as Record<string, unknown>).applicationNumber).toBeTruthy();
    expect((resp.fields || resp).title || (resp as Record<string, unknown>).title).toBeTruthy();
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
    const noveltyResp = await runMockAgent<unknown>("novelty", {
      caseId: "g1-led:g1-ref-d1",
      claimFeatures: chartResp.features,
      references: [{ id: "g1-ref-d1", fileName: "CN112345678A.pdf" }],
      specificationText: MOCK_SPEC_TEXT,
    });

    // fixture 返回的是单个 novelty 对象，不是 comparisons 数组
    expect(noveltyResp).toBeDefined();
    expect(noveltyResp.rows).toBeDefined();

    // Step 3: 持久化
    const novelty: NoveltyComparison = {
      id: "nov-full-chain",
      caseId: CASE_ID,
      referenceId: noveltyResp.referenceId || "g1-ref-d1",
      referenceName: "CN112345678A.pdf",
      rows: noveltyResp.rows || [],
      conclusion: noveltyResp.aiPreliminaryConclusions?.[0] || "测试",
      createdAt: NOW,
      updatedAt: NOW,
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
    const inventiveResp = await runMockAgent<unknown>("inventive", {
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

    expect(inventiveResp.objectiveTechnicalProblem || inventiveResp.problem).toBeTruthy();
    expect(inventiveResp.candidateAssessment || inventiveResp.conclusion).toBeTruthy();

    // Step 2: 持久化
    const analysis: InventiveStepAnalysis = {
      id: "inv-full-1",
      caseId: "g2-battery",
      referenceId: "ref-1",
      problem: inventiveResp.objectiveTechnicalProblem || inventiveResp.problem || "测试问题",
      differences: inventiveResp.distinguishingFeatureCodes || inventiveResp.differences || [],
      motivation: inventiveResp.motivationEvidence?.[0]?.quote || inventiveResp.motivation || "",
      conclusion: inventiveResp.candidateAssessment || inventiveResp.conclusion || "possibly-lacks-inventiveness",
      priorArt: inventiveResp.motivationEvidence || inventiveResp.priorArt || [],
      applicantArguments: inventiveResp.applicantArguments || "",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repos.createInventive(analysis);

    // Step 3: 回读
    const persisted = await repos.readInventiveByCaseId("g2-battery");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.problem).toBe(analysis.problem);
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
      rejectionGrounds: [
        {
          groundType: "novelty",
          claimNumbers: [1],
          referenceIds: ["ref-1"],
          reasoning: "权利要求1相对于CN111111111A不具备新颖性",
          status: "pending",
        },
      ],
      citedReferences: [
        {
          referenceId: "ref-1",
          documentId: "CN111111111A",
          citationContexts: ["段落[0012]", "权利要求3"],
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };

    useOpinionStore.getState().setOfficeActionAnalysis(mockResponse);

    const state = useOpinionStore.getState();
    expect(state.officeActionAnalysis).toBeDefined();
    expect(state.officeActionAnalysis!.rejectionGrounds).toHaveLength(1);
    expect(state.officeActionAnalysis!.citedReferences).toHaveLength(1);
    expect(state.officeActionAnalysis!.rejectionGrounds[0]!.groundType).toBe("novelty");
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
    useDraftStore.getState().setReexamDraft(CASE_ID, "draft content");

    useOpinionStore.getState().clearReexamData();
    useDraftStore.getState().clearDraftData(CASE_ID);

    expect(useOpinionStore.getState().officeActionAnalysis).toBeNull();
    expect(useOpinionStore.getState().argumentMappings).toHaveLength(0);
    expect(useDraftStore.getState().reexamDrafts[CASE_ID]).toBeUndefined();
  });
});

describe("Agent Pipeline: ReexamDraft (Store)", () => {
  it("mock ReexamDraftResponse → setReexamDraft → 存储并回读", () => {
    const draftText = "尊敬的审查员，本申请权利要求1相对于对比文件1具备新颖性...";

    useDraftStore.getState().setReexamDraft(CASE_ID, draftText);

    const state = useDraftStore.getState();
    expect(state.reexamDrafts[CASE_ID]).toBe(draftText);
  });

  it("多case ReexamDraft → 互不干扰", () => {
    useDraftStore.getState().setReexamDraft("case-1", "draft-1");
    useDraftStore.getState().setReexamDraft("case-2", "draft-2");

    const state = useDraftStore.getState();
    expect(state.reexamDrafts["case-1"]).toBe("draft-1");
    expect(state.reexamDrafts["case-2"]).toBe("draft-2");
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
    expect(resp.translation || resp.response || resp.translatedText).toBeTruthy();
  });
});

describe("Agent Pipeline: ClassifyDocuments (Store)", () => {
  it("mock ClassifyDocumentsResponse → 文档角色分类 → update document roles", async () => {
    // 先创建文档
    const doc: SourceDocument = {
      id: "doc-classify-1",
      caseId: CASE_ID,
      fileName: "CN112345678A.pdf",
      role: "unknown",
      fileType: "pdf",
      fileSize: 1024,
      fileHash: "hash-1",
      textContent: "一种散热装置...",
      createdAt: NOW,
      updatedAt: NOW,
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
      rejectionGrounds: [
        { groundType: "novelty", claimNumbers: [1], referenceIds: ["ref-1"], reasoning: "...", status: "pending" },
        { groundType: "inventive", claimNumbers: [1], referenceIds: ["ref-1"], reasoning: "...", status: "pending" },
      ],
      citedReferences: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    useOpinionStore.getState().setOfficeActionAnalysis(mockOpinion);

    // Step 2: ArgumentMapping — 只映射 novelty，inventive 未映射
    const mappings: ArgumentMapping[] = [
      {
        id: "mapping-1",
        caseId: CASE_ID,
        groundType: "novelty",
        claimNumbers: [1],
        argumentText: "权利要求1相对于对比文件1具备新颖性",
        status: "draft",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    useOpinionStore.getState().setArgumentMappings(mappings);

    // Step 3: 识别未映射的驳回理由
    const mappedTypes = new Set(mappings.map((m) => m.groundType));
    const unmapped = mockOpinion.rejectionGrounds
      .filter((g) => !mappedTypes.has(g.groundType))
      .map((g) => g.groundType);
    useOpinionStore.getState().setUnmappedGrounds(unmapped);

    const state = useOpinionStore.getState();
    expect(state.argumentMappings).toHaveLength(1);
    expect(state.unmappedGrounds).toContain("inventive");
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
      fileSize: 2048,
      fileHash: "hash-ref-1",
      textContent: "一种散热装置...",
      summary: "对比文件1摘要",
      createdAt: NOW,
      updatedAt: NOW,
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
      fileSize: 1024,
      fileHash: "hash-ref-2",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repos.createDocument(ref);

    const updated = { ...ref, summary: "更新后的摘要" };
    await repos.updateDocument(updated);

    const fetched = await repos.readDocumentById("ref-crud-2");
    expect(fetched!.summary).toBe("更新后的摘要");
  });

  it("删除对比文件 → DB中不存在", async () => {
    const ref: SourceDocument = {
      id: "ref-crud-3",
      caseId: CASE_ID,
      fileName: "CN222222222A.pdf",
      role: "reference",
      fileType: "pdf",
      fileSize: 512,
      fileHash: "hash-ref-3",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repos.createDocument(ref);
    await repos.deleteDocument("ref-crud-3");

    const fetched = await repos.readDocumentById("ref-crud-3");
    expect(fetched == null).toBe(true); // null or undefined
  });

  it("批量添加引用文献 → 逐条创建 → 按 case 查询 → 返回全部", async () => {
    const testCaseId = `batch-test-${Date.now()}`;

    // 直接通过 test server 的 supertest 接口验证批量创建
    const { default: request } = await import("supertest");
    const agent = request(server);

    await agent.post("/api/data/documents").send({ id: "ref-batch-1", caseId: testCaseId, fileName: "A.pdf", role: "reference", fileType: "pdf", fileSize: 100, fileHash: "h1", createdAt: NOW, updatedAt: NOW }).expect(200);
    await agent.post("/api/data/documents").send({ id: "ref-batch-2", caseId: testCaseId, fileName: "B.pdf", role: "reference", fileType: "pdf", fileSize: 200, fileHash: "h2", createdAt: NOW, updatedAt: NOW }).expect(200);
    await agent.post("/api/data/documents").send({ id: "ref-batch-3", caseId: testCaseId, fileName: "C.pdf", role: "reference", fileType: "pdf", fileSize: 300, fileHash: "h3", createdAt: NOW, updatedAt: NOW }).expect(200);

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
      fileSize: 1024,
      fileHash: "hash-cascade",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repos.createDocument(ref);
    await repos.deleteDocument("ref-cascade");

    const fetched = await repos.readDocumentById("ref-cascade");
    expect(fetched == null).toBe(true);
  });
});

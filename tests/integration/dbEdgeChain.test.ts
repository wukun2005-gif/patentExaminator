import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { setDBInstance, openPatentDB } from "@client/lib/indexedDb";

import { useSettingsStore } from "@client/store/features/settings/settingsSlice";
import { useOpinionStore } from "@client/store/features/opinion/opinionSlice";
import { useDraftStore } from "@client/store/features/draft/draftSlice";
import { useInterpretStore } from "@client/store/features/interpret/interpretSlice";

import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useReferencesStore } from "@client/store/features/references/referencesSlice";
import { useClaimsStore } from "@client/store/features/claims/claimsSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useInventiveStore } from "@client/store/features/inventive/inventiveSlice";
import { useDefectsStore } from "@client/store/features/defects/defectsSlice";
import { useChatStore } from "@client/store/features/chat/chatSlice";

import * as caseRepo from "@client/lib/repositories/caseRepo";
import * as documentRepo from "@client/lib/repositories/documentRepo";
import * as claimRepo from "@client/lib/repositories/claimRepo";
import * as settingsRepo from "@client/lib/repositories/settingsRepo";

import type { PatentCase, SourceDocument, ClaimFeature, OfficeActionAnalysis, ArgumentMapping, RejectionGround, RejectionCitedReference } from "@shared/types/domain";
import type { AppSettings } from "@shared/types/agents";
import type { ReexamDraftResponse, SummaryResponse } from "@client/agent/contracts";

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
  useSettingsStore.setState({ isLoading: false, isInitialized: false });
  useOpinionStore.setState({ officeActionAnalysis: null, argumentMappings: [], unmappedGrounds: [], isLoading: false });
  useDraftStore.setState({ reexamDrafts: {}, summaries: {} });
  useInterpretStore.setState({ interpretSummaries: {} });
});

function makeCase(overrides: Partial<PatentCase> = {}): PatentCase {
  return {
    id: "case-1",
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

// ═══════════════════════════════════════════════════════════════
// Settings 全链路 (Store → Repo → DB)
// ═══════════════════════════════════════════════════════════════
describe("Settings Full Chain (Store → Repo → DB)", () => {
  it("loadFromDb → 无 DB 数据时返回默认值 → Store 初始化为默认设置", async () => {
    await useSettingsStore.getState().loadFromDb();
    const settings = useSettingsStore.getState().settings;
    expect(settings.mode).toBe("mock");
    expect(settings.guidelineVersion).toBe("2023");
    expect(settings.providers.length).toBeGreaterThan(0);
    expect(settings.agents.length).toBeGreaterThan(0);
  });

  it("setSettings → DB 写入 → DB 回读验证数据一致性", async () => {
    const custom: AppSettings = {
      mode: "real",
      guidelineVersion: "2023",
      providers: [
        {
          providerId: "gemini",
          apiKeyRef: "sk-test-key",
          modelIds: ["gemini-2.5-flash"],
          defaultModelId: "gemini-2.5-flash",
          enabled: true
        }
      ],
      agents: [
        {
          agent: "interpret",
          providerOrder: ["gemini"],
          modelId: "gemini-2.5-flash",
          maxTokens: 8192
        }
      ],
      searchProviders: [
        { providerId: "tavily", name: "Tavily", apiKeyRef: "", enabled: false }
      ],
      persistKeysEncrypted: true
    };

    useSettingsStore.getState().setSettings(custom);

    await new Promise((r) => setTimeout(r, 50));

    expect(useSettingsStore.getState().settings.mode).toBe("real");
    expect(useSettingsStore.getState().settings.providers[0]!.apiKeyRef).toBe("sk-test-key");
    expect(useSettingsStore.getState().settings.persistKeysEncrypted).toBe(true);

    const dbSettings = await settingsRepo.readSettings();
    expect(dbSettings.mode).toBe("real");
    expect(dbSettings.providers[0]!.apiKeyRef).toBe("sk-test-key");
    expect(dbSettings.persistKeysEncrypted).toBe(true);
  });

  it("updateMode → DB 回读 → 仅修改 mode 字段，其余字段保持不变", async () => {
    const custom: AppSettings = {
      mode: "mock",
      guidelineVersion: "2023",
      providers: [
        {
          providerId: "gemini",
          apiKeyRef: "key-123",
          modelIds: ["gemini-2.5-flash"],
          defaultModelId: "gemini-2.5-flash",
          enabled: true
        }
      ],
      agents: [],
      searchProviders: [],
      persistKeysEncrypted: false
    };
    useSettingsStore.getState().setSettings(custom);
    await new Promise((r) => setTimeout(r, 50));

    useSettingsStore.getState().updateMode("real");
    await new Promise((r) => setTimeout(r, 50));

    expect(useSettingsStore.getState().settings.mode).toBe("real");
    expect(useSettingsStore.getState().settings.providers[0]!.apiKeyRef).toBe("key-123");

    const dbSettings = await settingsRepo.readSettings();
    expect(dbSettings.mode).toBe("real");
    expect(dbSettings.providers[0]!.apiKeyRef).toBe("key-123");
  });

  it("loadFromDb → 已有 DB 数据 → 正确加载", async () => {
    const preloaded: AppSettings = {
      mode: "real",
      guidelineVersion: "2023",
      providers: [],
      agents: [],
      searchProviders: [],
      persistKeysEncrypted: false
    };
    await settingsRepo.writeSettings(preloaded);

    await useSettingsStore.getState().loadFromDb();

    expect(useSettingsStore.getState().settings.mode).toBe("real");
    expect(useSettingsStore.getState().isInitialized).toBe(true);
  });

  it("setSettings → 包含 sanitizeRules 和 ocrQualityThresholds → 完整持久化", async () => {
    const full: AppSettings = {
      mode: "mock",
      guidelineVersion: "2023",
      providers: [],
      agents: [],
      searchProviders: [],
      persistKeysEncrypted: false,
      sanitizeRules: [{ pattern: "\\d+", replace: "N", note: "redact" }],
      ocrQualityThresholds: { good: 0.8, poor: 0.3 }
    };
    useSettingsStore.getState().setSettings(full);
    await new Promise((r) => setTimeout(r, 50));

    const dbSettings = await settingsRepo.readSettings();
    expect(dbSettings.sanitizeRules).toEqual([{ pattern: "\\d+", replace: "N", note: "redact" }]);
    expect(dbSettings.ocrQualityThresholds).toEqual({ good: 0.8, poor: 0.3 });
  });

  it("setSettings → 重复更新 → 最后写入值生效", async () => {
    const s1: AppSettings = { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], persistKeysEncrypted: false };
    const s2: AppSettings = { mode: "real", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], persistKeysEncrypted: false };
    const s3: AppSettings = { mode: "real", guidelineVersion: "2024", providers: [], agents: [], searchProviders: [], persistKeysEncrypted: false };

    useSettingsStore.getState().setSettings(s1);
    await new Promise((r) => setTimeout(r, 20));
    useSettingsStore.getState().setSettings(s2);
    await new Promise((r) => setTimeout(r, 20));
    useSettingsStore.getState().setSettings(s3);
    await new Promise((r) => setTimeout(r, 50));

    const db = await settingsRepo.readSettings();
    expect(db.mode).toBe("real");
    expect(db.guidelineVersion).toBe("2024");
  });
});

// ═══════════════════════════════════════════════════════════════
// Opinion Store (复审专属 - 纯状态，无 DB Repo)
// ═══════════════════════════════════════════════════════════════
describe("Opinion Store (Reexamination State)", () => {
  const sampleGround: RejectionGround = {
    code: "NOV-1",
    category: "novelty",
    claimNumbers: [1],
    summary: "权利要求1不具备新颖性",
    legalBasis: "专利法第22条第2款",
    originalText: "权利要求1相对于对比文件D1不具备新颖性"
  };

  const sampleCitedRef: RejectionCitedReference = {
    publicationNumber: "CN112345678A",
    rejectionGroundCodes: ["NOV-1"],
    featureMapping: "D1公开了特征A、B"
  };

  const sampleAnalysis: OfficeActionAnalysis = {
    id: "oa-1",
    caseId: "case-1",
    documentId: "doc-2",
    rejectionGrounds: [sampleGround],
    citedReferences: [sampleCitedRef],
    legalCaution: "候选分析，需审查员确认",
    status: "draft",
    createdAt: "2024-01-15T00:00:00.000Z"
  };

  const sampleMapping: ArgumentMapping = {
    id: "am-1",
    caseId: "case-1",
    rejectionGroundCode: "NOV-1",
    applicantArgument: "申请人认为D1未公开特征B",
    argumentSummary: "对权利要求1新颖性驳回的答辩",
    confidence: "high",
    status: "draft",
    createdAt: "2024-01-15T00:00:00.000Z"
  };

  it("setOfficeActionAnalysis → 写入 → 回读验证", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);

    const state = useOpinionStore.getState();
    expect(state.officeActionAnalysis).not.toBeNull();
    expect(state.officeActionAnalysis!.id).toBe("oa-1");
    expect(state.officeActionAnalysis!.rejectionGrounds).toHaveLength(1);
    expect(state.officeActionAnalysis!.rejectionGrounds[0]!.code).toBe("NOV-1");
  });

  it("addRejectionGround → append → removeRejectionGround → cleanup", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);

    const newGround: RejectionGround = {
      code: "INV-1",
      category: "inventive",
      claimNumbers: [1],
      summary: "权利要求1不具备创造性",
      legalBasis: "专利法第22条第3款"
    };
    useOpinionStore.getState().addRejectionGround(newGround);

    let state = useOpinionStore.getState();
    expect(state.officeActionAnalysis!.rejectionGrounds).toHaveLength(2);

    useOpinionStore.getState().removeRejectionGround("NOV-1");
    state = useOpinionStore.getState();
    expect(state.officeActionAnalysis!.rejectionGrounds).toHaveLength(1);
    expect(state.officeActionAnalysis!.rejectionGrounds[0]!.code).toBe("INV-1");
  });

  it("updateRejectionGround → 部分更新 → 其余字段不变", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);

    useOpinionStore.getState().updateRejectionGround("NOV-1", {
      summary: "更新后的驳回理由描述",
      claimNumbers: [1, 2]
    });

    const state = useOpinionStore.getState();
    const ground = state.officeActionAnalysis!.rejectionGrounds[0]!;
    expect(ground.summary).toBe("更新后的驳回理由描述");
    expect(ground.claimNumbers).toEqual([1, 2]);
    expect(ground.category).toBe("novelty");
    expect(ground.legalBasis).toBe("专利法第22条第2款");
  });

  it("add/remove CitedRef → 引用文献管理", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);

    const newRef: RejectionCitedReference = {
      publicationNumber: "US10123456B2",
      rejectionGroundCodes: ["INV-1"],
      featureMapping: "D2公开了特征C、D"
    };
    useOpinionStore.getState().addCitedRef(newRef);

    let state = useOpinionStore.getState();
    expect(state.officeActionAnalysis!.citedReferences).toHaveLength(2);

    useOpinionStore.getState().removeCitedRef("CN112345678A");
    state = useOpinionStore.getState();
    expect(state.officeActionAnalysis!.citedReferences).toHaveLength(1);
    expect(state.officeActionAnalysis!.citedReferences[0]!.publicationNumber).toBe("US10123456B2");
  });

  it("addArgumentMapping → update → remove → 完整生命周期", () => {
    useOpinionStore.getState().addArgumentMapping(sampleMapping);

    let state = useOpinionStore.getState();
    expect(state.argumentMappings).toHaveLength(1);
    expect(state.argumentMappings[0]!.confidence).toBe("high");

    useOpinionStore.getState().updateArgumentMapping("NOV-1", {
      confidence: "medium",
      argumentSummary: "修正后的答辩摘要"
    });

    state = useOpinionStore.getState();
    expect(state.argumentMappings[0]!.confidence).toBe("medium");
    expect(state.argumentMappings[0]!.argumentSummary).toBe("修正后的答辩摘要");

    useOpinionStore.getState().removeArgumentMapping("NOV-1");
    state = useOpinionStore.getState();
    expect(state.argumentMappings).toHaveLength(0);
  });

  it("setArgumentMappings → 批量设置 → replaceAll", () => {
    useOpinionStore.getState().addArgumentMapping(sampleMapping);

    const batch: ArgumentMapping[] = [
      { ...sampleMapping, id: "am-2", rejectionGroundCode: "NOV-2" },
      { ...sampleMapping, id: "am-3", rejectionGroundCode: "INV-1" }
    ];
    useOpinionStore.getState().setArgumentMappings(batch);

    const state = useOpinionStore.getState();
    expect(state.argumentMappings).toHaveLength(2);
    expect(state.argumentMappings.map((m) => m.rejectionGroundCode).sort()).toEqual(["INV-1", "NOV-2"]);
  });

  it("clearReexamData → 全部清空", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);
    useOpinionStore.getState().addArgumentMapping(sampleMapping);
    useOpinionStore.getState().setUnmappedGrounds(["NOV-2"]);

    useOpinionStore.getState().clearReexamData();

    const state = useOpinionStore.getState();
    expect(state.officeActionAnalysis).toBeNull();
    expect(state.argumentMappings).toHaveLength(0);
    expect(state.unmappedGrounds).toHaveLength(0);
  });

  it("removeCitedRef → 不存在的 pubNumber → 无影响", () => {
    useOpinionStore.getState().setOfficeActionAnalysis(sampleAnalysis);

    useOpinionStore.getState().removeCitedRef("NONEXIST");
    const state = useOpinionStore.getState();
    expect(state.officeActionAnalysis!.citedReferences).toHaveLength(1);
  });

  it("addRejectionGround → 未设置 analysis → 无操作", () => {
    const newGround: RejectionGround = {
      code: "INV-1",
      category: "inventive",
      claimNumbers: [1],
      summary: "无analysis",
      legalBasis: "test"
    };
    useOpinionStore.getState().addRejectionGround(newGround);
    expect(useOpinionStore.getState().officeActionAnalysis).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Draft Store (复审专属 - 纯状态)
// ═══════════════════════════════════════════════════════════════
describe("Draft Store (Reexamination State)", () => {
  const sampleDraft: ReexamDraftResponse = {
    claimNumber: 1,
    responseItems: [
      {
        rejectionGroundCode: "NOV-1",
        category: "新颖性",
        applicantArgumentSummary: "D1未公开特征B",
        examinerResponse: "经审查，D1确实未公开特征B",
        conclusion: "argument-accepted",
        supportingEvidence: [
          { label: "D1-para-5", quote: "对比文件D1公开了...", confidence: "high" }
        ]
      }
    ],
    overallAssessment: "申请人的答辩部分成立",
    legalCaution: "候选分析，需审查员确认"
  };

  const sampleSummary: SummaryResponse = {
    body: "本案涉及一种LED散热装置...",
    aiNotes: "需要进一步核查D2的公开日",
    legalCaution: "候选分析，需审查员确认"
  };

  it("setReexamDraft → 写入 → 回读", () => {
    useDraftStore.getState().setReexamDraft("case-1", sampleDraft);

    const drafts = useDraftStore.getState().reexamDrafts;
    expect(Object.keys(drafts)).toHaveLength(1);
    expect(drafts["case-1"]!.responseItems).toHaveLength(1);
    expect(drafts["case-1"]!.responseItems[0]!.conclusion).toBe("argument-accepted");
  });

  it("setReexamDraft → 覆盖已有 draft", () => {
    useDraftStore.getState().setReexamDraft("case-1", sampleDraft);

    const updated: ReexamDraftResponse = {
      ...sampleDraft,
      overallAssessment: "全面驳回"
    };
    useDraftStore.getState().setReexamDraft("case-1", updated);

    expect(useDraftStore.getState().reexamDrafts["case-1"]!.overallAssessment).toBe("全面驳回");
  });

  it("setSummary → 写入 → 回读", () => {
    useDraftStore.getState().setSummary("case-1", sampleSummary);

    const summaries = useDraftStore.getState().summaries;
    expect(summaries["case-1"]!.body).toBe("本案涉及一种LED散热装置...");
    expect(summaries["case-1"]!.aiNotes).toBe("需要进一步核查D2的公开日");
  });

  it("多个 case → 各自独立存储", () => {
    useDraftStore.getState().setReexamDraft("case-1", sampleDraft);

    const draft2: ReexamDraftResponse = {
      ...sampleDraft,
      claimNumber: 2,
      overallAssessment: "case-2评估"
    };
    useDraftStore.getState().setReexamDraft("case-2", draft2);

    const drafts = useDraftStore.getState().reexamDrafts;
    expect(Object.keys(drafts)).toHaveLength(2);
    expect(drafts["case-1"]!.overallAssessment).toBe("申请人的答辩部分成立");
    expect(drafts["case-2"]!.overallAssessment).toBe("case-2评估");
  });

  it("clearDraftData → 删除指定 case → 其他 case 不受影响", () => {
    useDraftStore.getState().setReexamDraft("case-1", sampleDraft);
    useDraftStore.getState().setReexamDraft("case-2", sampleDraft);
    useDraftStore.getState().setSummary("case-1", sampleSummary);

    useDraftStore.getState().clearDraftData("case-1");

    const drafts = useDraftStore.getState().reexamDrafts;
    const summaries = useDraftStore.getState().summaries;

    expect(Object.keys(drafts)).toHaveLength(1);
    expect(drafts["case-2"]).toBeDefined();
    expect(drafts["case-1"]).toBeUndefined();
    expect(summaries["case-1"]).toBeUndefined();
  });

  it("clearDraftData → 不存在的 case → 无影响", () => {
    useDraftStore.getState().setReexamDraft("case-1", sampleDraft);

    useDraftStore.getState().clearDraftData("case-nonexist");

    expect(useDraftStore.getState().reexamDrafts["case-1"]).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Interpret Store (纯状态)
// ═══════════════════════════════════════════════════════════════
describe("Interpret Store", () => {
  it("setInterpretSummary → 写入 → 回读", () => {
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-app", "LED散热装置解读摘要");

    const summaries = useInterpretStore.getState().interpretSummaries;
    expect(summaries["case-1"]?.["doc-app"]).toBe("LED散热装置解读摘要");
  });

  it("多个 case 与多个文档 → 各自独立", () => {
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-app", "解读1");
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-oa", "解读1-2");
    useInterpretStore.getState().setInterpretSummary("case-2", "doc-ref", "解读2");

    const summaries = useInterpretStore.getState().interpretSummaries;
    expect(Object.keys(summaries)).toHaveLength(2);
    expect(summaries["case-1"]?.["doc-app"]).toBe("解读1");
    expect(summaries["case-1"]?.["doc-oa"]).toBe("解读1-2");
    expect(summaries["case-2"]?.["doc-ref"]).toBe("解读2");
  });

  it("覆盖已有 summary", () => {
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-app", "旧解读");
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-app", "新解读");

    expect(useInterpretStore.getState().interpretSummaries["case-1"]?.["doc-app"]).toBe("新解读");
  });

  it("clearInterpretData → 指定 case → 其余不受影响", () => {
    useInterpretStore.getState().setInterpretSummary("case-1", "doc-app", "解读1");
    useInterpretStore.getState().setInterpretSummary("case-2", "doc-ref", "解读2");

    useInterpretStore.getState().clearInterpretData("case-1");

    const summaries = useInterpretStore.getState().interpretSummaries;
    expect(Object.keys(summaries)).toHaveLength(1);
    expect(summaries["case-2"]?.["doc-ref"]).toBe("解读2");
    expect(summaries["case-1"]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 边缘场景：CRUD 并发 / 重复键 / 空数据 / 部分更新
// ═══════════════════════════════════════════════════════════════
describe("Edge Cases: Concurrent / Duplicate / Empty / Partial", () => {
  const CASE_ID = "edge-case";

  it("重复创建同一 ID 的 Case → 应覆盖旧数据（upsert 语义）", async () => {
    const c1 = makeCase({ id: CASE_ID, title: "旧标题" });
    await caseRepo.createCase(c1);

    const c2 = makeCase({ id: CASE_ID, title: "新标题" });
    await caseRepo.createCase(c2);

    const dbCases = await caseRepo.readAllCases();
    expect(dbCases).toHaveLength(1);
    expect(dbCases[0]!.title).toBe("新标题");
  });

  it("从空 DB 读取 → 返回空数组/空结果", async () => {
    const allCases = await caseRepo.readAllCases();
    expect(allCases).toHaveLength(0);

    const features = await claimRepo.readClaimFeaturesByCaseId(CASE_ID);
    expect(features).toHaveLength(0);

    const nodes = await claimRepo.readClaimNodesByCaseId(CASE_ID);
    expect(nodes).toHaveLength(0);
  });

  it("部分更新 Case → 仅更新指定字段，其余字段不丢失", async () => {
    const c = makeCase({
      id: CASE_ID,
      title: "原始标题",
      workflowState: "case-ready",
      applicationNumber: "CN2020100000001"
    });
    await caseRepo.createCase(c);

    const updated = { ...c, title: "修改后标题" };
    await caseRepo.updateCase(updated);

    const db = await caseRepo.readAllCases();
    expect(db[0]!.title).toBe("修改后标题");
    expect(db[0]!.workflowState).toBe("case-ready");
    expect(db[0]!.applicationNumber).toBe("CN2020100000001");
  });

  it("更新不存在的 Case → 创建新记录（put 语义）", async () => {
    const c = makeCase({ id: "nonexistent-case" });
    await caseRepo.updateCase(c);

    const db = await caseRepo.readAllCases();
    expect(db).toHaveLength(1);
    expect(db[0]!.id).toBe("nonexistent-case");
  });

  it("删除不存在的记录 → 不报错", async () => {
    await expect(caseRepo.deleteCase("not-exist")).resolves.toBeUndefined();
  });

  it("并发写入多个 Case → 全部持久化", async () => {
    const cases = Array.from({ length: 10 }, (_, i) =>
      makeCase({ id: `concurrent-${i}`, title: `并发测试 ${i}` })
    );

    await Promise.all(cases.map((c) => caseRepo.createCase(c)));

    const db = await caseRepo.readAllCases();
    expect(db).toHaveLength(10);
    for (const c of cases) {
      const found = db.find((d) => d.id === c.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe(c.title);
    }
  });

  it("批量写入 → 逐个删除 → 最终 DB 为空", async () => {
    const ids = ["batch-1", "batch-2", "batch-3"];
    await Promise.all(ids.map((id) => caseRepo.createCase(makeCase({ id }))));

    let db = await caseRepo.readAllCases();
    expect(db).toHaveLength(3);

    for (const id of ids) {
      await caseRepo.deleteCase(id);
    }

    db = await caseRepo.readAllCases();
    expect(db).toHaveLength(0);
  });

  it("写入大量 ClaimFeature → 全部回读正确", async () => {
    const features: ClaimFeature[] = Array.from({ length: 50 }, (_, i) => ({
      id: `${CASE_ID}-chart-1-${i}`,
      caseId: CASE_ID,
      claimNumber: 1,
      featureCode: String.fromCharCode(65 + (i % 26)),
      description: `特征描述 ${i}`,
      specificationCitations: [],
      citationStatus: "needs-review" as const,
      source: "mock" as const
    }));

    await Promise.all(features.map((f) => claimRepo.createClaimFeature(f)));

    const db = await claimRepo.readClaimFeaturesByCaseId(CASE_ID);
    expect(db).toHaveLength(50);
  });

  it("写入包含 null 字段的 Document → 正常持久化", async () => {
    const doc: SourceDocument = {
      id: "null-doc",
      caseId: CASE_ID,
      role: "application",
      fileName: "test.pdf",
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      createdAt: "2024-01-01T00:00:00.000Z"
    };

    await documentRepo.createDocument(doc);
    const db = await documentRepo.readAllDocuments();
    expect(db).toHaveLength(1);
    expect(db[0]!.id).toBe("null-doc");
  });
});

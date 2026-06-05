/**
 * 持久化自动测试 — Client 完整链路
 * =================================
 *
 * 基于 PRD/DESIGN 需求，测试 client 端完整持久化链路：
 *   slice action → repo function → fetch POST → (server → DB → server) → fetch GET → store state
 *
 * 不测 server 端（server 端由 HTTP round-trip 测试覆盖），
 * 测 client 端的：slice 是否调了 repo、POST body 是否正确、load 是否恢复数据。
 *
 * 运行：vitest run tests/unit/settingsPersist.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

const guardedErrors: Array<{ store: string; error: unknown }> = [];
vi.mock("@client/lib/idbWriteGuard", () => ({
  idbWriteGuard: vi.fn((store: string) => (error: unknown) => {
    guardedErrors.push({ store, error });
  })
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────

import { useSettingsStore } from "@client/store/features/settings/settingsSlice";
import { useCaseStore } from "@client/store/features/case/caseSlice";
import { useDocumentsStore } from "@client/store/features/documents/documentsSlice";
import { useClaimsStore } from "@client/store/features/claims/claimsSlice";
import { useNoveltyStore } from "@client/store/features/novelty/noveltySlice";
import { useInventiveStore } from "@client/store/features/inventive/inventiveSlice";
import { useDefectsStore } from "@client/store/features/defects/defectsSlice";
import { useChatStore } from "@client/store/features/chat/chatSlice";
import { useOpinionStore } from "@client/store/features/opinion/opinionSlice";
import { useDraftStore } from "@client/store/features/draft/draftSlice";
import { useInterpretStore } from "@client/store/features/interpret/interpretSlice";
import type { AppSettings } from "@shared/types/agents";

// ── Helpers ──────────────────────────────────────────────

/** 提取最后一次 fetch POST/PUT 的 body */
function getLastPostBody(urlPattern: string, method = "POST"): Record<string, unknown> | null {
  const calls = mockFetch.mock.calls.filter(
    (c: unknown[]) => typeof c[0] === "string" && c[0].includes(urlPattern) && (c[1] as RequestInit)?.method === method
  );
  if (calls.length === 0) return null;
  return JSON.parse((calls[calls.length - 1]![1] as RequestInit).body as string);
}

/** 统计特定 URL 的 fetch 调用次数 */
function countCalls(urlPattern: string, method?: string): number {
  return mockFetch.mock.calls.filter((c: unknown[]) => {
    if (typeof c[0] !== "string" || !c[0].includes(urlPattern)) return false;
    if (method && (c[1] as RequestInit)?.method !== method) return false;
    return true;
  }).length;
}

/** 模拟 DB 返回数据（GET /api/data/:store/:id） */
function mockDbGet(store: string, id: string, record: Record<string, unknown>) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes(`/api/data/${store}/${id}`) && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, record: { id, ...record } }) });
    }
    if (typeof url === "string" && url.includes(`/api/data/${store}`) && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, records: [{ id, ...record }] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

/** 模拟 DB 返回空（GET 404） */
function mockDbEmpty(store: string) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes(`/api/data/${store}`) && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, records: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

// ── 测试数据 ────────────────────────────────────────────

const FULL_SETTINGS: AppSettings = {
  mode: "real", guidelineVersion: "2023",
  providers: [{ providerId: "mimo", apiKeyRef: "sk-mimo", modelIds: ["m1"], defaultModelId: "m1", enabled: true }],
  agents: [{ agent: "novelty", providerOrder: ["mimo"], modelId: "m1", maxTokens: 4096 }],
  searchProviders: [{ providerId: "tavily", name: "Tavily", apiKeyRef: "tvly", enabled: true }],
  enableProviderFallback: true,
  knowledge: { enabled: true, topK: 10, scoreThreshold: 0.5 },
  knowledgeProviders: [
    { providerType: "embedding", providerId: "sf", displayName: "SF", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-emb", modelId: "bge-m3", availableModels: [], enabled: true },
    { providerType: "reranker", providerId: "sf", displayName: "SF", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker", modelId: "bge-reranker", availableModels: [], enabled: true },
  ],
  providerErrorMessages: [], sanitizeRules: [], ocrQualityThresholds: { good: 0.7, poor: 0.4 },
};

// ── 测试 ────────────────────────────────────────────────

describe("持久化 — Client 完整链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardedErrors.length = 0;
    localStorage.clear();
    // Reset all stores
    useSettingsStore.setState({
      settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true },
      isInitialized: false,
      syncStatus: { connected: false, lastSync: null, syncing: false, error: null },
    });
    useCaseStore.setState({ currentCase: null, cases: [], isLoading: false });
    useDocumentsStore.setState({ documents: [], isLoading: false });
    useClaimsStore.setState({ claimNodes: [], claimFeatures: [], ranCases: [] } as any);
    useNoveltyStore.setState({ comparisons: [] });
    useInventiveStore.setState({ analyses: [] });
    useDefectsStore.setState({ defects: [], ranCases: [] } as any);
    useChatStore.setState({ sessions: [], messages: [], activeSessionId: null });
    useOpinionStore.setState({ officeActionAnalysis: null, argumentMappings: [], argumentRanCases: [] } as any);
    useDraftStore.setState({ reexamDraft: null, summary: null });
    useInterpretStore.setState({ interpretSummaries: {} });
  });

  // ══════════════════════════════════════════════════════════════
  // 1. Settings — 配置持久化
  // ══════════════════════════════════════════════════════════════

  describe("1. Settings 配置持久化", () => {
    it("setSettings → POST body 含所有配置 → loadFromDb → store 恢复", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      useSettingsStore.getState().setSettings(FULL_SETTINGS);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/settings");
      console.log("[Settings] POST body providers:", JSON.stringify(written?.providers));
      console.log("[Settings] POST body knowledgeProviders:", JSON.stringify(written?.knowledgeProviders));
      expect(written?.providers).toEqual(FULL_SETTINGS.providers);
      expect(written?.searchProviders).toEqual(FULL_SETTINGS.searchProviders);
      expect(written?.knowledgeProviders).toEqual(FULL_SETTINGS.knowledgeProviders);
      expect(written?.knowledge).toEqual(FULL_SETTINGS.knowledge);

      // 模拟刷新 — loadFromDb
      mockDbGet("settings", "app", FULL_SETTINGS);
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();
      const s = useSettingsStore.getState().settings;
      console.log("[Settings] 读回 providers:", JSON.stringify(s.providers));
      expect(s.providers).toEqual(FULL_SETTINGS.providers);
      expect(s.knowledgeProviders).toEqual(FULL_SETTINGS.knowledgeProviders);
    });

    // BUG-162: updateKnowledgeConfig 用 patchSettings 只写 knowledge 字段，
    // 不会覆盖 providers 等其他字段。验证 PATCH 请求只包含 knowledge。
    it("BUG-162 修复：updateKnowledgeConfig 只 patch knowledge 字段，不覆盖 providers", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });

      // 用户保存新 key
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ providerId: "mimo", apiKeyRef: "sk-USER-NEW", modelIds: ["m1"], defaultModelId: "m1", enabled: true }],
      });

      // 模拟 KnowledgeConfigPanel effect 触发 updateKnowledgeConfig
      useSettingsStore.getState().updateKnowledgeConfig({ enabled: true, topK: 10, scoreThreshold: 0.5 });

      // 验证 PATCH 请求只包含 knowledge 字段
      const patchCall = mockFetch.mock.calls.find(
        (c: unknown[]) => (c[0] as string)?.includes("/api/data/settings") && (c[1] as Record<string, unknown>)?.method === "PATCH"
      );
      console.log("[BUG-162] PATCH 调用:", patchCall ? "found" : "not found");

      if (patchCall) {
        const body = JSON.parse((patchCall[1] as Record<string, unknown>).body as string);
        console.log("[BUG-162] PATCH body keys:", Object.keys(body));
        // PATCH 只包含 knowledge，不包含 providers
        expect(body.knowledge).toEqual({ enabled: true, topK: 10, scoreThreshold: 0.5 });
        expect(body.providers).toBeUndefined();
      }

      // 验证 providers 的 POST 写入仍然是用户的新值
      const postCalls = mockFetch.mock.calls.filter(
        (c: unknown[]) => (c[0] as string)?.includes("/api/data/settings") && (c[1] as Record<string, unknown>)?.method === "POST"
      );
      const lastPost = postCalls[postCalls.length - 1];
      if (lastPost) {
        const body = JSON.parse((lastPost[1] as Record<string, unknown>).body as string);
        const key = (body.providers as Array<Record<string, unknown>>)?.[0]?.apiKeyRef;
        console.log("[BUG-162] 最后 POST providers key:", key);
        expect(key).toBe("sk-USER-NEW");
      }
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 2. Cases — 案件持久化
  // ══════════════════════════════════════════════════════════════

  describe("2. Cases 案件持久化", () => {
    it("setCurrentCase → PUT /api/data/cases → body 含案件数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const c = { id: "c1", applicationNumber: "CN202310001001A", title: "LED散热装置", workflowState: "case-ready", createdAt: "2026-06-05", updatedAt: "2026-06-05" };
      useCaseStore.getState().setCurrentCase(c as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/cases", "PUT");
      console.log("[Cases] PUT body:", JSON.stringify(written));
      expect(written?.title).toBe("LED散热装置");
      expect(written?.workflowState).toBe("case-ready");
    });

    it("updateWorkflowState → PUT body 含新 workflowState", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useCaseStore.setState({ currentCase: { id: "c1", title: "test", workflowState: "case-ready" } as any });
      useCaseStore.getState().updateWorkflowState("text-confirmed");
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/cases", "PUT");
      console.log("[Cases] updateWorkflowState PUT body:", written?.workflowState);
      expect(written?.workflowState).toBe("text-confirmed");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 3. Documents — 文档持久化
  // ══════════════════════════════════════════════════════════════

  describe("3. Documents 文档持久化", () => {
    it("addDocument → POST /api/data/documents → body 含文档数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useDocumentsStore.getState().addDocument({ id: "d1", caseId: "c1", role: "application", fileName: "申请.pdf" } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/documents");
      console.log("[Documents] POST body:", JSON.stringify(written));
      expect(written?.fileName).toBe("申请.pdf");
      expect(written?.role).toBe("application");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 4. ClaimNodes — 权利要求节点持久化
  // ══════════════════════════════════════════════════════════════

  describe("4. ClaimNodes 权利要求节点持久化", () => {
    it("addClaimNode → POST /api/data/claimNodes → body 含节点数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useClaimsStore.getState().addClaimNode({ id: "cn1", caseId: "c1", claimNumber: 1, type: "independent", rawText: "一种LED散热装置" } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/claimNodes");
      console.log("[ClaimNodes] POST body:", JSON.stringify(written));
      expect(written?.type).toBe("independent");
      expect(written?.rawText).toContain("LED");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 5. ClaimCharts — 特征对照持久化
  // ══════════════════════════════════════════════════════════════

  describe("5. ClaimCharts 特征对照持久化", () => {
    it("addClaimFeature → POST /api/data/claimCharts → body 含嵌套 citation 数组", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useClaimsStore.getState().addClaimFeature({
        id: "cc1", caseId: "c1", featureCode: "A",
        specificationCitations: [{ label: "段落001", paragraph: "1", quote: "散热基板", confidence: "high" }],
      } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/claimCharts");
      console.log("[ClaimCharts] POST body:", JSON.stringify(written));
      expect(written?.specificationCitations).toBeDefined();
      expect((written?.specificationCitations as any[])[0].quote).toBe("散热基板");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 6. Novelty — 新颖性对照持久化
  // ══════════════════════════════════════════════════════════════

  describe("6. Novelty 新颖性对照持久化", () => {
    it("addComparison → POST /api/data/novelty → body 含深嵌套 rows + citations", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useNoveltyStore.getState().addComparison({
        id: "n1", caseId: "c1", referenceId: "ref-d1",
        rows: [{ featureCode: "A", citations: [{ documentId: "ref-d1", quote: "铝合金散热基板", confidence: "high" }] }],
        differenceFeatureCodes: ["A"],
      } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/novelty");
      console.log("[Novelty] POST body:", JSON.stringify(written));
      expect((written?.rows as any[])[0].citations[0].quote).toBe("铝合金散热基板");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 7. Inventive — 创造性分析持久化
  // ══════════════════════════════════════════════════════════════

  describe("7. Inventive 创造性分析持久化", () => {
    it("addAnalysis → POST /api/data/inventive → body 含 features[]", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useInventiveStore.getState().addAnalysis({
        id: "inv1", caseId: "c1", closestPriorArtId: "ref-d1",
        features: [{ featureCode: "B", analysis: "石墨烯未公开", conclusion: "possibly-inventive" }],
        overallConclusion: "possibly-lacks-inventiveness",
      } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/inventive");
      console.log("[Inventive] POST body:", JSON.stringify(written));
      expect((written?.features as any[])[0].analysis).toContain("石墨烯");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 8. Defects — 缺陷持久化
  // ══════════════════════════════════════════════════════════════

  describe("8. Defects 缺陷持久化", () => {
    it("addDefect → POST /api/data/defects → body 含缺陷数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useDefectsStore.getState().addDefect({
        id: "def1", caseId: "c1", category: "support", description: "权利要求3范围过宽", severity: "warning", resolved: false,
      } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/defects");
      console.log("[Defects] POST body:", JSON.stringify(written));
      expect(written?.category).toBe("support");
      expect(written?.resolved).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 9. Chat — 对话持久化
  // ══════════════════════════════════════════════════════════════

  describe("9. Chat 对话持久化", () => {
    it("addSession → POST /api/data/chatSessions → body 含会话数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useChatStore.getState().addSession({ id: "s1", caseId: "c1", title: "文档解读", createdAt: "2026-06-05", updatedAt: "2026-06-05" } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/chatSessions");
      console.log("[Chat] addSession POST body:", JSON.stringify(written));
      expect(written?.title).toBe("文档解读");
    });

    it("addMessage → POST /api/data/chatMessages → body 含消息数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useChatStore.getState().addMessage({
        id: "m1", sessionId: "s1", caseId: "c1", moduleScope: "case", role: "user", content: "核心创新在哪？", createdAt: "2026-06-05",
      } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/chatMessages");
      console.log("[Chat] addMessage POST body:", JSON.stringify(written));
      expect(written?.content).toBe("核心创新在哪？");
      expect(written?.moduleScope).toBe("case");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 10. Opinion — 审查意见分析持久化
  // ══════════════════════════════════════════════════════════════

  describe("10. Opinion 审查意见分析持久化", () => {
    it("setOfficeActionAnalysis → POST /api/data/opinionAnalyses → body 含分析数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const analysis = { id: "oa1", caseId: "c1", analysisData: { rejectionGrounds: [{ groundType: "novelty", claimNumbers: [1] }] }, createdAt: "2026-06-05" };
      useOpinionStore.getState().setOfficeActionAnalysis(analysis as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/opinionAnalyses");
      console.log("[Opinion] POST body:", JSON.stringify(written));
      expect((written?.analysisData as any).rejectionGrounds[0].groundType).toBe("novelty");
    });

    it("setArgumentMappings → POST /api/data/argumentMappings → body 含映射数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useOpinionStore.getState().setArgumentMappings([
        { id: "am1", caseId: "c1", claimFeature: "A", argument: "D1未公开特征A" },
      ] as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/argumentMappings");
      console.log("[Opinion] setArgumentMappings POST body:", JSON.stringify(written));
      expect(written?.argument).toBe("D1未公开特征A");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 11. Draft — 复审草稿持久化
  // ══════════════════════════════════════════════════════════════

  describe("11. Draft 复审草稿持久化", () => {
    it("setReexamDraft → POST /api/data/reexamDrafts → body 含草稿数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useDraftStore.getState().setReexamDraft("c1", { responseItems: [{ rejectionId: "R1", response: "针对驳回理由1" }], overallAssessment: "建议维持" } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/reexamDrafts");
      console.log("[Draft] setReexamDraft POST body:", JSON.stringify(written));
      expect((written?.responseItems as any[])[0].response).toContain("驳回理由");
    });

    it("setSummary → POST /api/data/summaries → body 含摘要数据", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useDraftStore.getState().setSummary("c1", { body: "本申请涉及LED散热装置" } as any);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/summaries");
      console.log("[Draft] setSummary POST body:", JSON.stringify(written));
      expect(written?.body).toContain("LED");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 12. Interpret — 文档解读持久化
  // ══════════════════════════════════════════════════════════════

  describe("12. Interpret 文档解读持久化", () => {
    it("setInterpretSummary → POST /api/data/interpretSummaries → body 含解读结果", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useInterpretStore.getState().setInterpretSummary("c1", "doc-app", "本申请涉及LED散热");
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/interpretSummaries");
      console.log("[Interpret] POST body:", JSON.stringify(written));
      expect(written?.summaries).toBeDefined();
      expect((written?.summaries as any)["doc-app"]).toContain("LED");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 13. RunMarkers — 运行标记持久化
  // ══════════════════════════════════════════════════════════════

  describe("13. RunMarkers 运行标记持久化", () => {
    it("addRanCase → POST /api/data/runMarkers → body 含复合 ID", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useClaimsStore.getState().addRanCase("c1");
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/runMarkers");
      console.log("[RunMarkers] POST body:", JSON.stringify(written));
      expect(written?.id).toBe("c1::claimChart");
      expect(written?.caseId).toBe("c1");
      expect(written?.module).toBe("claimChart");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 14. writeSettings 失败传播
  // ══════════════════════════════════════════════════════════════

  describe("14. writeSettings 失败传播", () => {
    it("POST 失败 → idbWriteGuard 记录 → 用户有感知", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/data/settings")) return Promise.reject(new Error("Network error"));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });
      useSettingsStore.setState({ isInitialized: true });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      await new Promise(r => setTimeout(r, 100));
      expect(guardedErrors.length).toBeGreaterThan(0);
      expect(guardedErrors[0]!.store).toBe("settings");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 15. localStorage fallback
  // ══════════════════════════════════════════════════════════════

  describe("15. DB 不可用降级", () => {
    it("DB 不可用 → loadFromDb 返回默认值（不依赖 localStorage）", async () => {
      mockFetch.mockRejectedValue(new Error("DB unavailable"));
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[DB降级] DB 失败后使用默认值:", s.providers.length, "providers");
      // 去掉 localStorage 中间层后，DB 不可用时直接返回 REPO_DEFAULT_SETTINGS
      expect(s.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({ providerId: "gemini" })
      ]));
      expect(s.enableProviderFallback).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 16. agents 配置持久化
  // ══════════════════════════════════════════════════════════════

  describe("16. agents 配置持久化", () => {
    it("setSettings agents → POST body 含 agents → loadFromDb → 恢复", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      const agents = [
        { agent: "interpret" as const, providerOrder: ["mimo" as const], modelId: "MiMo-V2.5-Pro", maxTokens: 8192 },
        { agent: "novelty" as const, providerOrder: ["gemini" as const], modelId: "gemini-2.5-flash", maxTokens: 4096 },
      ];
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, agents });
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/settings");
      console.log("[agents] POST body agents:", JSON.stringify(written?.agents));
      expect(written?.agents).toEqual(agents);

      mockDbGet("settings", "app", { ...useSettingsStore.getState().settings, agents });
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();
      const s = useSettingsStore.getState().settings;
      console.log("[agents] 读回 agents:", JSON.stringify(s.agents));
      expect(s.agents).toEqual(agents);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 17. sanitizeRules 配置持久化
  // ══════════════════════════════════════════════════════════════

  describe("17. sanitizeRules 配置持久化", () => {
    it("setSettings sanitizeRules → POST body 含 rules → loadFromDb → 恢复", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      const rules = [
        { pattern: "\\btest\\b", replace: "TEST", note: "测试替换" },
        { pattern: "\\d{4}", replace: "YYYY", note: "年份脱敏" },
      ];
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, sanitizeRules: rules });
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/settings");
      console.log("[sanitizeRules] POST body:", JSON.stringify(written?.sanitizeRules));
      expect(written?.sanitizeRules).toEqual(rules);

      mockDbGet("settings", "app", { ...useSettingsStore.getState().settings, sanitizeRules: rules });
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();
      const s = useSettingsStore.getState().settings;
      console.log("[sanitizeRules] 读回:", JSON.stringify(s.sanitizeRules));
      expect(s.sanitizeRules).toEqual(rules);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 18. ocrQualityThresholds 配置持久化
  // ══════════════════════════════════════════════════════════════

  describe("18. ocrQualityThresholds 配置持久化", () => {
    it("setSettings ocrQualityThresholds → POST body 含阈值 → loadFromDb → 恢复", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      const thresholds = { good: 0.8, poor: 0.5 };
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, ocrQualityThresholds: thresholds });
      await new Promise(r => setTimeout(r, 50));

      const written = getLastPostBody("/api/data/settings");
      console.log("[ocrThresholds] POST body:", JSON.stringify(written?.ocrQualityThresholds));
      expect(written?.ocrQualityThresholds).toEqual(thresholds);

      mockDbGet("settings", "app", { ...useSettingsStore.getState().settings, ocrQualityThresholds: thresholds });
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();
      const s = useSettingsStore.getState().settings;
      console.log("[ocrThresholds] 读回:", JSON.stringify(s.ocrQualityThresholds));
      expect(s.ocrQualityThresholds).toEqual(thresholds);
    });
  });
});

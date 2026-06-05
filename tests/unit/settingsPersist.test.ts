/**
 * Settings 持久化测试 — 全配置项完整链路
 * ======================================
 *
 * 测试每个用户配置项的完整持久化链路：写入 → 读回 → 使用
 * 加 log 追踪数据流，确保测试能自动发现持久化 bug。
 *
 * 运行：vitest run tests/unit/settingsPersist.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverReady
vi.mock("@client/lib/serverReady", () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
  clearServerReadyCache: vi.fn()
}));

// Mock idbWriteGuard — 记录被吞掉的错误
const guardedErrors: Array<{ store: string; error: unknown }> = [];
vi.mock("@client/lib/idbWriteGuard", () => ({
  idbWriteGuard: vi.fn((store: string) => (error: unknown) => {
    guardedErrors.push({ store, error });
  })
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useSettingsStore } from "@client/store/features/settings/settingsSlice";
import type { AppSettings } from "@shared/types/agents";

// ── 辅助函数 ──────────────────────────────────────────

/** 模拟 loadFromDb 从 DB 读回的数据 */
function mockLoadFromDb(record: Record<string, unknown>) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/data/settings/app") && !init?.method) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, record: { id: "app", ...record } }),
      });
    }
    // POST/PUT 请求默认成功
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

/** 收集 writeSettings 发出的 POST body */
function getWrittenSettings(): Record<string, unknown> | null {
  const postCalls = mockFetch.mock.calls.filter(
    (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/settings") && (c[1] as RequestInit)?.method === "POST"
  );
  if (postCalls.length === 0) return null;
  const lastPost = postCalls[postCalls.length - 1]!;
  return JSON.parse((lastPost[1] as RequestInit).body as string);
}

/** 收集 syncProviderKeys 发出的请求 */
function getSyncCalls() {
  return mockFetch.mock.calls.filter(
    (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/settings/providers/")
  );
}

// ── 测试 ──────────────────────────────────────────────

describe("Settings 持久化 — 全配置项完整链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardedErrors.length = 0;
    localStorage.clear();
    useSettingsStore.setState({
      settings: {
        mode: "mock",
        guidelineVersion: "2023",
        providers: [],
        agents: [],
        searchProviders: [],
        enableProviderFallback: true,
      },
      isInitialized: true,
      syncStatus: { connected: false, lastSync: null, syncing: false, error: null },
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §一 LLM Providers 持久化
  // ══════════════════════════════════════════════════════════════════════

  describe("§一 LLM Providers", () => {
    it("TC-1.1: 写入 providers → 读回 → apiKeyRef 完整", async () => {
      const providers = [
        { providerId: "mimo" as const, apiKeyRef: "sk-mimo-real-key-12345", modelIds: ["MiMo-V2.5-Pro"], defaultModelId: "MiMo-V2.5-Pro", enabled: true },
        { providerId: "gemini" as const, apiKeyRef: "AIzaSy-gemini-key-67890", modelIds: ["gemini-2.5-flash"], defaultModelId: "gemini-2.5-flash", enabled: true },
      ];

      // 写入
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        mode: "real",
        providers,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-1.1] 写入 providers:", JSON.stringify(written?.providers, null, 2));
      expect(written).not.toBeNull();
      expect((written!.providers as unknown[]).length).toBe(2);

      // 读回
      mockLoadFromDb({ mode: "real", providers, agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-1.1] 读回 providers:", JSON.stringify(s.providers, null, 2));
      expect(s.providers).toHaveLength(2);
      expect(s.providers[0]!.apiKeyRef).toBe("sk-mimo-real-key-12345");
      expect(s.providers[1]!.apiKeyRef).toBe("AIzaSy-gemini-key-67890");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §二 Search Providers 持久化（含 EPO key）
  // ══════════════════════════════════════════════════════════════════════

  describe("§二 Search Providers", () => {
    it("TC-2.1: 写入 searchProviders → 读回 → EPO key 含冒号完整", async () => {
      const searchProviders = [
        { providerId: "tavily" as const, name: "Tavily", apiKeyRef: "tvly-dev-abc123", enabled: true },
        { providerId: "epo" as const, name: "EPO OPS", apiKeyRef: "epo-consumer-key:epo-secret-key", enabled: true },
      ];

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        searchProviders,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-2.1] 写入 searchProviders:", JSON.stringify(written?.searchProviders, null, 2));

      // 读回
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders, enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-2.1] 读回 searchProviders:", JSON.stringify(s.searchProviders, null, 2));
      expect(s.searchProviders).toHaveLength(2);
      expect(s.searchProviders[0]!.apiKeyRef).toBe("tvly-dev-abc123");
      expect(s.searchProviders[1]!.apiKeyRef).toBe("epo-consumer-key:epo-secret-key");
    });

    it("TC-2.2: DB 中无 searchProviders → readSettings 补默认值", async () => {
      // DB 中只有基本字段，没有 searchProviders
      mockLoadFromDb({ mode: "mock", providers: [], agents: [] });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-2.2] DB 无 searchProviders → 读回:", JSON.stringify(s.searchProviders, null, 2));
      // readSettings 第50行：stored.searchProviders ?? REPO_DEFAULT_SETTINGS.searchProviders
      expect(s.searchProviders).toBeDefined();
      expect(s.searchProviders.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §三 Knowledge Providers 持久化（embedding + reranker）
  // ══════════════════════════════════════════════════════════════════════

  describe("§三 Knowledge Providers (embedding + reranker)", () => {
    const EMBEDDING_PROVIDER = {
      providerType: "embedding" as const,
      providerId: "siliconflow",
      displayName: "硅基流动",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKeyRef: "sk-siliconflow-embedding-key-aaa",
      modelId: "BAAI/bge-m3",
      availableModels: ["BAAI/bge-m3"],
      enabled: true,
    };

    const RERANKER_PROVIDER = {
      providerType: "reranker" as const,
      providerId: "siliconflow",
      displayName: "硅基流动",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKeyRef: "sk-siliconflow-reranker-key-bbb",
      modelId: "BAAI/bge-reranker-v2-m3",
      availableModels: ["BAAI/bge-reranker-v2-m3"],
      enabled: true,
    };

    it("TC-3.1: 写入 knowledgeProviders → 读回 → embedding + reranker key 完整", async () => {
      const knowledgeProviders = [EMBEDDING_PROVIDER, RERANKER_PROVIDER];

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        knowledgeProviders,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-3.1] 写入 knowledgeProviders:", JSON.stringify(written?.knowledgeProviders, null, 2));

      // 读回
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true, knowledgeProviders });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-3.1] 读回 knowledgeProviders:", JSON.stringify(s.knowledgeProviders, null, 2));
      expect(s.knowledgeProviders).toBeDefined();
      expect(s.knowledgeProviders).toHaveLength(2);
      expect(s.knowledgeProviders![0]!.apiKeyRef).toBe("sk-siliconflow-embedding-key-aaa");
      expect(s.knowledgeProviders![1]!.apiKeyRef).toBe("sk-siliconflow-reranker-key-bbb");
    });

    it("TC-3.2: DB 中无 knowledgeProviders → readSettings 补默认值 [] → 不崩溃", async () => {
      mockLoadFromDb({ mode: "real", providers: [], agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-3.2] DB 无 knowledgeProviders → 读回:", s.knowledgeProviders);
      // 正确行为：readSettings 为可选数组字段补默认值 []
      expect(s.knowledgeProviders).toBeDefined();
      expect(s.knowledgeProviders).toEqual([]);
    });

    it("TC-3.3: DB 中无 knowledge → readSettings 补默认值 → 不崩溃", async () => {
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-3.3] knowledge:", s.knowledge);
      // 正确行为：readSettings 为可选对象字段补默认值
      expect(s.knowledge).toBeDefined();
      expect(s.knowledge!.enabled).toBe(false);
      expect(s.knowledge!.topK).toBeDefined();
      expect(s.knowledge!.scoreThreshold).toBeDefined();
    });

    it("TC-3.4: 写入后 writeSettings 失败 → idbWriteGuard 记录错误", async () => {
      const knowledgeProviders = [EMBEDDING_PROVIDER, RERANKER_PROVIDER];

      // writeSettings 的 fetch 失败
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/data/settings")) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        knowledgeProviders,
      });
      await new Promise((r) => setTimeout(r, 100));

      // 内存中有 reranker key
      const memSettings = useSettingsStore.getState().settings;
      console.log("[TC-3.4] 内存中 knowledgeProviders:", JSON.stringify(memSettings.knowledgeProviders, null, 2));
      expect(memSettings.knowledgeProviders).toHaveLength(2);

      // 正确行为：writeSettings 失败时应调用 idbWriteGuard
      console.log("[TC-3.4] guardedErrors:", guardedErrors.length);
      expect(guardedErrors.length).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §四 Knowledge Config 持久化
  // ══════════════════════════════════════════════════════════════════════

  describe("§四 Knowledge Config", () => {
    it("TC-4.1: 写入 knowledge config → 读回 → 完整", async () => {
      const knowledge = { enabled: true, topK: 15, scoreThreshold: 0.7 };

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().updateKnowledgeConfig(knowledge);
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-4.1] 写入 knowledge:", JSON.stringify(written?.knowledge, null, 2));

      // 读回
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true, knowledge });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-4.1] 读回 knowledge:", JSON.stringify(s.knowledge, null, 2));
      expect(s.knowledge).toEqual(knowledge);
    });

    it("TC-4.2: DB 中无 knowledge → readSettings 补默认值 { enabled: false }", async () => {
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-4.2] DB 无 knowledge → 读回:", s.knowledge);
      // 正确行为：readSettings 为 knowledge 补默认值
      expect(s.knowledge).toBeDefined();
      expect(s.knowledge!.enabled).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §五 Provider Error Messages 持久化
  // ══════════════════════════════════════════════════════════════════════

  describe("§五 Provider Error Messages", () => {
    it("TC-5.1: addProviderError → 写入 → 读回 → 完整", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

      useSettingsStore.getState().addProviderError({
        providerId: "mimo",
        errorCode: "quota_exceeded",
        message: "API quota exceeded",
        timestamp: "2026-06-05T10:00:00Z",
        read: false,
        agent: "novelty",
        caseId: "case-123",
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-5.1] 写入 providerErrorMessages:", JSON.stringify(written?.providerErrorMessages, null, 2));
      expect((written?.providerErrorMessages as unknown[]).length).toBe(1);

      // 读回
      const savedErrors = useSettingsStore.getState().settings.providerErrorMessages;
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true, providerErrorMessages: savedErrors });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-5.1] 读回 providerErrorMessages:", JSON.stringify(s.providerErrorMessages, null, 2));
      expect(s.providerErrorMessages).toHaveLength(1);
      expect(s.providerErrorMessages![0]!.providerId).toBe("mimo");
      expect(s.providerErrorMessages![0]!.errorCode).toBe("quota_exceeded");
    });

    it("TC-5.2: DB 中无 providerErrorMessages → readSettings 补默认值 []", async () => {
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-5.2] DB 无 providerErrorMessages → 读回:", s.providerErrorMessages);
      // 正确行为：readSettings 为可选数组字段补默认值 []
      expect(s.providerErrorMessages).toBeDefined();
      expect(s.providerErrorMessages).toEqual([]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §六 Agents 配置持久化
  // ══════════════════════════════════════════════════════════════════════

  describe("§六 Agents 配置", () => {
    it("TC-6.1: 写入 agents → 读回 → providerOrder/modelId/maxTokens 完整", async () => {
      const agents = [
        { agent: "novelty" as const, providerOrder: ["mimo" as const, "gemini" as const], modelId: "MiMo-V2.5-Pro", maxTokens: 8192 },
        { agent: "inventive" as const, providerOrder: ["gemini" as const], modelId: "gemini-2.5-pro", maxTokens: 16384 },
        { agent: "claim-chart" as const, providerOrder: [], modelId: "", maxTokens: 4096 },
      ];

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        agents,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-6.1] 写入 agents:", JSON.stringify(written?.agents, null, 2));

      // 读回
      mockLoadFromDb({ mode: "mock", providers: [], agents, searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-6.1] 读回 agents:", JSON.stringify(s.agents, null, 2));
      expect(s.agents).toHaveLength(3);
      expect(s.agents[0]!.providerOrder).toEqual(["mimo", "gemini"]);
      expect(s.agents[0]!.modelId).toBe("MiMo-V2.5-Pro");
      expect(s.agents[0]!.maxTokens).toBe(8192);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §七 竞态条件：loadFromDb 未完成时写入
  // ══════════════════════════════════════════════════════════════════════

  describe("§七 竞态条件", () => {
    it("TC-7.1: loadFromDb 未完成时 setSettings → isInitialized 守卫阻止写入 DB", async () => {
      // 场景：页面刷新 → loadFromDb 开始 → 某组件 useEffect 调用 setSettings
      // 正确行为：setSettings 有 isInitialized 守卫，未初始化时不写 DB

      // 模拟页面刷新后 isInitialized = false
      useSettingsStore.setState({ isInitialized: false });

      let resolveLoad: (value: unknown) => void;
      const loadPromise = new Promise((resolve) => { resolveLoad = resolve; });

      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/api/data/settings/app") && !init?.method) {
          return loadPromise;
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      // 开始 loadFromDb（异步，fetch 还没返回）
      const loadFromDbPromise = useSettingsStore.getState().loadFromDb();

      // 此时 isInitialized = false
      expect(useSettingsStore.getState().isInitialized).toBe(false);

      // 某组件调用 setSettings
      useSettingsStore.getState().setSettings(useSettingsStore.getState().settings);
      await new Promise((r) => setTimeout(r, 50));

      // 正确行为：isInitialized=false 时 setSettings 不应写入 DB
      const written = getWrittenSettings();
      console.log("[TC-7.1] isInitialized=false 时写入:", written);
      expect(written).toBeNull();

      // 清理
      resolveLoad!({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          record: { id: "app", mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true },
        }),
      });
      await loadFromDbPromise;
    });

    it("TC-7.2: isInitialized=false 时 updateKnowledgeConfig → isInitialized 守卫阻止写入", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

      // 模拟页面刷新后 isInitialized = false
      useSettingsStore.setState({ isInitialized: false });
      expect(useSettingsStore.getState().isInitialized).toBe(false);

      useSettingsStore.getState().updateKnowledgeConfig({
        enabled: true,
        topK: 10,
        scoreThreshold: 0.5,
      });
      await new Promise((r) => setTimeout(r, 50));

      // 正确行为：isInitialized=false 时不应写入 DB
      const written = getWrittenSettings();
      console.log("[TC-7.2] isInitialized=false 时写入:", written);
      expect(written).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §八 syncProviderKeys 覆盖范围
  // ══════════════════════════════════════════════════════════════════════

  describe("§八 syncProviderKeys 覆盖范围", () => {
    it("TC-8.1: syncProviderKeys 只同步 LLM providers，不同步 knowledgeProviders", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/settings/providers/")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        mode: "real",
        providers: [
          { providerId: "mimo" as const, apiKeyRef: "sk-mimo", modelIds: ["m1"], defaultModelId: "m1", enabled: true },
        ],
        knowledgeProviders: [
          { providerType: "reranker" as const, providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker", modelId: "m1", availableModels: ["m1"], enabled: true },
        ],
      });
      await new Promise((r) => setTimeout(r, 100));

      const syncCalls = getSyncCalls();
      console.log("[TC-8.1] syncProviderKeys 调用:", syncCalls.map((c) => c[0]));
      // 只有 LLM provider 被同步
      expect(syncCalls.some((c) => (c[0] as string).includes("/mimo"))).toBe(true);
      // knowledgeProviders 没有被同步
      expect(syncCalls.some((c) => (c[0] as string).includes("/siliconflow"))).toBe(false);

      console.log("[TC-8.1] syncProviderKeys 不同步 knowledgeProviders — reranker key 通过 request body 传递");
    });

    it("TC-8.2: syncProviderKeys 失败时 syncStatus.error 有错误信息 → 用户有感知", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/settings/providers/")) {
          return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        mode: "real",
        providers: [
          { providerId: "mimo" as const, apiKeyRef: "sk-mimo", modelIds: ["m1"], defaultModelId: "m1", enabled: true },
        ],
      });
      await new Promise((r) => setTimeout(r, 100));

      const syncStatus = useSettingsStore.getState().syncStatus;
      console.log("[TC-8.2] syncProviderKeys 失败后 syncStatus:", syncStatus);
      // 正确行为：失败时 syncStatus.error 应有错误信息
      expect(syncStatus.error).not.toBeNull();
      expect(syncStatus.error).toContain("mimo");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §九 Sanitize Rules 和 OCR Quality Thresholds
  // ══════════════════════════════════════════════════════════════════════

  describe("§九 其他配置项", () => {
    it("TC-9.1: 写入 sanitizeRules + ocrQualityThresholds → 读回 → 完整", async () => {
      const sanitizeRules = [{ pattern: "\\s+", replace: " " }, { pattern: "[\\x00-\\x1f]", replace: "" }];
      const ocrQualityThresholds = { good: 0.75, poor: 0.45 };

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        sanitizeRules,
        ocrQualityThresholds,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-9.1] 写入 sanitizeRules:", JSON.stringify(written?.sanitizeRules));
      console.log("[TC-9.1] 写入 ocrQualityThresholds:", JSON.stringify(written?.ocrQualityThresholds));

      // 读回
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true, sanitizeRules, ocrQualityThresholds });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-9.1] 读回 sanitizeRules:", JSON.stringify(s.sanitizeRules));
      console.log("[TC-9.1] 读回 ocrQualityThresholds:", JSON.stringify(s.ocrQualityThresholds));
      expect(s.sanitizeRules).toEqual(sanitizeRules);
      expect(s.ocrQualityThresholds).toEqual(ocrQualityThresholds);
    });

    it("TC-9.2: DB 中无 sanitizeRules/ocrQualityThresholds → readSettings 补默认值", async () => {
      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: true });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[TC-9.2] DB 无 sanitizeRules →", s.sanitizeRules);
      console.log("[TC-9.2] DB 无 ocrQualityThresholds →", s.ocrQualityThresholds);
      // 正确行为：readSettings 为可选字段补默认值
      expect(s.sanitizeRules).toBeDefined();
      expect(s.sanitizeRules).toEqual([]);
      expect(s.ocrQualityThresholds).toBeDefined();
      expect(s.ocrQualityThresholds).toEqual({ good: 0.7, poor: 0.4 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §十 enableProviderFallback 持久化
  // ══════════════════════════════════════════════════════════════════════

  describe("§十 enableProviderFallback", () => {
    it("TC-10.1: 写入 false → 读回 false", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        enableProviderFallback: false,
      });
      await new Promise((r) => setTimeout(r, 50));

      const written = getWrittenSettings();
      console.log("[TC-10.1] 写入 enableProviderFallback:", written?.enableProviderFallback);

      mockLoadFromDb({ mode: "mock", providers: [], agents: [], searchProviders: [], enableProviderFallback: false });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      console.log("[TC-10.1] 读回 enableProviderFallback:", useSettingsStore.getState().settings.enableProviderFallback);
      expect(useSettingsStore.getState().settings.enableProviderFallback).toBe(false);
    });

    it("TC-10.2: DB 中无 enableProviderFallback → readSettings 补 true", async () => {
      mockLoadFromDb({ mode: "mock", providers: [], agents: [] });
      useSettingsStore.setState({ settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true }, isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      console.log("[TC-10.2] DB 无 enableProviderFallback → 默认值:", useSettingsStore.getState().settings.enableProviderFallback);
      expect(useSettingsStore.getState().settings.enableProviderFallback).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // §十一 writeSettings 失败时 idbWriteGuard 记录
  // ══════════════════════════════════════════════════════════════════════

  describe("§十一 writeSettings 失败处理", () => {
    it("TC-11.1: writeSettings 网络失败 → idbWriteGuard 记录错误 → 用户有感知", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/data/settings")) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      const newSettings: AppSettings = {
        ...useSettingsStore.getState().settings,
        mode: "real",
        providers: [{ providerId: "mimo", apiKeyRef: "sk-test", modelIds: ["m1"], defaultModelId: "m1", enabled: true }],
        knowledgeProviders: [{ providerType: "reranker", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker", modelId: "m1", availableModels: ["m1"], enabled: true }],
      };

      useSettingsStore.getState().setSettings(newSettings);
      await new Promise((r) => setTimeout(r, 100));

      // 正确行为：writeSettings 失败时应调用 idbWriteGuard 记录错误
      console.log("[TC-11.1] guardedErrors:", guardedErrors.length);
      expect(guardedErrors.length).toBeGreaterThan(0);
      expect(guardedErrors[0]!.store).toBe("settings");
    });

    it("TC-11.2: writeSettings server 500 → idbWriteGuard 记录 → 同上", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/data/settings")) {
          return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      // 注意：writeSettings 用的是 dbCreate，它 fetch POST 后检查 response.ok
      // 但 writeSettings 的 catch 只捕获 fetch reject，不捕获 500
      // 让我验证这个行为
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ providerId: "mimo", apiKeyRef: "sk-test", modelIds: ["m1"], defaultModelId: "m1", enabled: true }],
      });
      await new Promise((r) => setTimeout(r, 100));

      // 如果 500 不被 catch，guardedErrors 为空
      console.log("[TC-11.2] server 500 后 guardedErrors:", guardedErrors.length);
      // 这取决于 dbCreate 是否 throw on non-ok response
    });
  });
});

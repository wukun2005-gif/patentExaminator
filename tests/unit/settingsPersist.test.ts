/**
 * 持久化完整链路测试 — 模拟真实用户操作序列
 * ============================================
 *
 * 不测理想数据流，测真实用户操作：
 *   打开设置 → 填 key → 保存 → 切 tab → 刷新 → key 还在吗？
 *
 * 核心：模拟 loadFromDb 完成后组件 effect 触发 → 用旧数据写入 → 覆盖用户保存的竞态。
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

// ── Helpers ──────────────────────────────────────────────

/** 提取最后一次 POST /api/data/settings 的 body */
function getLastWrittenSettings(): Record<string, unknown> | null {
  const postCalls = mockFetch.mock.calls.filter(
    (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/settings") && (c[1] as RequestInit)?.method === "POST"
  );
  if (postCalls.length === 0) return null;
  return JSON.parse((postCalls[postCalls.length - 1]![1] as RequestInit).body as string);
}

/** 统计 POST /api/data/settings 的调用次数 */
function countWriteCalls(): number {
  return mockFetch.mock.calls.filter(
    (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/data/settings") && (c[1] as RequestInit)?.method === "POST"
  ).length;
}

/** 模拟 loadFromDb：拦截 GET /api/data/settings/app，返回 DB 数据 */
function mockDbResponse(record: Record<string, unknown> | AppSettings) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/data/settings/app") && !init?.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, record: { id: "app", ...record } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

// ── 测试数据 ────────────────────────────────────────────

const DB_SETTINGS: Record<string, unknown> = {
  mode: "mock",
  providers: [
    { providerId: "mimo", apiKeyRef: "sk-mimo-db-key", modelIds: ["MiMo-V2.5-Pro"], defaultModelId: "MiMo-V2.5-Pro", enabled: true },
  ],
  agents: [{ agent: "novelty", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 }],
  searchProviders: [
    { providerId: "tavily", name: "Tavily", apiKeyRef: "tvly-db-key", enabled: true },
    { providerId: "epo", name: "EPO OPS", apiKeyRef: "epo-DB-key:epo-DB-secret", enabled: true },
  ],
  enableProviderFallback: true,
  knowledge: { enabled: true, topK: 10, scoreThreshold: 0.5 },
  knowledgeProviders: [
    { providerType: "embedding", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-embedding-DB-key", modelId: "BAAI/bge-m3", availableModels: [], enabled: true },
    { providerType: "reranker", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker-DB-key", modelId: "BAAI/bge-reranker-v2-m3", availableModels: [], enabled: true },
  ],
  providerErrorMessages: [{ id: "err-1", providerId: "mimo", errorCode: "quota", message: "test error", timestamp: "2026-06-05T10:00:00Z", read: false }],
  sanitizeRules: [{ pattern: "\\s+", replace: " ", note: "合并空白" }],
  ocrQualityThresholds: { good: 0.7, poor: 0.4 },
};

// ── 测试 ────────────────────────────────────────────────

describe("持久化 — 模拟真实用户操作序列", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardedErrors.length = 0;
    localStorage.clear();
    useSettingsStore.setState({
      settings: { mode: "mock", guidelineVersion: "2023", providers: [], agents: [], searchProviders: [], enableProviderFallback: true },
      isInitialized: false,
      syncStatus: { connected: false, lastSync: null, syncing: false, error: null },
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 1. 基本存取：保存 → 刷新 → 还在吗？
  // ══════════════════════════════════════════════════════════════

  describe("1. 保存 → 刷新 → 所有 key 还在", () => {
    it("保存所有配置 → 模拟刷新(loadFromDb) → 全字段存活", async () => {
      const savedSettings: AppSettings = {
        mode: "real",
        guidelineVersion: "2023",
        providers: [{ providerId: "mimo", apiKeyRef: "sk-mimo-SAVED", modelIds: ["MiMo-V2.5-Pro"], defaultModelId: "MiMo-V2.5-Pro", enabled: true }],
        agents: [{ agent: "novelty", providerOrder: ["mimo"], modelId: "MiMo-V2.5-Pro", maxTokens: 4096 }],
        searchProviders: [
          { providerId: "tavily", name: "Tavily", apiKeyRef: "tvly-SAVED", enabled: true },
          { providerId: "epo", name: "EPO OPS", apiKeyRef: "epo-SAVED-key:epo-SAVED-secret", enabled: true },
        ],
        enableProviderFallback: true,
        knowledge: { enabled: true, topK: 10, scoreThreshold: 0.5 },
        knowledgeProviders: [
          { providerType: "embedding", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-embedding-SAVED", modelId: "BAAI/bge-m3", availableModels: [], enabled: true },
          { providerType: "reranker", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker-SAVED", modelId: "BAAI/bge-reranker-v2-m3", availableModels: [], enabled: true },
        ],
        providerErrorMessages: [],
        sanitizeRules: [{ pattern: "\\s+", replace: " " }],
        ocrQualityThresholds: { good: 0.75, poor: 0.45 },
      };

      // Step 1: 用户保存
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      useSettingsStore.getState().setSettings(savedSettings);
      await new Promise(r => setTimeout(r, 50));

      const written = getLastWrittenSettings();
      console.log("[保存→刷新] 写入的 providers:", JSON.stringify(written?.providers));
      console.log("[保存→刷新] 写入的 knowledgeProviders:", JSON.stringify(written?.knowledgeProviders));

      // Step 2: 模拟刷新 — loadFromDb 从 DB 读回
      mockDbResponse(savedSettings);
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[保存→刷新] 读回 providers:", JSON.stringify(s.providers));
      console.log("[保存→刷新] 读回 knowledgeProviders:", JSON.stringify(s.knowledgeProviders));

      expect(s.providers[0]!.apiKeyRef).toBe("sk-mimo-SAVED");
      expect(s.searchProviders.find(p => p.providerId === "epo")!.apiKeyRef).toBe("epo-SAVED-key:epo-SAVED-secret");
      expect(s.knowledgeProviders!.find(p => p.providerType === "reranker")!.apiKeyRef).toBe("sk-reranker-SAVED");
      expect(s.knowledgeProviders!.find(p => p.providerType === "embedding")!.apiKeyRef).toBe("sk-embedding-SAVED");
      expect(s.knowledge!.enabled).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 2. 竞态：loadFromDb effect 用旧 knowledgeProviders 覆盖用户保存
  // ══════════════════════════════════════════════════════════════

  describe("2. debounce 防竞态：快速写入只保留最终值", () => {
    it("用户保存 → updateKnowledgeConfig → 两个写入都正确持久化", async () => {
      // 场景：用户保存 provider key，然后 KnowledgeConfigPanel effect 触发 updateKnowledgeConfig
      // updateKnowledgeConfig 只改 knowledge 字段，保留 providers/searchProviders
      // 两个写入在不同 debounce 窗口，各自正确持久化

      // Step 1: loadFromDb 完成
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // Step 2: 用户保存新 provider key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...(DB_SETTINGS.providers as Array<Record<string, unknown>>)[0]!, apiKeyRef: "sk-mimo-USER-NEW" }] as AppSettings["providers"],
      });
      await new Promise(r => setTimeout(r, 50));

      const written1 = getLastWrittenSettings();
      console.log("[debounce] 用户保存后 providers:", JSON.stringify(written1?.providers));
      expect((written1?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef).toBe("sk-mimo-USER-NEW");

      // Step 3: KnowledgeConfigPanel effect 触发 updateKnowledgeConfig（保留 providers）
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().updateKnowledgeConfig({ enabled: false, topK: 5, scoreThreshold: 0.3 });
      await new Promise(r => setTimeout(r, 50));

      const written2 = getLastWrittenSettings();
      console.log("[debounce] updateKnowledgeConfig 后 providers:", JSON.stringify(written2?.providers));
      // updateKnowledgeConfig 保留了 providers
      expect((written2?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef).toBe("sk-mimo-USER-NEW");
      expect((written2?.knowledge as Record<string, unknown>).enabled).toBe(false);
    });

    it("快速连续 setSettings → debounce 合并为 1 次 POST", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // 快速连续 3 次 setSettings（都在 30ms debounce 窗口内）
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      await new Promise(r => setTimeout(r, 100));

      console.log("[debounce] 快速写入 POST 次数:", countWriteCalls());
      expect(countWriteCalls()).toBe(1);
      expect(getLastWrittenSettings()?.mode).toBe("mock");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 3. 竞态：loadFromDb effect 用旧 providers 覆盖用户保存
  // ══════════════════════════════════════════════════════════════

  describe("3. setSettings 快速连续写入 — debounce 保证最终值正确", () => {
    it("用户快速改两次 provider key → debounce 合并 → 最终值正确", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...(DB_SETTINGS.providers as Array<Record<string, unknown>>)[0]!, apiKeyRef: "sk-mimo-FIRST" }] as AppSettings["providers"],
      });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...(DB_SETTINGS.providers as Array<Record<string, unknown>>)[0]!, apiKeyRef: "sk-mimo-SECOND" }] as AppSettings["providers"],
      });
      await new Promise(r => setTimeout(r, 100));

      expect(countWriteCalls()).toBe(1);
      expect((getLastWrittenSettings()?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef).toBe("sk-mimo-SECOND");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 4. 竞态：loadFromDb effect 用旧 searchProviders 覆盖
  // ══════════════════════════════════════════════════════════════

  describe("4. updateKnowledgeConfig 保留 searchProviders", () => {
    it("用户更新 EPO key → updateKnowledgeConfig → EPO key 保留", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // 用户更新 EPO key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const updatedSP = (DB_SETTINGS.searchProviders as Array<Record<string, unknown>>).map(p =>
        p.providerId === "epo" ? { ...p, apiKeyRef: "epo-USER-NEW-key:epo-USER-NEW-secret" } : p
      );
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, searchProviders: updatedSP as unknown as AppSettings["searchProviders"] });
      await new Promise(r => setTimeout(r, 50));

      // KnowledgeConfigPanel effect 触发 updateKnowledgeConfig
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().updateKnowledgeConfig({ enabled: false, topK: 5, scoreThreshold: 0.3 });
      await new Promise(r => setTimeout(r, 50));

      const lastWrite = getLastWrittenSettings();
      const epoKey = (lastWrite?.searchProviders as Array<Record<string, unknown>>).find(p => p.providerId === "epo")?.apiKeyRef;
      console.log("[updateKnowledgeConfig] EPO key:", epoKey);
      // updateKnowledgeConfig 保留了 searchProviders
      expect(epoKey).toBe("epo-USER-NEW-key:epo-USER-NEW-secret");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 4b. 跨面板竞态：切 tab 导致 key 丢失
  // ══════════════════════════════════════════════════════════════

  describe("4b. 跨面板竞态：切 tab 导致 key 丢失", () => {
    it("Providers 面板保存 key → 切到 Knowledge 面板 → Knowledge effect 覆盖 → provider key 丢失", async () => {
      // 场景：用户在 Providers 面板修改 key，然后切到 Knowledge 面板
      // KnowledgeConfigPanel 挂载时 updateKnowledgeConfig effect 触发
      // 如果 effect 用旧 snapshot 写入，provider key 丢失

      // Step 1: loadFromDb 完成
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // Step 2: 用户在 Providers 面板保存新 key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...(DB_SETTINGS.providers as Array<Record<string, unknown>>)[0]!, apiKeyRef: "sk-mimo-USER-TAB-KEY" }] as AppSettings["providers"],
      });
      await new Promise(r => setTimeout(r, 50));
      console.log("[跨面板] Providers 保存后 key:", (getLastWrittenSettings()?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef);

      // Step 3: 用户切到 Knowledge 面板 → KnowledgeConfigPanel 挂载
      // updateKnowledgeConfig effect 触发，用 store 中的 settings 写入
      // 此时 store 中 providers 应该有新 key（setSettings 同步更新了 store）
      // 但如果 KnowledgeConfigPanel 的 updateSettings 用了渲染时的旧 settings 快照，就会覆盖
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      // 模拟 KnowledgeConfigPanel 的 updateKnowledgeConfig effect
      useSettingsStore.getState().updateKnowledgeConfig(useSettingsStore.getState().settings.knowledge!);
      await new Promise(r => setTimeout(r, 50));

      const lastWrite = getLastWrittenSettings();
      const providerKey = (lastWrite?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef;
      console.log("[跨面板] Knowledge effect 写入后 provider key:", providerKey);
      // 验证：provider key 应该保留用户的值
      expect(providerKey).toBe("sk-mimo-USER-TAB-KEY");
    });

    it("Search 面板保存 EPO key → 切到 Knowledge 面板 → Knowledge effect 覆盖 → EPO key 丢失", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // 用户在 Search 面板更新 EPO key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const updatedSP = (DB_SETTINGS.searchProviders as Array<Record<string, unknown>>).map(p =>
        p.providerId === "epo" ? { ...p, apiKeyRef: "epo-USER-TAB-KEY:epo-USER-TAB-SECRET" } : p
      );
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, searchProviders: updatedSP as unknown as AppSettings["searchProviders"] });
      await new Promise(r => setTimeout(r, 50));

      // 切到 Knowledge 面板 → effect 触发
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().updateKnowledgeConfig(useSettingsStore.getState().settings.knowledge!);
      await new Promise(r => setTimeout(r, 50));

      const lastWrite = getLastWrittenSettings();
      const epoKey = (lastWrite?.searchProviders as Array<Record<string, unknown>>).find(p => p.providerId === "epo")?.apiKeyRef;
      console.log("[跨面板] Knowledge effect 写入后 EPO key:", epoKey);
      expect(epoKey).toBe("epo-USER-TAB-KEY:epo-USER-TAB-SECRET");
    });

    it("Knowledge 面板保存 reranker key → 切到 Providers 面板 → 保存 provider → 覆盖 reranker key", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // 用户在 Knowledge 面板保存 reranker key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const withNewReranker = {
        ...useSettingsStore.getState().settings,
        knowledgeProviders: [
          ...(DB_SETTINGS.knowledgeProviders as Array<Record<string, unknown>>).filter(p => p.providerType === "embedding"),
          { providerType: "reranker", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker-USER-TAB-KEY", modelId: "BAAI/bge-reranker-v2-m3", availableModels: [], enabled: true },
        ],
      } as unknown as AppSettings;
      useSettingsStore.getState().setSettings(withNewReranker);
      await new Promise(r => setTimeout(r, 50));

      // 切到 Providers 面板 → 保存 provider
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...(DB_SETTINGS.providers as Array<Record<string, unknown>>)[0]!, apiKeyRef: "sk-mimo-PROVIDERS-TAB" }] as AppSettings["providers"],
      });
      await new Promise(r => setTimeout(r, 50));

      const lastWrite = getLastWrittenSettings();
      const rerankerKey = (lastWrite?.knowledgeProviders as Array<Record<string, unknown>>)?.find(p => p.providerType === "reranker")?.apiKeyRef;
      console.log("[跨面板] Providers 面板写入后 reranker key:", rerankerKey);
      expect(rerankerKey).toBe("sk-reranker-USER-TAB-KEY");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 5. writeSettings fire-and-forget 顺序
  // ══════════════════════════════════════════════════════════════

  describe("5. writeSettings debounce 合并", () => {
    it("连续 3 次 setSettings → debounce 合并为 1 次 POST → 最终值正确", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });

      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      await new Promise(r => setTimeout(r, 100));

      console.log("[debounce] writeSettings POST 次数:", countWriteCalls());
      expect(countWriteCalls()).toBe(1);
      expect(getLastWrittenSettings()?.mode).toBe("mock");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 6. readSettings 默认值（旧 DB 记录缺字段）
  // ══════════════════════════════════════════════════════════════

  describe("6. readSettings 默认值（旧 DB 记录缺字段）", () => {
    it("DB 记录只有 { mode, searchProviders } → 所有字段有值", async () => {
      mockDbResponse({ mode: "mock", searchProviders: [{ providerId: "tavily", name: "Tavily", apiKeyRef: "tvly", enabled: true }] });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[默认值] providers:", s.providers);
      console.log("[默认值] agents:", s.agents);
      console.log("[默认值] knowledgeProviders:", s.knowledgeProviders);
      console.log("[默认值] knowledge:", s.knowledge);

      expect(s.providers).toBeDefined();
      expect(s.agents).toBeDefined();
      expect(s.searchProviders).toBeDefined();
      expect(s.knowledgeProviders).toBeDefined();
      expect(s.knowledge).toBeDefined();
      expect(s.providerErrorMessages).toBeDefined();
      expect(s.sanitizeRules).toBeDefined();
      expect(s.ocrQualityThresholds).toBeDefined();
      expect(s.enableProviderFallback).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 7. isInitialized 守卫
  // ══════════════════════════════════════════════════════════════

  describe("7. isInitialized 守卫", () => {
    it("loadFromDb 前 setSettings → 不写 DB", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      expect(useSettingsStore.getState().isInitialized).toBe(false);
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      await new Promise(r => setTimeout(r, 50));
      expect(countWriteCalls()).toBe(0);
    });

    it("loadFromDb 后 setSettings → 写 DB", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      await new Promise(r => setTimeout(r, 50));
      expect(countWriteCalls()).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 8. writeSettings 失败传播
  // ══════════════════════════════════════════════════════════════

  describe("8. writeSettings 失败传播", () => {
    it("POST 失败 → idbWriteGuard 记录", async () => {
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
  // 9. localStorage fallback
  // ══════════════════════════════════════════════════════════════

  describe("9. localStorage fallback", () => {
    it("DB 失败 → localStorage 有数据 → loadFromDb 从 localStorage 恢复", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ providerId: "mimo", apiKeyRef: "sk-mimo-localStorage", modelIds: ["m1"], defaultModelId: "m1", enabled: true }],
      });
      await new Promise(r => setTimeout(r, 50));

      const lsData = localStorage.getItem("patent-examiner-settings");
      expect(lsData).not.toBeNull();

      // DB 不可用 → loadFromDb 应从 localStorage 恢复
      mockFetch.mockRejectedValue(new Error("DB unavailable"));
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();

      const s = useSettingsStore.getState().settings;
      console.log("[localStorage] DB 失败后恢复 providers:", JSON.stringify(s.providers));
      expect(s.providers[0]!.apiKeyRef).toBe("sk-mimo-localStorage");
    });
  });
});

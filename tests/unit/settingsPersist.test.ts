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
function mockDbResponse(record: Record<string, unknown>) {
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
      expect(s.knowledgeProviders.find(p => p.providerType === "reranker")!.apiKeyRef).toBe("sk-reranker-SAVED");
      expect(s.knowledgeProviders.find(p => p.providerType === "embedding")!.apiKeyRef).toBe("sk-embedding-SAVED");
      expect(s.knowledge!.enabled).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 2. 竞态：loadFromDb effect 用旧 knowledgeProviders 覆盖用户保存
  // ══════════════════════════════════════════════════════════════

  describe("2. 竞态：loadFromDb effect 用旧 knowledgeProviders 覆盖用户保存", () => {
    it("loadFromDb 完成 → effect 用旧 knowledge 覆盖 → 用户的 enabled 状态丢失", async () => {
      // Step 1: DB 中有 knowledge: { enabled: true }
      mockDbResponse({ ...DB_SETTINGS, knowledge: { enabled: true, topK: 10, scoreThreshold: 0.5 } });
      await useSettingsStore.getState().loadFromDb();
      expect(useSettingsStore.getState().settings.knowledge!.enabled).toBe(true);

      // Step 2: 模拟 KnowledgeConfigPanel effect — updateKnowledgeConfig 用 DEFAULT config（enabled: false）
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().updateKnowledgeConfig({ enabled: false, topK: 5, scoreThreshold: 0.3 });
      await new Promise(r => setTimeout(r, 50));

      const written = getLastWrittenSettings();
      console.log("[竞态-knowledge] effect 覆盖后 knowledge:", JSON.stringify(written?.knowledge));
      expect((written?.knowledge as Record<string, unknown>).enabled).toBe(false);

      // Step 3: 刷新 → 读回 → enabled 状态丢失
      mockDbResponse({ ...DB_SETTINGS, knowledge: { enabled: false, topK: 5, scoreThreshold: 0.3 } });
      useSettingsStore.setState({ isInitialized: false });
      await useSettingsStore.getState().loadFromDb();
      console.log("[竞态-knowledge] 刷新后 knowledge:", JSON.stringify(useSettingsStore.getState().settings.knowledge));
      expect(useSettingsStore.getState().settings.knowledge!.enabled).toBe(false);
    });

    it("用户保存 reranker key → effect 用旧 knowledgeProviders 覆盖 → reranker key 丢失", async () => {
      // Step 1: DB 中有 knowledgeProviders（无 reranker key）
      const settingsWithoutReranker = {
        ...DB_SETTINGS,
        knowledgeProviders: [
          { providerType: "embedding", providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-embedding-DB-key", modelId: "BAAI/bge-m3", availableModels: [], enabled: true },
        ],
      };
      mockDbResponse(settingsWithoutReranker);
      await useSettingsStore.getState().loadFromDb();
      expect(useSettingsStore.getState().settings.knowledgeProviders).toHaveLength(1);

      // Step 2: 用户保存 reranker key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const withReranker = {
        ...useSettingsStore.getState().settings,
        knowledgeProviders: [
          ...useSettingsStore.getState().settings.knowledgeProviders,
          { providerType: "reranker" as const, providerId: "siliconflow", displayName: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKeyRef: "sk-reranker-USER-KEY", modelId: "BAAI/bge-reranker-v2-m3", availableModels: [], enabled: true },
        ],
      };
      useSettingsStore.getState().setSettings(withReranker);
      await new Promise(r => setTimeout(r, 50));

      // Step 3: effect 用旧 knowledgeProviders（无 reranker key）覆盖
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const staleSettings = { ...useSettingsStore.getState().settings, knowledgeProviders: settingsWithoutReranker.knowledgeProviders };
      useSettingsStore.setState({ settings: staleSettings as AppSettings });
      useSettingsStore.getState().setSettings(staleSettings as AppSettings);
      await new Promise(r => setTimeout(r, 50));

      const lastWrite = getLastWrittenSettings();
      console.log("[竞态-reranker] 最后写入 knowledgeProviders:", JSON.stringify(lastWrite?.knowledgeProviders));
      const rerankerInWrite = (lastWrite?.knowledgeProviders as Array<Record<string, unknown>>)?.find(p => p.providerType === "reranker");
      console.log("[竞态-reranker] 最后写入含 reranker?", rerankerInWrite?.apiKeyRef);
      // 如果竞态发生，reranker key 丢失
      expect(rerankerInWrite).toBeDefined();
      expect(rerankerInWrite!.apiKeyRef).toBe("sk-reranker-USER-KEY");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 3. 竞态：loadFromDb effect 用旧 providers 覆盖用户保存
  // ══════════════════════════════════════════════════════════════

  describe("3. 竞态：loadFromDb effect 用旧 providers 覆盖", () => {
    it("用户改 provider key → effect 用旧 providers 覆盖 → key 丢失", async () => {
      // Step 1: DB 中有 providers（旧 key）
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // Step 2: 用户修改 provider key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({
        ...useSettingsStore.getState().settings,
        providers: [{ ...DB_SETTINGS.providers[0], apiKeyRef: "sk-mimo-USER-NEW-KEY" }],
      });
      await new Promise(r => setTimeout(r, 50));

      const written1 = getLastWrittenSettings();
      console.log("[竞态-providers] 用户保存后 key:", (written1?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef);

      // Step 3: effect 用旧 providers 覆盖
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, providers: DB_SETTINGS.providers });
      await new Promise(r => setTimeout(r, 50));

      const written2 = getLastWrittenSettings();
      console.log("[竞态-providers] effect 覆盖后 key:", (written2?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef);
      expect((written2?.providers as Array<Record<string, unknown>>)[0]!.apiKeyRef).toBe("sk-mimo-USER-NEW-KEY");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 4. 竞态：loadFromDb effect 用旧 searchProviders 覆盖
  // ══════════════════════════════════════════════════════════════

  describe("4. 竞态：loadFromDb effect 用旧 searchProviders 覆盖", () => {
    it("用户更新 EPO key → effect 用旧 key 覆盖 → key 丢失", async () => {
      mockDbResponse(DB_SETTINGS);
      await useSettingsStore.getState().loadFromDb();

      // 用户更新 EPO key
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      const updatedSP = (DB_SETTINGS.searchProviders as Array<Record<string, unknown>>).map(p =>
        p.providerId === "epo" ? { ...p, apiKeyRef: "epo-USER-NEW-key:epo-USER-NEW-secret" } : p
      );
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, searchProviders: updatedSP });
      await new Promise(r => setTimeout(r, 50));

      // effect 用旧 searchProviders 覆盖
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, searchProviders: DB_SETTINGS.searchProviders });
      await new Promise(r => setTimeout(r, 50));

      const written2 = getLastWrittenSettings();
      const epoKey = (written2?.searchProviders as Array<Record<string, unknown>>).find(p => p.providerId === "epo")?.apiKeyRef;
      console.log("[竞态-searchProviders] effect 覆盖后 EPO key:", epoKey);
      expect(epoKey).toBe("epo-USER-NEW-key:epo-USER-NEW-secret");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 5. writeSettings fire-and-forget 顺序
  // ══════════════════════════════════════════════════════════════

  describe("5. writeSettings fire-and-forget 顺序", () => {
    it("连续 3 次 setSettings → 3 次 POST → 最后一次是最终值", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
      useSettingsStore.setState({ isInitialized: true });

      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "real" });
      useSettingsStore.getState().setSettings({ ...useSettingsStore.getState().settings, mode: "mock" });
      await new Promise(r => setTimeout(r, 100));

      console.log("[fire-and-forget] writeSettings 调用次数:", countWriteCalls());
      expect(countWriteCalls()).toBe(3);
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

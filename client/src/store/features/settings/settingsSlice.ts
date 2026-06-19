import { create } from "zustand";
import type { AppMode } from "@shared/types/domain";
import type { AppSettings, ProviderErrorMessage } from "@shared/types/agents";
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { DEFAULT_KNOWLEDGE_CONFIG } from "@shared/types/knowledge";
import { getById, create as dbCreate, patch as dbPatch } from "../../../lib/repos";
import { createLogger } from "../../../lib/logger";
import { dbWriteGuard } from "../../../lib/dbWriteGuard";

const log = createLogger("SettingsSlice");

/** 从调用栈提取简短 caller 标识 */
function getCaller(skipFrames = 2): string {
  try {
    const stack = new Error().stack?.split("\n").slice(skipFrames) ?? [];
    for (const frame of stack) {
      const m = frame.match(/at (\S+)/);
      if (m && m[1] && !m[1].includes("writeSettings") && !m[1].includes("getCaller")) {
        return m[1].replace(/^Object\./, "").replace(/\.<anonymous>$/, "");
      }
    }
  } catch { /* ignore */ }
  return "unknown";
}

// ── Settings persistence (inlined from settingsRepo) ──

const SETTINGS_ID = "app";

const REPO_DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [
    {
      providerId: "gemini",
      apiKeyRef: "",
      modelIds: ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
      defaultModelId: "gemini-2.5-flash-lite",
      enabled: true
    }
  ],
  agents: [
    { agent: "extract-case-fields", providerOrder: [], modelId: "", maxTokens: 8192 },
    { agent: "classify-documents", providerOrder: [], modelId: "", maxTokens: 2048 },
    { agent: "interpret", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "search-references", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "claim-chart", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "novelty", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "inventive", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "defects", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "opinion-analysis", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "argument-analysis", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "reexam-draft", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "summary", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "translate", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "chat", providerOrder: [], modelId: "", maxTokens: 4096 },
  ],
  searchProviders: [
    { providerId: "tavily", name: "Tavily", apiKeyRef: "", enabled: true }
  ],
  enableProviderFallback: true
};

async function readSettings(caller: string): Promise<AppSettings> {
  try {
    const stored = await getById<AppSettings & { id: string }>("settings", SETTINGS_ID, caller);
    if (stored) {
      return {
        ...stored,
        providers: stored.providers ?? REPO_DEFAULT_SETTINGS.providers,
        agents: stored.agents ?? REPO_DEFAULT_SETTINGS.agents,
        searchProviders: stored.searchProviders ?? REPO_DEFAULT_SETTINGS.searchProviders,
        enableProviderFallback: stored.enableProviderFallback ?? true,
        knowledgeProviders: stored.knowledgeProviders ?? [],
        knowledge: stored.knowledge ?? DEFAULT_KNOWLEDGE_CONFIG,
        providerErrorMessages: stored.providerErrorMessages ?? [],
        sanitizeRules: stored.sanitizeRules ?? [],
        ocrQualityThresholds: stored.ocrQualityThresholds ?? { good: 0.7, poor: 0.4 },
      };
    }
  } catch (e) {
    log("Server read failed:", e);
  }
  return REPO_DEFAULT_SETTINGS;
}

function writeSettings(settings: AppSettings, caller: string): void {
  dbCreate("settings", { ...settings, id: SETTINGS_ID }, caller).catch((e) => {
    log("Server write failed:", e);
    dbWriteGuard("settings")(e);
  });
}

/** 部分更新 — 只写指定字段，服务器 deep merge，不会覆盖其他字段 */
function patchSettings(partial: Partial<AppSettings>, caller: string): void {
  dbPatch("settings", SETTINGS_ID, partial, caller).catch((e) => {
    log("Server patch failed:", e);
    dbWriteGuard("settings")(e);
  });
}


export interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  syncing: boolean;
  error: string | null;
}

export interface SettingsSlice {
  settings: AppSettings;
  isLoading: boolean;
  isInitialized: boolean;
  syncStatus: SyncStatus;

  setSettings: (settings: AppSettings) => void;
  updateMode: (mode: AppMode) => void;
  setLoading: (v: boolean) => void;
  loadFromDb: () => Promise<void>;
  addProviderError: (error: Omit<ProviderErrorMessage, "id">) => void;
  updateKnowledgeConfig: (config: KnowledgeConfig) => void;
  setSyncStatus: (status: Partial<SyncStatus>) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  searchProviders: [],
  // B-027: persistKeysEncrypted 已删除（从未有实现）
  enableProviderFallback: true,
  providerErrorMessages: []
};

export const createSettingsSlice = (
  set: (fn: (prev: SettingsSlice) => Partial<SettingsSlice>) => void,
  _get: () => SettingsSlice
): SettingsSlice => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  isInitialized: false,
  syncStatus: { connected: false, lastSync: null, syncing: false, error: null },

  setSettings: (settings) => {
    if (!_get().isInitialized) return;
    const caller = getCaller(3);
    set(() => ({ settings }));
    writeSettings(settings, `setSettings:${caller}`);
  },
  updateMode: (mode) => {
    const caller = getCaller(3);
    set((prev) => {
      const next = { ...prev.settings, mode };
      writeSettings(next, `updateMode:${caller}`);
      return { settings: next };
    });
  },
  setLoading: (v) => set(() => ({ isLoading: v })),
  addProviderError: (error) => {
    set((prev) => {
      const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const messages = prev.settings.providerErrorMessages ?? [];
      const entry: ProviderErrorMessage = { ...error, id };
      const updated = { ...prev.settings, providerErrorMessages: [entry, ...messages].slice(0, 50) };
      // BUG-162: 用 patchSettings 只写 providerErrorMessages 字段，不覆盖其他字段
      patchSettings({ providerErrorMessages: updated.providerErrorMessages }, "addProviderError");
      return { settings: updated };
    });
  },
  updateKnowledgeConfig: (config) => {
    if (!_get().isInitialized) return;
    set((prev) => {
      const next = { ...prev.settings, knowledge: config };
      // BUG-162: 用 patchSettings 只写 knowledge 字段，不覆盖其他字段
      patchSettings({ knowledge: config }, "updateKnowledgeConfig");
      return { settings: next };
    });
  },
  setSyncStatus: (status) => {
    set((prev) => ({ syncStatus: { ...prev.syncStatus, ...status } }));
  },
  loadFromDb: async () => {
    try {
      const saved = await readSettings("loadFromDb");
      set(() => ({ settings: saved, isInitialized: true }));
    } catch (e) {
      log("Failed to load settings from DB:", e);
      set(() => ({ isInitialized: true }));
    }
  }
});

export const useSettingsStore = create<SettingsSlice>()((set, get) =>
  createSettingsSlice(set, get)
);

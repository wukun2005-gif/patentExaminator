import { create } from "zustand";
import type { AppMode } from "@shared/types/domain";
import type { AppSettings, ProviderErrorMessage } from "@shared/types/agents";
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { DEFAULT_KNOWLEDGE_CONFIG } from "@shared/types/knowledge";
import { getById, create as dbCreate } from "../../../lib/repos";
import { waitForServerReady } from "../../../lib/serverReady";
import { createLogger } from "../../../lib/logger";
import { idbWriteGuard } from "../../../lib/idbWriteGuard";

const log = createLogger("SettingsSlice");

// ── Settings persistence (inlined from settingsRepo) ──

const SETTINGS_ID = "app";
const LS_KEY = "patent-examiner-settings";

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
    { agent: "interpret", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "claim-chart", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "novelty", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "inventive", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "summary", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "chat", providerOrder: [], modelId: "", maxTokens: 4096 },
    { agent: "extract-case-fields", providerOrder: [], modelId: "", maxTokens: 8192 }
  ],
  searchProviders: [
    { providerId: "tavily", name: "Tavily", apiKeyRef: "", enabled: true }
  ],
  enableProviderFallback: true
};

async function readSettings(): Promise<AppSettings> {
  try {
    const stored = await getById<AppSettings & { id: string }>("settings", SETTINGS_ID);
    if (stored) {
      const result: AppSettings = {
        ...stored,
        searchProviders: stored.searchProviders ?? REPO_DEFAULT_SETTINGS.searchProviders,
        enableProviderFallback: stored.enableProviderFallback ?? true,
        knowledgeProviders: stored.knowledgeProviders ?? [],
        knowledge: stored.knowledge ?? DEFAULT_KNOWLEDGE_CONFIG,
        providerErrorMessages: stored.providerErrorMessages ?? [],
        sanitizeRules: stored.sanitizeRules ?? [],
        ocrQualityThresholds: stored.ocrQualityThresholds ?? { good: 0.7, poor: 0.4 },
      };
      try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch { /* ignore */ }
      return result;
    }
  } catch (e) {
    log("Server read failed, trying localStorage:", e);
  }
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) return JSON.parse(ls) as AppSettings;
  } catch (e) {
    log("localStorage JSON.parse failed, using defaults:", e);
  }
  return REPO_DEFAULT_SETTINGS;
}

async function writeSettings(settings: AppSettings): Promise<void> {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  try {
    await dbCreate("settings", { ...settings, id: SETTINGS_ID });
  } catch (e) {
    log("Server write failed, settings saved to localStorage only:", e);
    throw e;
  }
}

interface SyncResult {
  success: boolean;
  syncedProviders: string[];
  failedProviders: Array<{ providerId: string; error: string }>;
}

async function syncProviderKeys(settings: AppSettings): Promise<SyncResult> {
  await waitForServerReady("/api");
  const syncedProviders: string[] = [];
  const failedProviders: Array<{ providerId: string; error: string }> = [];
  for (const provider of settings.providers) {
    if (!provider.enabled || !provider.apiKeyRef) continue;
    try {
      const response = await fetch(`/api/settings/providers/${provider.providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: provider.apiKeyRef })
      });
      if (!response.ok) {
        failedProviders.push({ providerId: provider.providerId, error: `HTTP ${response.status}: ${response.statusText}` });
      } else {
        syncedProviders.push(provider.providerId);
      }
    } catch (err) {
      failedProviders.push({ providerId: provider.providerId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { success: failedProviders.length === 0, syncedProviders, failedProviders };
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
    set(() => ({ settings }));
    writeSettings(settings).catch(idbWriteGuard("settings"));
    if (settings.mode === "real") {
      syncProviderKeys(settings).then((result) => {
        if (!result.success) {
          log("Provider key sync partially failed:", result.failedProviders);
          _get().setSyncStatus({ error: result.failedProviders.map((p) => `${p.providerId}: ${p.error}`).join(", ") });
        }
      }).catch(idbWriteGuard("settings"));
    }
  },
  updateMode: (mode) => {
    set((prev) => {
      const next = { ...prev.settings, mode };
      writeSettings(next).catch(idbWriteGuard("settings"));
      if (mode === "real") {
        syncProviderKeys(next).then((result) => {
          if (!result.success) {
            log("Provider key sync partially failed:", result.failedProviders);
          }
        }).catch(idbWriteGuard("settings"));
      }
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
      writeSettings(updated).catch(idbWriteGuard("settings"));
      return { settings: updated };
    });
  },
  updateKnowledgeConfig: (config) => {
    if (!_get().isInitialized) return;
    set((prev) => {
      const next = { ...prev.settings, knowledge: config };
      writeSettings(next).catch(idbWriteGuard("settings"));
      return { settings: next };
    });
  },
  setSyncStatus: (status) => {
    set((prev) => ({ syncStatus: { ...prev.syncStatus, ...status } }));
  },
  loadFromDb: async () => {
    try {
      const saved = await readSettings();
      set(() => ({ settings: saved, isInitialized: true }));
      // Sync API keys to server so AI calls work in real mode
      if (saved.mode === "real") {
        syncProviderKeys(saved).then((result) => {
          if (!result.success) {
            log("Provider key sync partially failed:", result.failedProviders);
          }
        }).catch(idbWriteGuard("settings"));
      }
    } catch (e) {
      log("Failed to load settings from DB:", e);
      set(() => ({ isInitialized: true }));
    }
  }
});

export const useSettingsStore = create<SettingsSlice>()((set, get) =>
  createSettingsSlice(set, get)
);

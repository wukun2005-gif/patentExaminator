import { create } from "zustand";
import type { AppMode } from "@shared/types/domain";
import type { AppSettings, ProviderErrorMessage } from "@shared/types/agents";
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { readSettings, writeSettings, syncProviderKeys } from "../../../lib/repositories/settingsRepo";
import { createLogger } from "../../../lib/logger";
import { idbWriteGuard } from "../../../lib/idbWriteGuard";

const log = createLogger("SettingsSlice");

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
    set(() => ({ settings }));
    writeSettings(settings).catch(idbWriteGuard("settings"));
    if (settings.mode === "real") {
      syncProviderKeys(settings).then((result) => {
        if (!result.success) {
          log("Provider key sync partially failed:", result.failedProviders);
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

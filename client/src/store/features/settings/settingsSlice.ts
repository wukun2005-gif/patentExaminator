import { create } from "zustand";
import type { AppMode } from "@shared/types/domain";
import type { AppSettings, ProviderErrorMessage } from "@shared/types/agents";
import { readSettings, writeSettings, syncProviderKeys } from "../../../lib/repositories/settingsRepo";

export interface SettingsSlice {
  settings: AppSettings;
  isLoading: boolean;
  isInitialized: boolean;

  setSettings: (settings: AppSettings) => void;
  updateMode: (mode: AppMode) => void;
  setLoading: (v: boolean) => void;
  loadFromDb: () => Promise<void>;
  addProviderError: (error: Omit<ProviderErrorMessage, "id">) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  searchProviders: [],
  persistKeysEncrypted: false,
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

  setSettings: (settings) => {
    set(() => ({ settings }));
    writeSettings(settings).catch(console.error);
    if (settings.mode === "real") {
      syncProviderKeys(settings).then((result) => {
        if (!result.success) {
          console.warn("[SettingsSlice] Provider key sync partially failed:", result.failedProviders);
        }
      }).catch(console.error);
    }
  },
  updateMode: (mode) => {
    set((prev) => {
      const next = { ...prev.settings, mode };
      writeSettings(next).catch(console.error);
      if (mode === "real") {
        syncProviderKeys(next).then((result) => {
          if (!result.success) {
            console.warn("[SettingsSlice] Provider key sync partially failed:", result.failedProviders);
          }
        }).catch(console.error);
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
      writeSettings(updated).catch(console.error);
      return { settings: updated };
    });
  },
  loadFromDb: async () => {
    try {
      const saved = await readSettings();
      set(() => ({ settings: saved, isInitialized: true }));
      // Sync API keys to server so AI calls work in real mode
      if (saved.mode === "real") {
        syncProviderKeys(saved).then((result) => {
          if (!result.success) {
            console.warn("[SettingsSlice] Provider key sync partially failed:", result.failedProviders);
          }
        }).catch(console.error);
      }
    } catch (e) {
      console.error("Failed to load settings from DB:", e);
      set(() => ({ isInitialized: true }));
    }
  }
});

export const useSettingsStore = create<SettingsSlice>()((set, get) =>
  createSettingsSlice(set, get)
);

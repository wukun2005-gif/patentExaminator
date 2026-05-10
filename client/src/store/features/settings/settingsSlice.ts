import { create } from "zustand";
import type { AppMode } from "@shared/types/domain";
import type { AppSettings } from "@shared/types/agents";

export interface SettingsSlice {
  settings: AppSettings;
  isLoading: boolean;

  setSettings: (settings: AppSettings) => void;
  updateMode: (mode: AppMode) => void;
  setLoading: (v: boolean) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  persistKeysEncrypted: false
};

export const createSettingsSlice = (
  set: (fn: (prev: SettingsSlice) => Partial<SettingsSlice>) => void,
  _get: () => SettingsSlice
): SettingsSlice => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  setSettings: (settings) => set(() => ({ settings })),
  updateMode: (mode) =>
    set((prev) => ({ settings: { ...prev.settings, mode } })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useSettingsStore = create<SettingsSlice>()((set, get) =>
  createSettingsSlice(set, get)
);

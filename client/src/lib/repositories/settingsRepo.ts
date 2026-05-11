import { getDB } from "../indexedDb.js";
import type { AppSettings } from "@shared/types/agents";

const SETTINGS_ID = "app";
const LS_KEY = "patent-examiner-settings";

const DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [
    {
      providerId: "gemini",
      apiKeyRef: "gemini",
      modelIds: ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
      defaultModelId: "gemini-2.5-flash-lite",
      enabled: true
    }
  ],
  agents: [
    {
      agent: "interpret",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "claim-chart",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "novelty",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "inventive",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "summary",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "draft",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    },
    {
      agent: "chat",
      providerOrder: ["gemini"],
      modelId: "gemini-2.5-flash-lite",
      maxTokens: 4096
    }
  ],
  persistKeysEncrypted: false
};

export async function readSettings(): Promise<AppSettings> {
  // Try IndexedDB first
  try {
    const db = await getDB();
    const stored = await db.get("settings", SETTINGS_ID);
    if (stored) {
      const result: AppSettings = {
        mode: stored.mode,
        guidelineVersion: stored.guidelineVersion,
        providers: stored.providers,
        agents: stored.agents,
        persistKeysEncrypted: stored.persistKeysEncrypted
      };
      if (stored.sanitizeRules) result.sanitizeRules = stored.sanitizeRules;
      if (stored.ocrQualityThresholds) result.ocrQualityThresholds = stored.ocrQualityThresholds;
      // Also sync to localStorage as backup
      try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch { /* ignore */ }
      return result;
    }
  } catch (e) {
    console.warn("IndexedDB read failed, trying localStorage:", e);
  }

  // Fallback: try localStorage
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) return JSON.parse(ls) as AppSettings;
  } catch { /* ignore */ }

  return DEFAULT_SETTINGS;
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  // Always write to localStorage as backup
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }

  // Write to IndexedDB
  try {
    const db = await getDB();
    await db.put("settings", { ...settings, id: SETTINGS_ID });
  } catch (e) {
    console.warn("IndexedDB write failed, settings saved to localStorage only:", e);
  }
}

const ALL_STORES = [
  "cases", "documents", "textIndex", "claimNodes", "claimCharts",
  "novelty", "inventive", "ocrCache", "chatMessages", "feedback", "settings"
] as const;

export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([...ALL_STORES], "readwrite");
  await Promise.all([
    ...ALL_STORES.map((store) => tx.objectStore(store).clear()),
    tx.done
  ]);
}

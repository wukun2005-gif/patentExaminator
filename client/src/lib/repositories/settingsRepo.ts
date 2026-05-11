import { getDB } from "../indexedDb.js";
import type { AppSettings } from "@shared/types/agents";

const SETTINGS_ID = "app";
const LS_KEY = "patent-examiner-settings";

const DEFAULT_SETTINGS: AppSettings = {
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
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

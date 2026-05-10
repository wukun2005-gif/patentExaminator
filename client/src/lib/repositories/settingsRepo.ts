import { getDB } from "../indexedDb.js";
import type { AppSettings } from "@shared/types/agents";

const SETTINGS_ID = "app";

const DEFAULT_SETTINGS: AppSettings & { id: string } = {
  id: SETTINGS_ID,
  mode: "mock",
  guidelineVersion: "2023",
  providers: [],
  agents: [],
  persistKeysEncrypted: false
};

export async function readSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = await db.get("settings", SETTINGS_ID);
  if (!stored) return DEFAULT_SETTINGS;
  const result: AppSettings = {
    mode: stored.mode,
    guidelineVersion: stored.guidelineVersion,
    providers: stored.providers,
    agents: stored.agents,
    persistKeysEncrypted: stored.persistKeysEncrypted
  };
  if (stored.sanitizeRules) result.sanitizeRules = stored.sanitizeRules;
  if (stored.ocrQualityThresholds) result.ocrQualityThresholds = stored.ocrQualityThresholds;
  return result;
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put("settings", { ...settings, id: SETTINGS_ID });
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

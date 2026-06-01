import { getDB } from "../indexedDb.js";
import type { AppSettings } from "@shared/types/agents";
import { waitForServerReady } from "../serverReady";
import { createLogger } from "../logger";

const log = createLogger("settingsRepo");

const SETTINGS_ID = "app";
const LS_KEY = "patent-examiner-settings";

const DEFAULT_SETTINGS: AppSettings = {
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
    {
      agent: "interpret",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "claim-chart",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "novelty",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "inventive",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "summary",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "draft",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "chat",
      providerOrder: [],
      modelId: "",
      maxTokens: 4096
    },
    {
      agent: "extract-case-fields",
      providerOrder: [],
      modelId: "",
      maxTokens: 8192
    }
  ],
  searchProviders: [
    {
      providerId: "tavily",
      name: "Tavily",
      apiKeyRef: "",
      enabled: true
    }
  ],
  // B-027: persistKeysEncrypted 已删除（从未有实现）
  enableProviderFallback: true
};

export async function readSettings(): Promise<AppSettings> {
  // Try IndexedDB first
  try {
    const db = await getDB();
    const stored = await db.get("settings", SETTINGS_ID);
    if (stored) {
      // 保留所有存储的字段，只对缺失字段设默认值
      const result: AppSettings = {
        ...stored,
        searchProviders: stored.searchProviders ?? DEFAULT_SETTINGS.searchProviders,
        enableProviderFallback: stored.enableProviderFallback ?? true,
      };
      // Also sync to localStorage as backup
      try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch { /* ignore */ }
      return result;
    }
  } catch (e) {
    log("IndexedDB read failed, trying localStorage:", e);
  }

  // Fallback: try localStorage
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) return JSON.parse(ls) as AppSettings;
  } catch (e) {
    log("localStorage JSON.parse failed, using defaults:", e);
  }

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
    log("IndexedDB write failed, settings saved to localStorage only:", e);
  }
}

export interface SyncResult {
  success: boolean;
  syncedProviders: string[];
  failedProviders: Array<{ providerId: string; error: string }>;
}

/**
 * Sync enabled provider API keys to the server's in-memory key store.
 * The server needs these keys to make real AI calls.
 * Returns sync result with success/failure details for each provider.
 */
export async function syncProviderKeys(settings: AppSettings): Promise<SyncResult> {
  // Wait for server to be ready before syncing
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
        failedProviders.push({
          providerId: provider.providerId,
          error: `HTTP ${response.status}: ${response.statusText}`
        });
      } else {
        syncedProviders.push(provider.providerId);
      }
    } catch (err) {
      failedProviders.push({
        providerId: provider.providerId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    success: failedProviders.length === 0,
    syncedProviders,
    failedProviders
  };
}

const ALL_STORES = [
  "cases", "documents", "textIndex", "claimNodes", "claimCharts",
  "novelty", "inventive", "defects", "ocrCache",
  "chatMessages", "chatSessions", "feedback", "settings",
  "interpretSummaries", "opinionAnalyses", "argumentMappings",
  "reexamDrafts", "summaries", "runMarkers", "searchSessions",
  "knowledgeSources", "knowledgeChunks", "knowledgeVectors"
] as const;

export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([...ALL_STORES], "readwrite");
  await Promise.all([
    ...ALL_STORES.map((store) => tx.objectStore(store).clear()),
    tx.done
  ]);
}

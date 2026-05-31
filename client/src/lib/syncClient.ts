/**
 * 客户端同步模块 — 与服务器 SQLite 数据库同步 IndexedDB 数据
 * 无认证，单用户场景
 */
import { getDB } from "./indexedDb";
import { createLogger } from "./logger";

const log = createLogger("SyncClient");

// 需要同步的 IndexedDB store 列表
const SYNC_STORES = [
  "cases", "documents", "textIndex", "claimNodes", "claimCharts",
  "novelty", "inventive", "defects", "ocrCache",
  "chatMessages", "chatSessions", "feedback", "settings",
  "interpretSummaries", "opinionAnalyses", "argumentMappings",
  "reexamDrafts", "summaries", "runMarkers", "searchSessions",
  "knowledgeSources", "knowledgeChunks", "knowledgeVectors",
] as const;

export interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  syncing: boolean;
  error: string | null;
}

export interface SyncResult {
  ok: boolean;
  uploaded?: number;
  downloaded?: number;
  error?: string;
}

const GATEWAY_URL = "/api";

/** 检查服务器同步服务是否可用 */
export async function checkSyncStatus(): Promise<SyncStatus> {
  try {
    const res = await fetch(`${GATEWAY_URL}/sync/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { ok: boolean; lastSync: string | null; totalRecords: number };
    return { connected: true, lastSync: data.lastSync, syncing: false, error: null };
  } catch (err) {
    return { connected: false, lastSync: null, syncing: false, error: String(err) };
  }
}

/** 上传本地 IndexedDB 数据到服务器 */
export async function uploadToServer(): Promise<SyncResult> {
  try {
    const db = await getDB();
    const stores: Record<string, Array<{ id: string; data: unknown }>> = {};

    for (const storeName of SYNC_STORES) {
      try {
        const records = await db.getAll(storeName);
        if (records.length > 0) {
          stores[storeName] = records.map((r: unknown) => {
            const record = r as Record<string, unknown>;
            return { id: String(record.id ?? record.caseId ?? record.chunkId ?? Math.random()), data: record };
          });
        }
      } catch {
        // store 可能不存在，跳过
      }
    }

    const res = await fetch(`${GATEWAY_URL}/sync/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stores }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { ok: boolean; uploaded: number };
    log(`Uploaded ${data.uploaded} records`);
    return { ok: true, uploaded: data.uploaded };
  } catch (err) {
    log(`Upload failed: ${err}`);
    return { ok: false, error: String(err) };
  }
}

/** 从服务器下载数据到本地 IndexedDB */
export async function downloadFromServer(): Promise<SyncResult> {
  try {
    const res = await fetch(`${GATEWAY_URL}/sync/download`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { ok: boolean; stores: Record<string, Array<{ id: string; data: unknown }>> };

    const db = await getDB();
    let downloaded = 0;

    for (const [storeName, records] of Object.entries(data.stores)) {
      try {
        const tx = db.transaction(storeName, "readwrite");
        for (const record of records) {
          await tx.store.put(record.data);
          downloaded++;
        }
        await tx.done;
      } catch {
        // store 可能不存在，跳过
      }
    }

    log(`Downloaded ${downloaded} records`);
    return { ok: true, downloaded };
  } catch (err) {
    log(`Download failed: ${err}`);
    return { ok: false, error: String(err) };
  }
}

/** 双向同步：先上传本地变更，再下载服务器最新数据 */
export async function syncWithServer(): Promise<SyncResult> {
  log("Starting sync...");
  const uploadResult = await uploadToServer();
  if (!uploadResult.ok) return uploadResult;

  const downloadResult = await downloadFromServer();
  if (!downloadResult.ok) return downloadResult;

  log(`Sync complete: uploaded ${uploadResult.uploaded}, downloaded ${downloadResult.downloaded}`);
  return { ok: true, uploaded: uploadResult.uploaded, downloaded: downloadResult.downloaded };
}

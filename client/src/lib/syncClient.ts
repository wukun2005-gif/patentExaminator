/**
 * 客户端同步模块 — 与服务器 SQLite 数据库同步数据
 * B-034: 从 IndexedDB 迁移到 dataClient API
 */
import { getAll, create } from "./repos";
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

/** 上传数据到服务器 */
export async function uploadToServer(): Promise<SyncResult> {
  try {
    const stores: Record<string, Array<{ id: string; data: unknown }>> = {};

    for (const storeName of SYNC_STORES) {
      try {
        const records = await getAll<Record<string, unknown>>(storeName);
        if (records.length > 0) {
          stores[storeName] = records.map((r) => ({
            id: String(r.id ?? r.caseId ?? r.chunkId ?? Math.random()),
            data: r
          }));
        }
      } catch (e) {
        log("Failed to read store for sync upload:", e);
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

    let downloaded = 0;

    for (const [storeName, records] of Object.entries(data.stores)) {
      try {
        for (const record of records) {
          await create(storeName, record.data as { id: string });
          downloaded++;
        }
      } catch (e) {
        log("Failed to write synced records for store:", e);
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
  return {
    ok: true,
    ...(uploadResult.uploaded !== undefined && { uploaded: uploadResult.uploaded }),
    ...(downloadResult.downloaded !== undefined && { downloaded: downloadResult.downloaded }),
  };
}

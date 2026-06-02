/**
 * 知识库 Repository — dataClient CRUD 操作
 * B-034: 从 IndexedDB 迁移到 dataClient API
 */
import { getAll, getById, create, update, remove, clearStore, query } from "../repos";
import type { KnowledgeSource, KnowledgeChunk, KnowledgeVector } from "@shared/types/knowledge";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeRepo");

// ── KnowledgeSource ──────────────────────────────────

export async function addSource(source: KnowledgeSource): Promise<void> {
  await create("knowledgeSources", source as KnowledgeSource & { id: string });
  log(`Added source: ${source.id} (${source.name})`);
}

export async function getSource(id: string): Promise<KnowledgeSource | undefined> {
  const result = await getById<KnowledgeSource>("knowledgeSources", id);
  return result ?? undefined;
}

export async function getAllSources(): Promise<KnowledgeSource[]> {
  return getAll<KnowledgeSource>("knowledgeSources");
}

/** 分页获取 chunk */
export async function getChunksPaginated(
  offset: number = 0,
  limit: number = 50
): Promise<{ chunks: KnowledgeChunk[]; total: number }> {
  const all = await getAll<KnowledgeChunk>("knowledgeChunks");
  return {
    chunks: all.slice(offset, offset + limit),
    total: all.length,
  };
}

/** 获取所有 chunk（用于 BM25 检索） */
export async function getAllChunks(): Promise<KnowledgeChunk[]> {
  return getAll<KnowledgeChunk>("knowledgeChunks");
}

export async function deleteSource(id: string): Promise<void> {
  // 删除关联的 chunks 和 vectors
  const chunks = await query<KnowledgeChunk>("knowledgeChunks", "sourceId", id);
  for (const chunk of chunks) {
    await remove("knowledgeVectors", chunk.id);
    await remove("knowledgeChunks", chunk.id);
  }
  await remove("knowledgeSources", id);
  log(`Deleted source: ${id}`);
}

// ── KnowledgeChunk ───────────────────────────────────

export async function addChunks(chunks: KnowledgeChunk[]): Promise<void> {
  for (const chunk of chunks) {
    await create("knowledgeChunks", chunk as KnowledgeChunk & { id: string });
  }
  log(`Added ${chunks.length} chunks`);
}

export async function getChunksBySource(sourceId: string): Promise<KnowledgeChunk[]> {
  return query<KnowledgeChunk>("knowledgeChunks", "sourceId", sourceId);
}

export async function getUnembeddedChunks(): Promise<KnowledgeChunk[]> {
  const all = await getAll<KnowledgeChunk>("knowledgeChunks");
  return all.filter((c) => !c.embedded);
}

export async function markChunkEmbedded(chunkId: string): Promise<void> {
  const chunk = await getById<KnowledgeChunk>("knowledgeChunks", chunkId);
  if (chunk) {
    chunk.embedded = true;
    await update("knowledgeChunks", chunkId, chunk);
  }
}

export async function deleteChunksBySource(sourceId: string): Promise<void> {
  const chunks = await query<KnowledgeChunk>("knowledgeChunks", "sourceId", sourceId);
  for (const chunk of chunks) {
    await remove("knowledgeChunks", chunk.id);
  }
}

// ── KnowledgeVector ──────────────────────────────────

export async function addVectors(vectors: KnowledgeVector[]): Promise<void> {
  for (const vec of vectors) {
    await create("knowledgeVectors", vec as KnowledgeVector & { id: string });
  }
  log(`Added ${vectors.length} vectors`);
}

export async function getVector(chunkId: string): Promise<KnowledgeVector | undefined> {
  const result = await getById<KnowledgeVector>("knowledgeVectors", chunkId);
  return result ?? undefined;
}

export async function getAllVectors(): Promise<KnowledgeVector[]> {
  return getAll<KnowledgeVector>("knowledgeVectors");
}

export async function deleteVectorsBySource(sourceId: string): Promise<void> {
  const chunks = await query<KnowledgeChunk>("knowledgeChunks", "sourceId", sourceId);
  for (const chunk of chunks) {
    await remove("knowledgeVectors", chunk.id);
  }
}

// ── 统计 ─────────────────────────────────────────────

export async function getKnowledgeStats(): Promise<{
  sourceCount: number;
  chunkCount: number;
  embeddedCount: number;
}> {
  const sources = await getAll<KnowledgeSource>("knowledgeSources");
  const chunks = await getAll<KnowledgeChunk>("knowledgeChunks");
  const vectors = await getAll<KnowledgeVector>("knowledgeVectors");
  return { sourceCount: sources.length, chunkCount: chunks.length, embeddedCount: vectors.length };
}

// ── 一致性校验 ─────────────────────────────────────────

export interface ConsistencyReport {
  orphanedChunks: string[];   // 有 chunk 无 vector
  orphanedVectors: string[];  // 有 vector 无 chunk
  isConsistent: boolean;
}

/** 检查 chunk 和 vector 的一致性 */
export async function checkConsistency(): Promise<ConsistencyReport> {
  const chunks = await getAll<KnowledgeChunk>("knowledgeChunks");
  const vectors = await getAll<KnowledgeVector>("knowledgeVectors");

  const chunkIds = new Set(chunks.map((c) => c.id));
  const vectorIds = new Set(vectors.map((v) => v.chunkId));

  const orphanedChunks = chunks.filter((c) => !vectorIds.has(c.id)).map((c) => c.id);
  const orphanedVectors = vectors.filter((v) => !chunkIds.has(v.chunkId)).map((v) => v.chunkId);

  return {
    orphanedChunks,
    orphanedVectors,
    isConsistent: orphanedChunks.length === 0 && orphanedVectors.length === 0,
  };
}

/** 修复不一致：删除孤立的 vector */
export async function fixConsistency(): Promise<ConsistencyReport> {
  const report = await checkConsistency();
  if (report.isConsistent) return report;

  for (const vectorId of report.orphanedVectors) {
    await remove("knowledgeVectors", vectorId);
  }

  log(`Fixed consistency: removed ${report.orphanedVectors.length} orphaned vectors`);
  return { ...report, orphanedVectors: [], isConsistent: report.orphanedChunks.length === 0 };
}

// ── 文档摘要 ──────────────────────────────────────────

/** 为 source 生成摘要（基于前几个 chunk 的内容） */
export async function generateSourceSummary(sourceId: string): Promise<string> {
  const chunks = await getChunksBySource(sourceId);
  if (chunks.length === 0) return "";

  const summaryParts = chunks
    .slice(0, 3)
    .map((c) => c.text.slice(0, 200))
    .filter((t) => t.length > 20);

  return summaryParts.join("\n---\n");
}

/** 更新 source 的摘要 */
export async function updateSourceSummary(sourceId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;

  const summary = await generateSourceSummary(sourceId);
  source.summary = summary;
  source.updatedAt = new Date().toISOString();
  await addSource(source);
  log(`Updated summary for source: ${sourceId}`);
}

// ── 存储空间 ──────────────────────────────────────────

export interface StorageEstimate {
  sourceCount: number;
  chunkCount: number;
  vectorCount: number;
  estimatedBytes: number;
  estimatedMB: string;
}

/** 估算知识库存储占用 */
export async function estimateStorage(): Promise<StorageEstimate> {
  const sources = await getAll<KnowledgeSource>("knowledgeSources");
  const chunks = await getAll<KnowledgeChunk>("knowledgeChunks");
  const vectors = await getAll<KnowledgeVector>("knowledgeVectors");

  let totalBytes = 0;
  for (const chunk of chunks) {
    totalBytes += chunk.text.length * 3;
  }
  for (const vec of vectors) {
    totalBytes += vec.vector.length * 8;
  }
  for (const _source of sources) {
    totalBytes += 500;
  }

  return {
    sourceCount: sources.length,
    chunkCount: chunks.length,
    vectorCount: vectors.length,
    estimatedBytes: totalBytes,
    estimatedMB: (totalBytes / 1024 / 1024).toFixed(2),
  };
}

// ── 冲突检测 ──────────────────────────────────────────

export interface ConflictReport {
  sourceId: string;
  sourceName: string;
  conflictingWith: string;
  conflictType: "same-name" | "same-category" | "overlapping-content";
  suggestion: string;
}

/** 检测新文件是否与已有文件冲突 */
export async function detectConflicts(
  newSource: { name: string; fileHash?: string },
  newChunks: Array<{ text: string }>
): Promise<ConflictReport[]> {
  const existing = await getAllSources();
  const reports: ConflictReport[] = [];

  for (const ex of existing) {
    if (ex.name === newSource.name && ex.fileHash !== newSource.fileHash) {
      reports.push({
        sourceId: ex.id,
        sourceName: ex.name,
        conflictingWith: newSource.name,
        conflictType: "same-name",
        suggestion: "同名文件已存在，建议替换或重命名",
      });
    }

    const existingChunks = await getChunksBySource(ex.id);
    const existingCategory = existingChunks[0]?.metadata.documentCategory;
    if (existingCategory && existingCategory !== "其他") {
      const hasSimilarChunk = newChunks.some((nc) =>
        existingChunks.some((ec) => ec.text.slice(0, 100) === nc.text.slice(0, 100))
      );
      if (hasSimilarChunk) {
        reports.push({
          sourceId: ex.id,
          sourceName: ex.name,
          conflictingWith: newSource.name,
          conflictType: "overlapping-content",
          suggestion: `与已有文件"${ex.name}"内容高度重叠，可能是同一法规的不同版本`,
        });
      }
    }
  }

  return reports;
}

// ── 备份 ──────────────────────────────────────────────

/** 下载知识库备份为 JSON 文件 */
export async function downloadBackup(): Promise<void> {
  const data = await exportKnowledge();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `knowledge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log(`Downloaded backup: ${data.sources.length} sources, ${data.chunks.length} chunks`);
}

/** 从 JSON 文件恢复知识库备份 */
export async function restoreFromBackup(file: File): Promise<{
  importedSources: number;
  importedChunks: number;
  importedVectors: number;
}> {
  const text = await file.text();
  let data: KnowledgeExportData;
  try {
    data = JSON.parse(text) as KnowledgeExportData;
  } catch (e) {
    log("restoreFromBackup JSON.parse failed:", e);
    throw new Error("备份文件格式无效：无法解析 JSON");
  }
  if (data.version !== 1) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }
  return importKnowledge(data);
}

// ── 浏览器兼容 ────────────────────────────────────────

/** 检查存储配额 */
export async function checkStorageQuota(): Promise<{
  available: boolean;
  usage: number;
  quota: number;
  usagePercent: string;
  warning: string | null;
}> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const percent = quota > 0 ? ((usage / quota) * 100).toFixed(1) : "0";
      const warning = usage / quota > 0.8 ? "存储空间使用超过 80%，建议清理旧数据" : null;
      return { available: true, usage, quota, usagePercent: percent, warning };
    }
    return { available: true, usage: 0, quota: 0, usagePercent: "未知", warning: null };
  } catch (e) {
    log("checkStorageQuota error:", e);
    return { available: false, usage: 0, quota: 0, usagePercent: "0", warning: "存储不可用" };
  }
}

// ── 导入/导出 ─────────────────────────────────────────

export interface KnowledgeExportData {
  version: 1;
  exportedAt: string;
  sources: KnowledgeSource[];
  chunks: KnowledgeChunk[];
  vectors: KnowledgeVector[];
}

/** 导出全部知识库数据为 JSON */
export async function exportKnowledge(): Promise<KnowledgeExportData> {
  const sources = await getAll<KnowledgeSource>("knowledgeSources");
  const chunks = await getAll<KnowledgeChunk>("knowledgeChunks");
  const vectors = await getAll<KnowledgeVector>("knowledgeVectors");
  return { version: 1, exportedAt: new Date().toISOString(), sources, chunks, vectors };
}

/** 从 JSON 导入知识库数据（合并模式，不覆盖已有） */
export async function importKnowledge(data: KnowledgeExportData): Promise<{
  importedSources: number;
  importedChunks: number;
  importedVectors: number;
}> {
  const existingSources = new Set((await getAll<KnowledgeSource>("knowledgeSources")).map((s) => s.id));
  const existingChunks = new Set((await getAll<KnowledgeChunk>("knowledgeChunks")).map((c) => c.id));
  const existingVectors = new Set((await getAll<KnowledgeVector>("knowledgeVectors")).map((v) => v.chunkId));

  let importedSources = 0;
  let importedChunks = 0;
  let importedVectors = 0;

  for (const source of data.sources) {
    if (!existingSources.has(source.id)) {
      await create("knowledgeSources", source as KnowledgeSource & { id: string });
      importedSources++;
    }
  }
  for (const chunk of data.chunks) {
    if (!existingChunks.has(chunk.id)) {
      await create("knowledgeChunks", chunk as KnowledgeChunk & { id: string });
      importedChunks++;
    }
  }
  for (const vec of data.vectors) {
    if (!existingVectors.has(vec.chunkId)) {
      await create("knowledgeVectors", vec as KnowledgeVector & { id: string });
      importedVectors++;
    }
  }

  log(`Imported: ${importedSources} sources, ${importedChunks} chunks, ${importedVectors} vectors`);
  return { importedSources, importedChunks, importedVectors };
}

// ── 清空 ─────────────────────────────────────────────

export async function clearAllKnowledge(): Promise<void> {
  await clearStore("knowledgeSources");
  await clearStore("knowledgeChunks");
  await clearStore("knowledgeVectors");
  log("Cleared all knowledge data");
}

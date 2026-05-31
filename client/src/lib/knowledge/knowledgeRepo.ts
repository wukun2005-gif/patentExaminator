/**
 * 知识库 Repository — IndexedDB CRUD 操作
 */
import { getDB } from "../indexedDb";
import type { KnowledgeSource, KnowledgeChunk, KnowledgeVector } from "@shared/types/knowledge";
import { createLogger } from "../logger";

const log = createLogger("KnowledgeRepo");

// ── KnowledgeSource ──────────────────────────────────

export async function addSource(source: KnowledgeSource): Promise<void> {
  const db = await getDB();
  await db.put("knowledgeSources", source);
  log(`Added source: ${source.id} (${source.name})`);
}

export async function getSource(id: string): Promise<KnowledgeSource | undefined> {
  const db = await getDB();
  return db.get("knowledgeSources", id);
}

export async function getAllSources(): Promise<KnowledgeSource[]> {
  const db = await getDB();
  return db.getAll("knowledgeSources");
}

/** 分页获取 chunk */
export async function getChunksPaginated(
  offset: number = 0,
  limit: number = 50
): Promise<{ chunks: KnowledgeChunk[]; total: number }> {
  const db = await getDB();
  const all = await db.getAll("knowledgeChunks");
  return {
    chunks: all.slice(offset, offset + limit),
    total: all.length,
  };
}

export async function deleteSource(id: string): Promise<void> {
  const db = await getDB();
  // 删除关联的 chunks 和 vectors
  const chunks = await db.getAllFromIndex("knowledgeChunks", "by-sourceId", id);
  for (const chunk of chunks) {
    await db.delete("knowledgeVectors", chunk.id);
  }
  await db.delete("knowledgeSources", id);
  // 删除关联的 chunks
  const tx = db.transaction("knowledgeChunks", "readwrite");
  const index = tx.store.index("by-sourceId");
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
  log(`Deleted source: ${id}`);
}

// ── KnowledgeChunk ───────────────────────────────────

export async function addChunks(chunks: KnowledgeChunk[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("knowledgeChunks", "readwrite");
  for (const chunk of chunks) {
    await tx.store.put(chunk);
  }
  await tx.done;
  log(`Added ${chunks.length} chunks`);
}

export async function getChunksBySource(sourceId: string): Promise<KnowledgeChunk[]> {
  const db = await getDB();
  return db.getAllFromIndex("knowledgeChunks", "by-sourceId", sourceId);
}

export async function getUnembeddedChunks(): Promise<KnowledgeChunk[]> {
  const db = await getDB();
  return db.getAllFromIndex("knowledgeChunks", "by-embedded", 0);
}

export async function markChunkEmbedded(chunkId: string): Promise<void> {
  const db = await getDB();
  const chunk = await db.get("knowledgeChunks", chunkId);
  if (chunk) {
    chunk.embedded = true;
    await db.put("knowledgeChunks", chunk);
  }
}

export async function deleteChunksBySource(sourceId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("knowledgeChunks", "readwrite");
  const index = tx.store.index("by-sourceId");
  let cursor = await index.openCursor(sourceId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── KnowledgeVector ──────────────────────────────────

export async function addVectors(vectors: KnowledgeVector[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("knowledgeVectors", "readwrite");
  for (const vec of vectors) {
    await tx.store.put(vec);
  }
  await tx.done;
  log(`Added ${vectors.length} vectors`);
}

export async function getVector(chunkId: string): Promise<KnowledgeVector | undefined> {
  const db = await getDB();
  return db.get("knowledgeVectors", chunkId);
}

export async function getAllVectors(): Promise<KnowledgeVector[]> {
  const db = await getDB();
  return db.getAll("knowledgeVectors");
}

export async function deleteVectorsBySource(sourceId: string): Promise<void> {
  const db = await getDB();
  const chunks = await db.getAllFromIndex("knowledgeChunks", "by-sourceId", sourceId);
  const tx = db.transaction("knowledgeVectors", "readwrite");
  for (const chunk of chunks) {
    await tx.store.delete(chunk.id);
  }
  await tx.done;
}

// ── 统计 ─────────────────────────────────────────────

export async function getKnowledgeStats(): Promise<{
  sourceCount: number;
  chunkCount: number;
  embeddedCount: number;
}> {
  const db = await getDB();
  const sources = await db.count("knowledgeSources");
  const chunks = await db.count("knowledgeChunks");
  const vectors = await db.count("knowledgeVectors");
  return { sourceCount: sources, chunkCount: chunks, embeddedCount: vectors };
}

// ── 一致性校验 ─────────────────────────────────────────

export interface ConsistencyReport {
  orphanedChunks: string[];   // 有 chunk 无 vector
  orphanedVectors: string[];  // 有 vector 无 chunk
  isConsistent: boolean;
}

/** 检查 chunk 和 vector 的一致性 */
export async function checkConsistency(): Promise<ConsistencyReport> {
  const db = await getDB();
  const chunks = await db.getAll("knowledgeChunks");
  const vectors = await db.getAll("knowledgeVectors");

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

  const db = await getDB();
  const tx = db.transaction("knowledgeVectors", "readwrite");
  for (const vectorId of report.orphanedVectors) {
    await tx.store.delete(vectorId);
  }
  await tx.done;

  log(`Fixed consistency: removed ${report.orphanedVectors.length} orphaned vectors`);
  return { ...report, orphanedVectors: [], isConsistent: report.orphanedChunks.length === 0 };
}

// ── 文档摘要 ──────────────────────────────────────────

/** 为 source 生成摘要（基于前几个 chunk 的内容） */
export async function generateSourceSummary(sourceId: string): Promise<string> {
  const chunks = await getChunksBySource(sourceId);
  if (chunks.length === 0) return "";

  // 取前 3 个 chunk 的前 200 字作为摘要
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
  const db = await getDB();
  const sources = await db.getAll("knowledgeSources");
  const chunks = await db.getAll("knowledgeChunks");
  const vectors = await db.getAll("knowledgeVectors");

  let totalBytes = 0;
  for (const chunk of chunks) {
    totalBytes += chunk.text.length * 3; // UTF-8 中文约 3 字节/字符
  }
  for (const vec of vectors) {
    totalBytes += vec.vector.length * 8; // float64 = 8 bytes
  }
  for (const _source of sources) {
    totalBytes += 500; // 元数据约 500 字节
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
    // 同名文件
    if (ex.name === newSource.name && ex.fileHash !== newSource.fileHash) {
      reports.push({
        sourceId: ex.id,
        sourceName: ex.name,
        conflictingWith: newSource.name,
        conflictType: "same-name",
        suggestion: "同名文件已存在，建议替换或重命名",
      });
    }

    // 同类别文件（如两个审查指南）
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
  const data = JSON.parse(text) as KnowledgeExportData;
  if (data.version !== 1) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }
  return importKnowledge(data);
}

// ── 浏览器兼容 ────────────────────────────────────────

/** 检查 IndexedDB 可用性和存储配额 */
export async function checkStorageQuota(): Promise<{
  available: boolean;
  usage: number;
  quota: number;
  usagePercent: string;
  warning: string | null;
}> {
  try {
    // 检查 IndexedDB 是否可用
    const db = await getDB();
    void db; // 验证能打开

    // 检查存储配额
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const percent = quota > 0 ? ((usage / quota) * 100).toFixed(1) : "0";
      const warning = usage / quota > 0.8 ? "存储空间使用超过 80%，建议清理旧数据" : null;
      return { available: true, usage, quota, usagePercent: percent, warning };
    }

    return { available: true, usage: 0, quota: 0, usagePercent: "未知", warning: null };
  } catch {
    return { available: false, usage: 0, quota: 0, usagePercent: "0", warning: "IndexedDB 不可用" };
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
  const db = await getDB();
  const sources = await db.getAll("knowledgeSources");
  const chunks = await db.getAll("knowledgeChunks");
  const vectors = await db.getAll("knowledgeVectors");
  return { version: 1, exportedAt: new Date().toISOString(), sources, chunks, vectors };
}

/** 从 JSON 导入知识库数据（合并模式，不覆盖已有） */
export async function importKnowledge(data: KnowledgeExportData): Promise<{
  importedSources: number;
  importedChunks: number;
  importedVectors: number;
}> {
  const db = await getDB();

  // 获取已有 ID
  const existingSources = new Set((await db.getAll("knowledgeSources")).map((s) => s.id));
  const existingChunks = new Set((await db.getAll("knowledgeChunks")).map((c) => c.id));
  const existingVectors = new Set((await db.getAll("knowledgeVectors")).map((v) => v.chunkId));

  let importedSources = 0;
  let importedChunks = 0;
  let importedVectors = 0;

  const tx = db.transaction(
    ["knowledgeSources", "knowledgeChunks", "knowledgeVectors"],
    "readwrite"
  );

  for (const source of data.sources) {
    if (!existingSources.has(source.id)) {
      await tx.objectStore("knowledgeSources").put(source);
      importedSources++;
    }
  }
  for (const chunk of data.chunks) {
    if (!existingChunks.has(chunk.id)) {
      await tx.objectStore("knowledgeChunks").put(chunk);
      importedChunks++;
    }
  }
  for (const vec of data.vectors) {
    if (!existingVectors.has(vec.chunkId)) {
      await tx.objectStore("knowledgeVectors").put(vec);
      importedVectors++;
    }
  }

  await tx.done;
  log(`Imported: ${importedSources} sources, ${importedChunks} chunks, ${importedVectors} vectors`);
  return { importedSources, importedChunks, importedVectors };
}

// ── 清空 ─────────────────────────────────────────────

export async function clearAllKnowledge(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["knowledgeSources", "knowledgeChunks", "knowledgeVectors"],
    "readwrite"
  );
  await tx.objectStore("knowledgeSources").clear();
  await tx.objectStore("knowledgeChunks").clear();
  await tx.objectStore("knowledgeVectors").clear();
  await tx.done;
  log("Cleared all knowledge data");
}

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
  return db.getAllFromIndex("knowledgeChunks", "by-embedded", false);
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

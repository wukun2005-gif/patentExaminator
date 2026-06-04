/**
 * 服务端知识库存储 — SQLite + 向量化
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { logger } from "./logger.js";

// 支持通过环境变量指定数据库路径（测试隔离）
const DATA_DIR = process.env.KNOWLEDGE_DB_DIR ?? path.resolve(process.cwd(), "data");
const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(DATA_DIR, "knowledge.db");

let db: Database.Database | null = null;

function getKnowledgeDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      format TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      file_hash TEXT,
      source_url TEXT,
      chunk_count INTEGER DEFAULT 0,
      embed_status TEXT DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      strategy TEXT DEFAULT 'auto',
      metadata TEXT DEFAULT '{}',
      embedded INTEGER DEFAULT 0,
      text_hash TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES kb_sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kb_vectors (
      chunk_id TEXT PRIMARY KEY,
      vector TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE
    );
  `);

  // 增量升级：为旧数据库添加 text_hash 列
  const columns = db.prepare("PRAGMA table_info(kb_chunks)").all() as Array<{ name: string }>;
  const hasTextHash = columns.some((col) => col.name === "text_hash");
  if (!hasTextHash) {
    logger.info("[KnowledgeDB] Adding text_hash column to kb_chunks");
    db.exec("ALTER TABLE kb_chunks ADD COLUMN text_hash TEXT");
    // 为现有 chunk 计算 hash（使用 Node.js crypto，因为 SQLite 可能没有 md5 函数）
    const rows = db.prepare("SELECT id, text FROM kb_chunks WHERE text_hash IS NULL").all() as Array<{ id: string; text: string }>;
    const updateStmt = db.prepare("UPDATE kb_chunks SET text_hash = ? WHERE id = ?");
    const tx = db.transaction(() => {
      for (const row of rows) {
        const hash = computeTextHash(row.text);
        updateStmt.run(hash, row.id);
      }
    });
    tx();
    logger.info(`[KnowledgeDB] text_hash column added and populated for ${rows.length} chunks`);
  }

  // 创建 text_hash 索引以加速断点续传查询
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_text_hash ON kb_chunks(text_hash)`);

  logger.info(`Knowledge DB initialized at ${DB_PATH}`);
  return db;
}

// ── Sources ─────────────────────────────────────────

export function addSource(source: {
  id: string; name: string; type: string; format: string;
  mediaType: string; size: number; fileHash?: string; sourceUrl?: string;
  chunkCount: number; embedStatus: string;
}): void {
  const db = getKnowledgeDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT OR REPLACE INTO kb_sources
    (id, name, type, format, media_type, size, file_hash, source_url, chunk_count, embed_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(source.id, source.name, source.type, source.format, source.mediaType,
      source.size, source.fileHash ?? null, source.sourceUrl ?? null,
      source.chunkCount, source.embedStatus, now, now);
}

export function getAllSources(): Array<{
  id: string; name: string; type: string; format: string;
  mediaType: string; size: number; fileHash: string | null;
  sourceUrl: string | null; chunkCount: number; embedStatus: string;
  createdAt: string; updatedAt: string;
}> {
  const db = getKnowledgeDb();
  return db.prepare("SELECT * FROM kb_sources").all().map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      type: r.type as string,
      format: r.format as string,
      mediaType: r.media_type as string,
      size: r.size as number,
      fileHash: r.file_hash as string | null,
      sourceUrl: r.source_url as string | null,
      chunkCount: r.chunk_count as number,
      embedStatus: r.embed_status as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });
}

export function deleteSource(id: string): void {
  const db = getKnowledgeDb();
  db.prepare("DELETE FROM kb_chunks WHERE source_id = ?").run(id);
  db.prepare("DELETE FROM kb_sources WHERE id = ?").run(id);
}

// ── Chunks ──────────────────────────────────────────

export function addChunks(chunks: Array<{
  id: string; sourceId: string; index: number; text: string;
  strategy: string; metadata: Record<string, unknown>;
}>): void {
  const db = getKnowledgeDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO kb_chunks
    (id, source_id, idx, text, strategy, metadata, embedded, text_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const chunk of chunks) {
      const textHash = computeTextHash(chunk.text);
      stmt.run(chunk.id, chunk.sourceId, chunk.index, chunk.text,
        chunk.strategy, JSON.stringify(chunk.metadata), textHash, now);
    }
  });
  tx();
}

/** 计算文本的 MD5 hash（用于断点续传） */
export function computeTextHash(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

/** 根据 text_hash 批量查找已存在的 chunk（断点续传） */
export function findChunksByHashes(hashes: string[]): Map<string, { chunkId: string; vector: number[] }> {
  const db = getKnowledgeDb();
  const result = new Map<string, { chunkId: string; vector: number[] }>();

  if (hashes.length === 0) return result;

  // 批量查询，每批 100 个
  const batchSize = 100;
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT c.text_hash, c.id as chunk_id, v.vector
      FROM kb_chunks c
      INNER JOIN kb_vectors v ON c.id = v.chunk_id
      WHERE c.text_hash IN (${placeholders}) AND c.embedded = 1
    `).all(...batch) as Array<{ text_hash: string; chunk_id: string; vector: string }>;

    for (const row of rows) {
      let vector: number[] = [];
      try { vector = JSON.parse(row.vector) as number[]; } catch { logger.warn(`Malformed vector for chunk=${row.chunk_id}, hash=${row.text_hash}`); }
      result.set(row.text_hash, {
        chunkId: row.chunk_id,
        vector,
      });
    }
  }

  return result;
}

export function getUnembeddedChunks(): Array<{
  id: string; sourceId: string; index: number; text: string;
  strategy: string; metadata: string; embedded: number;
}> {
  const db = getKnowledgeDb();
  return db.prepare("SELECT * FROM kb_chunks WHERE embedded = 0").all() as Array<{
    id: string; sourceId: string; index: number; text: string;
    strategy: string; metadata: string; embedded: number;
  }>;
}

export function markChunkEmbedded(chunkId: string): void {
  const db = getKnowledgeDb();
  db.prepare("UPDATE kb_chunks SET embedded = 1 WHERE id = ?").run(chunkId);
}

export function getAllChunks(): Array<{
  id: string; sourceId: string; text: string; metadata: string;
}> {
  const db = getKnowledgeDb();
  return db.prepare("SELECT id, source_id as sourceId, text, metadata FROM kb_chunks").all() as Array<{
    id: string; sourceId: string; text: string; metadata: string;
  }>;
}

export function getChunksBySourceId(sourceId: string, limit = 20): Array<{
  id: string; index: number; text: string; metadata: string;
}> {
  const db = getKnowledgeDb();
  return db.prepare("SELECT id, idx as `index`, text, metadata FROM kb_chunks WHERE source_id = ? ORDER BY idx LIMIT ?").all(sourceId, limit) as Array<{
    id: string; index: number; text: string; metadata: string;
  }>;
}

// ── Vectors ─────────────────────────────────────────

export function addVectors(vectors: Array<{
  chunkId: string; vector: number[]; modelId: string;
}>): void {
  const db = getKnowledgeDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO kb_vectors
    (chunk_id, vector, model_id, created_at) VALUES (?, ?, ?, ?)`);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const vec of vectors) {
      stmt.run(vec.chunkId, JSON.stringify(vec.vector), vec.modelId, now);
    }
  });
  tx();
}

export function getAllVectors(): Array<{
  chunkId: string; vector: number[]; modelId: string;
}> {
  const db = getKnowledgeDb();
  return (db.prepare("SELECT * FROM kb_vectors").all() as Array<{
    chunk_id: string; vector: string; model_id: string;
  }>).map(row => ({
    chunkId: row.chunk_id,
    vector: (() => { try { return JSON.parse(row.vector) as number[]; } catch { logger.warn(`Malformed vector for chunk=${row.chunk_id}`); return []; } })(),
    modelId: row.model_id,
  }));
}

export function getStats(): { sourceCount: number; chunkCount: number; embeddedCount: number } {
  const db = getKnowledgeDb();
  const sources = (db.prepare("SELECT COUNT(*) as c FROM kb_sources").get() as { c: number }).c;
  const chunks = (db.prepare("SELECT COUNT(*) as c FROM kb_chunks").get() as { c: number }).c;
  const embedded = (db.prepare("SELECT COUNT(*) as c FROM kb_chunks WHERE embedded = 1").get() as { c: number }).c;
  return { sourceCount: sources, chunkCount: chunks, embeddedCount: embedded };
}

export function clearAll(): void {
  const db = getKnowledgeDb();
  db.exec("DELETE FROM kb_vectors");
  db.exec("DELETE FROM kb_chunks");
  db.exec("DELETE FROM kb_sources");
}

export function findDuplicateByHash(fileHash: string): { id: string; name: string } | null {
  const db = getKnowledgeDb();
  return db.prepare("SELECT id, name FROM kb_sources WHERE file_hash = ?").get(fileHash) as { id: string; name: string } | null;
}

/** 关闭并重置数据库连接（用于测试清理） */
function _closeKnowledgeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Unit tests for Eval Set CRUD (nf5-2 Phase 1)
 *
 * Tests the database schema and CRUD operations for metrics_eval_sets table.
 * Uses in-memory SQLite database for isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSyncDb, resetSyncDbForTesting } from "../../server/src/lib/syncDb.js";

describe("Eval Sets (nf5-2 Phase 1)", () => {
  let db: ReturnType<typeof getSyncDb>;

  beforeAll(() => {
    resetSyncDbForTesting(":memory:");
    db = getSyncDb();
  });

  afterAll(() => {
    resetSyncDbForTesting(":memory:");
  });

  describe("DB Schema", () => {
    it("metrics_eval_sets table exists", () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metrics_eval_sets'"
      ).all();
      expect(tables.length).toBe(1);
    });

    it("metrics_eval_sets has correct columns", () => {
      const cols = db.prepare("PRAGMA table_info('metrics_eval_sets')").all() as Array<{ name: string }>;
      const colNames = cols.map(c => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
      expect(colNames).toContain("question_count");
      expect(colNames).toContain("source_type_distribution");
      expect(colNames).toContain("status");
      expect(colNames).toContain("error_message");
      expect(colNames).toContain("metadata");
    });

    it("metrics_golden_set has eval_set_id column", () => {
      const cols = db.prepare("PRAGMA table_info('metrics_golden_set')").all() as Array<{ name: string }>;
      const colNames = cols.map(c => c.name);
      expect(colNames).toContain("eval_set_id");
    });
  });

  describe("CRUD Operations", () => {
    it("INSERT eval set", () => {
      db.prepare(`
        INSERT INTO metrics_eval_sets (id, name, question_count, source_type_distribution, status)
        VALUES (?, ?, ?, ?, ?)
      `).run("test-set-1", "Test Set", 5, '{"kb_only": 3, "web_only": 2}', "ready");
      const row = db.prepare("SELECT * FROM metrics_eval_sets WHERE id = ?").get("test-set-1") as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.name).toBe("Test Set");
      expect(row.question_count).toBe(5);
      expect(row.status).toBe("ready");
    });

    it("SELECT eval sets ordered by created_at DESC", () => {
      // Use explicit timestamps to ensure ordering
      db.prepare(`
        INSERT INTO metrics_eval_sets (id, name, question_count, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("test-set-2", "Second Set", 3, "ready", "2099-01-01T00:00:00");
      const rows = db.prepare("SELECT * FROM metrics_eval_sets ORDER BY created_at DESC").all() as Array<{ id: string }>;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // Most recent first (test-set-2 has future timestamp)
      expect(rows[0]!.id).toBe("test-set-2");
    });

    it("UPDATE eval set name", () => {
      db.prepare(`UPDATE metrics_eval_sets SET name = ?, updated_at = datetime('now') WHERE id = ?`)
        .run("Renamed Set", "test-set-1");
      const row = db.prepare("SELECT name FROM metrics_eval_sets WHERE id = ?").get("test-set-1") as { name: string };
      expect(row.name).toBe("Renamed Set");
    });

    it("DELETE eval set", () => {
      db.prepare("DELETE FROM metrics_eval_sets WHERE id = ?").run("test-set-1");
      const row = db.prepare("SELECT * FROM metrics_eval_sets WHERE id = ?").get("test-set-1");
      expect(row).toBeUndefined();
    });

    it("INSERT golden question with eval_set_id", () => {
      db.prepare(`
        INSERT INTO metrics_eval_sets (id, name, question_count, status)
        VALUES (?, ?, ?, ?)
      `).run("test-set-3", "Set 3", 1, "ready");
      db.prepare(`
        INSERT INTO metrics_golden_set (id, agent, query, expected_answer, eval_set_id)
        VALUES (?, ?, ?, ?, ?)
      `).run("q-test-1", "chat", "test query", "test answer", "test-set-3");
      const row = db.prepare("SELECT eval_set_id FROM metrics_golden_set WHERE id = ?").get("q-test-1") as { eval_set_id: string };
      expect(row.eval_set_id).toBe("test-set-3");
    });

    it("DELETE eval set cascades to questions (manual)", () => {
      // SQLite doesn't have FK cascade for eval_set_id, so we do it manually in the route
      db.prepare("DELETE FROM metrics_golden_set WHERE eval_set_id = ?").run("test-set-3");
      db.prepare("DELETE FROM metrics_eval_sets WHERE id = ?").run("test-set-3");
      const setRow = db.prepare("SELECT * FROM metrics_eval_sets WHERE id = ?").get("test-set-3");
      expect(setRow).toBeUndefined();
      const qRow = db.prepare("SELECT * FROM metrics_golden_set WHERE id = ?").get("q-test-1");
      expect(qRow).toBeUndefined();
    });
  });
});

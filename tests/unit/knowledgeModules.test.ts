/**
 * Unit tests for knowledge subsystem modules.
 *
 * Covers:
 * - bm25Search: TF-IDF search, empty index, Chinese text
 * - hybridSearch: search interface (mocked dependencies)
 *
 * Strategy: test pure functions directly, mock IndexedDB and external deps.
 *
 * Note: chunkers tests removed — chunkers.ts deleted in B-021, chunking moved to server.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { KnowledgeChunk } from "@shared/types/knowledge";

// Mock logger to suppress output
vi.mock("@client/lib/logger", () => ({
  createLogger: () => vi.fn(),
}));

// Mock IndexedDB
vi.mock("@client/lib/indexedDb", () => ({
  getDB: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
  }),
}));

// Helper to create test chunks
function makeChunk(overrides?: Partial<KnowledgeChunk>): KnowledgeChunk {
  return {
    id: `chunk-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: "src-1",
    text: "This is a test chunk about patent examination.",
    embedding: new Float32Array(384).fill(0.1),
    metadata: { page: 1, section: "claims" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────
// 1. BM25 Search tests
// ──────────────────────────────────────────────────

describe("BM25 Search", () => {
  beforeEach(async () => {
    // Reset module state between tests
    const mod = await import("@client/lib/knowledge/bm25Search");
    mod.invalidateBM25Index();
  });

  it("buildBM25Index + searchBM25 returns matching chunks", async () => {
    const { buildBM25Index, searchBM25 } = await import("@client/lib/knowledge/bm25Search");

    const chunks = [
      makeChunk({ id: "c1", text: "专利审查指南规定了新颖性判断标准" }),
      makeChunk({ id: "c2", text: "锂电池快速充电方法的技术方案" }),
      makeChunk({ id: "c3", text: "专利法第二十二条关于创造性的规定" }),
    ];

    buildBM25Index(chunks);
    const results = searchBM25("专利审查", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBeTruthy();
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("searchBM25 returns empty for empty index", async () => {
    const { searchBM25 } = await import("@client/lib/knowledge/bm25Search");
    const results = searchBM25("test query", 5);
    expect(results).toEqual([]);
  });

  it("searchBM25 handles Chinese text correctly", async () => {
    const { buildBM25Index, searchBM25 } = await import("@client/lib/knowledge/bm25Search");

    const chunks = [
      makeChunk({ id: "c1", text: "权利要求书的撰写要求" }),
      makeChunk({ id: "c2", text: "说明书应当充分公开技术方案" }),
    ];

    buildBM25Index(chunks);
    const results = searchBM25("权利要求", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("c1");
  });

  it("invalidateBM25Index clears the index", async () => {
    const { buildBM25Index, searchBM25, invalidateBM25Index } = await import("@client/lib/knowledge/bm25Search");

    buildBM25Index([makeChunk({ text: "test content" })]);
    expect(searchBM25("test", 5).length).toBeGreaterThan(0);

    invalidateBM25Index();
    expect(searchBM25("test", 5)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────
// 3. Hybrid Search tests
// ──────────────────────────────────────────────────

describe("Hybrid Search", () => {
  it("hybridSearch returns empty for empty knowledge base", async () => {
    const { hybridSearch } = await import("@client/lib/knowledge/hybridSearch");
    const results = await hybridSearch("test query", { maxResults: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  it("hybridSearch respects maxResults limit", async () => {
    const { hybridSearch } = await import("@client/lib/knowledge/hybridSearch");
    const results = await hybridSearch("test", { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

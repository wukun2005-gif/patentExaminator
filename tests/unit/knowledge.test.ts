/**
 * Unit tests for client/src/lib/knowledge/* modules.
 *
 * Covers:
 * - embedder: cosineSimilarity
 * - vectorStore: addVector, searchVectors, cosineSimilarity
 * - retriever: formatRetrievedChunks
 * - promptInjector: buildKnowledgeContext
 *
 * Test strategy: pure function tests, no IndexedDB or network calls.
 *
 * Note: chunkers tests removed — chunkers.ts deleted in B-021, chunking moved to server.
 */
import { describe, it, expect } from "vitest";

// ──────────────────────────────────────────────────
// 2. embedder tests
// ──────────────────────────────────────────────────

describe("embedder", () => {
  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", async () => {
      const { cosineSimilarity } = await import("@client/lib/knowledge/embedder");
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    });

    it("returns 0 for orthogonal vectors", async () => {
      const { cosineSimilarity } = await import("@client/lib/knowledge/embedder");
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("returns -1 for opposite vectors", async () => {
      const { cosineSimilarity } = await import("@client/lib/knowledge/embedder");
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("returns 0 for vectors of different lengths", async () => {
      const { cosineSimilarity } = await import("@client/lib/knowledge/embedder");
      expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    });

    it("returns 0 for zero vectors", async () => {
      const { cosineSimilarity } = await import("@client/lib/knowledge/embedder");
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────
// 3. vectorStore tests
// ──────────────────────────────────────────────────

describe("vectorStore", () => {
  describe("invalidateVectorIndex", () => {
    it("is a function", async () => {
      const { invalidateVectorIndex } = await import("@client/lib/knowledge/vectorStore");
      expect(typeof invalidateVectorIndex).toBe("function");
    });
  });

  describe("getVectorIndexStats", () => {
    it("is a function", async () => {
      const { getVectorIndexStats } = await import("@client/lib/knowledge/vectorStore");
      expect(typeof getVectorIndexStats).toBe("function");
    });
  });
});

// ──────────────────────────────────────────────────
// 4. retriever tests
// ──────────────────────────────────────────────────

describe("retriever", () => {
  describe("formatRetrievedChunks", () => {
    it("formats empty results", async () => {
      const { formatRetrievedChunks } = await import("@client/lib/knowledge/retriever");
      const result = formatRetrievedChunks([]);
      expect(result).toBe("");
    });

    it("formats single chunk", async () => {
      const { formatRetrievedChunks } = await import("@client/lib/knowledge/retriever");
      const chunks = [{
        chunk: { id: "c1", sourceId: "s1", index: 0, text: "test text", strategy: "heading" as const, metadata: { fileName: "test.md", mediaType: "text" as const }, embedded: true, createdAt: new Date().toISOString() },
        score: 0.95,
        sourceName: "test.md"
      }];
      const result = formatRetrievedChunks(chunks);
      expect(result).toContain("test text");
      expect(result).toContain("0.95");
    });
  });
});

// ──────────────────────────────────────────────────
// 5. promptInjector tests
// ──────────────────────────────────────────────────

describe("promptInjector", () => {
  describe("extractQueryFromRequest", () => {
    it("is a function", async () => {
      const { extractQueryFromRequest } = await import("@client/lib/knowledge/promptInjector");
      expect(typeof extractQueryFromRequest).toBe("function");
    });
  });
});

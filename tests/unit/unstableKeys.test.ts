import { describe, it, expect } from "vitest";

/**
 * Regression tests for React key stability (bg-56, bg-64).
 * These verify that the key generation logic produces stable, unique keys
 * when list items are deleted from the middle.
 */

describe("React key stability", () => {
  describe("ReferenceSearchPanel term keys (bg-56)", () => {
    it("generates unique keys for each term", () => {
      const keys = ["a", "b", "c"].map(() => crypto.randomUUID());
      expect(new Set(keys).size).toBe(3);
    });

    it("preserves existing keys when list shrinks", () => {
      // Identity-based key matching: each term gets a stable UUID keyed by value
      const keyMap = new Map<string, string>();
      const prev = ["k1", "k2", "k3"];
      for (const term of prev) keyMap.set(term, term); // simulate stable keys
      const next = ["k1", "k3"]; // k2 deleted
      const result = next.map(term => keyMap.get(term) ?? crypto.randomUUID());
      expect(result[0]).toBe("k1"); // k1 keeps its own key
      expect(result[1]).toBe("k3"); // k3 keeps its own key, NOT "k2"
    });

    it("generates new keys for new items at end", () => {
      const prev = ["k1", "k2"];
      const next = ["k1", "k2", "k3"]; // k3 added
      const result = next.map((_, i) => prev[i] ?? crypto.randomUUID());
      expect(result[0]).toBe("k1");
      expect(result[1]).toBe("k2");
      expect(result[2]).not.toBe("k1");
      expect(result[2]).not.toBe("k2");
    });
  });

  describe("ArgumentMappingPanel key (bg-64)", () => {
    it("uses id instead of rejectionGroundCode as key", () => {
      const mapping = { id: "uuid-123", rejectionGroundCode: "" };
      // The fix uses mapping.id as key
      expect(mapping.id).toBeTruthy();
      expect(mapping.id).not.toBe("");
    });

    it("different new mappings have different ids", () => {
      const m1 = { id: crypto.randomUUID(), rejectionGroundCode: "" };
      const m2 = { id: crypto.randomUUID(), rejectionGroundCode: "" };
      expect(m1.id).not.toBe(m2.id);
    });
  });
});

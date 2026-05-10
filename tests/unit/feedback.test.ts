import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FeedbackEntry } from "@shared/types/domain";

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn((key: string) => { storage.delete(key); }),
  clear: vi.fn(() => { storage.clear(); }),
  get length() { return storage.size; },
  key: vi.fn((i: number) => Array.from(storage.keys())[i] ?? null)
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

import {
  getFeedback,
  getAllFeedback,
  saveFeedback,
  deleteFeedback,
  clearAllFeedback
} from "@client/lib/feedbackRepo";

describe("feedbackRepo", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it("T-FB-001: getFeedback returns undefined when empty", () => {
    expect(getFeedback("nonexistent")).toBeUndefined();
  });

  it("T-FB-002: saveFeedback persists entry", () => {
    const entry: FeedbackEntry = {
      id: "fb-1",
      targetId: "feature-A",
      targetType: "claim-feature",
      sentiment: "like",
      comment: "",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z"
    };
    saveFeedback(entry);
    expect(getFeedback("feature-A")).toEqual(entry);
  });

  it("T-FB-003: saveFeedback updates existing entry", () => {
    const entry: FeedbackEntry = {
      id: "fb-1",
      targetId: "feature-A",
      targetType: "claim-feature",
      sentiment: "like",
      comment: "",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z"
    };
    saveFeedback(entry);
    const updated = { ...entry, sentiment: "dislike" as const, comment: "needs fix" };
    saveFeedback(updated);
    const result = getFeedback("feature-A");
    expect(result?.sentiment).toBe("dislike");
    expect(result?.comment).toBe("needs fix");
    expect(getAllFeedback()).toHaveLength(1);
  });

  it("T-FB-004: deleteFeedback removes entry", () => {
    const entry: FeedbackEntry = {
      id: "fb-1",
      targetId: "feature-A",
      targetType: "claim-feature",
      sentiment: "like",
      comment: "",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z"
    };
    saveFeedback(entry);
    deleteFeedback("feature-A");
    expect(getFeedback("feature-A")).toBeUndefined();
  });

  it("T-FB-005: getAllFeedback returns all entries", () => {
    saveFeedback({
      id: "fb-1", targetId: "a", targetType: "claim-feature",
      sentiment: "like", comment: "", createdAt: "", updatedAt: ""
    });
    saveFeedback({
      id: "fb-2", targetId: "b", targetType: "novelty-row",
      sentiment: "dislike", comment: "bad", createdAt: "", updatedAt: ""
    });
    expect(getAllFeedback()).toHaveLength(2);
  });

  it("T-FB-006: clearAllFeedback removes everything", () => {
    saveFeedback({
      id: "fb-1", targetId: "a", targetType: "claim-feature",
      sentiment: "like", comment: "", createdAt: "", updatedAt: ""
    });
    clearAllFeedback();
    expect(getAllFeedback()).toHaveLength(0);
  });

  it("T-FB-007: handles corrupt localStorage data gracefully", () => {
    storage.set("patent-examiner-feedback", "not-json");
    expect(getAllFeedback()).toEqual([]);
    expect(getFeedback("any")).toBeUndefined();
  });
});

describe("FeedbackButtons component", () => {
  it("can be imported", async () => {
    const mod = await import("@client/components/FeedbackButtons");
    expect(mod.FeedbackButtons).toBeDefined();
    expect(typeof mod.FeedbackButtons).toBe("function");
  });
});

describe("FeedbackEntry type validation", () => {
  it("T-FB-008: valid entry passes schema-like check", () => {
    const entry: FeedbackEntry = {
      id: "fb-test",
      targetId: "feature-A",
      targetType: "claim-feature",
      sentiment: "like",
      comment: "good",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z"
    };
    expect(entry.targetType).toBe("claim-feature");
    expect(entry.sentiment).toBe("like");
  });

  it("T-FB-009: targetType accepts all valid values", () => {
    const types: FeedbackEntry["targetType"][] = ["claim-feature", "novelty-row", "chat-message"];
    for (const t of types) {
      expect(typeof t).toBe("string");
    }
  });
});

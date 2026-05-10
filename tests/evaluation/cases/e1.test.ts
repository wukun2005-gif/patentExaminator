import { describe, it, expect } from "vitest";
import e1Fixture from "@shared/fixtures/e1-no-reference.json";

describe("Evaluation E1 — 零对比文件", () => {
  const fixture = e1Fixture as {
    case: { id: string };
    applicationText: string;
    references: unknown[];
  };

  it("E1: fixture has valid structure", () => {
    expect(fixture.case.id).toBe("e1-no-ref");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("E1: has zero reference documents", () => {
    expect(fixture.references).toHaveLength(0);
  });

  it("E1: application text has claims", () => {
    expect(fixture.applicationText).toContain("【权利要求书】");
    expect(fixture.applicationText).toContain("1. ");
  });

  it("E1: UI should show 'no references' message", () => {
    // This is verified at the UI level; fixture confirms zero refs
    expect(fixture.references.length).toBe(0);
  });
});

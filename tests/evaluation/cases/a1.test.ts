import { describe, it, expect } from "vitest";
import a1Fixture from "@shared/fixtures/a1-functional-limitation.json";

describe("Evaluation A1 — 功能性限定", () => {
  const fixture = a1Fixture as { case: { id: string }; applicationText: string; references: unknown[] };

  it("A1: fixture has valid structure", () => {
    expect(fixture.case).toBeDefined();
    expect(fixture.case.id).toBe("a1-func-limit");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("A1: application text contains functional language patterns", () => {
    // Functional limitation: "通过预设加密算法对...进行..."
    expect(fixture.applicationText).toContain("通过预设加密算法");
    expect(fixture.applicationText).toContain("对所述待加密数据进行加密处理");
  });

  it("A1: application text has claims section", () => {
    expect(fixture.applicationText).toContain("【权利要求书】");
    expect(fixture.applicationText).toContain("1. ");
  });

  it("A1: has no references (acceptance test for functional limitation detection)", () => {
    expect(fixture.references).toHaveLength(0);
  });
});

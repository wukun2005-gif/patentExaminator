import { describe, it, expect } from "vitest";
import e3Fixture from "@shared/fixtures/e3-multi-independent.json";

describe("Evaluation E3 — 多独权识别", () => {
  const fixture = e3Fixture as {
    case: { id: string; targetClaimNumber: number };
    applicationText: string;
    references: unknown[];
  };

  it("E3: fixture has valid structure", () => {
    expect(fixture.case.id).toBe("e3-multi-indep");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("E3: application text has multiple independent claims (1, 4, 8)", () => {
    const text = fixture.applicationText;
    // Claim 1: 通信系统
    expect(text).toContain("1. 一种通信系统");
    // Claim 4: 控制方法 (independent — does not reference another claim)
    expect(text).toContain("4. 一种通信系统的控制方法");
    // Claim 8: another 通信系统 (independent)
    expect(text).toContain("8. 一种通信系统");
  });

  it("E3: dependent claims reference independent claims", () => {
    const text = fixture.applicationText;
    // Claim 2 depends on claim 1
    expect(text).toContain("根据权利要求1所述的系统");
    // Claim 5 depends on claim 4
    expect(text).toContain("根据权利要求4所述的方法");
  });

  it("E3: targetClaimNumber defaults to 1", () => {
    expect(fixture.case.targetClaimNumber).toBe(1);
  });

  it("E3: has 10 total claims", () => {
    const claimMatches = fixture.applicationText.match(/^\d+\.\s/gm);
    expect(claimMatches).toHaveLength(10);
  });
});

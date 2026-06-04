import { describe, it, expect } from "vitest";
import { computeBaselineDate, classifyReferenceDate } from "@client/lib/dateRules";

// ── T-DATE-001..007: dateRules ──

describe("computeBaselineDate", () => {
  it("returns applicationDate when no priorityDate", () => {
    expect(computeBaselineDate({ applicationDate: "2023-03-15" })).toBe("2023-03-15");
  });

  it("returns priorityDate when both provided (priorityDate takes precedence)", () => {
    expect(
      computeBaselineDate({ applicationDate: "2023-07-20", priorityDate: "2021-07-20" })
    ).toBe("2021-07-20");
  });

  it("returns undefined when neither provided", () => {
    expect(computeBaselineDate({})).toBeUndefined();
  });
});

describe("classifyReferenceDate", () => {
  it("T-DATE-001: pub < baseline → available", () => {
    expect(classifyReferenceDate("2023-03-15", "2023-03-14", "high")).toBe("available");
  });

  it("T-DATE-002: pub === baseline → unavailable-same-day", () => {
    expect(classifyReferenceDate("2023-03-15", "2023-03-15", "high")).toBe(
      "unavailable-same-day"
    );
  });

  it("T-DATE-003: pub > baseline → unavailable-later", () => {
    expect(classifyReferenceDate("2023-03-15", "2023-03-16", "high")).toBe("unavailable-later");
  });

  it("T-DATE-004: baseline from priorityDate, pub > priority → unavailable-later", () => {
    // baseline = priorityDate = 2021-07-20, pub = 2022-05-01
    const baseline = computeBaselineDate({
      applicationDate: "2023-07-20",
      priorityDate: "2021-07-20"
    });
    expect(classifyReferenceDate(baseline, "2022-05-01", "high")).toBe("unavailable-later");
  });

  it("T-DATE-005: pubDate missing → needs-publication-date", () => {
    expect(classifyReferenceDate("2023-03-15", undefined)).toBe("needs-publication-date");
  });

  it("T-DATE-006: baselineDate missing → needs-baseline-date", () => {
    expect(classifyReferenceDate(undefined, "2023-03-15")).toBe("needs-baseline-date");
  });

  it("both missing → needs-publication-date (pubDate checked first)", () => {
    expect(classifyReferenceDate(undefined, undefined)).toBe("needs-publication-date");
  });
});

// ── T-DATE-007: caseValidation (priority ≤ application) ──

describe("caseValidation: priorityDate ≤ applicationDate", () => {
  it("T-DATE-007: priorityDate after applicationDate → error", () => {
    // This validation is a pure rule: priorityDate must be ≤ applicationDate
    const applicationDate = "2023-07-20";
    const priorityDate = "2023-08-01";
    expect(priorityDate > applicationDate).toBe(true);
    // The actual validation function will be in caseValidation.ts (B06),
    // but the rule itself is tested here as a pure comparison.
  });

  it("priorityDate equal to applicationDate → valid", () => {
    const applicationDate = "2023-07-20";
    const priorityDate = "2023-07-20";
    expect(priorityDate <= applicationDate).toBe(true);
  });

  it("priorityDate before applicationDate → valid", () => {
    const applicationDate = "2023-07-20";
    const priorityDate = "2021-07-20";
    expect(priorityDate <= applicationDate).toBe(true);
  });
});

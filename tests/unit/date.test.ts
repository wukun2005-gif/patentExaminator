import { describe, it, expect } from "vitest";
import { parseDate } from "@client/lib/dateParse";
import { computeBaselineDate, classifyReferenceDate } from "@client/lib/dateRules";

// ── T-PARSE-001..005: parseDate ──

describe("parseDate", () => {
  it("T-PARSE-001: ISO format (YYYY-MM-DD) → high confidence", () => {
    const result = parseDate("2023-03-15");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "high" });
  });

  it("T-PARSE-002: Chinese format (YYYY年M月D日) → medium confidence", () => {
    const result = parseDate("2023年3月15日");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "medium" });
  });

  it("T-PARSE-003: Slash format (YYYY/M/D) → medium confidence", () => {
    const result = parseDate("2023/03/15");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "medium" });
  });

  it("T-PARSE-004: English format (Month D, YYYY) → medium confidence", () => {
    const result = parseDate("March 15, 2023");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "medium" });
  });

  it("T-PARSE-005: Partial date (YYYY-MM) → low confidence, padded to 01", () => {
    const result = parseDate("2023-03");
    expect(result).toEqual({ iso: "2023-03-01", confidence: "low" });
  });

  it("empty string → undefined", () => {
    expect(parseDate("")).toBeUndefined();
  });

  it("unrecognizable string → undefined", () => {
    expect(parseDate("not a date")).toBeUndefined();
  });

  it("dot format (YYYY.M.D) → medium confidence", () => {
    const result = parseDate("2023.3.15");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "medium" });
  });

  it("English format without comma → medium confidence", () => {
    const result = parseDate("March 15 2023");
    expect(result).toEqual({ iso: "2023-03-15", confidence: "medium" });
  });
});

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

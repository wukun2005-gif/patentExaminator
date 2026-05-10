import { describe, it, expect } from "vitest";
import a2Fixture from "@shared/fixtures/a2-boundary-date.json";

describe("Evaluation A2 — 边界日期", () => {
  const fixture = a2Fixture as {
    case: { id: string; applicationDate: string; priorityDate?: string };
    applicationText: string;
    references: Array<{ publicationDate: string }>;
  };

  it("A2: fixture has valid structure", () => {
    expect(fixture.case.id).toBe("a2-boundary-date");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("A2: has priority date", () => {
    expect(fixture.case.priorityDate).toBe("2022-07-15");
  });

  it("A2: application date is after priority date", () => {
    expect(fixture.case.applicationDate > fixture.case.priorityDate!).toBe(true);
  });

  it("A2: reference publication date is between priority and application date", () => {
    // D1 published 2022-08-01, between priority 2022-07-15 and application 2023-01-15
    const refDate = fixture.references[0]!.publicationDate;
    expect(refDate > fixture.case.priorityDate!).toBe(true);
    expect(refDate < fixture.case.applicationDate).toBe(true);
  });

  it("A2: timeline precision — boundary date scenario", () => {
    // This fixture tests that the system correctly identifies the priority date
    // as the effective filing date for prior art comparison
    expect(fixture.case.priorityDate).toBeDefined();
    expect(fixture.references.length).toBeGreaterThan(0);
  });
});

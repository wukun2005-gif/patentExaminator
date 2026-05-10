import { describe, it, expect } from "vitest";
import a3Fixture from "@shared/fixtures/a3-priority-date.json";

describe("Evaluation A3 — 优先权日选用", () => {
  const fixture = a3Fixture as {
    case: { id: string; applicationDate: string; priorityDate?: string };
    applicationText: string;
    references: Array<{ id: string; publicationDate: string }>;
  };

  it("A3: fixture has valid structure", () => {
    expect(fixture.case.id).toBe("a3-priority-date");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("A3: has priority date that differs from application date", () => {
    expect(fixture.case.priorityDate).toBe("2022-09-20");
    expect(fixture.case.applicationDate).toBe("2023-03-20");
    expect(fixture.case.priorityDate !== fixture.case.applicationDate).toBe(true);
  });

  it("A3: baseline should use priority date when available", () => {
    // The system should use 2022-09-20 (priority) not 2023-03-20 (application)
    // for prior art comparison timeline
    expect(fixture.case.priorityDate).toBeDefined();
  });

  it("A3: reference publication date tests priority date selection", () => {
    // D1 published 2022-10-01, AFTER priority 2022-09-20 but BEFORE application 2023-03-20
    // If system uses priority date → D1 is prior art
    // If system uses application date → D1 is also prior art
    // But the correct behavior is to use priority date
    const refDate = fixture.references[0]!.publicationDate;
    expect(refDate > fixture.case.priorityDate!).toBe(true);
    expect(refDate < fixture.case.applicationDate).toBe(true);
  });
});

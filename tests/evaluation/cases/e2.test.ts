import { describe, it, expect } from "vitest";
import e2Fixture from "@shared/fixtures/e2-ocr-branch.json";

describe("Evaluation E2 — OCR 分支触发", () => {
  const fixture = e2Fixture as {
    case: { id: string; workflowState: string };
    applicationText: string;
    references: unknown[];
    ocrConfig?: { simulateOcrFailure: boolean; ocrQuality: string };
  };

  it("E2: fixture has valid structure", () => {
    expect(fixture.case.id).toBe("e2-ocr");
    expect(fixture.applicationText.length).toBeGreaterThan(10);
  });

  it("E2: case is in OCR review state", () => {
    expect(fixture.case.workflowState).toBe("ocr-review");
  });

  it("E2: has OCR configuration for failure simulation", () => {
    expect(fixture.ocrConfig).toBeDefined();
    expect(fixture.ocrConfig!.simulateOcrFailure).toBe(true);
    expect(fixture.ocrConfig!.ocrQuality).toBe("low");
  });

  it("E2: has at least one reference", () => {
    expect(fixture.references.length).toBeGreaterThan(0);
  });
});

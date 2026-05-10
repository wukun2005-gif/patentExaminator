import { describe, it, expect } from "vitest";
import { classifyReferenceDate, computeBaselineDate } from "@client/lib/dateRules";
import type { ReferenceDocument } from "@shared/types/domain";

describe("recomputeAllReferenceTimeline", () => {
  // Simulate the recompute logic that runs when applicationDate/priorityDate changes
  function recomputeTimeline(
    refs: ReferenceDocument[],
    applicationDate?: string,
    priorityDate?: string
  ): ReferenceDocument[] {
    const baseline = computeBaselineDate({
      ...(applicationDate ? { applicationDate } : {}),
      ...(priorityDate ? { priorityDate } : {})
    });
    return refs.map((ref) => ({
      ...ref,
      timelineStatus: classifyReferenceDate(baseline, ref.publicationDate, ref.publicationDateConfidence)
    }));
  }

  const baseRefs: ReferenceDocument[] = [
    {
      id: "ref-1",
      caseId: "case-1",
      role: "reference",
      fileName: "ref1.pdf",
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      publicationDate: "2022-01-01",
      publicationDateConfidence: "high",
      timelineStatus: "available",
      createdAt: "2023-01-01T00:00:00Z"
    },
    {
      id: "ref-2",
      caseId: "case-1",
      role: "reference",
      fileName: "ref2.pdf",
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      publicationDate: "2023-03-15",
      publicationDateConfidence: "high",
      timelineStatus: "available",
      createdAt: "2023-01-01T00:00:00Z"
    },
    {
      id: "ref-3",
      caseId: "case-1",
      role: "reference",
      fileName: "ref3.pdf",
      fileType: "pdf",
      textStatus: "empty",
      extractedText: "",
      textIndex: { pages: [], paragraphs: [], lineMap: [] },
      publicationDate: "2024-06-01",
      publicationDateConfidence: "high",
      timelineStatus: "available",
      createdAt: "2023-01-01T00:00:00Z"
    }
  ];

  it("updates all reference timeline statuses when applicationDate changes", () => {
    const result = recomputeTimeline(baseRefs, "2023-03-15");
    expect(result[0]!.timelineStatus).toBe("available"); // 2022-01-01 < 2023-03-15
    expect(result[1]!.timelineStatus).toBe("unavailable-same-day"); // 2023-03-15 === 2023-03-15
    expect(result[2]!.timelineStatus).toBe("unavailable-later"); // 2024-06-01 > 2023-03-15
  });

  it("uses priorityDate over applicationDate as baseline", () => {
    const result = recomputeTimeline(baseRefs, "2023-07-20", "2021-07-20");
    // baseline = priorityDate = 2021-07-20
    // All refs have pubDate > 2021-07-20, so all unavailable-later
    expect(result[0]!.timelineStatus).toBe("unavailable-later");
    expect(result[1]!.timelineStatus).toBe("unavailable-later");
    expect(result[2]!.timelineStatus).toBe("unavailable-later");
  });

  it("handles missing publicationDate", () => {
    const { publicationDate: _pubDate, ...refWithoutPubDate } = baseRefs[0]!;
    const refsWithMissing: ReferenceDocument[] = [refWithoutPubDate];
    const result = recomputeTimeline(refsWithMissing, "2023-03-15");
    expect(result[0]!.timelineStatus).toBe("needs-publication-date");
  });

  it("handles missing baseline date", () => {
    const result = recomputeTimeline(baseRefs);
    expect(result[0]!.timelineStatus).toBe("needs-baseline-date");
  });

  it("50 references recompute in under 50ms", () => {
    const manyRefs: ReferenceDocument[] = Array.from({ length: 50 }, (_, i) => ({
      ...baseRefs[0]!,
      id: `ref-${i}`,
      publicationDate: `2022-${String(i % 12 + 1).padStart(2, "0")}-01`
    }));
    const start = performance.now();
    recomputeTimeline(manyRefs, "2023-03-15");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

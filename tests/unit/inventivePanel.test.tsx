import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { InventiveStepPanel } from "@client/features/inventive/InventiveStepPanel";
import { useInventiveStore } from "@client/store";
import type { InventiveStepAnalysis, ReferenceDocument } from "@shared/types/domain";

function makeAnalysis(overrides: Partial<InventiveStepAnalysis> = {}): InventiveStepAnalysis {
  return {
    id: "inventive-test-1",
    caseId: "test",
    closestPriorArtId: "ref-1",
    sharedFeatureCodes: ["A"],
    distinguishingFeatureCodes: ["B", "C"],
    status: "draft",
    objectiveTechnicalProblem: "如何提高散热翅片与基板之间的热传导效率",
    motivationEvidence: [],
    candidateAssessment: "possibly-inventive",
    cautions: ["注意事项1"],
    legalCaution: "本分析为 AI 辅助候选",
    ...overrides
  };
}

function makeRefs(): ReferenceDocument[] {
  return [{
    id: "ref-1",
    caseId: "test",
    role: "reference",
    fileName: "ref.txt",
    fileType: "txt",
    textLayerStatus: "present",
    ocrStatus: "not-needed",
    textStatus: "confirmed",
    extractedText: "参考文献内容",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    title: "对比文件1",
    publicationNumber: "CN108XXXXXXA",
    timelineStatus: "available",
    summary: "公开了一种散热器",
    createdAt: new Date().toISOString()
  } as unknown as ReferenceDocument];
}

const FEATURES = [
  { featureCode: "A", description: "铝合金基板" },
  { featureCode: "B", description: "一体成型翅片" },
  { featureCode: "C", description: "纳米涂层" }
];

const NOOP_RUN = async () => ({
  claimNumber: 1,
  sharedFeatureCodes: ["A"],
  distinguishingFeatureCodes: ["B", "C"],
  motivationEvidence: [],
  candidateAssessment: "possibly-inventive" as const,
  cautions: [],
  legalCaution: ""
});

describe("InventiveStepPanel - 客观技术问题显示", () => {
  beforeEach(() => {
    useInventiveStore.getState().setAnalyses([]);
  });

  it("store 中已有 analysis 时，textarea 应显示 objectiveTechnicalProblem", () => {
    const analysis = makeAnalysis();
    useInventiveStore.getState().setAnalyses([analysis]);

    render(
      <InventiveStepPanel
        caseId="test"
        claimNumber={1}
        features={FEATURES}
        references={makeRefs()}
        runInventive={NOOP_RUN}
      />
    );

    const textarea = screen.getByTestId("input-objective-technical-problem") as HTMLTextAreaElement;
    expect(textarea.value).toBe("如何提高散热翅片与基板之间的热传导效率");
  });

  it("store 中没有 analysis 时，textarea 应为空", () => {
    render(
      <InventiveStepPanel
        caseId="test"
        claimNumber={1}
        features={FEATURES}
        references={makeRefs()}
        runInventive={NOOP_RUN}
      />
    );

    const textarea = screen.getByTestId("input-objective-technical-problem") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("区别特征应正确显示", () => {
    const analysis = makeAnalysis();
    useInventiveStore.getState().setAnalyses([analysis]);

    render(
      <InventiveStepPanel
        caseId="test"
        claimNumber={1}
        features={FEATURES}
        references={makeRefs()}
        runInventive={NOOP_RUN}
      />
    );

    // All features shown as checkboxes, distinguishing ones pre-checked
    expect(screen.getByTestId("checkbox-feature-B")).toBeTruthy();
    expect(screen.getByTestId("checkbox-feature-C")).toBeTruthy();
    expect(screen.getByText(/一体成型翅片/)).toBeTruthy();
    expect(screen.getByText(/纳米涂层/)).toBeTruthy();
  });

  it("候选结论应正确显示", () => {
    const analysis = makeAnalysis({
      motivationEvidence: [{
        documentId: "ref-1",
        label: "[0006]",
        quote: "焊接工艺",
        confidence: "high"
      }]
    });
    useInventiveStore.getState().setAnalyses([analysis]);

    render(
      <InventiveStepPanel
        caseId="test"
        claimNumber={1}
        features={FEATURES}
        references={makeRefs()}
        runInventive={NOOP_RUN}
      />
    );

    expect(screen.getByTestId("candidate-assessment")).toBeTruthy();
    expect(screen.getByText("可能具有创造性（待确认）")).toBeTruthy();
  });
});

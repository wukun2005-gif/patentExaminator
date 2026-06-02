import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AiGatewayError } from "@shared/types/api";
import { DefectPanel } from "@client/features/defects/DefectPanel";
import { NoveltyAgentTrigger } from "@client/features/novelty/NoveltyAgentTrigger";
import { SummaryPanel } from "@client/features/summary/SummaryPanel";
import { useDefectsStore, useNoveltyStore, useDraftStore } from "@client/store";
import type { ReferenceDocument, ClaimFeature } from "@shared/types/domain";
import type { DefectRequest, DefectResponse, NoveltyRequest, NoveltyResponse, SummaryResponse } from "@shared/types/api";

function makeAvailableRef(overrides: Partial<ReferenceDocument> = {}): ReferenceDocument {
  return {
    id: "ref-1",
    caseId: "test",
    fileName: "D1.pdf",
    fileType: "pdf",
    textStatus: "extracted",
    extractedText: "对比文件 D1 的全文内容",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    timelineStatus: "available",
    publicationDateConfidence: "medium",
    role: "reference",
    createdAt: new Date().toISOString(),
    ...overrides
  } as ReferenceDocument;
}

function makeFeature(overrides: Partial<ClaimFeature> = {}): ClaimFeature {
  return {
    id: "feat-A",
    caseId: "test",
    claimNumber: 1,
    featureCode: "A",
    description: "基板",
    specificationCitations: [],
    citationStatus: "confirmed",
    source: "ai",
    ...overrides
  } as ClaimFeature;
}

const NOOP_RUN_DEFECT = async (_req: DefectRequest): Promise<DefectResponse> => ({
  defects: [],
  warnings: [],
  legalCaution: ""
});

const NOOP_RUN_NOVELTY = async (_req: NoveltyRequest): Promise<NoveltyResponse> => ({
  referenceId: "ref-1",
  claimNumber: 1,
  rows: [],
  differenceFeatureCodes: [],
  pendingSearchQuestions: [],
  aiPreliminaryConclusions: [],
  legalCaution: ""
});

const NOOP_RUN_SUMMARY = async (): Promise<SummaryResponse> => ({
  body: "summary body",
  aiNotes: "",
  legalCaution: ""
});

describe("panel E2E error simulation", () => {
  describe("DefectPanel - 缺陷复查错误展示", () => {
    beforeEach(() => {
      useDefectsStore.getState().setDefects([]);
    });

    it("runDefectCheck 抛出 quota 错误 → ErrorBanner 展示配额提示", async () => {
      const runDefectCheck = vi.fn().mockRejectedValue(new AiGatewayError("quota", "额度已用尽"));

      render(
        <DefectPanel
          caseId="test"
          claimText="一种装置"
          specificationText="本发明涉及..."
          claimFeatures={[{ featureCode: "A", description: "基板" }]}
          runDefectCheck={runDefectCheck}
        />
      );

      fireEvent.click(screen.getByTestId("btn-run-defect-check"));

      await waitFor(() => {
        expect(screen.getByTestId("defect-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/配额/)).toBeInTheDocument();
      expect(screen.getByText(/Provider 额度/)).toBeInTheDocument();
    });

    it("runDefectCheck 抛出 auth 错误 → ErrorBanner 展示认证提示", async () => {
      const runDefectCheck = vi.fn().mockRejectedValue(new AiGatewayError("auth", "API Key 无效"));

      render(
        <DefectPanel
          caseId="test"
          claimText="一种装置"
          specificationText="本发明涉及..."
          claimFeatures={[{ featureCode: "A", description: "基板" }]}
          runDefectCheck={runDefectCheck}
        />
      );

      fireEvent.click(screen.getByTestId("btn-run-defect-check"));

      await waitFor(() => {
        expect(screen.getByTestId("defect-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/认证/)).toBeInTheDocument();
    });

    it("runDefectCheck 抛出 network 错误 → ErrorBanner 展示网络提示", async () => {
      const runDefectCheck = vi.fn().mockRejectedValue(new AiGatewayError("network", "connection refused"));

      render(
        <DefectPanel
          caseId="test"
          claimText="一种装置"
          specificationText="本发明涉及..."
          claimFeatures={[{ featureCode: "A", description: "基板" }]}
          runDefectCheck={runDefectCheck}
        />
      );

      fireEvent.click(screen.getByTestId("btn-run-defect-check"));

      await waitFor(() => {
        expect(screen.getByTestId("defect-error")).toBeInTheDocument();
      });

      const items = screen.getAllByText(/网络/);
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    it("runDefectCheck 抛出普通 Error → ErrorBanner 展示错误消息", async () => {
      const runDefectCheck = vi.fn().mockRejectedValue(new Error("服务器内部错误"));

      render(
        <DefectPanel
          caseId="test"
          claimText="一种装置"
          specificationText="本发明涉及..."
          claimFeatures={[{ featureCode: "A", description: "基板" }]}
          runDefectCheck={runDefectCheck}
        />
      );

      fireEvent.click(screen.getByTestId("btn-run-defect-check"));

      await waitFor(() => {
        expect(screen.getByTestId("defect-error")).toBeInTheDocument();
      });

      expect(screen.getByText("服务器内部错误")).toBeInTheDocument();
    });

    it("没有错误时 ErrorBanner 不渲染", () => {
      render(
        <DefectPanel
          caseId="test"
          claimText="一种装置"
          specificationText="本发明涉及..."
          claimFeatures={[{ featureCode: "A", description: "基板" }]}
          runDefectCheck={NOOP_RUN_DEFECT}
        />
      );

      expect(screen.queryByTestId("defect-error")).toBeNull();
    });
  });

  describe("NoveltyAgentTrigger - 新颖性对照错误展示", () => {
    beforeEach(() => {
      useNoveltyStore.getState().setComparisons([]);
      useNoveltyStore.getState().setLoading(false);
    });

    const renderNovelty = (runNovelty: typeof NOOP_RUN_NOVELTY) => {
      return render(
        <NoveltyAgentTrigger
          caseId="test"
          claimNumber={1}
          features={[makeFeature()]}
          references={[makeAvailableRef()]}
          runNovelty={runNovelty}
        />
      );
    };

    it("runNovelty 抛出 quota 错误 → ErrorBanner 展示配额提示", async () => {
      const runNovelty = vi.fn().mockRejectedValue(new AiGatewayError("quota", "额度已用尽"));

      renderNovelty(runNovelty);

      fireEvent.change(screen.getByTestId("select-reference"), {
        target: { value: "ref-1" }
      });

      fireEvent.click(screen.getByTestId("btn-run-novelty-ref-1"));

      await waitFor(() => {
        expect(screen.getByTestId("novelty-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/配额/)).toBeInTheDocument();
    });

    it("runNovelty 抛出 timeout 错误 → ErrorBanner 展示超时提示", async () => {
      const runNovelty = vi.fn().mockRejectedValue(new AiGatewayError("timeout", "请求超时"));

      renderNovelty(runNovelty);

      fireEvent.change(screen.getByTestId("select-reference"), {
        target: { value: "ref-1" }
      });

      fireEvent.click(screen.getByTestId("btn-run-novelty-ref-1"));

      await waitFor(() => {
        expect(screen.getByTestId("novelty-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/超时/)).toBeInTheDocument();
    });

    it("runNovelty 抛出普通 Error → ErrorBanner 展示错误消息", async () => {
      const runNovelty = vi.fn().mockRejectedValue(new Error("网络连接失败"));

      renderNovelty(runNovelty);

      fireEvent.change(screen.getByTestId("select-reference"), {
        target: { value: "ref-1" }
      });

      fireEvent.click(screen.getByTestId("btn-run-novelty-ref-1"));

      await waitFor(() => {
        expect(screen.getByTestId("novelty-error")).toBeInTheDocument();
      });

      expect(screen.getByText("网络连接失败")).toBeInTheDocument();
    });

    it("没有对比文件时显示占位提示而非 ErrorBanner", () => {
      render(
        <NoveltyAgentTrigger
          caseId="test"
          claimNumber={1}
          features={[makeFeature()]}
          references={[]}
          runNovelty={NOOP_RUN_NOVELTY}
        />
      );

      expect(screen.getByTestId("novelty-no-references")).toBeInTheDocument();
      expect(screen.queryByTestId("novelty-error")).toBeNull();
    });
  });

  describe("SummaryPanel - 报告草稿错误展示", () => {
    beforeEach(() => {
      useDraftStore.getState().setSummary("test", { body: "", aiNotes: "", legalCaution: "" });
    });

    it("runSummary 抛出 quota 错误 → ErrorBanner 展示配额提示", async () => {
      const runSummary = vi.fn().mockRejectedValue(new AiGatewayError("quota", "额度已用尽"));

      render(
        <SummaryPanel
          caseId="test"
          runSummary={runSummary}
        />
      );

      fireEvent.click(screen.getByTestId("btn-generate-summary"));

      await waitFor(() => {
        expect(screen.getByTestId("summary-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/配额/)).toBeInTheDocument();
      expect(screen.getByText(/Provider 额度/)).toBeInTheDocument();
    });

    it("runSummary 抛出 auth 错误 → ErrorBanner 展示认证提示", async () => {
      const runSummary = vi.fn().mockRejectedValue(new AiGatewayError("auth", "API Key 无效"));

      render(
        <SummaryPanel
          caseId="test"
          runSummary={runSummary}
        />
      );

      fireEvent.click(screen.getByTestId("btn-generate-summary"));

      await waitFor(() => {
        expect(screen.getByTestId("summary-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/认证/)).toBeInTheDocument();
    });

    it("runSummary 抛出含 quota 关键词的错误 → ErrorBanner 推断为配额错误", async () => {
      const runSummary = vi.fn().mockRejectedValue(
        new Error("All providers failed: bedrock(quota-exceeded), gemini(quota-exceeded)")
      );

      render(
        <SummaryPanel
          caseId="test"
          runSummary={runSummary}
        />
      );

      fireEvent.click(screen.getByTestId("btn-generate-summary"));

      await waitFor(() => {
        expect(screen.getByTestId("summary-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/配额/)).toBeInTheDocument();
    });

    it("没有 runSummary prop 时按钮不渲染", () => {
      render(<SummaryPanel caseId="test" />);
      expect(screen.queryByTestId("btn-generate-summary")).toBeNull();
    });

    it("没有错误时 ErrorBanner 不渲染", () => {
      render(
        <SummaryPanel
          caseId="test"
          runSummary={NOOP_RUN_SUMMARY}
        />
      );

      expect(screen.queryByTestId("summary-error")).toBeNull();
    });
  });
});
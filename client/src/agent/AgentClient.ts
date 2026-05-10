import type { ClaimChartRequest, ClaimChartResponse, AgentRunOptions } from "./contracts";
import type { ClaimFeature } from "@shared/types/domain";

/**
 * Agent client that routes to mock or real provider based on mode.
 * In mock mode, returns fixture data.
 * In real mode, calls the server API.
 */
export class AgentClient {
  constructor(private mode: "mock" | "real") {}

  async runClaimChart(
    request: ClaimChartRequest,
    _options?: AgentRunOptions
  ): Promise<ClaimChartResponse> {
    if (this.mode === "mock") {
      return mockClaimChart(request);
    }
    throw new Error("real-mode-not-ready");
  }
}

function mockClaimChart(request: ClaimChartRequest): ClaimChartResponse {
  const { claimText, caseId, claimNumber } = request;

  // Simple mock: split claim text by "和" or "，" to generate features
  const parts = claimText
    .replace(/^(?:一种|一个|一套)[^，。]*[，。]\s*/, "")
    .split(/(?:和|，|；)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const features: ClaimFeature[] = parts.map((part, i) => ({
    id: `${caseId}-chart-${claimNumber}-${String.fromCharCode(65 + i)}`,
    caseId,
    claimNumber,
    featureCode: String.fromCharCode(65 + i),
    description: part,
    specificationCitations: [],
    citationStatus: "needs-review" as const,
    source: "mock" as const
  }));

  return {
    features,
    warnings: [],
    pendingSearchQuestions: ["请确认对比文件中是否公开了上述技术特征"],
    legalCaution: "以上为候选事实整理，不构成新颖性法律结论。"
  };
}

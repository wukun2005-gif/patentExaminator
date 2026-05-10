import type {
  ClaimChartRequest,
  ClaimChartResponse,
  NoveltyRequest,
  NoveltyResponse,
  InventiveRequest,
  InventiveResponse,
  AgentRunOptions
} from "./contracts";
import type { ClaimFeature } from "@shared/types/domain";
import type { AiRunRequest, AiRunResponse } from "@shared/types/api";
import type { ProviderId } from "@shared/types/agents";

/**
 * Agent client that routes to mock or real provider based on mode.
 * In mock mode, returns fixture data.
 * In real mode, calls the server API.
 */
export class AgentClient {
  constructor(
    private mode: "mock" | "real",
    private gatewayUrl: string = "/api"
  ) {}

  async runClaimChart(
    request: ClaimChartRequest,
    options?: AgentRunOptions
  ): Promise<ClaimChartResponse> {
    if (this.mode === "mock") {
      return mockClaimChart(request);
    }
    return this.callGateway<ClaimChartResponse>("claim-chart", request.claimText, {
      caseId: request.caseId,
      moduleScope: "claim-chart",
      ...options
    });
  }

  async runNovelty(
    request: NoveltyRequest,
    options?: AgentRunOptions
  ): Promise<NoveltyResponse> {
    if (this.mode === "mock") {
      throw new Error("mock-novelty-not-implemented-in-agent-client");
    }
    const prompt = buildNoveltyPrompt(request);
    return this.callGateway<NoveltyResponse>("novelty", prompt, {
      caseId: request.caseId,
      moduleScope: "novelty",
      ...options
    });
  }

  async runInventive(
    request: InventiveRequest,
    options?: AgentRunOptions
  ): Promise<InventiveResponse> {
    if (this.mode === "mock") {
      throw new Error("mock-inventive-not-implemented-in-agent-client");
    }
    const prompt = buildInventivePrompt(request);
    return this.callGateway<InventiveResponse>("inventive", prompt, {
      caseId: request.caseId,
      moduleScope: "inventive",
      ...options
    });
  }

  private async callGateway<T>(
    agent: AiRunRequest["agent"],
    prompt: string,
    meta: { caseId: string; moduleScope: string; providerId?: string; modelId?: string }
  ): Promise<T> {
    const request: AiRunRequest = {
      agent,
      providerPreference: [meta.providerId as ProviderId ?? "mimo"],
      modelId: meta.modelId ?? "MiMo-V2.5-Pro",
      prompt,
      sanitized: false,
      metadata: {
        caseId: meta.caseId,
        moduleScope: meta.moduleScope,
        tokenEstimate: estimateTokens(prompt)
      }
    };

    const res = await fetch(`${this.gatewayUrl}/ai/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(error.error?.message ?? `Gateway error: ${res.status}`);
    }

    const data = (await res.json()) as AiRunResponse;
    if (!data.ok) {
      throw new Error(data.error?.message ?? "Gateway returned error");
    }

    if (data.outputJson) {
      return data.outputJson as T;
    }
    if (data.rawText) {
      try {
        return JSON.parse(data.rawText) as T;
      } catch {
        throw new Error("Failed to parse AI response as JSON");
      }
    }
    throw new Error("Empty response from gateway");
  }
}

function mockClaimChart(request: ClaimChartRequest): ClaimChartResponse {
  const { claimText, caseId, claimNumber } = request;

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

function buildNoveltyPrompt(request: NoveltyRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `对比文件 ID: ${request.referenceId}`,
    `对比文件内容:`,
    request.referenceText.slice(0, 8000)
  ].join("\n");
}

function buildInventivePrompt(request: InventiveRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `可用对比文件:`,
    ...request.availableReferences.map((r) => `  ${r.label} (${r.referenceId}): ${r.excerpt.slice(0, 500)}`),
    ``,
    `用户指定最接近现有技术: ${request.closestPriorArtId ?? "由 AI 推荐"}`
  ].join("\n");
}

function estimateTokens(text: string): number {
  const zhChars = (text.match(/[一-鿿＀-￯]/g) ?? []).length;
  const latinChars = text.length - zhChars;
  return Math.ceil(zhChars * 0.6 + latinChars * 0.3);
}

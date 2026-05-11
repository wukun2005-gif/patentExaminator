import type {
  ClaimChartRequest,
  ClaimChartResponse,
  NoveltyRequest,
  NoveltyResponse,
  InventiveRequest,
  InventiveResponse,
  DefectRequest,
  DefectResponse,
  ChatRequest,
  ChatResponse,
  AgentRunOptions,
  SearchReferencesRequest,
  SearchReferencesResponse
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

  async runDefectCheck(
    request: DefectRequest,
    options?: AgentRunOptions
  ): Promise<DefectResponse> {
    if (this.mode === "mock") {
      return mockDefectCheck(request);
    }
    const prompt = buildDefectPrompt(request);
    return this.callGateway<DefectResponse>("defects", prompt, {
      caseId: request.caseId,
      moduleScope: "defects",
      ...options
    });
  }

  async runChat(
    request: ChatRequest,
    options?: AgentRunOptions
  ): Promise<ChatResponse> {
    if (this.mode === "mock") {
      return mockChat(request);
    }
    const prompt = buildChatPrompt(request);
    return this.callGateway<ChatResponse>("chat", prompt, {
      caseId: request.caseId,
      moduleScope: request.moduleScope,
      ...options
    });
  }

  async runSearchReferences(
    request: SearchReferencesRequest,
    options?: AgentRunOptions
  ): Promise<SearchReferencesResponse> {
    if (this.mode === "mock") {
      return mockSearchReferences(request);
    }

    const res = await fetch(`${this.gatewayUrl}/search-references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: request.caseId,
        claimText: request.claimText,
        features: request.features,
        maxResults: request.maxResults ?? 5,
        providerPreference: [options?.providerId ?? "gemini"],
        modelId: options?.modelId ?? "gemini-2.5-flash-lite",
        searchProviderId: request.searchProviderId,
        searchApiKey: request.searchApiKey,
        searchBaseUrl: request.searchBaseUrl
      })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error ?? `Search error: ${res.status}`);
    }

    return (await res.json()) as SearchReferencesResponse;
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

function buildDefectPrompt(request: DefectRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    ``,
    `权利要求文本:`,
    request.claimText.slice(0, 4000),
    ``,
    `说明书文本:`,
    request.specificationText.slice(0, 8000),
    ``,
    `技术特征:`,
    ...request.claimFeatures.map((f) => `  ${f.featureCode}: ${f.description}`)
  ].join("\n");
}

function mockDefectCheck(request: DefectRequest): DefectResponse {
  const defects: DefectResponse["defects"] = [
    {
      category: "权利要求",
      description: "权利要求引用关系不明确，缺少对独立权利要求的具体引用",
      location: "权利要求2",
      severity: "error"
    },
    {
      category: "说明书",
      description: "具体实施方式中部分技术参数未公开具体数值范围",
      location: "说明书第4段",
      severity: "warning"
    }
  ];

  if (request.specificationText.length > 5000) {
    defects.push({
      category: "说明书",
      description: "摘要可能超过300字，建议精简",
      severity: "info"
    });
  }

  return {
    defects,
    warnings: [],
    legalCaution: "以下为 AI 辅助检测结果，需审查员逐项确认。"
  };
}

function buildChatPrompt(request: ChatRequest): string {
  const parts = [
    `案件 ID: ${request.caseId}`,
    `当前模块: ${request.moduleScope}`,
    ``,
    `=== 当前模块数据 ===`,
    request.contextSummary,
    ``,
    `=== 对话历史 ===`,
    ...request.history.map((m) => `[${m.role}]: ${m.content}`),
    ``,
    `=== 用户消息 ===`,
    request.userMessage
  ];
  return parts.join("\n");
}

function mockChat(request: ChatRequest): ChatResponse {
  const msg = request.userMessage.toLowerCase();
  const scope = request.moduleScope;

  // Detect action intent
  if (msg.includes("重新") && (msg.includes("claim") || msg.includes("特征"))) {
    return {
      reply: "好的，我将为您重新生成 Claim Chart 的特征拆解。请点击下方按钮执行。",
      action: { type: "regenerate", target: "claim-chart" }
    };
  }
  if (msg.includes("重新") && msg.includes("新颖")) {
    return {
      reply: "好的，我将为您重新运行新颖性对照分析。请点击下方按钮执行。",
      action: { type: "regenerate", target: "novelty" }
    };
  }
  if (msg.includes("重新") && msg.includes("创造")) {
    return {
      reply: "好的，我将为您重新运行创造性分析。请点击下方按钮执行。",
      action: { type: "regenerate", target: "inventive" }
    };
  }

  // Context-aware mock reply
  const scopeLabels: Record<string, string> = {
    "claim-chart": "Claim Chart",
    novelty: "新颖性对照",
    inventive: "创造性分析",
    defects: "形式缺陷",
    draft: "素材草稿",
    export: "导出",
    interpret: "文档解读",
    documents: "文档导入",
    case: "案件基本信息"
  };
  const label = scopeLabels[scope] ?? scope;

  return {
    reply: `当前正在${label}模块。您的问题已收到："${request.userMessage}"。\n\n这是演示模式的回复。实际使用时，AI 将结合当前模块的数据为您提供分析和建议。`
  };
}

function mockSearchReferences(request: SearchReferencesRequest): SearchReferencesResponse {
  return {
    ok: true,
    candidates: [
      {
        title: "一种基于深度学习的图像识别方法及装置",
        publicationNumber: "CN112345678A",
        publicationDate: "2021-02-05",
        summary: "公开了一种基于深度学习的图像识别方法，包括特征提取、模型训练和推理阶段。",
        relevanceScore: 88,
        recommendationReason: "该文献公开了与权利要求中图像特征提取相关的技术方案",
        sourceUrl: "https://patents.google.com/patent/CN112345678A"
      },
      {
        title: "基于神经网络的目标检测系统",
        publicationNumber: "CN113456789B",
        publicationDate: "2020-11-20",
        summary: "提出了一种基于卷积神经网络的目标检测系统，具有较高的检测精度和实时性。",
        relevanceScore: 75,
        recommendationReason: "该文献涉及目标检测领域的神经网络架构，与本申请技术领域相关",
        sourceUrl: "https://patents.google.com/patent/CN113456789B"
      },
      {
        title: "Image Processing Method Using Machine Learning",
        publicationNumber: "US20200123456A1",
        publicationDate: "2020-04-16",
        summary: "An image processing method utilizing machine learning models for feature extraction and classification.",
        relevanceScore: 65,
        recommendationReason: "该文献涉及机器学习在图像处理中的应用，技术领域有交叉",
        sourceUrl: "https://patents.google.com/patent/US20200123456A1"
      }
    ],
    searchQuery: "深度学习 图像识别 特征提取 神经网络"
  };
}

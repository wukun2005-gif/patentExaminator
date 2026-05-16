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
  SearchReferencesResponse,
  ExtractCaseFieldsRequest,
  ExtractCaseFieldsResponse,
  SummaryRequest,
  SummaryResponse,
  TranslateRequest,
  TranslateResponse,
  InterpretRequest,
  InterpretResponse,
  OpinionAnalysisRequest,
  OpinionAnalysisResponse,
  ArgumentAnalysisRequest,
  ArgumentAnalysisResponse,
  ReexamDraftRequest,
  ReexamDraftResponse
} from "./contracts";
import type { ClaimFeature } from "@shared/types/domain";
import type { AiRunRequest, AiRunResponse } from "@shared/types/api";
import type { ProviderId, AgentAssignment, AppSettings } from "@shared/types/agents";

const GATEWAY_AGENT_TO_KEY: Record<string, AgentAssignment["agent"]> = {
  "claim-chart": "claim-chart",
  novelty: "novelty",
  inventive: "inventive",
  defects: "defects",
  chat: "chat",
  summary: "summary",
  draft: "draft",
  interpret: "interpret",
  "search-references": "search-references",
  "extract-case-fields": "extract-case-fields",
  "opinion-analysis": "opinion-analysis",
  "argument-analysis": "argument-analysis",
  "reexam-draft": "reexam-draft"
};

/**
 * Agent client that routes to mock or real provider based on mode.
 * In mock mode, returns fixture data.
 * In real mode, calls the server API.
 */
export class AgentClient {
  private agentAssignments: AgentAssignment[];
  private fallbackProvider: ProviderId;
  private fallbackModel: string;
  private enabledProviders: ProviderId[];
  private llmApiKey: string;

  constructor(
    private mode: "mock" | "real",
    private gatewayUrl: string = "/api",
    settings?: AppSettings | AgentAssignment[]
  ) {
    if (Array.isArray(settings)) {
      this.agentAssignments = settings;
      this.fallbackProvider = "gemini";
      this.fallbackModel = "gemini-3.1-flash-lite-preview";
      this.enabledProviders = ["gemini"];
      this.llmApiKey = "";
    } else if (settings) {
      this.agentAssignments = settings.agents ?? [];
      const enabled = settings.providers.filter((p) => p.enabled && p.apiKeyRef);
      const firstEnabled = enabled[0];
      this.fallbackProvider = (firstEnabled?.providerId as ProviderId) ?? "gemini";
      this.fallbackModel = firstEnabled?.defaultModelId ?? "gemini-3.1-flash-lite-preview";
      this.enabledProviders = enabled.map((p) => p.providerId as ProviderId);
      this.llmApiKey = firstEnabled?.apiKeyRef ?? "";
    } else {
      this.agentAssignments = [];
      this.fallbackProvider = "gemini";
      this.fallbackModel = "gemini-3.1-flash-lite-preview";
      this.enabledProviders = ["gemini"];
      this.llmApiKey = "";
    }
  }

  private resolveAgent(gatewayAgent: string): { providerId: ProviderId; modelId: string } | null {
    const key = GATEWAY_AGENT_TO_KEY[gatewayAgent];
    if (!key) return null;
    const assignment = this.agentAssignments.find((a) => a.agent === key);
    if (!assignment) return null;
    return {
      providerId: assignment.providerOrder[0] ?? this.fallbackProvider,
      modelId: assignment.modelId
    };
  }

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
      return mockInventive(request);
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

    const searchResolved = options?.providerId && options?.modelId
      ? { providerId: options.providerId, modelId: options.modelId }
      : this.resolveAgent("search-references") ?? {
          providerId: this.enabledProviders[0] ?? this.fallbackProvider,
          modelId: this.fallbackModel
        };

    const res = await fetch(`${this.gatewayUrl}/search-references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: request.caseId,
        claimText: request.claimText,
        features: request.features,
        maxResults: request.maxResults ?? 5,
        providerPreference: [searchResolved.providerId, ...this.enabledProviders.filter((p) => p !== searchResolved.providerId)],
        modelId: searchResolved.modelId,
        searchProviderId: request.searchProviderId,
        searchApiKey: request.searchApiKey,
        searchBaseUrl: request.searchBaseUrl,
        llmApiKey: this.llmApiKey || undefined
      })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error ?? `Search error: ${res.status}`);
    }

    return (await res.json()) as SearchReferencesResponse;
  }

  async runExtractCaseFields(
    request: ExtractCaseFieldsRequest,
    options?: AgentRunOptions
  ): Promise<ExtractCaseFieldsResponse> {
    if (this.mode === "mock") {
      return mockExtractCaseFields(request);
    }
    const prompt = buildExtractCaseFieldsPrompt(request);
    return this.callGateway<ExtractCaseFieldsResponse>("extract-case-fields", prompt, {
      caseId: request.caseId,
      moduleScope: "case",
      ...options
    });
  }

  async runInterpret(
    request: InterpretRequest,
    options?: AgentRunOptions
  ): Promise<InterpretResponse> {
    if (this.mode === "mock") {
      return { reply: "（演示模式）文档解读功能需要在真实模式下使用 AI 服务。" };
    }
    const prompt = buildInterpretPrompt(request);
    return this.callGateway<InterpretResponse>("interpret", prompt, {
      caseId: request.caseId,
      moduleScope: "interpret",
      ...options
    });
  }

  async runOpinionAnalysis(
    request: OpinionAnalysisRequest,
    options?: AgentRunOptions
  ): Promise<OpinionAnalysisResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<OpinionAnalysisResponse>(
        "opinion-analysis",
        request.caseId,
        "opinion-analysis"
      );
    }
    const prompt = buildOpinionAnalysisPrompt(request);
    return this.callGateway<OpinionAnalysisResponse>("opinion-analysis", prompt, {
      caseId: request.caseId,
      moduleScope: "opinion-analysis",
      ...options
    });
  }

  async runArgumentAnalysis(
    request: ArgumentAnalysisRequest,
    options?: AgentRunOptions
  ): Promise<ArgumentAnalysisResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<ArgumentAnalysisResponse>(
        "argument-analysis",
        request.caseId,
        "argument-mapping"
      );
    }
    const prompt = buildArgumentAnalysisPrompt(request);
    return this.callGateway<ArgumentAnalysisResponse>("argument-analysis", prompt, {
      caseId: request.caseId,
      moduleScope: "argument-mapping",
      ...options
    });
  }

  async runReexamDraft(
    request: ReexamDraftRequest,
    options?: AgentRunOptions
  ): Promise<ReexamDraftResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<ReexamDraftResponse>("reexam-draft", request.caseId, "draft");
    }
    const prompt = buildReexamDraftPrompt(request);
    return this.callGateway<ReexamDraftResponse>("reexam-draft", prompt, {
      caseId: request.caseId,
      moduleScope: "draft",
      ...options
    });
  }

  async runSummary(
    request: SummaryRequest,
    options?: AgentRunOptions
  ): Promise<SummaryResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<SummaryResponse>("summary", request.caseId, "summary");
    }
    const prompt = buildSummaryPrompt(request);
    return this.callGateway<SummaryResponse>("summary", prompt, {
      caseId: request.caseId,
      moduleScope: "summary",
      ...options
    });
  }

  async runTranslate(
    request: TranslateRequest,
    options?: AgentRunOptions
  ): Promise<TranslateResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<TranslateResponse>("translate", request.caseId, "translate");
    }
    const prompt = buildTranslatePrompt(request);
    return this.callGateway<TranslateResponse>("translate", prompt, {
      caseId: request.caseId,
      moduleScope: "translate",
      ...options
    });
  }

  private async callGateway<T>(
    agent: AiRunRequest["agent"],
    prompt: string,
    meta: { caseId: string; moduleScope: string; providerId?: string; modelId?: string }
  ): Promise<T> {
    const resolved = meta.providerId && meta.modelId
      ? { providerId: meta.providerId as ProviderId, modelId: meta.modelId }
      : this.resolveAgent(agent) ?? { providerId: this.fallbackProvider, modelId: this.fallbackModel };

    const request: AiRunRequest = {
      agent,
      providerPreference: [resolved.providerId, ...this.enabledProviders.filter((p) => p !== resolved.providerId)],
      modelId: resolved.modelId,
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
      const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
      const msg = errorBody.error?.message ?? `Gateway error: ${res.status}`;
      const attempts = errorBody.attempts as AiRunResponse["attempts"] | undefined;
      const detail = attempts?.length
        ? ` (${attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
        : "";
      throw new Error(`${msg}${detail}`);
    }

    const data = (await res.json()) as AiRunResponse;
    if (!data.ok) {
      const msg = data.error?.message ?? "Gateway returned error";
      const detail = data.attempts?.length
        ? ` (${data.attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
        : "";
      throw new Error(`${msg}${detail}`);
    }

    if (data.outputJson) {
      return data.outputJson as T;
    }
    if (data.rawText) {
      try {
        return JSON.parse(stripCodeFences(data.rawText)) as T;
      } catch {
        // Plain text response (e.g. chat) — wrap as { reply: text }
        return { reply: data.rawText } as T;
      }
    }
    throw new Error("Empty response from gateway");
  }

  private async callGatewayMock<T>(
    agent: AiRunRequest["agent"],
    caseId: string,
    moduleScope: string
  ): Promise<T> {
    const res = await fetch(`${this.gatewayUrl}/ai/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        providerPreference: ["gemini"],
        modelId: "mock",
        prompt: `[Mock] ${agent}`,
        sanitized: false,
        mock: true,
        metadata: { caseId, moduleScope, tokenEstimate: 0 }
      })
    });
    const data = (await res.json()) as AiRunResponse;
    if (!res.ok || !data.ok) {
      throw new Error(data.error?.message ?? `Mock gateway error: ${res.status}`);
    }
    return data.outputJson as T;
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
  const parts = [
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `对比文件 ID: ${request.referenceId}`,
    `对比文件内容:`,
    request.referenceText.slice(0, 8000)
  ];
  if (request.applicantArguments) {
    parts.push(``, `申请人答辩理由:`, request.applicantArguments);
  }
  if (request.amendedClaimText) {
    parts.push(``, `修改后权利要求:`, request.amendedClaimText.slice(0, 4000));
  }
  return parts.join("\n");
}

function buildInventivePrompt(request: InventiveRequest): string {
  const parts = [
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `可用对比文件:`,
    ...request.availableReferences.map((r) => `  ${r.label} (${r.referenceId}): ${r.excerpt.slice(0, 500)}`),
    ``,
    `用户指定最接近现有技术: ${request.closestPriorArtId ?? "由 AI 推荐"}`
  ];
  if (request.applicantArguments) {
    parts.push(``, `申请人答辩理由:`, request.applicantArguments);
  }
  if (request.amendedClaimText) {
    parts.push(``, `修改后权利要求:`, request.amendedClaimText.slice(0, 4000));
  }
  return parts.join("\n");
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
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
      severity: "error",
      previouslyRaised: true,
      overcomeStatus: "not-overcome"
    },
    {
      category: "说明书",
      description: "具体实施方式中部分技术参数未公开具体数值范围",
      location: "说明书第4段",
      severity: "warning",
      previouslyRaised: true,
      overcomeStatus: "partially-overcome"
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

function mockInventive(request: InventiveRequest): InventiveResponse {
  const distCodes = request.features.map((f) => f.featureCode);
  const sharedCodes = distCodes.slice(0, 1);
  const diffCodes = distCodes.slice(1);

  const motivation = request.availableReferences.length > 0
    ? [{
        referenceId: request.availableReferences[0]!.referenceId,
        label: `${request.availableReferences[0]!.label} §5`,
        quote: "对比文件公开了散热基板与散热翅片的结构组合",
        confidence: "high" as const
      }]
    : [];

  const assessment = request.applicantArguments
    ? "possibly-inventive" as const
    : "possibly-lacks-inventiveness" as const;

  const examinerResponse = [
    "【候选结论】" + (assessment === "possibly-inventive"
      ? "修改后的权利要求可能具有创造性。"
      : "权利要求可能缺乏创造性。"),
    "",
    "【技术启示分析】",
    ...motivation.map((m) => `- ${m.label}：「${m.quote}」`),
    request.applicantArguments
      ? `\n申请人关于${request.applicantArguments.slice(0, 100)}...的答辩理由已纳入考量。`
      : "",
    "",
    "【审查意见草稿（可直接修改）】",
    "请在此处直接编辑您的审查意见回应草稿。",
    "",
    "（本分析为 AI 辅助候选，不构成正式审查结论。）"
  ].join("\n");

  return {
    claimNumber: request.claimNumber,
    closestPriorArtId: request.closestPriorArtId ?? request.availableReferences[0]?.referenceId,
    sharedFeatureCodes: sharedCodes,
    distinguishingFeatureCodes: diffCodes,
    motivationEvidence: motivation,
    candidateAssessment: assessment,
    cautions: request.applicantArguments
      ? ["申请人答辩可能改变创造性判断，建议进一步审查修改后的特征组合"]
      : ["建议在对比文件中寻找区别特征的技术启示"],
    examinerResponse,
    legalCaution: "本分析为 AI 辅助候选，不构成创造性法律结论。"
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

function buildInterpretPrompt(request: InterpretRequest): string {
  return [
    "你是一个专利审查助手。请对以下专利申请文件进行深度解读，从以下维度分析：",
    "",
    "1. 【技术领域】该专利属于哪个技术领域",
    "2. 【核心技术方案】概括发明的技术方案",
    "3. 【主要权利要求】列出独立权利要求的核心技术特征",
    "4. 【关键实施例】概括关键实施例及其技术效果",
    "5. 【创新点分析】该发明相对于现有技术的创新之处",
    "6. 【潜在问题】可能存在的形式或实质性问题",
    "",
    "请用中文回答，结构清晰，每个维度用标题分隔。",
    "",
    `案件 ID: ${request.caseId}`,
    "",
    "=== 专利文档内容 ===",
    request.documentText.slice(0, 12000)
  ].join("\n");
}

function buildOpinionAnalysisPrompt(request: OpinionAnalysisRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    `文档 ID: ${request.documentId}`,
    ``,
    `审查意见通知书文本:`,
    request.officeActionText.slice(0, 12000)
  ].join("\n");
}

function buildArgumentAnalysisPrompt(request: ArgumentAnalysisRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    ``,
    `驳回理由清单:`,
    ...request.rejectionGrounds.map((g) => `  ${g.code} (${g.category}): ${g.summary}`),
    ``,
    `意见陈述书文本:`,
    request.responseText.slice(0, 12000),
    ...(request.amendedClaimsText
      ? [``, `修改后权利要求:`, request.amendedClaimsText.slice(0, 4000)]
      : [])
  ].join("\n");
}

function buildReexamDraftPrompt(request: ReexamDraftRequest): string {
  return [
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    ``,
    `驳回理由清单:`,
    ...request.rejectionGrounds.map((g) => `  ${g.code} (${g.category}): ${g.summary}`),
    ``,
    `答辩映射:`,
    ...request.argumentMappings.map(
      (m) => `  ${m.rejectionGroundCode}: ${m.argumentSummary} [${m.confidence}]`
    ),
    ...(request.noveltyResults ? [``, `新颖性复核:`, request.noveltyResults.slice(0, 4000)] : []),
    ...(request.inventiveResults ? [``, `创造性复核:`, request.inventiveResults.slice(0, 4000)] : []),
    ...(request.defectResults ? [``, `缺陷复查:`, request.defectResults.slice(0, 2000)] : [])
  ].join("\n");
}

function buildSummaryPrompt(request: SummaryRequest): string {
  return [
    `案件基线: ${request.caseBaseline}`,
    ``,
    `Claim Chart（已确认特征）:`,
    request.confirmedFeatures.slice(0, 4000),
    ``,
    `新颖性对照（已审核记录）:`,
    request.reviewedNoveltyComparisons.slice(0, 4000),
    ``,
    `创造性分析:`,
    request.inventiveAnalysis.slice(0, 4000),
  ].join("\n");
}

function buildTranslatePrompt(request: TranslateRequest): string {
  return request.documentText.slice(0, 12000);
}

function mockChat(request: ChatRequest): ChatResponse {
  const msg = request.userMessage.toLowerCase();
  const scope = request.moduleScope;

  // Detect action intent
  if (msg.includes("重新") && (msg.includes("claim") || msg.includes("特征"))) {
    return {
      reply: "好的，我将为您重新生成权利要求特征表的特征拆解。请点击下方按钮执行。",
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
    "claim-chart": "权利要求特征表",
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

function buildExtractCaseFieldsPrompt(request: ExtractCaseFieldsRequest): string {
  const docSections = request.documents.map((doc, i) => {
    return `=== 文件 ${i + 1}: ${doc.fileName} ===\n${doc.text}`;
  });

  return [
    "你是一个专利文档信息提取助手。请从以下专利申请文件中提取案件基本信息和权利要求结构。",
    "",
    "请严格返回 JSON 格式，不要包含任何其他文字。字段无法确定时设为 null。",
    "",
    "返回格式:",
    JSON.stringify({
      title: "发明名称（字符串或 null）",
      applicationNumber: "申请号，格式如 CN202310001001A（字符串或 null）",
      applicant: "申请人（字符串或 null）",
      applicationDate: "申请日，格式 YYYY-MM-DD（字符串或 null）",
      priorityDate: "优先权日，格式 YYYY-MM-DD（字符串或 null）",
      claims: [
        {
          claimNumber: 1,
          type: "independent 或 dependent",
          dependsOn: [],
          rawText: "权利要求全文"
        }
      ]
    }, null, 2),
    "",
    "要求:",
    "- 提取所有权利要求，识别独立权利要求和从属权利要求",
    "- 从属权利要求的 dependsOn 填写其引用的权利要求编号列表",
    "- 日期格式统一为 YYYY-MM-DD",
    "",
    `案件 ID: ${request.caseId}`,
    "",
    ...docSections
  ].join("\n");
}

function mockExtractCaseFields(request: ExtractCaseFieldsRequest): ExtractCaseFieldsResponse {
  const text = request.documents[0]?.text.slice(0, 3000) ?? "";
  // Title: try "发明名称" label first, then first line starting with "一种/一个"
  const title =
    text.match(/发明名称[：:\s]*([^\n]+)/)?.[1]?.trim() ??
    text.match(/(一种[^，。\n]{2,60})/)?.[1]?.trim() ??
    null;
  // Application number: CN prefix, dotted format (202410567890.1), or plain digits
  const applicationNumber =
    text.match(/申请号[：:\s]*([A-Z]{0,2}\d{9,14}[.-]?\d{0,2}[A-Z]?)/)?.[1]?.trim() ??
    text.match(/\b(CN\d{9,13}[A-Z]?)\b/)?.[1] ??
    null;
  const applicant = text.match(/申请人[：:\s]*([^\n]+)/)?.[1]?.trim() ?? null;
  const appDateMatch = text.match(/申请日[：:\s]*(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  const applicationDate = appDateMatch
    ? `${appDateMatch[1]}-${appDateMatch[2]!.padStart(2, "0")}-${appDateMatch[3]!.padStart(2, "0")}`
    : null;
  const priDateMatch = text.match(/优先权[日]?[：:\s]*(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  const priorityDate = priDateMatch
    ? `${priDateMatch[1]}-${priDateMatch[2]!.padStart(2, "0")}-${priDateMatch[3]!.padStart(2, "0")}`
    : null;
  return {
    title,
    applicationNumber,
    applicant,
    applicationDate,
    priorityDate,
    claims: [
      { claimNumber: 1, type: "independent", dependsOn: [], rawText: "（演示模式：权利要求1内容将在实际使用时由 AI 提取）" }
    ]
  };
}

function mockSearchReferences(_request: SearchReferencesRequest): SearchReferencesResponse {
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

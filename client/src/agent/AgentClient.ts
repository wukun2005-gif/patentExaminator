import {
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
  ExtractSearchTermsRequest,
  ExtractSearchTermsResponse,
  SearchWithTermsRequest,
  SummaryRequest,
  SummaryResponse,
  TranslateRequest,
  TranslateResponse,
  InterpretRequest,
  InterpretResponse,
  InterpretDocumentType,
  OpinionAnalysisRequest,
  OpinionAnalysisResponse,
  ArgumentAnalysisRequest,
  ArgumentAnalysisResponse,
  ReexamDraftRequest,
  ReexamDraftResponse,
  ClassifyDocumentsRequest,
  ClassifyDocumentsResponse,
  AiGatewayError,
  type AiErrorType
} from "./contracts";
import type { ClaimFeature } from "@shared/types/domain";
import type { AiRunRequest, AiRunResponse } from "@shared/types/api";
import type { ProviderId, ProviderConnection, AgentAssignment, AppSettings, ProviderErrorMessage } from "@shared/types/agents";
import { useSettingsStore } from "../store/features/settings/settingsSlice";
import { waitForServerReady, clearServerReadyCache } from "../lib/serverReady";
import { truncateForModel } from "../lib/textTruncate";
import { createLogger } from "../lib/logger";

const log = createLogger("AgentClient");

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
  "reexam-draft": "reexam-draft",
  "classify-documents": "classify-documents"
};

const INTERPRET_DOCUMENT_LABELS: Record<InterpretDocumentType, string> = {
  application: "专利申请文件",
  "office-action": "审查意见通知书",
  "office-action-response": "意见陈述书"
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
  private providerSettings: ProviderConnection[];
  private enableProviderFallback: boolean;
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
      this.enabledProviders = ["gemini", "mimo"];
      this.providerSettings = [];
      this.enableProviderFallback = true;
      this.llmApiKey = "";
    } else if (settings) {
      this.agentAssignments = settings.agents ?? [];
      const enabled = settings.providers.filter((p) => p.enabled && p.apiKeyRef);
      const firstEnabled = enabled[0];
      this.fallbackProvider = (firstEnabled?.providerId as ProviderId) ?? "gemini";
      this.fallbackModel = firstEnabled?.defaultModelId ?? "gemini-3.1-flash-lite-preview";
      this.enabledProviders = enabled.map((p) => p.providerId as ProviderId);
      this.providerSettings = settings.providers;
      this.enableProviderFallback = settings.enableProviderFallback ?? true;
      this.llmApiKey = firstEnabled?.apiKeyRef ?? "";
    } else {
      this.agentAssignments = [];
      this.fallbackProvider = "gemini";
      this.fallbackModel = "gemini-3.1-flash-lite-preview";
      this.enabledProviders = ["gemini", "mimo"];
      this.providerSettings = [];
      this.enableProviderFallback = true;
      this.llmApiKey = "";
    }
  }

  private resolveAgent(gatewayAgent: string): { providerId: ProviderId; modelId: string; maxTokens?: number } | null {
    const key = GATEWAY_AGENT_TO_KEY[gatewayAgent];
    if (!key) return null;
    const assignment = this.agentAssignments.find((a) => a.agent === key);
    if (!assignment) return null;
    const providerId = assignment.providerOrder[0] ?? this.fallbackProvider;
    const providerSetting = this.providerSettings.find((p) => p.providerId === providerId);
    const modelId = providerSetting?.defaultModelId ?? assignment.modelId;
    return {
      providerId,
      modelId,
      maxTokens: assignment.maxTokens
    };
  }

  async runClaimChart(
    request: ClaimChartRequest,
    options?: AgentRunOptions
  ): Promise<ClaimChartResponse> {
    if (this.mode === "mock") {
      return mockClaimChart(request);
    }
    const prompt = buildClaimChartPrompt(request);
    const raw = await this.callGateway<unknown>("claim-chart", prompt, {
      caseId: request.caseId,
      moduleScope: "claim-chart",
      ...options
    });
    return mapClaimChartOutput(request.caseId, request.claimNumber, raw);
  }

  async runNovelty(
    request: NoveltyRequest,
    options?: AgentRunOptions
  ): Promise<NoveltyResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<NoveltyResponse>("novelty", request.caseId, "novelty");
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

    // Wait for server to be ready before making API calls
    await waitForServerReady(this.gatewayUrl);

    const searchResolved = options?.providerId && options?.modelId
      ? { providerId: options.providerId, modelId: options.modelId }
      : this.resolveAgent("search-references") ?? {
          providerId: this.enabledProviders[0] ?? this.fallbackProvider,
          modelId: this.fallbackModel
        };

    const modelFallbacks: Partial<Record<string, string[]>> = {};
    const enableModelFallback: Partial<Record<string, boolean>> = {};
    const providerBaseUrls: Partial<Record<string, string>> = {};
    for (const p of this.providerSettings) {
      modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds;
      enableModelFallback[p.providerId] = p.enableModelFallback ?? true;
      if (p.baseUrl) {
        providerBaseUrls[p.providerId] = p.baseUrl;
      }
    }

    const doSearchFetch = async (): Promise<Response> => {
      return fetch(`${this.gatewayUrl}/search-references`, {
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
          llmApiKey: this.llmApiKey || undefined,
          modelFallbacks,
          enableModelFallback,
          providerBaseUrls
        })
      });
    };

    let res: Response;
    try {
      res = await doSearchFetch();
    } catch {
      clearServerReadyCache();
      await waitForServerReady(this.gatewayUrl, true);
      res = await doSearchFetch();
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error ?? `Search error: ${res.status}`);
    }

    return (await res.json()) as SearchReferencesResponse;
  }

  /** nf-7 Step 1: 仅提取检索词，不执行搜索 */
  async runExtractSearchTerms(
    request: ExtractSearchTermsRequest,
    options?: AgentRunOptions
  ): Promise<ExtractSearchTermsResponse> {
    if (this.mode === "mock") {
      return {
        ok: true,
        queries: ["LED散热器 相变材料", "LED heatsink phase change", "散热模组 相变储能", "thermal management phase change"],
        featureCount: request.features.length
      };
    }

    await waitForServerReady(this.gatewayUrl);

    const searchResolved = options?.providerId && options?.modelId
      ? { providerId: options.providerId, modelId: options.modelId }
      : this.resolveAgent("search-references") ?? {
          providerId: this.enabledProviders[0] ?? this.fallbackProvider,
          modelId: this.fallbackModel
        };

    const modelFallbacks: Partial<Record<string, string[]>> = {};
    const enableModelFallback: Partial<Record<string, boolean>> = {};
    const providerBaseUrls: Partial<Record<string, string>> = {};
    for (const p of this.providerSettings) {
      modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds;
      enableModelFallback[p.providerId] = p.enableModelFallback ?? true;
      if (p.baseUrl) providerBaseUrls[p.providerId] = p.baseUrl;
    }

    const doFetch = async (): Promise<Response> => {
      return fetch(`${this.gatewayUrl}/extract-search-terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: request.caseId,
          claimText: request.claimText,
          features: request.features,
          providerPreference: [searchResolved.providerId, ...this.enabledProviders.filter((p) => p !== searchResolved.providerId)],
          modelId: searchResolved.modelId,
          llmApiKey: this.llmApiKey || undefined,
          modelFallbacks,
          enableModelFallback,
          providerBaseUrls
        })
      });
    };

    let res: Response;
    try {
      res = await doFetch();
    } catch {
      clearServerReadyCache();
      await waitForServerReady(this.gatewayUrl, true);
      res = await doFetch();
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error ?? `Extract terms error: ${res.status}`);
    }

    return (await res.json()) as ExtractSearchTermsResponse;
  }

  /** nf-7 Step 2: 用用户编辑后的检索词搜索 */
  async runSearchWithTerms(
    request: SearchWithTermsRequest,
    options?: AgentRunOptions
  ): Promise<SearchReferencesResponse> {
    if (this.mode === "mock") {
      return mockSearchReferences({ caseId: request.caseId, claimText: request.claimText, features: request.features, maxResults: request.maxResults });
    }

    await waitForServerReady(this.gatewayUrl);

    const searchResolved = options?.providerId && options?.modelId
      ? { providerId: options.providerId, modelId: options.modelId }
      : this.resolveAgent("search-references") ?? {
          providerId: this.enabledProviders[0] ?? this.fallbackProvider,
          modelId: this.fallbackModel
        };

    const modelFallbacks: Partial<Record<string, string[]>> = {};
    const enableModelFallback: Partial<Record<string, boolean>> = {};
    const providerBaseUrls: Partial<Record<string, string>> = {};
    for (const p of this.providerSettings) {
      modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds;
      enableModelFallback[p.providerId] = p.enableModelFallback ?? true;
      if (p.baseUrl) providerBaseUrls[p.providerId] = p.baseUrl;
    }

    const doFetch = async (): Promise<Response> => {
      return fetch(`${this.gatewayUrl}/search-with-terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: request.caseId,
          claimText: request.claimText,
          features: request.features,
          searchQueries: request.searchQueries,
          maxResults: request.maxResults ?? 5,
          searchProviderId: request.searchProviderId,
          searchApiKey: request.searchApiKey,
          searchBaseUrl: request.searchBaseUrl,
          providerPreference: [searchResolved.providerId, ...this.enabledProviders.filter((p) => p !== searchResolved.providerId)],
          modelId: searchResolved.modelId,
          llmApiKey: this.llmApiKey || undefined,
          modelFallbacks,
          enableModelFallback,
          providerBaseUrls
        })
      });
    };

    let res: Response;
    try {
      res = await doFetch();
    } catch {
      clearServerReadyCache();
      await waitForServerReady(this.gatewayUrl, true);
      res = await doFetch();
    }

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
      return mockInterpret(request);
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

  async runClassifyDocuments(
    request: ClassifyDocumentsRequest,
    options?: AgentRunOptions
  ): Promise<ClassifyDocumentsResponse> {
    if (this.mode === "mock") {
      return this.callGatewayMock<ClassifyDocumentsResponse>(
        "classify-documents",
        request.caseId,
        "documents"
      );
    }
    const prompt = buildClassifyDocumentsPrompt(request);
    return this.callGateway<ClassifyDocumentsResponse>("classify-documents", prompt, {
      caseId: request.caseId,
      moduleScope: "documents",
      ...options
    });
  }

  private async callGateway<T>(
    agent: AiRunRequest["agent"],
    prompt: string,
    meta: { caseId: string; moduleScope: string; providerId?: string; modelId?: string; signal?: AbortSignal | null }
  ): Promise<T> {
    // Wait for server to be ready before making API calls
    await waitForServerReady(this.gatewayUrl);

    const resolved = meta.providerId && meta.modelId
      ? { providerId: meta.providerId as ProviderId, modelId: meta.modelId, maxTokens: undefined as number | undefined }
      : this.resolveAgent(agent) ?? { providerId: this.fallbackProvider, modelId: this.fallbackModel, maxTokens: undefined };

    const modelFallbacks: Partial<Record<ProviderId, string[]>> = {};
    const enableModelFallback: Partial<Record<ProviderId, boolean>> = {};
    const providerBaseUrls: Partial<Record<ProviderId, string>> = {};
    for (const p of this.providerSettings) {
      modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds;
      enableModelFallback[p.providerId] = p.enableModelFallback ?? true;
      if (p.baseUrl) {
        providerBaseUrls[p.providerId] = p.baseUrl;
      }
    }

    const providerPreference = this.enableProviderFallback
      ? [resolved.providerId, ...this.enabledProviders.filter((p) => p !== resolved.providerId)]
      : [resolved.providerId];

    const request: AiRunRequest = {
      agent,
      providerPreference: providerPreference as ProviderId[],
      modelId: resolved.modelId,
      ...(resolved.maxTokens != null ? { maxTokens: resolved.maxTokens } : {}),
      modelFallbacks,
      enableModelFallback,
      providerBaseUrls,
      prompt,
      sanitized: false,
      metadata: {
        caseId: meta.caseId,
        moduleScope: meta.moduleScope,
        tokenEstimate: estimateTokens(prompt)
      }
    };

    log("Calling gateway", {
      agent,
      providerPreference,
      modelId: resolved.modelId,
      enabledProviders: this.enabledProviders,
      enableProviderFallback: this.enableProviderFallback,
      hasProviderBaseUrls: Object.keys(providerBaseUrls).length > 0,
      caseId: meta.caseId
    });

    const doFetch = async (): Promise<Response> => {
      return fetch(`${this.gatewayUrl}/ai/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        ...(meta.signal ? { signal: meta.signal } : {})
      });
    };

    let res: Response;
    try {
      res = await doFetch();
    } catch {
      // Don't retry if the request was already aborted by the client
      if (meta.signal?.aborted) {
        throw new AiGatewayError("abort", "请求已取消");
      }
      clearServerReadyCache();
      try {
        await waitForServerReady(this.gatewayUrl, true);
        res = await doFetch();
      } catch {
        throw new AiGatewayError(
          "network",
          "无法连接到 AI 服务，请检查网络连接和服务器状态。"
        );
      }
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
      const msg = errorBody.error?.message ?? `Gateway error: ${res.status}`;
      const attempts = errorBody.attempts as AiRunResponse["attempts"] | undefined;
      this.trackProviderErrors(attempts, agent, meta.caseId);
      const errorType = classifyGatewayError(res.status, errorBody, attempts);
      const detail = attempts?.length
        ? ` (${attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
        : "";
      throw new AiGatewayError(errorType, `${msg}${detail}`, attempts);
    }

    const data = (await res.json()) as AiRunResponse;
    if (!data.ok) {
      const msg = data.error?.message ?? "Gateway returned error";
      const attempts = data.attempts;
      this.trackProviderErrors(attempts, agent, meta.caseId);
      const errorType = classifyGatewayError(res.status, data, attempts);
      const detail = attempts?.length
        ? ` (${attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
        : "";
      throw new AiGatewayError(errorType, `${msg}${detail}`, attempts);
    }

    if (data.structureErrors?.length) {
      const detail = data.structureErrors.slice(0, 3).join("; ");
      throw new AiGatewayError(
        "structure",
        `AI 返回结构校验失败（${agent}）：${detail}。请确认 AI Provider 配置正确或切换为 Mock 模式重试。`
      );
    }

    // Track token usage
    if (data.tokenUsage && meta.caseId) {
      const { useTokenUsageStore } = await import("../store/features/tokenUsage/tokenUsageSlice");
      useTokenUsageStore.getState().addRecord({
        caseId: meta.caseId,
        agent,
        providerId: data.attempts?.[0]?.providerId ?? "unknown",
        modelId: request.modelId ?? "unknown",
        inputTokens: data.tokenUsage.input,
        outputTokens: data.tokenUsage.output,
        totalTokens: data.tokenUsage.total
      });
    }

    if (data.outputJson) {
      return data.outputJson as T;
    }
    if (data.rawText) {
      try {
        return JSON.parse(stripCodeFences(data.rawText)) as T;
      } catch (parseError) {
        if (agent === "chat" || agent === "interpret") {
          return { reply: data.rawText } as T;
        }
        // If there are structure errors, include them in the error message
        const structureErrorInfo = data.structureErrors ? ` 结构错误: ${data.structureErrors.join("; ")}` : "";
        throw new Error(
          `AI 返回格式异常：未返回结构化 JSON 数据。` +
          `Agent: ${agent}。` +
          `JSON 解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` +
          `${structureErrorInfo}` +
          `。请确认 AI Provider 配置正确或切换为 Mock 模式重试。`
        );
      }
    }
    throw new Error("Empty response from gateway");
  }

  private trackProviderErrors(
    attempts: AiRunResponse["attempts"] | undefined,
    agent: string,
    caseId: string
  ): void {
    if (!attempts || attempts.length === 0) return;
    try {
      const store = useSettingsStore.getState();
      for (const a of attempts) {
        if (a.ok) continue;
        store.addProviderError({
          providerId: a.providerId as ProviderId,
          errorCode: a.errorCode ?? "unknown",
          message: `Provider ${a.providerId} failed: ${a.errorCode ?? "unknown error"}`,
          timestamp: new Date().toISOString(),
          read: false,
          agent,
          caseId
        } as Omit<ProviderErrorMessage, "id">);
      }
    } catch {
      // Silently ignore errors during error tracking
    }
  }

  private async callGatewayMock<T>(
    agent: AiRunRequest["agent"],
    caseId: string,
    moduleScope: string
  ): Promise<T> {
    // Wait for server to be ready before making API calls
    await waitForServerReady(this.gatewayUrl);

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

function normalizeSpecificationCitations(
  raw: unknown
): ClaimFeature["specificationCitations"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const cite = item as Record<string, unknown>;
    const paragraph = cite.paragraph;
    const normalized: ClaimFeature["specificationCitations"][number] = {
      documentId: typeof cite.documentId === "string" ? cite.documentId : "",
      label: String(cite.label ?? ""),
      confidence:
        cite.confidence === "high" || cite.confidence === "medium" || cite.confidence === "low"
          ? cite.confidence
          : "medium"
    };
    if (paragraph !== undefined && paragraph !== null && paragraph !== "") {
      normalized.paragraph = String(paragraph);
    }
    if (typeof cite.quote === "string") normalized.quote = cite.quote;
    if (typeof cite.lineStart === "number") normalized.lineStart = cite.lineStart;
    if (typeof cite.lineEnd === "number") normalized.lineEnd = cite.lineEnd;
    return normalized;
  });
}

function buildClaimChartPrompt(request: ClaimChartRequest): string {
  const specExcerpt = truncateForModel(request.specificationText, 8000);
  return [
    `你是一位资深专利审查员助理，任务是对权利要求 ${request.claimNumber} 进行技术特征拆解（Claim Chart）。`,
    ``,
    `约束：`,
    `- 只能基于给定的权利要求文本与说明书片段；不得编造段落号或引用。`,
    `- 每个技术特征必须给出可映射到说明书段落号的 specificationCitations；若无法定位，citationStatus 必须为 "needs-review"。`,
    `- 不得输出新颖性/创造性等法律结论。`,
    `- 严格按下方 JSON 格式输出，不要输出 markdown 代码块或任何解释性文字。`,
    ``,
    `权利要求 ${request.claimNumber} 文本：`,
    request.claimText,
    ``,
    `说明书片段（含段落号，如有）：`,
    specExcerpt || "（未提供说明书片段）",
    ``,
    `请严格输出以下 JSON 格式（字段名必须完全一致，使用双引号）：`,
    `{`,
    `  "claimNumber": ${request.claimNumber},`,
    `  "features": [`,
    `    {`,
    `      "featureCode": "A",`,
    `      "description": "技术特征描述",`,
    `      "specificationCitations": [`,
    `        { "label": "[0001]", "paragraph": "0001", "quote": "说明书原文摘录", "confidence": "high" }`,
    `      ],`,
    `      "citationStatus": "confirmed"`,
    `    }`,
    `  ],`,
    `  "warnings": [`,
    `    { "type": "other", "message": "可选警告说明" }`,
    `  ],`,
    `  "pendingSearchQuestions": ["待检索问题，最多5条"],`,
    `  "legalCaution": "以上为候选事实整理，不构成法律结论。"`,
    `}`,
    ``,
    `注意：`,
    `- featureCode 使用大写字母 A、B、C…（从 A 起连续编号）`,
    `- features 至少 1 项；citationStatus 只能是 confirmed / needs-review / not-found`,
    `- specificationCitations 中 confidence 只能是 high / medium / low`,
    `- warnings 可为空数组 []；pendingSearchQuestions 最多 5 条`
  ].join("\n");
}

function mapClaimChartOutput(
  caseId: string,
  claimNumber: number,
  raw: unknown
): ClaimChartResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 未返回有效的权利要求特征数据，请确认 AI Provider 配置正确或切换为 Mock 模式重试。");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.features) || obj.features.length === 0) {
    throw new Error("AI 未返回有效的权利要求特征数据，请确认 AI Provider 配置正确或切换为 Mock 模式重试。");
  }

  const features: ClaimFeature[] = (obj.features as unknown[]).map((item, index) => {
    const feat = item as Record<string, unknown>;
    if (
      typeof feat.id === "string" &&
      typeof feat.caseId === "string" &&
      typeof feat.featureCode === "string"
    ) {
      return feat as unknown as ClaimFeature;
    }
    const code =
      typeof feat.featureCode === "string" && feat.featureCode.length > 0
        ? feat.featureCode
        : String.fromCharCode(65 + index);
    const status = feat.citationStatus;
    const citationStatus: ClaimFeature["citationStatus"] =
      status === "confirmed" || status === "needs-review" || status === "not-found"
        ? status
        : "needs-review";
    const mapped: ClaimFeature = {
      id: `${caseId}-chart-${claimNumber}-${code}`,
      caseId,
      claimNumber:
        typeof feat.claimNumber === "number" ? feat.claimNumber : claimNumber,
      featureCode: code,
      description: String(feat.description ?? ""),
      specificationCitations: normalizeSpecificationCitations(feat.specificationCitations),
      citationStatus,
      source: "ai" as const
    };
    if (typeof feat.userNotes === "string") {
      mapped.userNotes = feat.userNotes;
    }
    return mapped;
  });

  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.map((w) =>
        typeof w === "string"
          ? w
          : typeof w === "object" && w !== null && "message" in w
            ? String((w as { message: string }).message)
            : String(w)
      )
    : [];

  return {
    features,
    warnings,
    pendingSearchQuestions: Array.isArray(obj.pendingSearchQuestions)
      ? obj.pendingSearchQuestions.map(String)
      : [],
    legalCaution:
      typeof obj.legalCaution === "string"
        ? obj.legalCaution
        : "以上为候选事实整理，不构成法律结论。"
  };
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
    `你是一名专利复审辅助系统，负责在复审阶段逐特征重新评估新颖性对照。`,
    ``,
    `## 复审上下文`,
    `本次分析基于以下复审背景：`,
    `- 审查意见通知书中的驳回理由`,
    `- 申请人的答辩理由（如提供）`,
    `- 申请人修改后的权利要求（如提供）`,
    ``,
    `## 公开状态四档语义`,
    `- clearly-disclosed：对比文件明确公开了该技术特征`,
    `- possibly-disclosed：对比文件可能公开了该技术特征，但需审查员确认`,
    `- not-found：在对比文件中未找到该技术特征的公开内容`,
    `- not-applicable：该特征不适用于本次对照`,
    ``,
    `## 输入数据`,
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `对比文件 ID: ${request.referenceId}`,
    `对比文件内容:`,
    truncateForModel(request.referenceText, 8000)
  ];
  if (request.applicantArguments) {
    parts.push(``, `申请人答辩理由:`, request.applicantArguments);
  }
  if (request.amendedClaimText) {
    parts.push(``, `修改后权利要求:`, truncateForModel(request.amendedClaimText, 4000));
  }
  parts.push(
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出，不要输出其他任何内容：`,
    ``,
    `{`,
    `  "referenceId": "${request.referenceId}",`,
    `  "claimNumber": ${request.claimNumber},`,
    `  "rows": [`,
    `    {`,
    `      "featureCode": "A",`,
    `      "disclosureStatus": "clearly-disclosed|possibly-disclosed|not-found|not-applicable",`,
    `      "citations": [`,
    `        {`,
    `          "label": "[0005]",`,
    `          "paragraph": "0005",`,
    `          "quote": "引用原文",`,
    `          "confidence": "high|medium|low"`,
    `        }`,
    `      ],`,
    `      "mismatchNotes": "差异说明（可选）"`,
    `    }`,
    `  ],`,
    `  "differenceFeatureCodes": ["B", "C"],`,
    `  "pendingSearchQuestions": ["待检索问题（最多5条）"],`,
    `  "legalCaution": "以上为候选事实整理，不构成新颖性法律结论。"`,
    `}`,
    ``,
    `注意事项：`,
    `- rows 数组必须包含每条输入的技术特征`,
    `- citations 中必须包含 paragraph 字段`,
    `- 如果提供了答辩理由，需在 mismatchNotes 中回应`,
    `- 务必使用双引号，字段名必须与示例完全一致`
  );
  return parts.join("\n");
}

function buildInventivePrompt(request: InventiveRequest): string {
  const parts = [
    `你是一名专利复审辅助系统，负责在复审阶段进行创造性三步法分析。`,
    ``,
    `## 复审上下文`,
    `本次分析基于以下复审背景：`,
    `- 审查意见通知书中的驳回理由`,
    `- 申请人的答辩理由（如提供）`,
    `- 申请人修改后的权利要求（如提供）`,
    ``,
    `## 输入数据`,
    `案件 ID: ${request.caseId}`,
    `权利要求号: ${request.claimNumber}`,
    `技术特征:`,
    ...request.features.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `可用对比文件:`,
    ...request.availableReferences.map((r) => `  ${r.label} (${r.referenceId}): ${truncateForModel(r.excerpt, 500)}`),
    ``,
    `用户指定最接近现有技术: ${request.closestPriorArtId ?? "由 AI 推荐"}`
  ];
  if (request.applicantArguments) {
    parts.push(``, `申请人答辩理由:`, request.applicantArguments);
  }
  if (request.amendedClaimText) {
    parts.push(``, `修改后权利要求:`, truncateForModel(request.amendedClaimText, 4000));
  }
  parts.push(
    ``,
    `## 输出要求`,
    `严格按以下 JSON 格式输出，不要输出其他任何内容：`,
    ``,
    `{`,
    `  "claimNumber": ${request.claimNumber},`,
    `  "closestPriorArtId": "最接近现有技术的 referenceId（必须填写，从可用对比文件中选择一个）",`,
    `  "sharedFeatureCodes": ["共有特征的 featureCode 数组"],`,
    `  "distinguishingFeatureCodes": ["区别特征的 featureCode 数组"],`,
    `  "objectiveTechnicalProblem": "客观技术问题描述",`,
    `  "motivationEvidence": [`,
    `    {`,
    `      "referenceId": "对比文件ID",`,
    `      "label": "引用标签",`,
    `      "quote": "引用原文",`,
    `      "confidence": "high|medium|low"`,
    `    }`,
    `  ],`,
    `  "candidateAssessment": "possibly-inventive|possibly-lacks-inventiveness|insufficient-evidence",`,
    `  "cautions": ["注意事项数组"],`,
    `  "examinerResponse": "审查员回应草稿（可包含换行）",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
    ``,
    `注意事项：`,
    `- closestPriorArtId 必须填写，如果用户未指定则从可用对比文件中选择最相关的一个`,
    `- sharedFeatureCodes 和 distinguishingFeatureCodes 并集必须等于输入的所有 features`,
    `- candidateAssessment 只能是 possibly-inventive、possibly-lacks-inventiveness 或 insufficient-evidence`,
    `- motivationEvidence 中的 confidence 只能是 high、medium 或 low`,
    `- 务必使用双引号，字段名必须与示例完全一致`
  );
  return parts.join("\n");
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
}

function classifyGatewayError(
  status: number,
  errorBody: { error?: { code?: string } },
  attempts?: AiRunResponse["attempts"]
): AiErrorType {
  if (attempts?.length) {
    const errorCodes = attempts.map((a) => a.errorCode);
    const allSame = (code: string) => errorCodes.every((c) => c === code);
    if (allSame("quota-exceeded")) return "quota";
    if (allSame("auth-failed")) return "auth";
    if (allSame("timeout")) return "timeout";
    if (errorCodes.every((c) => c === "network-error" || c === "server-error")) return "network";
    const hasQuota = errorCodes.some((c) => c === "quota-exceeded");
    if (hasQuota) return "quota";
  }
  if (errorBody.error?.code === "no-api-keys") return "auth";
  if (errorBody.error?.code === "quota-exceeded" || status === 429) return "quota";
  if (errorBody.error?.code === "auth-failed" || status === 401) return "auth";
  if (status >= 500) return "network";
  return "other";
}

function estimateTokens(text: string): number {
  const zhChars = (text.match(/[一-鿿＀-￯]/g) ?? []).length;
  const latinChars = text.length - zhChars;
  return Math.ceil(zhChars * 0.6 + latinChars * 0.3);
}

function buildDefectPrompt(request: DefectRequest): string {
  return [
    `你是一位资深专利审查员，擅长识别专利申请文件中的形式缺陷。`,
    `案件 ID: ${request.caseId}`,
    ``,
    `权利要求文本:`,
    truncateForModel(request.claimText, 4000),
    ``,
    `说明书文本:`,
    truncateForModel(request.specificationText, 8000),
    ``,
    `技术特征:`,
    ...request.claimFeatures.map((f) => `  ${f.featureCode}: ${f.description}`),
    ``,
    `请根据以上内容检测形式缺陷，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "defects": [`,
    `    {`,
    `      "category": "缺陷类别（如：权利要求、说明书、摘要）",`,
    `      "description": "缺陷具体描述",`,
    `      "location": "缺陷所在位置（可选）",`,
    `      "severity": "error|warning|info",`,
    `      "previouslyRaised": true或false（可选，是否曾被提出）,`,
    `      "overcomeStatus": "overcome|not-overcome|partially-overcome（可选，克服状态）"`,
    `    }`,
    `  ],`,
    `  "warnings": ["检测过程中的警告信息数组"],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- severity 只能是 error（错误）、warning（警告）或 info（提示）`,
    `- 如果没有发现缺陷，defects 返回空数组`,
    `- 务必使用双引号，字段名必须与示例完全一致`,
    `- location、previouslyRaised、overcomeStatus 为可选字段，不适用时可不包含`
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
        referenceId: request.availableReferences[0]?.referenceId ?? "",
        label: `${request.availableReferences[0]?.label ?? ""} §5`,
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

  // Always provide closestPriorArtId, even if empty string when no references available
  const closestPriorArtId = request.closestPriorArtId ?? request.availableReferences[0]?.referenceId ?? "";

  return {
    claimNumber: request.claimNumber,
    closestPriorArtId,
    sharedFeatureCodes: sharedCodes,
    distinguishingFeatureCodes: diffCodes,
    objectiveTechnicalProblem: `如何通过${diffCodes.join("、")}等技术特征的组合，解决现有技术中存在的效率低、成本高等问题`,
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

const INTERPRET_TEMPLATES: Record<InterpretDocumentType, { title: string; instructions: string[] }> = {
  application: {
    title: "专利申请文件解读",
    instructions: [
      "1. 【技术领域】该专利属于哪个技术领域",
      "2. 【核心技术方案】概括发明的技术方案",
      "3. 【主要权利要求】列出独立权利要求的核心技术特征",
      "4. 【关键实施例】概括关键实施例及其技术效果",
      "5. 【创新点分析】该发明相对于现有技术的创新之处",
      "6. 【潜在问题】可能存在的形式或实质性问题"
    ]
  },
  "office-action": {
    title: "审查意见通知书解读",
    instructions: [
      "1. 【通知书基本信息】发文日、通知书编号、审查员姓名（如有）",
      "2. 【审查结论】整体审查结论概述",
      "3. 【驳回理由清单】逐条列出驳回理由及其法律依据",
      "4. 【引用对比文件】列出引用的对比文件及其公开号、公开日",
      "5. 【权利要求对应关系】每项驳回理由涉及的权利要求号",
      "6. 【申请人答复期限】答复截止日期及注意事项"
    ]
  },
  "office-action-response": {
    title: "意见陈述书解读",
    instructions: [
      "1. 【陈述书基本信息】提交日、对应审查意见通知书编号",
      "2. 【答复策略概述】申请人采取的整体答复策略",
      "3. 【权利要求修改情况】是否修改权利要求，修改内容及依据",
      "4. 【争辩要点】逐条回应驳回理由的核心论点",
      "5. 【新增证据或论证】是否有新的技术证据或论证",
      "6. 【未解决问题】审查员可能继续质疑的问题点"
    ]
  }
};

function buildInterpretPrompt(request: InterpretRequest): string {
  const template = INTERPRET_TEMPLATES[request.documentType] ?? INTERPRET_TEMPLATES.application;
  const relatedDocuments = request.relatedDocuments?.length
    ? request.relatedDocuments.map((doc) => `- ${doc.fileName}（${INTERPRET_DOCUMENT_LABELS[doc.documentType]}）`).join("\n")
    : "无";

  return [
    `你是一个专利审查助手。请对以下${template.title}进行深度解读，从以下维度分析：`,
    "",
    ...template.instructions,
    "",
    "请用中文回答，结构清晰，每个维度用标题分隔。",
    "必须在开头明确写出当前解读文件名。",
    "需要结合同案其它文件类型说明当前文件与案件整体的关联，但不得编造未出现在文本中的事实。",
    "",
    `案件 ID: ${request.caseId}`,
    `文件 ID: ${request.documentId ?? "unknown-document"}`,
    `文件名: ${request.fileName ?? "未命名文件"}`,
    "",
    "=== 同案相关文件 ===",
    relatedDocuments,
    "",
    "=== 文档内容 ===",
    truncateForModel(request.documentText, 12000)
  ].join("\n");
}

function mockInterpret(request: InterpretRequest): InterpretResponse {
  const template = INTERPRET_TEMPLATES[request.documentType] ?? INTERPRET_TEMPLATES.application;
  const docTypeLabel = template.title;

  return {
    reply: `【${docTypeLabel} · 演示模式】\n\n这是演示模式的解读结果。\n\n实际使用时，AI 将根据文档内容为您提供详细的分析和建议。\n\n请切换到真实模式以使用完整的文档解读功能。`
  };
}

function buildOpinionAnalysisPrompt(request: OpinionAnalysisRequest): string {
  return [
    `你是一位资深专利审查员，擅长分析审查意见通知书。`,
    `案件 ID: ${request.caseId}`,
    `文档 ID: ${request.documentId}`,
    ``,
    `审查意见通知书文本:`,
    truncateForModel(request.officeActionText, 12000),
    ``,
    `请从以上审查意见通知书中提取驳回理由和引用文献，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "documentId": "${request.documentId}",`,
    `  "rejectionGrounds": [`,
    `    {`,
    `      "code": "唯一标识（如 RG-1、RG-2）",`,
    `      "category": "novelty|inventive|clarity|support|amendment|other",`,
    `      "claimNumbers": [权利要求编号数组],`,
    `      "summary": "驳回理由摘要（50字以内）",`,
    `      "legalBasis": "法律依据（如'专利法第22条第2款'）",`,
    `      "originalText": "审查意见中相关段落的原文"`,
    `    }`,
    `  ],`,
    `  "citedReferences": [`,
    `    {`,
    `      "publicationNumber": "引用文献公开号（如 CN108123456A）",`,
    `      "rejectionGroundCodes": ["关联的驳回理由 code 数组"],`,
    `      "featureMapping": "该文献公开了哪个技术特征"`,
    `    }`,
    `  ],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- 一个驳回理由可能对应多个权利要求编号`,
    `- 一个引用文献可能被多条驳回理由引用`,
    `- 务必使用双引号，字段名必须与示例完全一致`,
    `- 如果审查意见中没有驳回理由，rejectionGrounds 返回空数组`
  ].join("\n");
}

function buildArgumentAnalysisPrompt(request: ArgumentAnalysisRequest): string {
  const parts = [
    `你是一位资深专利审查员，擅长分析意见陈述书中的答辩理由与驳回理由之间的对应关系。`,
    `案件 ID: ${request.caseId}`,
    ``,
    `驳回理由清单:`,
    ...request.rejectionGrounds.map((g) => `  ${g.code} (${g.category}): ${g.summary}`),
    ``,
    `意见陈述书文本:`,
    truncateForModel(request.responseText, 12000),
    ...(request.amendedClaimsText
      ? [``, `修改后权利要求:`, truncateForModel(request.amendedClaimsText, 4000)]
      : []),
    ``,
    `请将每条驳回理由与意见陈述书中的答辩内容进行映射，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "mappings": [`,
    `    {`,
    `      "rejectionGroundCode": "驳回理由的 code（如 RG-1）",`,
    `      "applicantArgument": "申请人的答辩原文片段",`,
    `      "argumentSummary": "答辩理由摘要（50字以内）",`,
    `      "confidence": "high|medium|low",`,
    `      "amendedClaims": [`,
    `        {`,
    `          "claimNumber": 权利要求编号,`,
    `          "originalText": "修改前原文",`,
    `          "amendedText": "修改后原文",`,
    `          "changeDescription": "修改说明"`,
    `        }`,
    `      ],`,
    `      "newEvidence": "申请人提交的新证据（如有）"`,
    `    }`,
    `  ],`,
    `  "unmappedGrounds": ["未在意见陈述书中找到对应答辩的驳回理由 code 数组"],`,
    `  "legalCaution": "AI 分析法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- 如果某条驳回理由在意见陈述书中没有对应答辩，将其 code 加入 unmappedGrounds`,
    `- amendedClaims 为可选字段，如果没有修改权利要求则不包含此字段`,
    `- newEvidence 为可选字段，没有新证据时不包含此字段`,
    `- 务必使用双引号，字段名必须与示例完全一致`
  ];
  return parts.join("\n");
}

function buildReexamDraftPrompt(request: ReexamDraftRequest): string {
  return [
    `你是一位资深专利审查员，负责起草复审意见草稿。`,
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
    ...(request.noveltyResults ? [``, `新颖性复核:`, truncateForModel(request.noveltyResults, 4000)] : []),
    ...(request.inventiveResults ? [``, `创造性复核:`, truncateForModel(request.inventiveResults, 4000)] : []),
    ...(request.defectResults ? [``, `缺陷复查:`, truncateForModel(request.defectResults, 2000)] : []),
    ``,
    `请根据以上内容起草复审意见草稿，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "claimNumber": 权利要求号,`,
    `  "responseItems": [`,
    `    {`,
    `      "rejectionGroundCode": "驳回理由代码",`,
    `      "category": "驳回理由类别",`,
    `      "applicantArgumentSummary": "申请人答辩要点摘要",`,
    `      "examinerResponse": "审查员回应（复审意见正文）",`,
    `      "conclusion": "argument-accepted|argument-partially-accepted|argument-rejected|needs-further-review",`,
    `      "supportingEvidence": [`,
    `        { "label": "证据标签", "quote": "引文片段（可选）", "confidence": "high|medium|low" }`,
    `      ]`,
    `    }`,
    `  ],`,
    `  "overallAssessment": "综合评估",`,
    `  "defectReviewSummary": "缺陷复查总结（可选）",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- conclusion 只能是 argument-accepted、argument-partially-accepted、argument-rejected 或 needs-further-review`,
    `- supportingEvidence 为可选字段，无证据时不包含`,
    `- confidence 为 high 或 medium 时，quote 必须有至少 20 个字符的引文`,
    `- defectReviewSummary 为可选字段`,
    `- 务必使用双引号，字段名必须与示例完全一致`
  ].join("\n");
}

function buildSummaryPrompt(request: SummaryRequest): string {
  return [
    `你是一位资深专利审查员，负责撰写审查意见简述。`,
    `案件基线: ${request.caseBaseline}`,
    ``,
    `Claim Chart（已确认特征）:`,
    truncateForModel(request.confirmedFeatures, 4000),
    ``,
    `新颖性对照（已审核记录）:`,
    truncateForModel(request.reviewedNoveltyComparisons, 4000),
    ``,
    `创造性分析:`,
    truncateForModel(request.inventiveAnalysis, 4000),
    ``,
    `请根据以上内容撰写审查意见简述，严格按以下 JSON 格式输出，不要输出其他内容：`,
    `{`,
    `  "body": "简述正文：①简要概述专利申请的技术方案、发明要解决的问题和关键技术手段；②概述审查意见的核心要点，包含新颖性、创造性的主要结论和关键依据（援引对比文件和 Citation）",`,
    `  "aiNotes": "AI 备注（包括不确定性说明、需要人工确认的事项等）",`,
    `  "legalCaution": "法律风险提示"`,
    `}`,
    ``,
    `注意：`,
    `- body 字段必须包含有效的简述正文，且必须同时包含技术方案概述和审查意见核心结论两部分`,
    `- 审查意见结论需引用具体的对比文件和法律依据`,
    `- 务必使用双引号，字段名必须与示例完全一致`
  ].join("\n");
}

function buildTranslatePrompt(request: TranslateRequest): string {
  return truncateForModel(request.documentText, 12000);
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
    ? `${appDateMatch[1]}-${(appDateMatch[2] ?? "0").padStart(2, "0")}-${(appDateMatch[3] ?? "0").padStart(2, "0")}`
    : null;
  const priDateMatch = text.match(/优先权[日]?[：:\s]*(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  const priorityDate = priDateMatch
    ? `${priDateMatch[1]}-${(priDateMatch[2] ?? "0").padStart(2, "0")}-${(priDateMatch[3] ?? "0").padStart(2, "0")}`
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

function buildClassifyDocumentsPrompt(request: ClassifyDocumentsRequest): string {
  const docSections = request.documents.map((doc) => {
    return `=== 文件 ${doc.fileIndex}: ${doc.fileName} ===\n${doc.textSample}`;
  });

  return [
    "你是一个专利文档分类助手。请根据以下文件的文件名和文本内容，识别每个文件的类型。",
    "",
    "## 文档类型定义",
    "",
    "| 类型 | 英文标识 | 识别特征 |",
    "|------|---------|---------|",
    "| 申请文件 | application | 包含'说明书'、'权利要求书'、'摘要'；文件名含'申请'、专利号格式 |",
    "| 审查意见通知书 | office-action | 包含'审查意见通知书'；文件名含'审查意见'、'OA' |",
    "| 意见陈述书 | office-action-response | 包含'意见陈述书'、'答复'；文件名含'意见陈述'、'答复' |",
    "| 对比文件 | reference | 包含其他专利公开号；文件名含专利号格式 |",
    "",
    "## 分类规则",
    "",
    "1. 优先根据文件名判断：文件名明确包含关键词的直接分类",
    "2. 无法识别的文件统一归类为'对比文件'(reference)",
    "3. 权利要求书属于'申请文件'的一部分",
    "",
    "请严格返回 JSON 格式：",
    JSON.stringify({
      classifications: [
        {
          fileIndex: 0,
          fileName: "文件名",
          role: "application | office-action | office-action-response | reference",
          confidence: "high | medium | low",
          reason: "分类理由（一句话）"
        }
      ],
      warnings: ["如果某文件难以分类，在此说明"]
    }, null, 2),
    "",
    `案件 ID: ${request.caseId}`,
    "",
    ...docSections
  ].join("\n");
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

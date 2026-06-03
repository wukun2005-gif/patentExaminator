/**
 * Data repositories + Agent API — B-038: 统一数据访问层
 * 内联 dataClient（fetch 工具层）+ agentApi（Agent API 封装）
 */
import type {
  PatentCase, SourceDocument, ClaimNode, ClaimFeature,
  FormalDefect, NoveltyComparison, InventiveStepAnalysis,
  ChatSession, ChatMessage, SearchSession,
  OfficeActionAnalysis, ArgumentMapping
} from "@shared/types/domain";
import type {
  ReexamDraftResponse, SummaryResponse,
  SearchReferencesRequest, SearchReferencesResponse,
  ExtractSearchTermsRequest, ExtractSearchTermsResponse,
  SearchWithTermsRequest, AgentRunOptions,
} from "@shared/types/api";
import { AiGatewayError } from "@shared/types/api";
import type { ProviderId, AppSettings } from "@shared/types/agents";
import { waitForServerReady, clearServerReadyCache } from "./serverReady";
import { createLogger } from "./logger";

const log = createLogger("Repos");

// ── Data Client (inlined from dataClient.ts) ──────────

const API_BASE = "/api/data";

export async function getAll<T>(store: string): Promise<T[]> {
  const res = await fetch(`${API_BASE}/${store}`);
  if (!res.ok) throw new Error(`Failed to get ${store}: ${res.status}`);
  const data = await res.json() as { ok: boolean; records: T[] };
  return data.records;
}

export async function query<T>(store: string, field: string, value: unknown): Promise<T[]> {
  const res = await fetch(`${API_BASE}/${store}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, value }),
  });
  if (!res.ok) throw new Error(`Failed to query ${store}: ${res.status}`);
  const data = await res.json() as { ok: boolean; records: T[] };
  return data.records;
}

export async function getById<T>(store: string, id: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/${store}/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get ${store}/${id}: ${res.status}`);
  const data = await res.json() as { ok: boolean; record: T };
  return data.record;
}

export async function create<T extends { id: string }>(store: string, record: T): Promise<void> {
  const res = await fetch(`${API_BASE}/${store}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`Failed to create ${store}: ${res.status}`);
}

export async function update<T>(store: string, id: string, data: T): Promise<void> {
  const res = await fetch(`${API_BASE}/${store}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update ${store}/${id}: ${res.status}`);
}

export async function remove(store: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${store}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete ${store}/${id}: ${res.status}`);
}

export async function clearStore(store: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${store}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to clear ${store}: ${res.status}`);
}

// ── caseRepo ─────────────────────────────────────────

export async function createCase(item: PatentCase): Promise<void> {
  await create("cases", item);
}

export async function readAllCases(): Promise<PatentCase[]> {
  const cases = await getAll<PatentCase>("cases");
  return cases.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function readCaseById(id: string): Promise<PatentCase | undefined> {
  const result = await getById<PatentCase>("cases", id);
  return result ?? undefined;
}

export async function updateCase(item: PatentCase): Promise<void> {
  await update("cases", item.id, { ...item, updatedAt: new Date().toISOString() });
}

export async function deleteCase(id: string): Promise<void> {
  await remove("cases", id);
}

// ── documentRepo ─────────────────────────────────────

export async function createDocument(item: SourceDocument): Promise<void> {
  await create("documents", item);
}

export async function readDocumentsByCaseId(caseId: string): Promise<SourceDocument[]> {
  const docs = await getAll<SourceDocument>("documents");
  return docs.filter((d) => d.caseId === caseId);
}

export async function updateDocument(item: SourceDocument): Promise<void> {
  await update("documents", item.id, item);
}

export async function deleteDocument(id: string): Promise<void> {
  await remove("documents", id);
}

// ── referenceRepo ────────────────────────────────────

export async function readReferencesByCaseId(caseId: string): Promise<SourceDocument[]> {
  const all = await query<SourceDocument>("documents", "caseId", caseId);
  return all.filter((doc) => doc.role === "reference");
}

// ── claimRepo ────────────────────────────────────────

export async function createClaimNode(item: ClaimNode): Promise<void> {
  await create("claimNodes", item as ClaimNode & { id: string });
}

export async function readClaimNodesByCaseId(caseId: string): Promise<ClaimNode[]> {
  return query<ClaimNode>("claimNodes", "caseId", caseId);
}

export async function deleteClaimNode(id: string): Promise<void> {
  await remove("claimNodes", id);
}

export async function createClaimFeature(item: ClaimFeature): Promise<void> {
  await create("claimCharts", item as ClaimFeature & { id: string });
}

export async function readClaimFeaturesByCaseId(caseId: string): Promise<ClaimFeature[]> {
  return query<ClaimFeature>("claimCharts", "caseId", caseId);
}

export async function updateClaimFeature(item: ClaimFeature): Promise<void> {
  await update("claimCharts", item.id, item);
}

export async function deleteClaimFeature(id: string): Promise<void> {
  await remove("claimCharts", id);
}

export async function deleteClaimFeaturesByCaseId(caseId: string): Promise<void> {
  const features = await query<ClaimFeature>("claimCharts", "caseId", caseId);
  for (const feature of features) {
    await remove("claimCharts", feature.id);
  }
}

// ── noveltyRepo ──────────────────────────────────────

export async function createNovelty(item: NoveltyComparison): Promise<void> {
  await create("novelty", item as NoveltyComparison & { id: string });
}

export async function readNoveltyByCaseId(caseId: string): Promise<NoveltyComparison[]> {
  return query<NoveltyComparison>("novelty", "caseId", caseId);
}

export async function updateNovelty(item: NoveltyComparison): Promise<void> {
  await update("novelty", item.id, item);
}

export async function deleteNovelty(id: string): Promise<void> {
  await remove("novelty", id);
}

export async function deleteNoveltyByCaseId(caseId: string): Promise<void> {
  const items = await query<NoveltyComparison>("novelty", "caseId", caseId);
  for (const item of items) {
    await remove("novelty", item.id);
  }
}

// ── inventiveRepo ────────────────────────────────────

export async function createInventive(item: InventiveStepAnalysis): Promise<void> {
  await create("inventive", item as InventiveStepAnalysis & { id: string });
}

export async function readInventiveByCaseId(caseId: string): Promise<InventiveStepAnalysis[]> {
  return query<InventiveStepAnalysis>("inventive", "caseId", caseId);
}

export async function updateInventive(item: InventiveStepAnalysis): Promise<void> {
  await update("inventive", item.id, item);
}

export async function deleteInventive(id: string): Promise<void> {
  await remove("inventive", id);
}

export async function deleteInventiveByCaseId(caseId: string): Promise<void> {
  const items = await query<InventiveStepAnalysis>("inventive", "caseId", caseId);
  for (const item of items) {
    await remove("inventive", item.id);
  }
}

// ── defectRepo ───────────────────────────────────────

export async function createDefect(defect: FormalDefect): Promise<void> {
  await create("defects", defect as FormalDefect & { id: string });
}

export async function getDefectsByCaseId(caseId: string): Promise<FormalDefect[]> {
  return query<FormalDefect>("defects", "caseId", caseId);
}

export async function updateDefect(defect: FormalDefect): Promise<void> {
  await update("defects", defect.id, defect);
}

export async function deleteDefect(id: string): Promise<void> {
  await remove("defects", id);
}

export async function deleteDefectsByCaseId(caseId: string): Promise<void> {
  const items = await query<FormalDefect>("defects", "caseId", caseId);
  for (const item of items) {
    await remove("defects", item.id);
  }
}

// ── draftRepo ────────────────────────────────────────

export async function saveReexamDraft(caseId: string, draft: ReexamDraftResponse): Promise<void> {
  await create("reexamDrafts", { id: caseId, ...draft });
}

export async function readReexamDraft(caseId: string): Promise<ReexamDraftResponse | undefined> {
  const record = await getById<Record<string, unknown>>("reexamDrafts", caseId);
  if (!record) return undefined;
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as ReexamDraftResponse;
}

async function deleteReexamDraft(caseId: string): Promise<void> {
  await remove("reexamDrafts", caseId);
}

export async function saveSummary(caseId: string, summary: SummaryResponse): Promise<void> {
  await create("summaries", { id: caseId, ...summary });
}

export async function readSummary(caseId: string): Promise<SummaryResponse | undefined> {
  const record = await getById<Record<string, unknown>>("summaries", caseId);
  if (!record) return undefined;
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as SummaryResponse;
}

async function deleteSummary(caseId: string): Promise<void> {
  await remove("summaries", caseId);
}

export async function clearDraftData(caseId: string): Promise<void> {
  await deleteReexamDraft(caseId);
  await deleteSummary(caseId);
}

// ── chatRepo ─────────────────────────────────────────

const chatLog = createLogger("chatRepo");

export async function createSession(session: ChatSession): Promise<void> {
  chatLog("createSession:", session.id);
  await create("chatSessions", session as ChatSession & { id: string });
}

export async function getSessionsByCaseId(caseId: string): Promise<ChatSession[]> {
  return query<ChatSession>("chatSessions", "caseId", caseId);
}

export async function deleteSession(id: string): Promise<void> {
  await remove("chatSessions", id);
}

export async function updateSession(session: ChatSession): Promise<void> {
  await update("chatSessions", session.id, session);
}

export async function deleteMessagesBySessionId(sessionId: string): Promise<void> {
  const messages = await query<ChatMessage>("chatMessages", "sessionId", sessionId);
  for (const msg of messages) {
    await remove("chatMessages", msg.id);
  }
}

export async function createMessage(message: ChatMessage): Promise<void> {
  await create("chatMessages", message as ChatMessage & { id: string });
}

export async function getMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
  return query<ChatMessage>("chatMessages", "sessionId", sessionId);
}

// ── opinionRepo ──────────────────────────────────────

export async function saveOpinionAnalysis(analysis: OfficeActionAnalysis): Promise<void> {
  await create("opinionAnalyses", analysis as OfficeActionAnalysis & { id: string });
}

export async function readOpinionAnalysis(caseId: string): Promise<OfficeActionAnalysis | null> {
  const analyses = await query<OfficeActionAnalysis>("opinionAnalyses", "caseId", caseId);
  if (analyses.length === 0) return null;
  analyses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return analyses[0] ?? null;
}

async function deleteOpinionAnalysis(caseId: string): Promise<void> {
  const analyses = await query<OfficeActionAnalysis>("opinionAnalyses", "caseId", caseId);
  for (const analysis of analyses) {
    await remove("opinionAnalyses", analysis.id);
  }
}

export async function saveArgumentMappings(mappings: ArgumentMapping[]): Promise<void> {
  for (const mapping of mappings) {
    await create("argumentMappings", mapping as ArgumentMapping & { id: string });
  }
}

export async function readArgumentMappings(caseId: string): Promise<ArgumentMapping[]> {
  return query<ArgumentMapping>("argumentMappings", "caseId", caseId);
}

export async function deleteArgumentMappings(caseId: string): Promise<void> {
  const mappings = await query<ArgumentMapping>("argumentMappings", "caseId", caseId);
  for (const mapping of mappings) {
    await remove("argumentMappings", mapping.id);
  }
}

export async function clearOpinionData(caseId: string): Promise<void> {
  await deleteOpinionAnalysis(caseId);
  await deleteArgumentMappings(caseId);
}

// ── interpretRepo ────────────────────────────────────

export async function saveInterpretSummaries(
  caseId: string,
  summaries: Record<string, string>
): Promise<void> {
  await create("interpretSummaries", {
    id: caseId,
    caseId,
    summaries,
    updatedAt: new Date().toISOString()
  });
}

export async function readInterpretSummaries(caseId: string): Promise<Record<string, string>> {
  const record = await getById<Record<string, unknown>>("interpretSummaries", caseId);
  if (!record) return {};
  if ("summaries" in record) return record.summaries as Record<string, string>;
  if ("summary" in record && record.summary) return { __legacy__: record.summary as string };
  return {};
}

export async function deleteInterpretSummaries(caseId: string): Promise<void> {
  await remove("interpretSummaries", caseId);
}

// ── runMarkerRepo ────────────────────────────────────

export async function saveRunMarker(caseId: string, module: string): Promise<void> {
  await create("runMarkers", {
    id: `${caseId}::${module}`,
    caseId,
    module,
    timestamp: new Date().toISOString()
  });
}

export async function getRunMarkersByCaseId(caseId: string): Promise<string[]> {
  const markers = await query<Record<string, unknown>>("runMarkers", "caseId", caseId);
  return markers.map((m) => m.module as string);
}

// ── searchSessionRepo ────────────────────────────────

export async function createSearchSession(session: SearchSession): Promise<void> {
  await create("searchSessions", session as SearchSession & { id: string });
}

async function getSearchSessionsByCaseId(caseId: string): Promise<SearchSession[]> {
  return query<SearchSession>("searchSessions", "caseId", caseId);
}

export async function updateSearchSession(session: SearchSession): Promise<void> {
  await update("searchSessions", session.id, { ...session, updatedAt: new Date().toISOString() });
}

export async function getLatestSearchSession(caseId: string): Promise<SearchSession | undefined> {
  const sessions = await getSearchSessionsByCaseId(caseId);
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

// ── Agent API (merged from agentApi.ts) ───────────────

/** 最近一次知识库注入的引用详情（供 UI 读取） */
export let lastKnowledgeCitations: Array<{ source: string; score: number; excerpt: string }> = [];

// ── Settings → Provider 解析 ────────────────────────

function resolveAgent(
  agent: string,
  settings: AppSettings
): { providerId: ProviderId; modelId: string; maxTokens?: number } | null {
  const assignment = (settings.agents ?? []).find((a) => a.agent === agent);
  if (!assignment) return null;
  const providerId = assignment.providerOrder[0] ?? getDefaultProvider(settings);
  const providerSetting = settings.providers.find((p) => p.providerId === providerId);
  const modelId = providerSetting?.defaultModelId ?? assignment.modelId;
  return { providerId, modelId, maxTokens: assignment.maxTokens };
}

function getDefaultProvider(settings: AppSettings): ProviderId {
  const enabled = settings.providers.filter((p) => p.enabled && p.apiKeyRef);
  return (enabled[0]?.providerId as ProviderId) ?? "gemini";
}

function getDefaultModel(settings: AppSettings): string {
  const enabled = settings.providers.filter((p) => p.enabled && p.apiKeyRef);
  return enabled[0]?.defaultModelId ?? "gemini-3.1-flash-lite-preview";
}

function getEnabledProviders(settings: AppSettings): ProviderId[] {
  return settings.providers.filter((p) => p.enabled && p.apiKeyRef).map((p) => p.providerId as ProviderId);
}

function getFirstApiKey(settings: AppSettings): string {
  const enabled = settings.providers.filter((p) => p.enabled && p.apiKeyRef);
  return enabled[0]?.apiKeyRef ?? "";
}

function buildProviderPreference(primaryProvider: ProviderId, settings: AppSettings): ProviderId[] {
  const enabled = getEnabledProviders(settings);
  return settings.enableProviderFallback !== false
    ? [primaryProvider, ...enabled.filter((p) => p !== primaryProvider)]
    : [primaryProvider];
}

function buildProviderOptions(settings: AppSettings) {
  const modelFallbacks: Partial<Record<ProviderId, string[]>> = {};
  const enableModelFallback: Partial<Record<ProviderId, boolean>> = {};
  const providerBaseUrls: Partial<Record<ProviderId, string>> = {};
  for (const p of settings.providers) {
    modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds;
    enableModelFallback[p.providerId] = p.enableModelFallback ?? true;
    if (p.baseUrl) providerBaseUrls[p.providerId] = p.baseUrl;
  }
  return { modelFallbacks, enableModelFallback, providerBaseUrls };
}

// ── 错误分类 ────────────────────────────────────────

type AiErrorType = "quota" | "auth" | "timeout" | "network" | "structure" | "abort" | "other";

function classifyGatewayError(
  status: number,
  errorBody: { error?: { code?: string } },
  attempts?: Array<{ providerId: string; errorCode?: string }>
): AiErrorType {
  if (attempts?.length) {
    const errorCodes = attempts.map((a) => a.errorCode);
    const allSame = (code: string) => errorCodes.every((c) => c === code);
    if (allSame("quota-exceeded")) return "quota";
    if (allSame("auth-failed")) return "auth";
    if (allSame("timeout")) return "timeout";
    if (errorCodes.every((c) => c === "network-error" || c === "server-error")) return "network";
    if (errorCodes.some((c) => c === "quota-exceeded")) return "quota";
  }
  if (errorBody.error?.code === "no-api-keys") return "auth";
  if (errorBody.error?.code === "quota-exceeded" || status === 429) return "quota";
  if (errorBody.error?.code === "auth-failed" || status === 401) return "auth";
  if (status >= 500) return "network";
  return "other";
}

// ── Token 追踪 ──────────────────────────────────────

async function trackTokenUsage(
  caseId: string,
  agent: string,
  modelId: string,
  tokenUsage: { input: number; output: number; total: number },
  providerId: string
): Promise<void> {
  try {
    const { useTokenUsageStore } = await import("../store/features/tokenUsage/tokenUsageSlice");
    useTokenUsageStore.getState().addRecord({
      caseId,
      agent,
      providerId,
      modelId,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
      totalTokens: tokenUsage.total,
    });
  } catch (e) {
    log("Failed to record token usage:", e);
  }
}

// ── Provider 错误追踪 ───────────────────────────────

async function trackProviderErrors(
  attempts: Array<{ providerId: string; ok?: boolean; errorCode?: string }> | undefined,
  agent: string,
  caseId: string
): Promise<void> {
  if (!attempts || attempts.length === 0) return;
  try {
    const { useSettingsStore } = await import("../store/features/settings/settingsSlice");
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
        caseId,
      });
    }
  } catch (e) {
    log("Failed to record AI run marker:", e);
  }
}

// ── 核心 API 函数 ───────────────────────────────────

/** 通用 agent 运行入口 — 调用 /api/agent/run */
export async function agentRun<T>(
  agent: string,
  request: object,
  settings: AppSettings,
  caseId?: string,
  options?: AgentRunOptions
): Promise<T> {
  const id = caseId ?? (request as Record<string, unknown>).caseId as string ?? "";
  const gatewayUrl = "/api";

  await waitForServerReady(gatewayUrl);

  const resolved = resolveAgent(agent, settings) ?? {
    providerId: getDefaultProvider(settings),
    modelId: getDefaultModel(settings),
    maxTokens: undefined,
  };
  const providerPreference = buildProviderPreference(
    (options?.providerId ?? resolved.providerId) as ProviderId,
    settings
  );

  const body = {
    agent,
    caseId: id,
    request,
    providerPreference,
    modelId: options?.modelId ?? resolved.modelId,
    ...(resolved.maxTokens != null ? { maxTokens: resolved.maxTokens } : {}),
    ...buildProviderOptions(settings),
    knowledgeEnabled: settings.knowledge?.enabled ?? false,
    ...(settings.mode === "mock" ? { mock: true } : {}),
  };

  log("Calling agent gateway", { agent, providerPreference, modelId: body.modelId, caseId: id });

  const doFetch = async (): Promise<Response> => {
    return fetch(`${gatewayUrl}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    if (options?.signal?.aborted) {
      throw new AiGatewayError("abort", "请求已取消");
    }
    clearServerReadyCache();
    try {
      await waitForServerReady(gatewayUrl, true);
      res = await doFetch();
    } catch {
      throw new AiGatewayError("network", "无法连接到 AI 服务，请检查网络连接和服务器状态。");
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    const msg = errorBody.error?.message ?? `Gateway error: ${res.status}`;
    const attempts = errorBody.attempts as Array<{ providerId: string; errorCode?: string }> | undefined;
    await trackProviderErrors(attempts, agent, id);
    const errorType = classifyGatewayError(res.status, errorBody, attempts);
    const detail = attempts?.length
      ? ` (${attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
      : "";
    throw new AiGatewayError(errorType, `${msg}${detail}`, attempts);
  }

  const data = (await res.json()) as {
    ok: boolean;
    output?: unknown;
    tokenUsage?: { input: number; output: number; total: number };
    attempts?: Array<{ providerId: string; modelId: string; errorCode?: string; duration: number }>;
    error?: { type: string; message: string };
    knowledgeCitations?: Array<{ source: string; score: number; excerpt: string }>;
  };

  if (!data.ok) {
    const msg = data.error?.message ?? "Gateway returned error";
    const attempts = data.attempts?.map((a) => {
      const result: { providerId: string; errorCode?: string } = { providerId: a.providerId };
      if (a.errorCode !== undefined) result.errorCode = a.errorCode;
      return result;
    });
    await trackProviderErrors(attempts, agent, id);
    const errorBody: { error?: { code?: string } } = {};
    if (data.error) errorBody.error = { code: data.error.type };
    const errorType = classifyGatewayError(res.status, errorBody, attempts);
    const detail = data.attempts?.length
      ? ` (${data.attempts.map((a) => `${a.providerId}: ${a.errorCode ?? "failed"}`).join("; ")})`
      : "";
    throw new AiGatewayError(errorType, `${msg}${detail}`, attempts);
  }

  // Track token usage
  if (data.tokenUsage && id) {
    await trackTokenUsage(id, agent, body.modelId ?? "unknown", data.tokenUsage, data.attempts?.[0]?.providerId ?? "unknown");
  }

  // Update knowledge citations
  if (data.knowledgeCitations) {
    lastKnowledgeCitations = data.knowledgeCitations;
  }

  if (data.output) {
    return data.output as T;
  }
  throw new Error("Empty response from gateway");
}

/** 检索文献搜索 — 调用 /api/search-references */
export async function searchReferences(
  request: SearchReferencesRequest,
  settings: AppSettings,
  options?: AgentRunOptions
): Promise<SearchReferencesResponse> {
  return postJson<SearchReferencesResponse>("/api/search-references", {
    ...buildSearchBase(request, settings, "search-references", options),
    maxResults: request.maxResults ?? 5,
    searchProviderId: request.searchProviderId,
    searchApiKey: request.searchApiKey,
    searchBaseUrl: request.searchBaseUrl,
  });
}

/** 提取检索词 — 调用 /api/extract-search-terms */
export async function extractSearchTerms(
  request: ExtractSearchTermsRequest,
  settings: AppSettings,
  options?: AgentRunOptions
): Promise<ExtractSearchTermsResponse> {
  return postJson<ExtractSearchTermsResponse>("/api/extract-search-terms", buildSearchBase(request, settings, "search-references", options));
}

/** 用检索词搜索 — 调用 /api/search-with-terms */
export async function searchWithTerms(
  request: SearchWithTermsRequest,
  settings: AppSettings,
  options?: AgentRunOptions
): Promise<SearchReferencesResponse> {
  return postJson<SearchReferencesResponse>("/api/search-with-terms", {
    ...buildSearchBase(request, settings, "search-references", options),
    searchQueries: request.searchQueries,
    maxResults: request.maxResults ?? 5,
    searchProviderId: request.searchProviderId,
    searchApiKey: request.searchApiKey,
    searchBaseUrl: request.searchBaseUrl,
  });
}

// ── 内部 helpers ─────────────────────────────────────

function buildSearchBase(
  request: { caseId: string; claimText: string; features: unknown[] },
  settings: AppSettings,
  agent: string,
  options?: AgentRunOptions
) {
  const resolved = resolveAgent(agent, settings) ?? {
    providerId: getDefaultProvider(settings),
    modelId: getDefaultModel(settings),
  };
  const providerId = (options?.providerId ?? resolved.providerId) as ProviderId;
  const modelId = options?.modelId ?? resolved.modelId;
  return {
    caseId: request.caseId,
    claimText: request.claimText,
    features: request.features,
    providerPreference: buildProviderPreference(providerId, settings),
    modelId,
    llmApiKey: getFirstApiKey(settings) || undefined,
    ...buildProviderOptions(settings),
  };
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    clearServerReadyCache();
    await waitForServerReady("/api", true);
    res = await doFetch();
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error ?? `Request error: ${res.status}`);
  }

  return (await res.json()) as T;
}

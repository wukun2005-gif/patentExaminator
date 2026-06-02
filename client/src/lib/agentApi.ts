/**
 * Agent API — 直接调用后端 /api/agent/run 端点
 * B-038: 替代 AgentClient class，前端只做 fetch 调用
 */
import type {
  SearchReferencesRequest,
  SearchReferencesResponse,
  ExtractSearchTermsRequest,
  ExtractSearchTermsResponse,
  SearchWithTermsRequest,
  AgentRunOptions,
} from "@shared/types/api";
import { AiGatewayError } from "@shared/types/api";
import type { ProviderId, AppSettings } from "@shared/types/agents";
import { waitForServerReady, clearServerReadyCache } from "./serverReady";
import { createLogger } from "./logger";

const log = createLogger("AgentApi");

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
  } catch {
    // Silently ignore
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
  } catch {
    // Silently ignore
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

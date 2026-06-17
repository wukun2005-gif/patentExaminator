/**
 * Settings 读取模块 — 从 DB 读取用户配置
 *
 * 供 orchestrator.ts 和 search.ts 共用，避免代码重复。
 * 结果缓存，避免每次请求都读 DB。
 */
import { logger } from "./logger.js";

export interface DbSettings {
  providerPreference?: string[];
  modelId?: string;
  modelFallbacks?: Record<string, string[]>;
  enableModelFallback?: Record<string, boolean>;
  providerBaseUrls?: Record<string, string>;
  knowledgeEnabled?: boolean;
  knowledgeEmbedding?: { baseUrl: string; apiKey: string; modelId: string };
  knowledgeReranker?: { baseUrl: string; apiKey: string; modelId: string };
}

let cachedSettings: DbSettings | null = null;

/**
 * 从 DB 的 sync_data 表读取用户配置（settings store, record_id='app'）。
 * 结果缓存，避免每次请求都读 DB。
 */
export async function readSettingsFromDb(): Promise<DbSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const { getSyncDb } = await import("./syncDb.js");
    const db = getSyncDb();
    const row = db.prepare(
      "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
    ).get() as { data: string } | undefined;

    if (!row) {
      cachedSettings = {};
      return cachedSettings;
    }

    const settings = JSON.parse(row.data);

    // providerPreference: enabled providers with apiKeyRef, in order
    const enabledProviders = (settings.providers ?? []).filter(
      (p: { enabled?: boolean; apiKeyRef?: string }) => p.enabled && p.apiKeyRef
    );
    const providerPreference = enabledProviders.map(
      (p: { providerId: string }) => p.providerId
    );
    const modelId = enabledProviders[0]?.defaultModelId ?? "";
    logger.info(`[SettingsReader] DEBUG enabledProviders[0]=${JSON.stringify(enabledProviders[0] ? { providerId: enabledProviders[0].providerId, defaultModelId: enabledProviders[0].defaultModelId, modelIds: enabledProviders[0].modelIds, modelFallbacks: enabledProviders[0].modelFallbacks } : null)}, resolved modelId="${modelId}"`);

    // modelFallbacks / enableModelFallback / providerBaseUrls
    const modelFallbacks: Record<string, string[]> = {};
    const enableModelFallback: Record<string, boolean> = {};
    const providerBaseUrls: Record<string, string> = {};
    for (const p of (settings.providers ?? []) as Array<{
      providerId: string; modelFallbacks?: string[]; modelIds?: string[]; enableModelFallback?: boolean; baseUrl?: string;
    }>) {
      modelFallbacks[p.providerId] = p.modelFallbacks ?? p.modelIds ?? [];
      enableModelFallback[p.providerId] = p.enableModelFallback ?? false;
      if (p.baseUrl) providerBaseUrls[p.providerId] = p.baseUrl;
    }

    // knowledgeEnabled
    const knowledgeEnabled = settings.knowledge?.enabled ?? false;

    // knowledgeEmbedding / knowledgeReranker
    // 优先从 knowledgeProviders 数组读取，fallback 到顶层字段（向后兼容）
    const knowledgeProviders = (settings.knowledgeProviders ?? []) as Array<{
      providerType: string; providerId: string; enabled: boolean; apiKeyRef: string; baseUrl: string; modelId: string;
    }>;
    let embProvider = knowledgeProviders.find(
      (p) => p.providerType === "embedding" && p.enabled && p.apiKeyRef
    );
    let rerankerProvider = knowledgeProviders.find(
      (p) => p.providerType === "reranker" && p.enabled && p.apiKeyRef
    );

    // fallback: 顶层 knowledgeEmbedding / knowledgeReranker 字段
    if (!embProvider && settings.knowledgeEmbedding?.apiKey) {
      embProvider = { providerType: "embedding", providerId: "", enabled: true, apiKeyRef: settings.knowledgeEmbedding.apiKey, baseUrl: settings.knowledgeEmbedding.baseUrl, modelId: settings.knowledgeEmbedding.modelId };
    }
    if (!rerankerProvider && settings.knowledgeReranker?.apiKey) {
      rerankerProvider = { providerType: "reranker", providerId: "", enabled: true, apiKeyRef: settings.knowledgeReranker.apiKey, baseUrl: settings.knowledgeReranker.baseUrl, modelId: settings.knowledgeReranker.modelId };
    }

    cachedSettings = {
      providerPreference,
      modelId,
      modelFallbacks,
      enableModelFallback,
      providerBaseUrls,
      knowledgeEnabled,
      ...(embProvider ? { knowledgeEmbedding: { baseUrl: embProvider.baseUrl, apiKey: embProvider.apiKeyRef, modelId: embProvider.modelId } } : {}),
      ...(rerankerProvider ? { knowledgeReranker: { baseUrl: rerankerProvider.baseUrl, apiKey: rerankerProvider.apiKeyRef, modelId: rerankerProvider.modelId } } : {}),
    };

    logger.info(`[SettingsReader] 从 DB 读取 settings: providers=${providerPreference.length}, knowledgeEnabled=${knowledgeEnabled}, embedding=${!!embProvider}, reranker=${!!rerankerProvider}`);
    return cachedSettings;
  } catch (err) {
    logger.warn(`[SettingsReader] 读取 DB settings 失败: ${err}`);
    cachedSettings = {};
    return cachedSettings;
  }
}

/** 清除 settings 缓存（用于 settings 更新后） */
export function clearSettingsCache(): void {
  cachedSettings = null;
}

/**
 * 自动填充缺失的 settings 字段。
 * 如果请求体中没有 providerPreference/modelId 等字段，则从 DB 读取并填充。
 */
export async function fillMissingSettings<T extends {
  providerPreference?: string[] | undefined;
  modelId?: string | undefined;
  modelFallbacks?: Record<string, string[]> | undefined;
  enableModelFallback?: Record<string, boolean> | undefined;
  providerBaseUrls?: Record<string, string> | undefined;
}>(req: T): Promise<T> {
  const dbSettings = await readSettingsFromDb();

  if (!req.providerPreference || req.providerPreference.length === 0) {
    (req as Record<string, unknown>).providerPreference = dbSettings.providerPreference;
  }
  if (!req.modelId) {
    (req as Record<string, unknown>).modelId = dbSettings.modelId;
    logger.info(`[SettingsReader] DEBUG fillMissingSettings: req.modelId was empty, set to "${dbSettings.modelId}"`);
  } else {
    logger.info(`[SettingsReader] DEBUG fillMissingSettings: req.modelId already set to "${req.modelId}"`);
  }
  if (!req.modelFallbacks && dbSettings.modelFallbacks) {
    (req as Record<string, unknown>).modelFallbacks = dbSettings.modelFallbacks;
  }
  if (!req.enableModelFallback && dbSettings.enableModelFallback) {
    (req as Record<string, unknown>).enableModelFallback = dbSettings.enableModelFallback;
  }
  if (!req.providerBaseUrls && dbSettings.providerBaseUrls) {
    (req as Record<string, unknown>).providerBaseUrls = dbSettings.providerBaseUrls;
  }

  return req;
}

const API_BASE = "/api";

export interface ModelFetchResult {
  models: string[];
  /** modelId → supportsFunctionCalling */
  modelCapabilities: Record<string, boolean>;
}

export async function fetchModels(providerId: string, apiKey: string, baseUrl?: string): Promise<ModelFetchResult> {
  const params = new URLSearchParams({ apiKey });
  if (baseUrl) params.set("baseUrl", baseUrl);
  const url = `${API_BASE}/providers/${encodeURIComponent(providerId)}/models?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { models: string[]; modelCapabilities?: Record<string, boolean> };
  return { models: data.models, modelCapabilities: data.modelCapabilities ?? {} };
}

/** 验证单个模型是否可用（发送轻量 chat 请求） */
export async function verifyModel(providerId: string, modelId: string, apiKey: string, baseUrl?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/providers/${encodeURIComponent(providerId)}/verify-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, baseUrl, modelId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

/** bug9: 从 server 获取完整模型目录（含能力元数据，无需 API Key） */
export async function fetchModelCatalog(): Promise<Record<string, Array<{ id: string; recommendation?: string; rpm?: number; rpd?: number; tpm?: string; contextWindow?: number; maxOutputTokens?: number; isReasoning?: boolean; supportsVision?: boolean; supportsStructuredOutput?: boolean }>>> {
  const res = await fetch(`${API_BASE}/providers/models`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, Array<{ id: string; recommendation?: string; rpm?: number; rpd?: number; tpm?: string; contextWindow?: number; maxOutputTokens?: number; isReasoning?: boolean; supportsVision?: boolean; supportsStructuredOutput?: boolean }>>>;
}

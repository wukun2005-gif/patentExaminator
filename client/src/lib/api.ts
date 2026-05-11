const API_BASE = "/api";

export async function fetchModels(providerId: string, apiKey: string): Promise<string[]> {
  const url = `${API_BASE}/providers/${encodeURIComponent(providerId)}/models?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { models: string[] };
  return data.models;
}

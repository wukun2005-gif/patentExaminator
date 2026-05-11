import { logger } from "../lib/logger.js";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface SearchProviderConfig {
  providerId: string;
  apiKey: string;
  baseUrl?: string | undefined;
}

/**
 * Search for patent-related文献 using configured search API.
 * All results come from real search — no hallucination.
 */
export async function searchPatents(
  query: string,
  maxResults: number = 10,
  config?: SearchProviderConfig
): Promise<SearchResponse> {
  const apiKey = config?.apiKey || process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("No search API key configured");
  }

  const providerId = config?.providerId || "tavily";

  if (providerId === "tavily") {
    return searchTavily(query, maxResults, apiKey);
  }

  // Generic/custom search provider
  const baseUrl = config?.baseUrl;
  if (!baseUrl) {
    throw new Error(`No base URL configured for search provider: ${providerId}`);
  }
  return searchCustom(query, maxResults, apiKey, baseUrl);
}

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResponse> {
  // 不加 site 限制，让 Tavily 自由搜索，由 LLM 后续筛选专利相关结果
  const searchQuery = `${query} 专利 patent 对比文件`;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: searchQuery,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      search_depth: "advanced"
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error("Tavily API error", { status: response.status, text });
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string; score: number }>;
    query?: string;
  };

  return {
    results: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score
    })),
    query: data.query ?? query
  };
}

async function searchCustom(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string
): Promise<SearchResponse> {
  const searchQuery = `${query} patent`;

  const url = new URL(baseUrl);
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("max_results", String(maxResults));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error("Custom search API error", { status: response.status, text });
    throw new Error(`Search API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string; score?: number }>;
    query?: string;
  };

  return {
    results: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score ?? 0
    })),
    query: data.query ?? query
  };
}

/**
 * Extract patent publication numbers from text using regex.
 * Matches CN, US, EP, JP, KR, WO patent number patterns.
 */
export function extractPublicationNumbers(text: string): string[] {
  const patterns = [
    /CN\d{9,12}[A-Z]?/g,
    /US\d{7,11}[A-Z]?\d?/g,
    /EP\d{6,8}[A-Z]?\d?/g,
    /JP\d{4,8}[A-Z]?\d+/g,
    /KR\d{7,10}[A-Z]?\d?/g,
    /WO\d{4}\/\d{6}/g
  ];

  const numbers = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) numbers.add(m);
    }
  }
  return [...numbers];
}

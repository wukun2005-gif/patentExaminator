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
 * Supports multiple queries — runs them in parallel and merges results.
 */
export async function searchPatents(
  queries: string | string[],
  maxResults: number = 10,
  config?: SearchProviderConfig
): Promise<SearchResponse> {
  const apiKey = config?.apiKey || process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("No search API key configured");
  }

  const queryList = Array.isArray(queries) ? queries : [queries];
  const providerId = config?.providerId || "tavily";
  logger.info(`searchPatents called with providerId=${providerId}, hasApiKey=${!!apiKey}, queries=${queryList.length}`);

  // Run all queries in parallel (tolerate individual query failures)
  const perQuery = Math.max(3, Math.ceil(maxResults / queryList.length));
  const allResults = await Promise.all(
    queryList.map((q) => {
      const searchFn = providerId === "tavily" ? searchTavily
        : providerId === "serpapi" ? searchSerpApi
        : config?.baseUrl ? (k: string, n: number, a: string) => searchCustom(k, n, a, config.baseUrl!)
        : null;
      if (!searchFn) return Promise.resolve([] as SearchResult[]);
      return searchFn(q, perQuery, apiKey!).catch((err) => {
        logger.warn("Search query failed, skipping", { query: q, error: String(err).slice(0, 200) });
        return [] as SearchResult[];
      });
    })
  );

  // Merge and deduplicate by URL
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const results of allResults) {
    for (const r of results) {
      const key = r.url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
  }

  return { results: merged.slice(0, maxResults * 2), query: queryList.join(" | ") };
}

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  // Two-pass strategy: patent-domain search + open web search
  // No extra noise words appended — the query from LLM should be clean and focused
  const patentResults = await tavilySearch(query, Math.ceil(maxResults / 2), apiKey, {
    include_domains: ["patents.google.com", "patentscope.wipo.int"]
  });

  const generalResults = await tavilySearch(query, maxResults, apiKey, {});

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...patentResults, ...generalResults]) {
    const key = r.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged;
}

async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string,
  options: { include_domains?: string[] }
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
    search_depth: "advanced"
  };
  if (options.include_domains && options.include_domains.length > 0) {
    body.include_domains = options.include_domains;
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
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

  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score
  }));
}

async function searchSerpApi(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  // Two-pass: patent-domain + open search, no noise appended
  const patentResults = await serpApiSearch(query, Math.ceil(maxResults / 2), apiKey);
  const generalResults = await serpApiSearch(query, maxResults, apiKey);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...patentResults, ...generalResults]) {
    const key = r.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged;
}

async function serpApiSearch(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(maxResults));
  url.searchParams.set("api_key", apiKey);

  logger.info("SerpAPI request", { query, maxResults, url: url.toString().replace(apiKey, "***") });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error("SerpAPI error", { status: response.status, text: text.slice(0, 500) });
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = (await response.json()) as {
    organic_results?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
    }>;
    error?: string;
  };

  if (data.error) {
    logger.error("SerpAPI returned error", { error: data.error });
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  const results = (data.organic_results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    content: r.snippet ?? "",
    score: 0
  }));
  logger.info("SerpAPI returned results", { count: results.length });
  return results;
}

async function searchCustom(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string
): Promise<SearchResult[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
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

  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score ?? 0
  }));
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

import { logger } from "../lib/logger.js";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  results: TavilyResult[];
  query: string;
}

/**
 * Search for patent-related文献 using Tavily API.
 * All results come from real search — no hallucination.
 */
export async function searchPatents(
  query: string,
  maxResults: number = 10
): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY not configured");
  }

  const searchQuery = `${query} site:patents.google.com OR site:espacenet.com OR site:worldwide.espacenet.com`;

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

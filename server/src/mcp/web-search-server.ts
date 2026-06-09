/**
 * NF1: Web Search MCP Server
 *
 * 暴露 web_search tool，使用 SerpAPI 搜索引擎。
 * Google → Bing → Baidu fallback 策略。
 * 通过 stdio transport 与 MCP client 通信。
 *
 * 注意：日志必须走 stderr（stdout 被 JSON-RPC 占用）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERPAPI_BASE = "https://serpapi.com/search";
const FETCH_TIMEOUT_MS = 30_000;

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

// ── SerpAPI 搜索（单引擎）──────────────────────────────────

async function searchSerpApi(
  query: string,
  maxResults: number,
  apiKey: string,
  engine: "google" | "bing" | "baidu"
): Promise<SearchResult[]> {
  const url = new URL(SERPAPI_BASE);
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(maxResults));
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SerpAPI ${engine} error: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
    error?: string;
  };

  if (data.error) {
    throw new Error(`SerpAPI ${engine} error: ${data.error}`);
  }

  return (data.organic_results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    content: r.snippet ?? "",
    score: 0,
  }));
}

// ── 带 fallback 的搜索 ──────────────────────────────────

async function searchWithFallback(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<{ results: SearchResult[]; engine: string }> {
  const engines: Array<"google" | "bing" | "baidu"> = ["google", "bing", "baidu"];

  for (const engine of engines) {
    try {
      stderrLog(`Trying engine=${engine}...`);
      const results = await searchSerpApi(query, maxResults, apiKey, engine);
      stderrLog(`Engine=${engine} returned ${results.length} results`);
      return { results, engine };
    } catch (err) {
      stderrLog(`Engine=${engine} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { results: [], engine: "none" };
}

// ── stderr 日志（不污染 stdout 的 JSON-RPC）────────────────

function stderrLog(msg: string): void {
  process.stderr.write(`[WebSearchMCP] ${msg}\n`);
}

// ── MCP Server 启动 ──────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    stderrLog("ERROR: SERPAPI_KEY environment variable is required");
    process.exit(1);
  }

  const server = new McpServer({
    name: "web-search-mcp",
    version: "1.0.0",
  });

  // 注册 web_search tool
  server.tool(
    "web_search",
    "Search the web using Google, Bing, or Baidu. Returns titles, URLs, and snippets.",
    {
      query: z.string().describe("The search query"),
      max_results: z.number().int().positive().max(20).default(5).describe("Maximum number of results (1-20)"),
    },
    async ({ query, max_results }) => {
      stderrLog(`web_search called: query="${query}", max_results=${max_results}`);
      try {
        const { results, engine } = await searchWithFallback(query, max_results ?? 5, apiKey);

        stderrLog(`Returning ${results.length} results from engine=${engine}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              engine,
              query,
              results: results.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
              })),
            }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stderrLog(`web_search error: ${msg}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg, query, results: [] }) }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  stderrLog("Web Search MCP Server starting...");
  await server.connect(transport);
  stderrLog("Web Search MCP Server connected via stdio");
}

main().catch((err) => {
  stderrLog(`Fatal error: ${err}`);
  process.exit(1);
});

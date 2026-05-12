import { Router } from "express";
import { z } from "zod";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { searchPatents } from "../services/webSearch.js";
import { logger } from "../lib/logger.js";
import { sanitizeText } from "../security/sanitize.js";
import type { SearchReferencesResponse, SearchReferencesCandidate } from "@shared/types/api";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

export const searchRouter = Router();

const searchRequestSchema = z.object({
  caseId: z.string(),
  claimText: z.string().min(1),
  features: z.array(z.object({ featureCode: z.string(), description: z.string() })),
  maxResults: z.number().int().min(1).max(10).optional().default(5),
  providerPreference: z.array(z.string()).optional().default(["gemini", "mimo"]),
  modelId: z.string().optional().default("gemini-2.5-flash-lite"),
  searchProviderId: z.string().optional(),
  searchApiKey: z.string().optional(),
  searchBaseUrl: z.string().optional(),
  llmApiKey: z.string().optional()
});

searchRouter.post("/search-references", async (req, res) => {
  const parseResult = searchRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      ok: false,
      candidates: [],
      error: `Invalid request: ${parseResult.error.issues.map((i) => i.message).join(", ")}`
    } satisfies SearchReferencesResponse);
    return;
  }

  const request = parseResult.data;

  // Resolve search API key:
  //   - APP mode: frontend sends user-configured key via searchApiKey
  //   - Dev/test mode: frontend sends nothing, backend uses env vars
  // These two routes are independent — no fallback between them.
  const searchProviderId = request.searchProviderId || "tavily";
  const envKeyMap: Record<string, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    serpapi: process.env.SerpAPI_KEY
  };
  const searchApiKey = request.searchApiKey || envKeyMap[searchProviderId];
  if (!searchApiKey) {
    res.status(503).json({
      ok: false,
      candidates: [],
      error: "搜索服务不可用：未配置搜索 API Key。请在设置→专利搜索中配置，或手动上传文献。"
    } satisfies SearchReferencesResponse);
    return;
  }

  // Resolve LLM provider
  // Priority: 1) llmApiKey from request body (APP mode) — use for all providers, 2) server keyStore (dev mode)
  const providerKeys = new Map<string, string>();
  if (request.llmApiKey) {
    // Frontend sent a single LLM key — use it for the first available provider in the registry
    for (const pid of request.providerPreference) {
      if (registry.get(pid)) {
        providerKeys.set(pid, request.llmApiKey);
        break;
      }
    }
  }
  // Fall back to server keyStore for remaining providers
  for (const pid of request.providerPreference) {
    if (!providerKeys.has(pid)) {
      const key = getApiKey(pid);
      if (key) providerKeys.set(pid, key);
    }
  }
  const availableProviders = request.providerPreference.filter((p) => providerKeys.has(p));
  if (availableProviders.length === 0) {
    res.status(400).json({
      ok: false,
      candidates: [],
      error: "未配置任何 LLM API key，无法执行检索分析。"
    } satisfies SearchReferencesResponse);
    return;
  }

  try {
    // Step 1: Use LLM to extract multiple short search queries from claims
    const featureText = request.features.map((f) => `${f.featureCode}: ${f.description}`).join("\n");
    const extractPrompt = sanitizeText(
      `你是资深专利检索专家。请从权利要求中提取用于搜索专利文献的检索式。\n\n` +
      `权利要求文本:\n${request.claimText.slice(0, 4000)}\n\n` +
      `技术特征:\n${featureText}\n\n` +
      `检索策略要求:\n` +
      `1. 生成 3-5 条短检索式，每条仅含 2-4 个词，用于在 Google Patents 等专利搜索引擎中检索\n` +
      `2. 每条检索式必须是纯中文或纯英文，不要中英混杂\n` +
      `3. 优先选择能区分技术方案的特征词，避免通用词（如"装置""方法"）\n` +
      `4. 中文检索式用中文关键词，英文检索式用英文关键词\n` +
      `5. 覆盖不同角度：技术领域、核心结构、关键技术特征\n\n` +
      `示例（LED散热专利）:\n` +
      `{"queries":["LED散热器 相变材料","LED heatsink phase change","散热模组 相变储能","thermal management phase change material"]}\n\n` +
      `示例（锂电池快充专利）:\n` +
      `{"queries":["锂电池快速充电","lithium battery fast charging","正极材料 快充","cathode material rapid charge"]}\n\n` +
      `请严格输出 JSON 格式 {"queries":["查询1","查询2",...]}，不要输出其他内容：`
    );

    const firstProvider = availableProviders[0]!;
    const apiKey = providerKeys.get(firstProvider)!;

    const extractReq: ChatRequest = {
      modelId: request.modelId,
      messages: [{ role: "user", content: extractPrompt }],
      maxTokens: 800,
      apiKey
    };

    const { response: extractRes } = await registry.runWithFallback(
      availableProviders as string[],
      extractReq
    );

    if (extractRes.error) {
      logger.error("LLM extract search terms failed", { error: extractRes.error });
      res.status(502).json({
        ok: false,
        candidates: [],
        error: "AI 提取检索词失败，请稍后重试。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Parse structured queries from LLM output
    let searchQueries: string[];
    const rawText = extractRes.text.trim();
    logger.info("LLM extract raw output", { rawText: rawText.slice(0, 500) });
    try {
      // Strip markdown code fences (```json ... ``` or ``` ... ```)
      let jsonText = rawText;
      // Try multiple fence patterns (non-greedy to handle various formats)
      const fencePatterns = [
        /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m,   // standard fenced
        /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,     // relaxed
      ];
      for (const pat of fencePatterns) {
        const m = rawText.match(pat);
        if (m) { jsonText = m[1]!.trim(); break; }
      }
      // Try to extract JSON object from the text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/) ?? jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        searchQueries = Array.isArray(parsed) ? parsed : (parsed.queries ?? []);
      } else {
        searchQueries = [];
      }
    } catch {
      searchQueries = [];
    }

    // Fallback: if JSON parsing failed, extract meaningful lines or partial queries
    if (searchQueries.length === 0) {
      // First, try to extract quoted strings from incomplete JSON (handles truncation)
      const partialMatches = rawText.match(/"([^"]{3,50})"/g);
      if (partialMatches && partialMatches.length > 0) {
        searchQueries = partialMatches
          .map((m) => m.replace(/^"|"$/g, ""))
          .filter((q) => {
            if (/^(queries|query|title|summary|score|date|url|reason|publicationNumber|publicationDate|relevanceScore|recommendationReason|sourceUrl)$/i.test(q)) return false;
            if (/^[{}\[\]:,]/.test(q)) return false;
            return true;
          })
          .slice(0, 5);
      }

      // If still no queries, try line-based extraction
      if (searchQueries.length === 0) {
        searchQueries = rawText
          .split(/\n/)
          .map((s) => s.replace(/^[-•*\d.)`\s]+/, "").trim())
          .filter((s) => {
            if (s.length < 3) return false;
            if (s.startsWith("```")) return false;
            if (/^[{}\[\]":,]/.test(s)) return false;
            if (/^(queries|query):/i.test(s)) return false;
            return true;
          })
          .slice(0, 5);
      }
    }

    // Validate: each query must be at least 3 chars and not look like code
    searchQueries = searchQueries
      .filter((q) => q.length >= 3 && !q.startsWith("```") && !q.startsWith("{"))
      .slice(0, 5);

    if (searchQueries.length === 0) {
      searchQueries = [rawText]; // last resort fallback
    }

    // Limit to 5 queries max
    searchQueries = searchQueries.slice(0, 5);
    const searchQuery = searchQueries.join(" | ");
    logger.info("Extracted search queries", { searchQueries });

    // Step 2: Search with configured search provider using multiple queries in parallel
    logger.info("Search provider", { providerId: searchProviderId, hasApiKey: !!searchApiKey });
    const searchConfig = {
      providerId: searchProviderId,
      apiKey: searchApiKey,
      ...(request.searchBaseUrl ? { baseUrl: request.searchBaseUrl } : {})
    };
    const searchRes = await searchPatents(searchQueries, request.maxResults * 2, searchConfig);
    logger.info("Search returned", { providerId: searchProviderId, count: searchRes.results.length, queries: searchQueries });
    for (const r of searchRes.results) {
      logger.info("  result", { title: r.title?.slice(0, 80), url: r.url?.slice(0, 100) });
    }

    if (searchRes.results.length === 0) {
      res.json({
        ok: true,
        candidates: [],
        searchQuery,
        error: "未检索到相关专利文献，请尝试调整权利要求或手动上传。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Step 3: Use LLM to filter and rank real search results
    const searchResultsText = searchRes.results
      .map(
        (r, i) =>
          `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content.slice(0, 500)}`
      )
      .join("\n\n");

    const filterPrompt = sanitizeText(
      `你是专利检索分析专家。以下是从网络搜索到的结果，需要从中识别专利文献。\n\n` +
      `权利要求文本:\n${request.claimText.slice(0, 2000)}\n\n` +
      `技术特征:\n${featureText}\n\n` +
      `搜索结果:\n${searchResultsText}\n\n` +
      `任务：\n` +
      `1. 从搜索结果中识别专利文献（标题或URL包含专利号：CN/US/EP/JP/KR/WO开头）\n` +
      `2. 提取每篇专利的：\n` +
      `   - title: 专利标题\n` +
      `   - publicationNumber: 公开号（从URL或标题提取，格式如CN108123456A）\n` +
      `   - publicationDate: 公开日期（如有，格式YYYY-MM-DD）\n` +
      `   - summary: 技术摘要（从content提取，200字以内）\n` +
      `   - relevanceScore: 相关度评分（0-100，基于与权利要求的技术相似度）\n` +
      `   - recommendationReason: 推荐理由（简述为何相关）\n` +
      `   - sourceUrl: 来源URL\n` +
      `3. 按相关度排序，最多返回${request.maxResults}篇\n\n` +
      `输出格式：JSON数组\n` +
      `[{\n` +
      `  "title": "专利标题",\n` +
      `  "publicationNumber": "CN108123456A",\n` +
      `  "publicationDate": "2023-01-15",\n` +
      `  "summary": "技术摘要",\n` +
      `  "relevanceScore": 85,\n` +
      `  "recommendationReason": "推荐理由",\n` +
      `  "sourceUrl": "https://..."\n` +
      `}]\n\n` +
      `重要规则：\n` +
      `- 只返回专利文献，非专利网页返回空数组\n` +
      `- 所有信息必须来自搜索结果原文，不得编造\n` +
      `- 优先中国专利（CN开头）和高相关度文献\n` +
      `- 如果没有专利文献，返回空数组 []`
    );

    const filterReq: ChatRequest = {
      modelId: request.modelId,
      messages: [{ role: "user", content: filterPrompt }],
      maxTokens: 2000,
      apiKey
    };

    const { response: filterRes } = await registry.runWithFallback(
      availableProviders as string[],
      filterReq
    );

    if (filterRes.error) {
      logger.error("LLM filter results failed", { error: filterRes.error });
      res.status(502).json({
        ok: false,
        candidates: [],
        searchQuery,
        error: "AI 筛选结果失败，请稍后重试。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Parse LLM output — strip markdown code fences if present
    let candidates: SearchReferencesCandidate[] = [];
    try {
      let jsonText = filterRes.text.trim();
      // Remove ```json ... ``` or ``` ... ``` wrappers (relaxed patterns)
      const fencePatterns = [
        /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m,
        /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
      ];
      for (const pat of fencePatterns) {
        const m = jsonText.match(pat);
        if (m) { jsonText = m[1]!.trim(); break; }
      }
      // Try to extract JSON array from the text
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/) ?? jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // If no closing bracket found, try to repair truncated JSON
        const openBracket = jsonText.indexOf("[");
        if (openBracket !== -1) {
          // Extract from opening [ to end, then try to close it
          let partial = jsonText.slice(openBracket);
          // Remove trailing incomplete element (after last complete })
          const lastCompleteObj = partial.lastIndexOf("}");
          if (lastCompleteObj !== -1) {
            partial = partial.slice(0, lastCompleteObj + 1) + "]";
          }
          try {
            const parsed = JSON.parse(partial);
            const rawCandidates = Array.isArray(parsed) ? parsed : [];
            logger.info("LLM filter returned (repaired)", { raw: rawCandidates.length });
            candidates = rawCandidates
              .filter((c: Record<string, unknown>) => c.title && c.publicationNumber)
              .slice(0, request.maxResults)
              .map((c: Record<string, unknown>) => ({
                title: String(c.title),
                publicationNumber: String(c.publicationNumber),
                ...(c.publicationDate ? { publicationDate: String(c.publicationDate) } : {}),
                summary: String(c.summary ?? ""),
                relevanceScore: Number(c.relevanceScore) || 0,
                recommendationReason: String(c.recommendationReason ?? ""),
                ...(c.sourceUrl ? { sourceUrl: String(c.sourceUrl) } : {})
              }));
            logger.info("Final candidates", { count: candidates.length });
          } catch {
            logger.warn("Failed to parse repaired filter JSON", { partial: partial.slice(0, 200) });
          }
        }
      } else {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawCandidates = Array.isArray(parsed) ? parsed : parsed.candidates ?? [];
        logger.info("LLM filter returned", { raw: rawCandidates.length });
        candidates = rawCandidates
          .filter((c: Record<string, unknown>) => c.title && c.publicationNumber)
          .slice(0, request.maxResults)
          .map((c: Record<string, unknown>) => ({
            title: String(c.title),
            publicationNumber: String(c.publicationNumber),
            ...(c.publicationDate ? { publicationDate: String(c.publicationDate) } : {}),
            summary: String(c.summary ?? ""),
            relevanceScore: Number(c.relevanceScore) || 0,
            recommendationReason: String(c.recommendationReason ?? ""),
            ...(c.sourceUrl ? { sourceUrl: String(c.sourceUrl) } : {})
          }));
        logger.info("Final candidates", { count: candidates.length });
      }
    } catch {
      logger.warn("Failed to parse LLM filter output as JSON", { rawText: filterRes.text.slice(0, 200) });
    }

    logger.info("Search references completed", {
      caseId: request.caseId,
      query: searchQuery,
      searchResults: searchRes.results.length,
      candidates: candidates.length
    });

    res.json({
      ok: true,
      candidates,
      searchQuery
    } satisfies SearchReferencesResponse);
  } catch (error) {
    logger.error("Search references error", { error: String(error) });
    res.status(500).json({
      ok: false,
      candidates: [],
      error: `检索失败: ${String(error)}`
    } satisfies SearchReferencesResponse);
  }
});

// Verify search API key validity
const verifyKeySchema = z.object({
  providerId: z.enum(["tavily", "serpapi", "custom"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().optional()
});

searchRouter.post("/verify-search-key", async (req, res) => {
  const parseResult = verifyKeySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ ok: false, error: "Invalid request" });
    return;
  }

  const { providerId, apiKey, baseUrl } = parseResult.data;

  try {
    if (providerId === "tavily") {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query: "test", max_results: 1, include_answer: false })
      });
      if (response.ok) {
        res.json({ ok: true, providerId, message: "Tavily API Key 有效" });
      } else {
        const text = await response.text().catch(() => "");
        res.json({ ok: false, providerId, error: `Key 无效 (${response.status}): ${text.slice(0, 100)}` });
      }
    } else if (providerId === "serpapi") {
      const url = new URL("https://serpapi.com/search");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", "test");
      url.searchParams.set("num", "1");
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
      if (response.ok) {
        res.json({ ok: true, providerId, message: "SerpAPI Key 有效" });
      } else {
        const text = await response.text().catch(() => "");
        res.json({ ok: false, providerId, error: `Key 无效 (${response.status}): ${text.slice(0, 100)}` });
      }
    } else if (providerId === "custom" && baseUrl) {
      const url = new URL(baseUrl);
      url.searchParams.set("q", "test");
      url.searchParams.set("max_results", "1");
      const response = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" }
      });
      if (response.ok) {
        res.json({ ok: true, providerId, message: "自定义搜索 API Key 有效" });
      } else {
        res.json({ ok: false, providerId, error: `Key 无效 (${response.status})` });
      }
    } else {
      res.status(400).json({ ok: false, error: "自定义搜索需要提供 API 端点" });
    }
  } catch (err) {
    res.json({ ok: false, providerId, error: `验证失败: ${String(err)}` });
  }
});

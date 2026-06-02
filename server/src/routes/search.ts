import { Router } from "express";
import { z } from "zod";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { searchPatents } from "../services/webSearch.js";
import { logger } from "../lib/logger.js";
import { extractJsonFromText } from "../lib/jsonExtractor.js";
import { sanitizeText } from "../security/sanitize.js";
import { validateExternalUrl, validateProviderBaseUrls, BlockedUrlError } from "../lib/urlValidation.js";
import type { SearchReferencesResponse, SearchReferencesCandidate, SearchSummary, ExtractSearchTermsResponse } from "@shared/types/api";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

export const searchRouter = Router();

function extractFallbackCandidates(rawText: string): SearchReferencesCandidate[] {
  const candidates: SearchReferencesCandidate[] = [];
  const objectPattern = /"title"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(rawText)) !== null) {
    const title = match[1];
    if (!title || title.length < 3) continue;
    const remaining = rawText.slice(match.index);
    const pubMatch = remaining.match(/"publicationNumber"\s*:\s*"([^"]+)"/);
    const dateMatch = remaining.match(/"publicationDate"\s*:\s*"([^"]+)"/);
    const summaryMatch = remaining.match(/"summary"\s*:\s*"([^"]*)"/);
    const scoreMatch = remaining.match(/"relevanceScore"\s*:\s*(\d+(?:\.\d+)?)/);
    const reasonMatch = remaining.match(/"recommendationReason"\s*:\s*"([^"]*)"/);
    const urlMatch = remaining.match(/"sourceUrl"\s*:\s*"([^"]+)"/);
    candidates.push({
      title,
      publicationNumber: pubMatch?.[1] ?? "",
      ...(dateMatch?.[1] ? { publicationDate: dateMatch[1] } : {}),
      summary: summaryMatch?.[1] ?? "",
      relevanceScore: scoreMatch ? Number(scoreMatch[1]) : 0,
      recommendationReason: reasonMatch?.[1] ?? "",
      ...(urlMatch?.[1] ? { sourceUrl: urlMatch[1] } : {}),
    });
  }
  return candidates.filter((c) => c.title && c.publicationNumber);
}

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
  llmApiKey: z.string().optional(),
  modelFallbacks: z.record(z.string(), z.array(z.string())).optional(),
  enableModelFallback: z.record(z.string(), z.boolean()).optional(),
  providerBaseUrls: z.record(z.string(), z.string()).optional()
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

  // SSRF protection: validate user-provided URLs
  if (request.searchBaseUrl) validateExternalUrl(request.searchBaseUrl);
  validateProviderBaseUrls(request.providerBaseUrls as Record<string, string> | undefined);

  // Resolve search API key:
  //   - APP mode: frontend sends user-configured key via searchApiKey
  //   - Dev/test mode: frontend sends nothing, backend uses env vars
  // These two routes are independent — no fallback between them.
  const searchProviderId = request.searchProviderId || "tavily";
  const envKeyMap: Record<string, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    serpapi: process.env.SerpAPI_KEY,
    epo: process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET
      ? `${process.env.EPO_CONSUMER_KEY}:${process.env.EPO_CONSUMER_SECRET}`
      : undefined
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

  // Abort on client disconnect
  const controller = new AbortController();
  const onSocketClose = () => {
    if (!res.headersSent) {
      controller.abort();
      logger.info("Client disconnected, aborting search-references request");
    }
  };
  req.socket?.on("close", onSocketClose);

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
      maxTokens: 8192,
      apiKey
    };

    const { response: extractRes, attempts: extractAttempts } = await registry.runWithFallback(
      availableProviders as string[],
      extractReq,
      undefined,
      request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
      request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
      request.providerBaseUrls as Partial<Record<string, string>> | undefined,
      Object.fromEntries(providerKeys) as Partial<Record<string, string>>
    );

    if (extractRes.error) {
      logger.error("LLM extract search terms failed", { error: extractRes.error, attempts: extractAttempts });
      res.status(502).json({
        ok: false,
        candidates: [],
        error: "AI 提取检索词失败，请稍后重试。"
      } satisfies SearchReferencesResponse);
      return;
    }

    if (!extractRes.text || !extractRes.text.trim()) {
      logger.error("LLM extract returned empty text", { attempts: extractAttempts });
      res.status(502).json({
        ok: false,
        candidates: [],
        error: "AI 返回空内容，可能 API Key 无效或配额已用完。请检查 LLM 设置。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Parse structured queries from LLM output
    let searchQueries: string[];
    const rawText = extractRes.text.trim();
    logger.info("LLM extract raw output", { rawText: rawText.slice(0, 500) });
    try {
      const extracted = extractJsonFromText(rawText);
      if (extracted) {
        const parsed = extracted.parsed;
        searchQueries = Array.isArray(parsed)
          ? (parsed as string[])
          : ((parsed as { queries?: string[] }).queries ?? []);
      } else {
        searchQueries = [];
      }
    } catch (e) {
      logger.warn("Failed to parse search queries JSON: " + String(e));
      searchQueries = [];
    }

    // Fallback: if JSON parsing failed, extract meaningful lines
    if (searchQueries.length === 0) {
      searchQueries = rawText
        .split(/\n/)
        .map((s) => s.replace(/^[-•*\d.)`\s]+/, "").trim())
        .filter((s) => {
          if (s.length < 3) return false;
          if (s.startsWith("```")) return false;
          if (/^[{}[\]":,]/.test(s)) return false;
          if (/^(queries|query):/i.test(s)) return false;
          return true;
        })
        .slice(0, 5);
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
    
    // Step 1.5: If using EPO, translate Chinese queries to English
    // EPO OPS only indexes English/German/French - Chinese terms will return 0 results
    if (searchProviderId === "epo") {
      const chineseQueries = searchQueries.filter(q => /[\u4e00-\u9fff]/.test(q));
      if (chineseQueries.length > 0) {
        logger.info("EPO search detected Chinese queries, translating to English", { chineseQueries });
        const translatePrompt = sanitizeText(
          `你是专利检索专家。请将以下中文检索词翻译为英文，用于在 EPO（欧洲专利局）专利数据库中检索。\n\n` +
          `中文检索词:\n${chineseQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
          `翻译要求:\n` +
          `1. 使用专利领域的专业英文术语\n` +
          `2. 保持检索意图不变，不要添加或删除技术特征\n` +
          `3. 每个检索词单独翻译，不要合并\n\n` +
          `输出 JSON 格式: {"translations":["英文检索词1","英文检索词2",...]}`
        );
        
        const translateReq: ChatRequest = {
          modelId: request.modelId,
          messages: [{ role: "user", content: translatePrompt }],
          maxTokens: 4096,
          apiKey
        };
        
        try {
          const { response: translateRes } = await registry.runWithFallback(
            availableProviders as string[],
            translateReq,
            undefined,
            request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
            request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
            request.providerBaseUrls as Partial<Record<string, string>> | undefined,
            Object.fromEntries(providerKeys) as Partial<Record<string, string>>
          );
          
          if (!translateRes.error && translateRes.text) {
            const extracted = extractJsonFromText(translateRes.text);
            if (extracted) {
              const parsed = extracted.parsed as { translations?: string[] };
              if (parsed.translations && parsed.translations.length === chineseQueries.length) {
                // Replace Chinese queries with English translations
                let transIdx = 0;
                searchQueries = searchQueries.map(q => 
                  /[\u4e00-\u9fff]/.test(q) ? parsed.translations![transIdx++]! : q
                );
                logger.info("Translated Chinese queries for EPO", { translated: searchQueries });
              }
            }
          }
        } catch (err) {
          logger.warn("EPO query translation failed, using original", { error: String(err) });
        }
      }
    }
    
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

    // Build search summary for better UX
    const dataSourceName: Record<string, string> = {
      tavily: "Tavily",
      serpapi: "SerpAPI",
      epo: "EPO",
      custom: "自定义数据源"
    };
    const searchSummary: SearchSummary = {
      featureCount: request.features.length,
      queryCount: searchQueries.length,
      dataSource: dataSourceName[searchProviderId] ?? searchProviderId.toUpperCase(),
      queries: searchQueries
    };

    if (searchRes.results.length === 0) {
      res.json({
        ok: true,
        candidates: [],
        searchQuery,
        searchSummary,
        error: `未在 ${searchSummary.dataSource} 数据库中找到与这些技术特征匹配的专利文献。`
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
      maxTokens: 8192,
      apiKey
    };

    const { response: filterRes } = await registry.runWithFallback(
      availableProviders as string[],
      filterReq,
      undefined,
      request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
      request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
      request.providerBaseUrls as Partial<Record<string, string>> | undefined,
      Object.fromEntries(providerKeys) as Partial<Record<string, string>>
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

    if (!filterRes.text || !filterRes.text.trim()) {
      logger.error("LLM filter returned empty text", { searchQuery });
      res.status(502).json({
        ok: false,
        candidates: [],
        searchQuery,
        error: "AI 筛选文献返回空内容，请稍后重试。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Parse LLM output
    let candidates: SearchReferencesCandidate[] = [];
    try {
      const extracted = extractJsonFromText(filterRes.text);
      if (!extracted) {
        const fallbackCandidates = extractFallbackCandidates(filterRes.text);
        if (fallbackCandidates.length > 0) {
          candidates = fallbackCandidates.slice(0, request.maxResults);
          logger.info("LLM filter extracted via fallback", { count: candidates.length });
        }
      } else {
        const parsed = extracted.parsed;
        const rawCandidates = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : ((parsed as { candidates?: Record<string, unknown>[] }).candidates ?? []);
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
      const fallbackCandidates = extractFallbackCandidates(filterRes.text);
      if (fallbackCandidates.length > 0) {
        candidates = fallbackCandidates.slice(0, request.maxResults);
        logger.info("LLM filter extracted via catch fallback", { count: candidates.length });
      }
    }

    // Enrich candidates with sourceUrl from the original search results.
    // The LLM sometimes omits or garbles sourceUrl even though it's present
    // in the prompt text. Programmatic recovery ensures every candidate
    // that matches a real search result gets its correct URL.
    const searchUrlLookup: Array<{ title: string; url: string }> = searchRes.results.map((r) => ({
      title: (r.title ?? "").toLowerCase().trim(),
      url: r.url
    }));

    candidates = candidates.map((candidate) => {
      if (candidate.sourceUrl) return candidate;

      const candTitle = (candidate.title ?? "").toLowerCase().trim();
      const candPubNum = (candidate.publicationNumber ?? "").toLowerCase().trim();

      // 1. Exact title match
      let match = searchUrlLookup.find((s) => s.title === candTitle);

      // 2. Title substring in either direction
      if (!match) {
        match = searchUrlLookup.find(
          (s) => s.title.includes(candTitle) || candTitle.includes(s.title)
        );
      }

      // 3. Publication number found in search result URL
      if (!match && candPubNum) {
        match = searchUrlLookup.find((s) =>
          s.url.toLowerCase().includes(candPubNum)
        );
      }

      if (match) {
        return { ...candidate, sourceUrl: match.url };
      }
      return candidate;
    });

    logger.info("Search references completed", {
      caseId: request.caseId,
      query: searchQuery,
      searchResults: searchRes.results.length,
      candidates: candidates.length
    });

    res.json({
      ok: true,
      candidates,
      searchQuery,
      searchSummary
    } satisfies SearchReferencesResponse);
  } catch (error) {
    logger.error("Search references error", { error: String(error) });
    const status = error instanceof BlockedUrlError ? 400 : 500;
    const message = error instanceof BlockedUrlError ? error.message : "检索失败，请稍后重试";
    res.status(status).json({
      ok: false,
      candidates: [],
      error: message
    } satisfies SearchReferencesResponse);
  } finally {
    req.socket?.off("close", onSocketClose);
  }
});

// ─── nf-7: Step 1 — 仅提取检索词（不执行搜索） ───

const extractTermsSchema = z.object({
  caseId: z.string(),
  claimText: z.string().min(1),
  features: z.array(z.object({ featureCode: z.string(), description: z.string() })),
  providerPreference: z.array(z.string()).optional().default(["gemini", "mimo"]),
  modelId: z.string().optional().default("gemini-2.5-flash-lite"),
  llmApiKey: z.string().optional(),
  modelFallbacks: z.record(z.string(), z.array(z.string())).optional(),
  enableModelFallback: z.record(z.string(), z.boolean()).optional(),
  providerBaseUrls: z.record(z.string(), z.string()).optional()
});

searchRouter.post("/extract-search-terms", async (req, res) => {
  const parseResult = extractTermsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      ok: false,
      queries: [],
      featureCount: 0,
      error: `Invalid request: ${parseResult.error.issues.map((i) => i.message).join(", ")}`
    } satisfies ExtractSearchTermsResponse);
    return;
  }

  const request = parseResult.data;

  // SSRF protection
  validateProviderBaseUrls(request.providerBaseUrls as Record<string, string> | undefined);

  // Resolve LLM provider
  const providerKeys = new Map<string, string>();
  if (request.llmApiKey) {
    for (const pid of request.providerPreference) {
      if (registry.get(pid)) {
        providerKeys.set(pid, request.llmApiKey);
        break;
      }
    }
  }
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
      queries: [],
      featureCount: 0,
      error: "未配置任何 LLM API key，无法提取检索词。"
    } satisfies ExtractSearchTermsResponse);
    return;
  }

  // Abort on client disconnect
  const controller = new AbortController();
  const onSocketClose = () => {
    if (!res.headersSent) {
      controller.abort();
      logger.info("Client disconnected, aborting extract-search-terms request");
    }
  };
  req.socket?.on("close", onSocketClose);

  try {
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
      `请严格输出 JSON 格式 {"queries":["查询1","查询2",...]}，不要输出其他内容：`
    );

    const firstProvider = availableProviders[0]!;
    const apiKey = providerKeys.get(firstProvider)!;

    const extractReq: ChatRequest = {
      modelId: request.modelId,
      messages: [{ role: "user", content: extractPrompt }],
      maxTokens: 8192,
      apiKey
    };

    const { response: extractRes } = await registry.runWithFallback(
      availableProviders as string[],
      extractReq,
      undefined,
      request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
      request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
      request.providerBaseUrls as Partial<Record<string, string>> | undefined,
      Object.fromEntries(providerKeys) as Partial<Record<string, string>>
    );

    if (extractRes.error || !extractRes.text?.trim()) {
      logger.error("Extract search terms failed", { error: extractRes.error });
      res.status(502).json({
        ok: false,
        queries: [],
        featureCount: request.features.length,
        error: "AI 提取检索词失败，请稍后重试。"
      } satisfies ExtractSearchTermsResponse);
      return;
    }

    // Parse queries
    let searchQueries: string[];
    const rawText = extractRes.text.trim();
    try {
      const extracted = extractJsonFromText(rawText);
      if (extracted) {
        const parsed = extracted.parsed;
        searchQueries = Array.isArray(parsed)
          ? (parsed as string[])
          : ((parsed as { queries?: string[] }).queries ?? []);
      } else {
        searchQueries = [];
      }
    } catch (e) {
      logger.warn("Failed to parse search queries JSON: " + String(e));
      searchQueries = [];
    }

    if (searchQueries.length === 0) {
      searchQueries = rawText
        .split(/\n/)
        .map((s) => s.replace(/^[-•*\d.)`\s]+/, "").trim())
        .filter((s) => s.length >= 3 && !s.startsWith("```") && !/^[{}[\]":,]/.test(s))
        .slice(0, 5);
    }

    searchQueries = searchQueries
      .filter((q) => q.length >= 3 && !q.startsWith("```") && !q.startsWith("{"))
      .slice(0, 5);

    if (searchQueries.length === 0) {
      searchQueries = [rawText];
    }

    logger.info("Extract search terms completed", { queryCount: searchQueries.length });

    res.json({
      ok: true,
      queries: searchQueries,
      featureCount: request.features.length
    } satisfies ExtractSearchTermsResponse);
  } catch (error) {
    logger.error("Extract search terms error", { error: String(error) });
    const status = error instanceof BlockedUrlError ? 400 : 500;
    const message = error instanceof BlockedUrlError ? error.message : "提取检索词失败，请稍后重试";
    res.status(status).json({
      ok: false,
      queries: [],
      featureCount: 0,
      error: message
    } satisfies ExtractSearchTermsResponse);
  } finally {
    req.socket?.off("close", onSocketClose);
  }
});

// ─── nf-7: Step 2 — 用用户编辑后的检索词执行搜索 ───

const searchWithTermsSchema = z.object({
  caseId: z.string(),
  claimText: z.string().min(1),
  features: z.array(z.object({ featureCode: z.string(), description: z.string() })),
  searchQueries: z.array(z.string().min(1)).min(1),
  maxResults: z.number().int().min(1).max(10).optional().default(5),
  searchProviderId: z.string().optional(),
  searchApiKey: z.string().optional(),
  searchBaseUrl: z.string().optional(),
  llmApiKey: z.string().optional(),
  providerPreference: z.array(z.string()).optional().default(["gemini", "mimo"]),
  modelId: z.string().optional().default("gemini-2.5-flash-lite"),
  modelFallbacks: z.record(z.string(), z.array(z.string())).optional(),
  enableModelFallback: z.record(z.string(), z.boolean()).optional(),
  providerBaseUrls: z.record(z.string(), z.string()).optional()
});

searchRouter.post("/search-with-terms", async (req, res) => {
  const parseResult = searchWithTermsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      ok: false,
      candidates: [],
      error: `Invalid request: ${parseResult.error.issues.map((i) => i.message).join(", ")}`
    } satisfies SearchReferencesResponse);
    return;
  }

  const request = parseResult.data;

  // SSRF protection
  if (request.searchBaseUrl) validateExternalUrl(request.searchBaseUrl);
  validateProviderBaseUrls(request.providerBaseUrls as Record<string, string> | undefined);

  const searchProviderId = request.searchProviderId || "tavily";

  // Resolve search API key
  const envKeyMap: Record<string, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    serpapi: process.env.SerpAPI_KEY,
    epo: process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET
      ? `${process.env.EPO_CONSUMER_KEY}:${process.env.EPO_CONSUMER_SECRET}`
      : undefined
  };
  const searchApiKey = request.searchApiKey || envKeyMap[searchProviderId];
  if (!searchApiKey) {
    res.status(503).json({
      ok: false,
      candidates: [],
      error: "搜索服务不可用：未配置搜索 API Key。"
    } satisfies SearchReferencesResponse);
    return;
  }

  // Resolve LLM provider
  const providerKeys = new Map<string, string>();
  if (request.llmApiKey) {
    for (const pid of request.providerPreference) {
      if (registry.get(pid)) {
        providerKeys.set(pid, request.llmApiKey);
        break;
      }
    }
  }
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

  // Abort on client disconnect
  const controller = new AbortController();
  const onSocketClose = () => {
    if (!res.headersSent) {
      controller.abort();
      logger.info("Client disconnected, aborting search-with-terms request");
    }
  };
  req.socket?.on("close", onSocketClose);

  try {
    let searchQueries = [...request.searchQueries];

    // EPO translation if needed
    if (searchProviderId === "epo") {
      const chineseQueries = searchQueries.filter(q => /[一-鿿]/.test(q));
      if (chineseQueries.length > 0) {
        const firstProvider = availableProviders[0]!;
        const apiKey = providerKeys.get(firstProvider)!;
        const translatePrompt = sanitizeText(
          `你是专利检索专家。请将以下中文检索词翻译为英文，用于在 EPO 专利数据库中检索。\n\n` +
          `中文检索词:\n${chineseQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
          `输出 JSON 格式: {"translations":["英文检索词1","英文检索词2",...]}`
        );
        const translateReq: ChatRequest = {
          modelId: request.modelId,
          messages: [{ role: "user", content: translatePrompt }],
          maxTokens: 4096,
          apiKey
        };
        try {
          const { response: translateRes } = await registry.runWithFallback(
            availableProviders as string[], translateReq, undefined,
            request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
            request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
            request.providerBaseUrls as Partial<Record<string, string>> | undefined,
            Object.fromEntries(providerKeys) as Partial<Record<string, string>>
          );
          if (!translateRes.error && translateRes.text) {
            const extracted = extractJsonFromText(translateRes.text);
            if (extracted) {
              const parsed = extracted.parsed as { translations?: string[] };
              if (parsed.translations && parsed.translations.length === chineseQueries.length) {
                let transIdx = 0;
                searchQueries = searchQueries.map(q =>
                  /[一-鿿]/.test(q) ? parsed.translations![transIdx++]! : q
                );
              }
            }
          }
        } catch (err) {
          logger.warn("EPO query translation failed, using original", { error: String(err) });
        }
      }
    }

    const searchQuery = searchQueries.join(" | ");
    logger.info("Search with user terms", { providerId: searchProviderId, queries: searchQueries });

    const searchConfig = {
      providerId: searchProviderId,
      apiKey: searchApiKey,
      ...(request.searchBaseUrl ? { baseUrl: request.searchBaseUrl } : {})
    };
    const searchRes = await searchPatents(searchQueries, request.maxResults * 2, searchConfig);

    const dataSourceName: Record<string, string> = {
      tavily: "Tavily", serpapi: "SerpAPI", epo: "EPO", custom: "自定义数据源"
    };
    const providerResultCount = {
      providerId: searchProviderId,
      providerName: dataSourceName[searchProviderId] ?? searchProviderId.toUpperCase(),
      resultCount: searchRes.results.length,
      candidateCount: 0 // updated after LLM filtering
    };

    const searchSummary: SearchSummary = {
      featureCount: request.features.length,
      queryCount: searchQueries.length,
      dataSource: dataSourceName[searchProviderId] ?? searchProviderId.toUpperCase(),
      queries: searchQueries,
      providerResults: [providerResultCount]
    };

    if (searchRes.results.length === 0) {
      res.json({
        ok: true,
        candidates: [],
        searchQuery,
        searchSummary,
        error: `未在 ${searchSummary.dataSource} 数据库中找到与这些技术特征匹配的专利文献。`
      } satisfies SearchReferencesResponse);
      return;
    }

    // LLM filter and rank
    const featureText = request.features.map((f) => `${f.featureCode}: ${f.description}`).join("\n");
    const searchResultsText = searchRes.results
      .map((r, i) => `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content.slice(0, 500)}`)
      .join("\n\n");

    const filterPrompt = sanitizeText(
      `你是专利检索分析专家。以下是从网络搜索到的结果，需要从中识别专利文献。\n\n` +
      `权利要求文本:\n${request.claimText.slice(0, 2000)}\n\n` +
      `技术特征:\n${featureText}\n\n` +
      `搜索结果:\n${searchResultsText}\n\n` +
      `任务：从搜索结果中识别专利文献，提取 title, publicationNumber, publicationDate, summary, relevanceScore, recommendationReason, sourceUrl。` +
      `按相关度排序，最多返回${request.maxResults}篇。\n\n` +
      `输出 JSON 数组格式。`
    );

    const firstProvider = availableProviders[0]!;
    const apiKey = providerKeys.get(firstProvider)!;
    const filterReq: ChatRequest = {
      modelId: request.modelId,
      messages: [{ role: "user", content: filterPrompt }],
      maxTokens: 8192,
      apiKey
    };

    const { response: filterRes } = await registry.runWithFallback(
      availableProviders as string[], filterReq, undefined,
      request.modelFallbacks as Partial<Record<string, string[]>> | undefined,
      request.enableModelFallback as Partial<Record<string, boolean>> | undefined,
      request.providerBaseUrls as Partial<Record<string, string>> | undefined,
      Object.fromEntries(providerKeys) as Partial<Record<string, string>>
    );

    if (filterRes.error || !filterRes.text?.trim()) {
      res.status(502).json({
        ok: false, candidates: [], searchQuery, searchSummary,
        error: "AI 筛选结果失败，请稍后重试。"
      } satisfies SearchReferencesResponse);
      return;
    }

    let candidates: SearchReferencesCandidate[] = [];
    try {
      const extracted = extractJsonFromText(filterRes.text);
      if (extracted) {
        const parsed = extracted.parsed;
        const rawCandidates = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : ((parsed as { candidates?: Record<string, unknown>[] }).candidates ?? []);
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
      } else {
        const fallbackCandidates = extractFallbackCandidates(filterRes.text);
        if (fallbackCandidates.length > 0) candidates = fallbackCandidates.slice(0, request.maxResults);
      }
    } catch {
      const fallbackCandidates = extractFallbackCandidates(filterRes.text);
      if (fallbackCandidates.length > 0) candidates = fallbackCandidates.slice(0, request.maxResults);
    }

    // Update candidate count
    if (searchSummary.providerResults?.[0]) {
      searchSummary.providerResults[0].candidateCount = candidates.length;
    }

    res.json({ ok: true, candidates, searchQuery, searchSummary } satisfies SearchReferencesResponse);
  } catch (error) {
    logger.error("Search with terms error", { error: String(error) });
    const status = error instanceof BlockedUrlError ? 400 : 500;
    const message = error instanceof BlockedUrlError ? error.message : "检索失败，请稍后重试";
    res.status(status).json({
      ok: false, candidates: [],
      error: message
    } satisfies SearchReferencesResponse);
  } finally {
    req.socket?.off("close", onSocketClose);
  }
});

// Verify search API key validity
const verifyKeySchema = z.object({
  providerId: z.enum(["tavily", "serpapi", "custom", "epo"]),
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
    // SSRF protection
    if (baseUrl) validateExternalUrl(baseUrl);
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
    } else if (providerId === "epo") {
      const colonIdx = apiKey.indexOf(":");
      if (colonIdx === -1) {
        res.json({ ok: false, providerId, error: "EPO OPS 需要 Consumer Key:Consumer Secret 格式" });
        return;
      }
      const consumerKey = apiKey.slice(0, colonIdx);
      const consumerSecret = apiKey.slice(colonIdx + 1);
      const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
      const response = await fetch("https://ops.epo.org/3.2/auth/accesstoken", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      });
      if (response.ok) {
        res.json({ ok: true, providerId, message: "EPO OPS Consumer Key/Secret 有效" });
      } else {
        const text = await response.text().catch(() => "");
        res.json({ ok: false, providerId, error: `EPO 认证失败 (${response.status}): ${text.slice(0, 100)}` });
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
    logger.error("Verify search key error", { error: String(err) });
    const message = err instanceof BlockedUrlError ? err.message : "验证失败，请稍后重试";
    res.json({ ok: false, providerId, error: message });
  }
});

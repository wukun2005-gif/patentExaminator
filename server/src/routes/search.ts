import { Router } from "express";
import { z } from "zod";
import { registry } from "../providers/registry.js";
import { getApiKey } from "../security/keyStore.js";
import { searchPatents, extractPublicationNumbers } from "../services/webSearch.js";
import { logger } from "../lib/logger.js";
import { sanitizeText } from "../security/sanitize.js";
import type { SearchReferencesResponse, SearchReferencesCandidate } from "@shared/types/api";
import type { ProviderId } from "@shared/types/agents";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

export const searchRouter = Router();

const searchRequestSchema = z.object({
  caseId: z.string(),
  claimText: z.string().min(1),
  features: z.array(z.object({ featureCode: z.string(), description: z.string() })),
  maxResults: z.number().int().min(1).max(10).optional().default(5),
  providerPreference: z.array(z.string()).optional().default(["gemini", "mimo"]),
  modelId: z.string().optional().default("gemini-2.5-flash-lite")
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

  // Hard constraint: TAVILY_API_KEY must be configured
  if (!process.env.TAVILY_API_KEY) {
    res.status(503).json({
      ok: false,
      candidates: [],
      error: "搜索服务不可用：未配置 TAVILY_API_KEY。请在 .env 文件中配置后重试，或手动上传文献。"
    } satisfies SearchReferencesResponse);
    return;
  }

  // Resolve LLM provider
  const providerKeys = new Map<string, string>();
  for (const pid of request.providerPreference) {
    const key = getApiKey(pid);
    if (key) providerKeys.set(pid, key);
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
    // Step 1: Use LLM to extract search terms from claims
    const featureText = request.features.map((f) => `${f.featureCode}: ${f.description}`).join("\n");
    const extractPrompt = sanitizeText(
      `你是专利检索专家。从以下权利要求中提取用于专利检索的关键词和可能的IPC分类号。\n\n` +
      `权利要求文本:\n${request.claimText.slice(0, 4000)}\n\n` +
      `技术特征:\n${featureText}\n\n` +
      `请输出一个简洁的检索查询字符串（中英文关键词，用空格分隔），不要输出其他内容。`
    );

    const firstProvider = availableProviders[0]!;
    const apiKey = providerKeys.get(firstProvider)!;

    const extractReq: ChatRequest = {
      modelId: request.modelId,
      messages: [{ role: "user", content: extractPrompt }],
      maxTokens: 500,
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

    const searchQuery = extractRes.text.trim();
    logger.info("Extracted search query", { searchQuery });

    // Step 2: Search with Tavily (real search results only)
    const tavilyRes = await searchPatents(searchQuery, request.maxResults * 2);

    if (tavilyRes.results.length === 0) {
      res.json({
        ok: true,
        candidates: [],
        searchQuery,
        error: "未检索到相关专利文献，请尝试调整权利要求或手动上传。"
      } satisfies SearchReferencesResponse);
      return;
    }

    // Step 3: Use LLM to filter and rank real search results
    const searchResultsText = tavilyRes.results
      .map(
        (r, i) =>
          `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content.slice(0, 500)}`
      )
      .join("\n\n");

    const filterPrompt = sanitizeText(
      `你是专利检索分析专家。以下是从专利数据库中检索到的真实搜索结果。\n\n` +
      `权利要求文本:\n${request.claimText.slice(0, 2000)}\n\n` +
      `技术特征:\n${featureText}\n\n` +
      `搜索结果:\n${searchResultsText}\n\n` +
      `请从上述搜索结果中筛选出与权利要求最相关的专利文献（最多${request.maxResults}篇），\n` +
      `从每条结果中提取公开号（从URL或标题中提取，如CN/US/EP开头的编号）、公开日（如有）。\n` +
      `输出JSON格式，每篇包含: title, publicationNumber, publicationDate(可选), summary, relevanceScore(0-100), recommendationReason, sourceUrl\n\n` +
      `重要：所有字段必须来自搜索结果原文，不得编造。如果没有相关专利文献，返回空数组。`
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

    // Parse LLM output
    let candidates: SearchReferencesCandidate[] = [];
    try {
      const parsed = JSON.parse(filterRes.text);
      const rawCandidates = Array.isArray(parsed) ? parsed : parsed.candidates ?? [];
      candidates = rawCandidates
        .filter((c: Record<string, unknown>) => c.title && c.publicationNumber)
        .slice(0, request.maxResults)
        .map((c: Record<string, unknown>) => ({
          title: String(c.title),
          publicationNumber: String(c.publicationNumber),
          publicationDate: c.publicationDate ? String(c.publicationDate) : undefined,
          summary: String(c.summary ?? ""),
          relevanceScore: Number(c.relevanceScore) || 0,
          recommendationReason: String(c.recommendationReason ?? ""),
          sourceUrl: c.sourceUrl ? String(c.sourceUrl) : undefined
        }));
    } catch {
      logger.warn("Failed to parse LLM filter output as JSON", { rawText: filterRes.text.slice(0, 200) });
    }

    logger.info("Search references completed", {
      caseId: request.caseId,
      query: searchQuery,
      tavilyResults: tavilyRes.results.length,
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

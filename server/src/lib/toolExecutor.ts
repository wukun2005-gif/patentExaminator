/**
 * Tool Executor
 *
 * 职责：
 * 1. Tool Loop — LLM 自主判断何时调用 web_search（最多 3 轮）
 * 2. 跨源融合 — 收集 RAG + Web Search 结果，统一 reranker 排序
 * 3. Re-inject — Top-K 注入 prompt，不带 tools 调 LLM 生成最终回答
 *
 * 流程：所有轮次使用 tool_choice=auto，由 system prompt 引导 LLM 调用搜索。
 * 注：tool_choice=required 会导致部分模型（Gemini/豆包/DeepSeek）返回空响应，
 * 因此改用 auto + prompt 引导的组合策略。
 */
import { logger } from "./logger.js";
import { mcpClient } from "../mcp/mcpClient.js";
import type { ToolDefinition, ToolCall } from "../providers/ProviderAdapter.js";

/** 第 1 轮强制搜索 + 最多 2 轮 LLM 自主判断 = 3 轮 LLM 调用 */
const MAX_TOOL_ROUNDS = 3;

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface ToolExecutorInput {
  /** 原始 system prompt */
  systemPrompt: string;
  /** RAG 增强后的 user prompt */
  userPrompt: string;
  /** RAG 检索到的引用 */
  ragCitations: Array<{ source: string; score: number; excerpt: string }>;
  /** 调 LLM 的回调 — 支持传入 messages（含 tool results）、tools、tool_choice */
  callLLM: (overrides?: {
    messages?: LLMMessage[];
    tools?: ToolDefinition[];
    tool_choice?: "auto" | "none" | "required" | undefined;
  }) => Promise<{ text: string; toolCalls?: ToolCall[] | undefined; error?: { code: string; message: string } | undefined }>;
  /** 模型 ID */
  modelId?: string;
  /** 用于 reranker 的查询文本 */
  query: string;
  /** 远程 reranker 配置（优先使用，失败才 fallback local） */
  rerankerConfig?: { baseUrl: string; apiKey: string; modelId: string };
  /** @deprecated 搜索 API key 已由 MCP server 自己从数据库读取，此字段不再使用 */
  searchApiKey?: string;
}

interface ToolExecutorOutput {
  /** 最终回答文本 */
  answer: string;
  /** Web Search 引用（仅 web，用于向后兼容） */
  webSearchCitations: Array<{ title: string; url: string; snippet: string; engine: string }>;
  /** 合并后的全部引用（RAG + Web，按 reranker 相关性排序） */
  mergedCitations: Array<{ title: string; url: string; snippet: string; engine: string }>;
  /** 工具调用轮次 */
  toolRounds: number;
}

/**
 * 从 MCP server 获取 tool 定义，转为 OpenAI 格式
 */
async function loadMcpTools(): Promise<ToolDefinition[]> {
  const mcpTools = await mcpClient.getTools();
  return mcpTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          Object.entries((t.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>).map(([k, v]) => [k, {
            type: (v.type as string) ?? "string",
            description: (v.description as string) ?? "",
          }])
        ),
        required: (t.inputSchema.required as string[]) ?? [],
      },
    },
  }));
}

/**
 * 执行 tool loop + 跨源融合 + re-inject
 *
 * 流程：
 * 1. 第 1 轮：加载 MCP tools，强制 tool_choice=required 调用搜索
 * 2. 后续轮次：LLM 自主判断是否继续搜索（tool_choice=auto）
 * 3. 无 tool calls → LLM 直接回答，结束 loop
 */
export async function executeWithTools(input: ToolExecutorInput): Promise<ToolExecutorOutput> {
  const { systemPrompt, userPrompt, ragCitations, callLLM, query, rerankerConfig } = input;

  const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const webSearchResults: Array<{ title: string; url: string; snippet: string; engine: string }> = [];
  let toolRounds = 0;
  let finalAnswer = "";
  let tools: ToolDefinition[] = [];

  // 预加载 MCP tools（默认启动搜索，不依赖 LLM 判断）
  try {
    tools = await loadMcpTools();
    logger.info(`[ToolExecutor] MCP tools pre-loaded: ${tools.length} tools available`);
  } catch (err) {
    logger.warn(`[ToolExecutor] MCP tools unavailable, falling back to plain LLM: ${err}`);
    // MCP 不可用时直接调 LLM（不带 tools）
    const fallbackResult = await callLLM({ messages });
    return {
      answer: fallbackResult.text || "",
      webSearchCitations: [],
      mergedCitations: [],
      toolRounds: 0,
    };
  }

  if (tools.length === 0) {
    logger.warn(`[ToolExecutor] No MCP tools registered, falling back to plain LLM`);
    const fallbackResult = await callLLM({ messages });
    return {
      answer: fallbackResult.text || "",
      webSearchCitations: [],
      mergedCitations: [],
      toolRounds: 0,
    };
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 第 1 轮强制搜索，后续轮次 LLM 自主判断
    const toolChoice = round === 0 ? "required" : "auto";
    logger.info(`[ToolExecutor] LLM call #${round + 1} (with tools, tool_choice=${toolChoice})`);

    const result = await callLLM({
      messages,
      tools,
      tool_choice: toolChoice,
    });

    if (result.error) {
      logger.warn(`[ToolExecutor] LLM error in round ${round + 1}: ${result.error.message}`);
      finalAnswer = result.text || "";
      break;
    }

    // 无 tool calls → LLM 决定直接回答
    if (!result.toolCalls || result.toolCalls.length === 0) {
      logger.info(`[ToolExecutor] LLM returned direct answer (no tool calls)`);
      finalAnswer = result.text;
      break;
    }

    // 执行工具
    toolRounds++;
    messages.push({ role: "assistant", content: result.text || "" });

    for (const tc of result.toolCalls) {
      logger.info(`[ToolExecutor] Executing tool: ${tc.function.name}`);
      try {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        const toolResult = await mcpClient.callTool(tc.function.name, args);

        // 解析搜索结果
        if (tc.function.name === "web_search" && toolResult.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(toolResult.content[0].text) as {
              engine?: string;
              results?: Array<{ title: string; url: string; content: string }>;
            };
            if (parsed.results) {
              for (const r of parsed.results) {
                webSearchResults.push({
                  title: r.title,
                  url: r.url,
                  snippet: r.content,
                  engine: parsed.engine ?? "unknown",
                });
              }
            }
          } catch (parseErr) { logger.debug(`[ToolExecutor] Tool result not JSON, using raw text: ${parseErr}`); }
        }

        messages.push({
          role: "tool",
          content: toolResult.content?.[0]?.text ?? "No result",
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      } catch (err) {
        logger.warn(`[ToolExecutor] Tool ${tc.function.name} failed: ${err}`);
        messages.push({
          role: "tool",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
    }
  }

  // Step 3: 跨源融合排序（先融合，再 re-inject）
  const totalCandidates = ragCitations.length + webSearchResults.length;
  logger.info(`[ToolExecutor] 跨源融合: RAG=${ragCitations.length} + Web=${webSearchResults.length} = ${totalCandidates} 候选`);
  const citations = totalCandidates > 0
    ? await fuseAndRank(query, ragCitations, webSearchResults, rerankerConfig)
    : [];

  // Step 4: 注入 Top-K 文档后调 LLM（不带 tools），强制要求引用标注
  // 全部结果（RAG + Web）按 reranker 相关性统一编号 [1]-[N]
  // 即使 LLM 在 tool loop 中已返回直接回答，仍需 re-inject 以确保 [N] 引用标记
  if (toolRounds > 0 && citations.length > 0) {
    logger.info(`[ToolExecutor] Re-inject: injecting ${citations.length} docs (unified ranking), final call without tools`);
    const docsSection = citations
      .map((c, i) => {
        const link = c.url ? `[${c.title}](${c.url})` : c.title;
        const tag = c.engine === "rag" ? "（知识库）" : "（网络搜索）";
        return `[${i + 1}] ${tag} ${link}\n${c.snippet}`;
      })
      .join("\n\n");
    const citationInstructions = [
      "## 参考文档（按相关性排序）",
      "",
      docsSection,
      "",
      "## 回答要求（必须严格遵守）",
      "",
      "**最重要：每句话结尾必须标注来源编号 [N]！**",
      "",
      "示例格式：",
      "- USPTO于2026年4月1日发布了新指南，确立了预审程序 [1]",
      "- 该程序适用于2026年4月5日之后提交的复审请求 [1][3]",
      "- 专利权人可在30天内提交书面意见 [6]",
      "",
      "规则：",
      "1. 基于参考文档回答，不编造信息",
      "2. 每句话末尾用 [N] 标注来源",
      "3. [N] 对应上方文档序号",
      "4. 无相关信息时说明'参考文档中未找到'",
    ];

    if (finalAnswer) {
      // LLM 已返回直接回答 → 让它基于已有回答添加引用标记
      messages.push({
        role: "user",
        content: [
          ...citationInstructions,
          "",
          "## 你之前的回答（需要添加引用标记）",
          "",
          finalAnswer,
          "",
          "请基于上方参考文档，为你的回答中的每句话添加 [N] 引用标记后重新输出完整回答：",
        ].join("\n"),
      });
    } else {
      // LLM 未返回回答 → 从头回答
      messages.push({
        role: "user",
        content: [
          ...citationInstructions,
          "",
          "请回答用户的问题：",
        ].join("\n"),
      });
    }
    const finalResult = await callLLM({ messages });
    finalAnswer = finalResult.text;
  }

  logger.info(`[ToolExecutor] Done: toolRounds=${toolRounds}, webResults=${webSearchResults.length}, mcpTools=${tools.length}, answerLen=${finalAnswer.length}`);

  return {
    answer: finalAnswer,
    webSearchCitations: citations.filter((c) => c.engine !== "rag"),
    mergedCitations: citations,
    toolRounds,
  };
}

// ── 跨源融合排序 ──────────────────────────────────────

interface FusedCitation {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

/**
 * 跨源融合：RAG + Web Search 结果合并后用 reranker 排序
 *
 * 优先级：远程 reranker API → 本地 cross-encoder → 本地启发式算法
 */
async function fuseAndRank(
  query: string,
  ragCitations: Array<{ source: string; score: number; excerpt: string }>,
  webResults: Array<{ title: string; url: string; snippet: string; engine: string }>,
  rerankerConfig?: { baseUrl: string; apiKey: string; modelId: string }
): Promise<FusedCitation[]> {
  // Web Search 去重
  const seen = new Set<string>();
  const uniqueWeb: FusedCitation[] = [];
  for (const r of webResults) {
    const key = r.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueWeb.push(r);
    }
  }

  // RAG 结果转为统一格式
  const ragAsFused: FusedCitation[] = ragCitations.map((c) => ({
    title: c.source,
    url: "",
    snippet: c.excerpt,
    engine: "rag",
  }));

  // 合并所有结果
  const allResults = [...ragAsFused, ...uniqueWeb];
  const TOP_K = 10;

  // 转为 reranker 输入格式（base score 统一为 0，让 reranker 完全自主判断相关性）
  const rerankInput = allResults.map((r, i) => ({
    chunkId: `fusion_${i}`,
    text: `${r.title} ${r.snippet}`,
    metadata: { engine: r.engine, url: r.url },
    score: 0,
  }));

  // 优先级 1：远程 reranker API
  if (rerankerConfig) {
    try {
      const rerankUrl = rerankerConfig.baseUrl.endsWith("/v1")
        ? `${rerankerConfig.baseUrl}/rerank`
        : `${rerankerConfig.baseUrl}/v1/rerank`;
      const documents = rerankInput.map((r) => r.text);
      logger.info(`[Rerank] 远程 Rerank: ${documents.length} 候选, model=${rerankerConfig.modelId}`);
      const res = await fetch(rerankUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${rerankerConfig.apiKey}` },
        body: JSON.stringify({ model: rerankerConfig.modelId, query, documents, top_n: TOP_K }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json() as { results: Array<{ index: number; relevance_score: number }> };
        const reranked = data.results
          .filter((r) => r.index >= 0 && r.index < allResults.length)
          .map((r) => allResults[r.index])
          .filter(Boolean);
        logger.info(`[Rerank] 远程 Rerank 完成: ${reranked.length} 结果`);
        return reranked.slice(0, TOP_K);
      }
      logger.warn(`[Rerank] 远程 Rerank 失败 (${res.status})，降级到本地`);
    } catch (err) {
      logger.warn(`[Rerank] 远程 Rerank 错误，降级到本地: ${err}`);
    }
  }

  // 优先级 2：本地 cross-encoder
  try {
    const { crossEncoderRerank } = await import("./reranker.js");
    const reranked = await crossEncoderRerank(rerankInput, query);
    if (reranked.length > 0) {
      logger.info(`[Rerank] Cross-encoder 完成: ${reranked.length} 结果`);
      return reranked
        .slice(0, TOP_K)
        .map((r) => allResults[parseInt(r.chunkId.replace("fusion_", ""))])
        .filter(Boolean);
    }
  } catch (err) {
    logger.warn(`[Rerank] Cross-encoder 失败，降级到启发式: ${err}`);
  }

  // 优先级 3：本地启发式算法
  try {
    const { localRerank } = await import("./reranker.js");
    const reranked = localRerank(rerankInput, query);
    return reranked
      .slice(0, TOP_K)
      .map((r) => allResults[parseInt(r.chunkId.replace("fusion_", ""))])
      .filter(Boolean);
  } catch (err) {
    logger.warn(`[Rerank] 所有 reranker 失败，按引擎优先级排序: ${err}`);
    const enginePriority: Record<string, number> = { google: 0, bing: 1, baidu: 2, unknown: 3, rag: -1 };
    allResults.sort((a, b) => (enginePriority[a.engine] ?? 3) - (enginePriority[b.engine] ?? 3));
    return allResults.slice(0, TOP_K);
  }
}

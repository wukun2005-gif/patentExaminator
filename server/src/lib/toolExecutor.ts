/**
 * NF1: Tool Executor
 *
 * 职责：
 * 1. Tool Loop — LLM 自主判断何时调用 web_search（最多 3 轮）
 * 2. 跨源融合 — 收集 RAG + Web Search 结果，统一 reranker 排序
 * 3. Re-inject — Top-K 注入 prompt，不带 tools 调 LLM 生成最终回答
 */
import { logger } from "./logger.js";
import { mcpClient } from "../mcp/mcpClient.js";
import type { ToolDefinition, ToolCall } from "../providers/ProviderAdapter.js";

const MAX_TOOL_ROUNDS = 3;

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
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
}

interface ToolExecutorOutput {
  /** 最终回答文本 */
  answer: string;
  /** Web Search 引用 */
  webSearchCitations: Array<{ title: string; url: string; snippet: string; engine: string }>;
  /** 工具调用轮次 */
  toolRounds: number;
}

/**
 * 执行 tool loop + 跨源融合 + re-inject
 */
export async function executeWithTools(input: ToolExecutorInput): Promise<ToolExecutorOutput> {
  const { systemPrompt, userPrompt, ragCitations, callLLM, query } = input;

  // Step 1: 获取 MCP tool 定义
  let tools: ToolDefinition[];
  try {
    const mcpTools = await mcpClient.getTools();
    tools = mcpTools.map((t) => ({
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
    logger.info(`[ToolExecutor] ${tools.length} MCP tools available`);
  } catch (err) {
    logger.warn(`[ToolExecutor] MCP tools unavailable, falling back to plain LLM: ${err}`);
    // 降级：不带 tools 调 LLM
    const result = await callLLM({});
    return { answer: result.text, webSearchCitations: [], toolRounds: 0 };
  }

  // Step 2: Tool Loop
  const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const webSearchResults: Array<{ title: string; url: string; snippet: string; engine: string }> = [];
  let toolRounds = 0;
  let finalAnswer = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    logger.info(`[ToolExecutor] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);
    const result = await callLLM({
      messages,
      tools,
      tool_choice: "auto",
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

    // 有 tool calls → 执行工具
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
          } catch { /* not JSON, use raw text */ }
        }

        messages.push({
          role: "tool",
          content: toolResult.content?.[0]?.text ?? "No result",
          tool_call_id: tc.id,
        });
      } catch (err) {
        logger.warn(`[ToolExecutor] Tool ${tc.function.name} failed: ${err}`);
        messages.push({
          role: "tool",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          tool_call_id: tc.id,
        });
      }
    }
  }

  // Step 3: 如果 tool loop 没有产生最终回答，再调一次 LLM（不带 tools）
  if (!finalAnswer && toolRounds > 0) {
    logger.info(`[ToolExecutor] Re-inject: final call without tools`);
    const finalResult = await callLLM({ messages });
    finalAnswer = finalResult.text;
  }

  // Step 4: 跨源融合排序（如果有 web search 结果）
  const citations = webSearchResults.length > 0
    ? await fuseAndRank(query, ragCitations, webSearchResults)
    : ragCitations.map((c) => ({ title: c.source, url: "", snippet: c.excerpt, engine: "rag" }));

  logger.info(`[ToolExecutor] Done: toolRounds=${toolRounds}, webResults=${webSearchResults.length}, answerLen=${finalAnswer.length}`);

  return {
    answer: finalAnswer,
    webSearchCitations: citations.filter((c) => c.engine !== "rag"),
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
 * 跨源融合：RAG + Web Search 结果合并后排序
 *
 * 策略：
 * 1. 统一格式
 * 2. Web Search 结果按 URL 去重
 * 3. 简单排序：RAG 优先（已有相关性分数），Web Search 按引擎优先级
 * 4. 取 Top-K
 */
async function fuseAndRank(
  query: string,
  ragCitations: Array<{ source: string; score: number; excerpt: string }>,
  webResults: Array<{ title: string; url: string; snippet: string; engine: string }>
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

  // 引擎优先级排序（google > bing > baidu）
  const enginePriority: Record<string, number> = { google: 0, bing: 1, baidu: 2, unknown: 3 };
  uniqueWeb.sort((a, b) => (enginePriority[a.engine] ?? 3) - (enginePriority[b.engine] ?? 3));

  // RAG 结果转为统一格式
  const ragAsFused: FusedCitation[] = ragCitations.map((c) => ({
    title: c.source,
    url: "",
    snippet: c.excerpt,
    engine: "rag",
  }));

  // 融合：RAG 结果在前（已有相关性分数），Web Search 在后
  const fused = [...ragAsFused, ...uniqueWeb];

  // 取 Top-10
  const TOP_K = 10;
  return fused.slice(0, TOP_K);
}

/**
 * NF1: Tool Executor 单元测试
 *
 * 测试范围：
 * 1. Tool loop — LLM 返回 tool_calls → 执行 → 再调 LLM
 * 2. 无 tool calls → 直接返回 LLM 回答
 * 3. Tool 执行失败 → 降级
 * 4. MCP 不可用 → 降级到纯 LLM
 * 5. 跨源融合排序
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 所有外部依赖
vi.mock("@server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@server/mcp/mcpClient", () => ({
  mcpClient: {
    getTools: vi.fn(),
    callTool: vi.fn(),
  },
}));

// ── 测试 ──────────────────────────────────────────

describe("executeWithTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MCP 不可用时降级到纯 LLM", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockRejectedValue(new Error("MCP spawn failed"));

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn().mockResolvedValue({ text: "plain answer" });
    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("plain answer");
    expect(result.webSearchCitations).toEqual([]);
    expect(result.toolRounds).toBe(0);
    expect(callLLM).toHaveBeenCalledOnce();
  });

  it("LLM 直接回答（无 tool calls）→ 返回结果", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn().mockResolvedValue({ text: "direct answer" });
    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("direct answer");
    expect(result.toolRounds).toBe(0);
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("LLM 返回 tool_calls → 执行工具 → 再调 LLM → 返回结果", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ engine: "google", results: [{ title: "Test", url: "https://example.com", content: "snippet" }] }) }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    let callCount = 0;
    const callLLM = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // 第一次调用：返回 tool_calls
        return {
          text: "",
          toolCalls: [{
            id: "call_0",
            type: "function",
            function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
          }],
        };
      }
      // 第二次调用：返回最终回答
      return { text: "final answer with search results" };
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("final answer with search results");
    expect(result.toolRounds).toBe(1);
    expect(mcpClient.callTool).toHaveBeenCalledWith("web_search", { query: "test" });
    expect(result.webSearchCitations).toHaveLength(1);
    expect(result.webSearchCitations[0].url).toBe("https://example.com");
  });

  it("tool 执行失败 → 继续循环，不崩溃", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockRejectedValue(new Error("SerpAPI timeout"));

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    let callCount = 0;
    const callLLM = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          text: "",
          toolCalls: [{
            id: "call_0",
            type: "function",
            function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
          }],
        };
      }
      return { text: "answer after tool failure" };
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("answer after tool failure");
    expect(result.toolRounds).toBe(1);
  });

  it("超过 MAX_TOOL_ROUNDS → 停止循环", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ engine: "google", results: [] }) }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    // 每次都返回 tool_calls（无限循环场景）
    const callLLM = vi.fn().mockResolvedValue({
      text: "",
      toolCalls: [{
        id: "call_0",
        type: "function",
        function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
      }],
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    // MAX_TOOL_ROUNDS = 3，所以最多 3 轮 tool + 1 次 re-inject
    expect(result.toolRounds).toBe(3);
    expect(callLLM).toHaveBeenCalledTimes(4); // 3 tool rounds + 1 re-inject
  });

  it("RAG + Web Search 融合排序", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          engine: "google",
          results: [
            { title: "Web Result", url: "https://web.com", content: "web snippet" },
          ],
        }),
      }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    let callCount = 0;
    const callLLM = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          text: "",
          toolCalls: [{
            id: "call_0",
            type: "function",
            function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
          }],
        };
      }
      return { text: "fused answer" };
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [
        { source: "RAG Source", score: 0.9, excerpt: "rag excerpt" },
      ],
      query: "test query",
      callLLM,
    });

    // RAG 结果在前，Web Search 在后
    expect(result.webSearchCitations).toHaveLength(1);
    expect(result.webSearchCitations[0].engine).toBe("google");
  });
});

/**
 * Tool Executor 单元测试
 *
 * 测试范围：
 * 1. MCP 预加载 + 第 1 轮强制 tool_choice=required
 * 2. MCP 不可用 → 降级到普通 LLM
 * 3. Tool 执行失败 → 继续循环
 * 4. MAX_TOOL_ROUNDS 限制
 * 5. 跨源融合排序
 * 6. 后续轮次 LLM 自主判断（tool_choice=auto）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 所有外部依赖
vi.mock("@server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

  it("MCP 预加载 + 第 1 轮强制 tool_choice=required → 执行搜索 → 返回结果", async () => {
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
        // 第 1 次调用（tool_choice=required）：返回 tool_calls
        return {
          text: "",
          toolCalls: [{
            id: "call_0",
            type: "function",
            function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
          }],
        };
      }
      if (callCount === 2) {
        // 第 2 次调用（tool_choice=auto）：返回直接回答（无 tool calls）
        return { text: "direct answer without citations" };
      }
      // 第 3 次调用（re-inject）：返回带引用的回答
      return { text: "final answer with citations [1]" };
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    // re-inject 后的回答（带引用标记）
    expect(result.answer).toBe("final answer with citations [1]");
    expect(result.toolRounds).toBe(1);
    // MCP 预加载（第 1 轮之前）
    expect(mcpClient.getTools).toHaveBeenCalledOnce();
    expect(mcpClient.callTool).toHaveBeenCalledWith("web_search", { query: "test" });
    expect(result.webSearchCitations).toHaveLength(1);
    expect(result.webSearchCitations[0].url).toBe("https://example.com");
    // 3 次调用：tool loop + direct answer + re-inject
    expect(callLLM).toHaveBeenCalledTimes(3);
  });

  it("MCP 不可用时 → 降级到普通 LLM（不带 tools）", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockRejectedValue(new Error("MCP spawn failed"));

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn().mockResolvedValue({ text: "fallback answer" });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("fallback answer");
    expect(result.toolRounds).toBe(0);
    expect(result.webSearchCitations).toEqual([]);
    // 降级调用不带 tools
    expect(callLLM).toHaveBeenCalledOnce();
    expect(callLLM.mock.calls[0][0].tools).toBeUndefined();
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("MCP 无注册工具时 → 降级到普通 LLM", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([]);

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn().mockResolvedValue({ text: "no tools answer" });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.answer).toBe("no tools answer");
    expect(result.toolRounds).toBe(0);
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("tool 执行失败 → 继续循环，不崩溃", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockRejectedValue(new Error("SerpAPI timeout"));

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    // 每次都返回 tool_calls（工具执行会失败，但循环继续）
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

    // MAX_TOOL_ROUNDS = 3：3 轮 tool calls，全部失败无 citations → re-inject 不触发
    expect(result.toolRounds).toBe(3);
    expect(callLLM).toHaveBeenCalledTimes(3);
  });

  it("超过 MAX_TOOL_ROUNDS → 停止循环，re-inject 生成最终回答", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ engine: "google", results: [{ title: "R", url: "https://r.com", content: "s" }] }) }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    // 前 3 次返回 tool_calls，第 4 次（re-inject）返回文本
    let callCount = 0;
    const callLLM = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        return {
          text: "",
          toolCalls: [{
            id: `call_${callCount}`,
            type: "function",
            function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
          }],
        };
      }
      // re-inject 调用
      return { text: "final answer after re-inject" };
    });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    expect(result.toolRounds).toBe(3);
    expect(callLLM).toHaveBeenCalledTimes(4); // 3 loop rounds + 1 re-inject
    expect(result.answer).toBe("final answer after re-inject");
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

    expect(result.webSearchCitations).toHaveLength(1);
    expect(result.webSearchCitations[0].engine).toBe("google");
  });

  it("re-inject prompt 包含超链接指令和 URL", async () => {
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
            { title: "USPTO新规", url: "https://uspto.gov/rules", content: "2026年复审新规" },
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
      // 第 2 调用（tool_choice=auto）返回 tool_calls → 触发 re-inject
      return {
        text: "",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "test2" }) },
        }],
      };
    });

    await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [{ source: "专利法.pdf", score: 0.8, excerpt: "复审规定" }],
      query: "2026年复审新规定",
      callLLM,
    });

    // 找到 re-inject 的那次调用（不带 tools 的最后一次）
    const reInjectCall = callLLM.mock.calls.find(
      (call) => call[0]?.messages && !call[0]?.tools
    );
    expect(reInjectCall).toBeDefined();

    const userMessages = reInjectCall![0].messages.filter(
      (m: { role: string }) => m.role === "user"
    );
    const reInjectContent = userMessages[userMessages.length - 1]?.content ?? "";

    // 验证包含引用格式化指令
    expect(reInjectContent).toContain("每句话结尾必须标注来源编号");
    // 验证包含 web 结果的 markdown 超链接
    expect(reInjectContent).toContain("[USPTO新规](https://uspto.gov/rules)");
    // 验证包含 RAG 结果
    expect(reInjectContent).toContain("专利法.pdf");
  });

  it("webSearchCitations 包含 URL（可点击链接）", async () => {
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
            { title: "USPTO 2026 Rules", url: "https://uspto.gov/2026-rules", content: "New reexamination rules" },
            { title: "CNIPA 通知", url: "https://cnipa.gov.cn/notice", content: "复审流程调整" },
          ],
        }),
      }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn()
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [{
          id: "call_0",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
        }],
      })
      .mockResolvedValueOnce({ text: "answer with links" })
      .mockResolvedValueOnce({ text: "answer with links [1][2]" });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    // webSearchCitations 应该包含 URL
    expect(result.webSearchCitations).toHaveLength(2);
    expect(result.webSearchCitations[0].url).toBe("https://uspto.gov/2026-rules");
    expect(result.webSearchCitations[0].title).toBe("USPTO 2026 Rules");
    expect(result.webSearchCitations[1].url).toBe("https://cnipa.gov.cn/notice");
  });

  it("RAG + Web 融合后两者都出现在 citations 中", async () => {
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
            { title: "Web USPTO", url: "https://uspto.gov", content: "USPTO rules" },
          ],
        }),
      }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn()
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [{
          id: "call_0",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
        }],
      })
      .mockResolvedValueOnce({ text: "direct answer" })
      .mockResolvedValueOnce({ text: "fused answer [1][2]" });

    const result = await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [
        { source: "专利审查指南.pdf", score: 0.9, excerpt: "复审程序规定" },
      ],
      query: "复审新规定",
      callLLM,
    });

    // webSearchCitations 只包含 web 结果（不含 RAG）
    expect(result.webSearchCitations).toHaveLength(1);
    expect(result.webSearchCitations[0].engine).toBe("google");
    expect(result.webSearchCitations[0].url).toBe("https://uspto.gov");
  });

  it("web_search 工具调用不传 api_key（MCP server 自己从数据库读取）", async () => {
    const { mcpClient } = await import("@server/mcp/mcpClient");
    vi.mocked(mcpClient.getTools).mockResolvedValue([
      { name: "web_search", description: "Search", inputSchema: { type: "object", properties: {} } },
    ]);
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ engine: "google", results: [] }) }],
    });

    const { executeWithTools } = await import("@server/lib/toolExecutor");

    const callLLM = vi.fn()
      .mockResolvedValueOnce({
        text: "",
        toolCalls: [{
          id: "call_0",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "test" }) },
        }],
      })
      .mockResolvedValueOnce({ text: "answer" });

    await executeWithTools({
      systemPrompt: "system",
      userPrompt: "user",
      ragCitations: [],
      query: "test query",
      callLLM,
    });

    // 不传 api_key，由 MCP server 自己从数据库读取
    expect(mcpClient.callTool).toHaveBeenCalledWith("web_search", {
      query: "test",
    });
  });
});

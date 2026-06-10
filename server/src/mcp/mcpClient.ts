/**
 * NF1: MCP Client
 *
 * 管理 Web Search MCP Server 子进程的生命周期。
 * 单例模式：整个 server 生命周期复用一个 MCP 子进程。
 * 子进程崩溃后下次调用自动重新 spawn。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "../lib/logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

class McpClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private spawning = false;
  private toolsCache: McpToolDefinition[] | null = null;

  /**
   * 确保 MCP 子进程已启动，返回可用的 tool 定义列表
   */
  async getTools(): Promise<McpToolDefinition[]> {
    if (this.toolsCache && this.client) {
      return this.toolsCache;
    }

    await this.ensureConnected();
    const result = await this.client!.listTools();
    this.toolsCache = result.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    logger.info(`[MCP Client] ${this.toolsCache.length} tools available: ${this.toolsCache.map((t) => t.name).join(", ")}`);
    return this.toolsCache;
  }

  /**
   * 调用 MCP tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.ensureConnected();
    logger.info(`[MCP Client] Calling tool: ${name}, args=${JSON.stringify(args).slice(0, 200)}`);
    const result = await this.client!.callTool({ name, arguments: args });
    logger.info(`[MCP Client] Tool ${name} returned: isError=${result.isError ?? false}`);
    return result as McpToolResult;
  }

  /**
   * 关闭 MCP 子进程
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch { /* ignore */ }
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch { /* ignore */ }
      this.transport = null;
    }
    this.toolsCache = null;
    logger.info("[MCP Client] Closed");
  }

  /**
   * 确保已连接。子进程崩溃时自动重新 spawn。
   */
  private async ensureConnected(): Promise<void> {
    if (this.client && this.transport) {
      // 心跳检查：调用 listTools 验证连接是否存活
      try {
        await this.client.listTools();
        return;
      } catch {
        logger.warn("[MCP Client] Connection lost, respawning...");
        this.client = null;
        this.transport = null;
        this.toolsCache = null;
      }
    }

    // 防止并发 spawn
    if (this.spawning) {
      while (this.spawning) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.spawning = true;
    try {
      await this.spawnServer();
    } finally {
      this.spawning = false;
    }
  }

  private async spawnServer(): Promise<void> {
    // MCP server 源码位置（开发模式用 tsx 直接运行 TypeScript）
    const serverSrcPath = path.resolve(__dirname, "./web-search-server.ts");
    const serverDistPath = path.resolve(__dirname, "../../dist/server/src/mcp/web-search-server.js");
    logger.info(`[MCP Client] Spawning server: src=${serverSrcPath}`);

    // 不传 key 给子进程 — 符合 CLAUDE.md 两类 Key 严格隔离
    // API key 只通过 per-request api_key 参数传入（toolExecutor → callTool → args.api_key）

    // 优先用编译后的 JS，回退到 tsx 直接运行 TS
    const { existsSync } = await import("fs");
    const useDist = existsSync(serverDistPath);
    const command = useDist ? "node" : "npx";
    const args = useDist ? [serverDistPath] : ["tsx", serverSrcPath];
    logger.info(`[MCP Client] Using ${useDist ? "compiled JS" : "tsx (dev mode)"}: ${useDist ? serverDistPath : serverSrcPath}`);

    // 传递数据库路径给 MCP 子进程（用 __dirname 算绝对路径，不依赖 cwd）
    const dbPath = path.resolve(__dirname, "../../data/patent-examiner.db");
    logger.info(`[MCP Client] DB_PATH for subprocess: ${dbPath}`);

    this.transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, DB_PATH: dbPath },
    });

    this.client = new Client(
      { name: "patent-examiner", version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    logger.info("[MCP Client] Connected to MCP server");
  }
}

// 单例
export const mcpClient = new McpClientManager();

/**
 * 将 MCP tool 定义转换为 OpenAI ToolDefinition 格式
 */
export function mcpToolsToOpenAI(tools: McpToolDefinition[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

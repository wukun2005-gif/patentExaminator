/**
 * 知识库 Prompt 注入器 — 在 Agent 调用前注入检索到的知识
 */
import type { KnowledgeConfig } from "@shared/types/knowledge";
import type { EmbedderConfig } from "./embedder";
import { retrieve, formatRetrievedChunks } from "./retriever";
import { createLogger } from "../logger";

const log = createLogger("KnowledgePromptInjector");

export interface InjectOptions {
  /** 检索 query 文本 */
  query: string;
  /** 原始 system prompt */
  systemPrompt: string;
  /** 知识库配置 */
  config: KnowledgeConfig;
  /** embedding 配置 */
  embedConfig: EmbedderConfig;
}

/**
 * 检索相关知识并注入到 system prompt 尾部
 * 返回注入后的完整 system prompt
 */
export async function injectKnowledge(options: InjectOptions): Promise<string> {
  const { query, systemPrompt, config, embedConfig } = options;

  if (!config.enabled) {
    return systemPrompt;
  }

  try {
    const results = await retrieve({ query }, config, embedConfig);

    if (results.length === 0) {
      log("No relevant knowledge found, returning original prompt");
      return systemPrompt;
    }

    const injection = formatRetrievedChunks(results);
    const enhanced = `${systemPrompt}\n\n${injection}`;

    log(`Injected ${results.length} knowledge chunks into prompt`);
    return enhanced;
  } catch (err) {
    log(`Knowledge injection failed, falling back to original prompt: ${err}`);
    return systemPrompt;
  }
}

/**
 * 从 Agent 请求数据中提取检索 query
 * 不同 Agent 使用不同的字段作为 query
 */
export function extractQueryFromRequest(
  agentType: string,
  request: Record<string, unknown>
): string {
  switch (agentType) {
    case "novelty": {
      const features = request.features as Array<{ description?: string }> | undefined;
      return features?.map((f) => f.description).filter(Boolean).join(" ") ?? "";
    }
    case "inventive": {
      const features = request.features as Array<{ description?: string }> | undefined;
      return features?.map((f) => f.description).filter(Boolean).join(" ") ?? "";
    }
    case "opinion-analysis": {
      return (request.opinionText as string) ?? "";
    }
    case "argument-analysis": {
      return (request.argumentText as string) ?? "";
    }
    case "reexam-draft": {
      return (request.summaryText as string) ?? "";
    }
    case "claim-chart": {
      const claims = request.claims as Array<{ rawText?: string }> | undefined;
      return claims?.map((c) => c.rawText).filter(Boolean).join(" ") ?? "";
    }
    case "defects": {
      return (request.claimText as string) ?? "";
    }
    default:
      return "";
  }
}

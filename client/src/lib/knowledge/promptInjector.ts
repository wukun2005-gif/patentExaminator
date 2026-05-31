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
  /** Agent 类型（用于定制注入格式） */
  agentType?: string;
}

/**
 * 检索相关知识并注入到 system prompt 尾部
 * 返回注入后的完整 system prompt
 */
/** 根据 Agent 类型生成注入上下文前缀 */
function getAgentContext(agentType?: string): string {
  switch (agentType) {
    case "novelty":
      return "以下法规段落与新颖性判断相关，请参考其中的对比规则和公开标准：";
    case "inventive":
      return "以下法规段落与创造性判断相关，请参考三步法审查标准和技术启示判断规则：";
    case "opinion-analysis":
      return "以下法规段落与审查意见解析相关，请参考驳回理由的法律依据：";
    case "argument-analysis":
      return "以下法规段落与答辩理由评估相关，请参考审查标准和法律依据：";
    case "reexam-draft":
      return "以下法规段落与复审意见草稿相关，请参考复审程序规定和审查标准：";
    case "claim-chart":
      return "以下法规段落与权利要求解释相关，请参考权利要求撰写和解释规则：";
    case "defects":
      return "以下法规段落与形式缺陷检查相关，请参考说明书和权利要求书的要求：";
    default:
      return "以下段落与当前分析内容相关，请在回答时参考但不仅限于此：";
  }
}

export async function injectKnowledge(options: InjectOptions): Promise<string> {
  const { query, systemPrompt, config, embedConfig, agentType } = options;

  if (!config.enabled) {
    return systemPrompt;
  }

  try {
    const results = await retrieve({ query }, config, embedConfig);

    if (results.length === 0) {
      log("No relevant knowledge found, returning original prompt");
      return systemPrompt;
    }

    const contextPrefix = getAgentContext(agentType);
    const injection = `## 参考法规（由知识库检索，仅供参考）\n${contextPrefix}\n\n${formatRetrievedChunks(results).replace(/^[^\n]+\n[^\n]+\n/, "")}`;
    const enhanced = `${systemPrompt}\n\n${injection}`;

    log(`Injected ${results.length} knowledge chunks into prompt (agent=${agentType ?? "default"})`);
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

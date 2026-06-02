/**
 * 知识库 Prompt 注入器 — 在 Agent 调用前注入检索到的知识
 */
import type { KnowledgeConfig } from "@shared/types/knowledge";
import { retrieve, formatRetrievedChunks } from "./retriever";
import { createLogger } from "../logger";

const log = createLogger("KnowledgePromptInjector");

// 最近一次注入的引用详情
let lastCitations: Array<{ source: string; score: number; excerpt: string }> = [];

/** 获取最近一次注入的引用详情 */
export function getInjectionCitations(): Array<{ source: string; score: number; excerpt: string }> {
  return [...lastCitations];
}

// 注入审计日志
interface InjectionAudit {
  timestamp: string;
  agentType: string;
  query: string;
  chunkCount: number;
  chunkIds: string[];
  totalChars: number;
}

const auditLog: InjectionAudit[] = [];
const MAX_AUDIT_LOG = 100;

function recordAudit(agentType: string, query: string, results: Array<{ chunk: { id: string; text: string } }>) {
  const entry: InjectionAudit = {
    timestamp: new Date().toISOString(),
    agentType,
    query: query.slice(0, 200),
    chunkCount: results.length,
    chunkIds: results.map((r) => r.chunk.id),
    totalChars: results.reduce((sum, r) => sum + r.chunk.text.length, 0),
  };
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG) auditLog.shift();
}

/** 获取注入审计日志 */
export function getInjectionAuditLog(): InjectionAudit[] {
  return [...auditLog];
}

export interface InjectOptions {
  /** 检索 query 文本 */
  query: string;
  /** 原始 system prompt */
  systemPrompt: string;
  /** 知识库配置 */
  config: KnowledgeConfig;
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
  const { query, systemPrompt, config, agentType } = options;

  if (!config.enabled) {
    return systemPrompt;
  }

  try {
    const results = await retrieve({ query }, config);

    if (results.length === 0) {
      log("No relevant knowledge found, returning original prompt");
      return systemPrompt;
    }

    const contextPrefix = getAgentContext(agentType);
    const citationBlock = results.map((r) => {
      const source = r.chunk.metadata.sectionId ?? r.chunk.metadata.articleId ?? r.chunk.metadata.fileName;
      return `[来源: ${source}] ${r.chunk.text.slice(0, 300)}`;
    }).join("\n\n");

    const injection = `## 参考法规（由知识库自动检索，作为回答的依据）

${contextPrefix}

${citationBlock}

## 引用要求
- 回答时**必须引用上述参考法规的具体条文**作为依据
- 引用格式：在相关论述后标注【来源：文件名 章节/条文号】
- 如果参考法规中没有直接相关的内容，明确说明"参考法规中未找到直接依据"
- 不要编造参考法规中没有的内容`;
    const enhanced = `${systemPrompt}\n\n${injection}`;

    // 记录引用详情
    lastCitations = results.map((r) => ({
      source: r.chunk.metadata.sectionId ?? r.chunk.metadata.articleId ?? r.chunk.metadata.fileName,
      score: r.score,
      excerpt: r.chunk.text.slice(0, 150),
    }));

    recordAudit(agentType ?? "unknown", query, results);
    log(`Injected ${results.length} knowledge chunks into prompt (agent=${agentType ?? "default"})`);
    return enhanced;
  } catch (err) {
    log(`Knowledge injection failed, falling back to original prompt: ${err}`);
    return systemPrompt;
  }
}

/**
 * 主动注入：面板加载时预取相关法规，不等 Agent 调用
 * 返回检索到的 chunk 文本，可直接显示在 UI 中
 */
export async function proactiveInject(
  agentType: string,
  contextText: string,
  config: KnowledgeConfig
): Promise<string> {
  if (!config.enabled || !contextText) return "";

  try {
    const results = await retrieve({ query: contextText }, config);
    if (results.length === 0) return "";

    const contextPrefix = getAgentContext(agentType);
    return `## 参考法规（预加载）\n${contextPrefix}\n\n${formatRetrievedChunks(results, 2000).replace(/^[^\n]+\n[^\n]+\n/, "")}`;
  } catch (e) {
    log("preloadKnowledge error:", e);
    return "";
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

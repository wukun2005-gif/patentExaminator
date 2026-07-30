/**
 * HyDE (Hypothetical Document Embeddings) — 假设性文档嵌入
 * 论文：Gao et al., "Precise Zero-Shot Dense Retrieval without Relevance Labels" (arXiv:2212.10496)
 *
 * 业界标准的零样本稠密检索增强技术（LangChain/LlamaIndex 均有内置实现）：
 * LLM 先将 query 改写成一段"假设答案"，再用假设答案的 embedding 去做向量检索。
 *
 * 解决的问题（回声问题）：query 是问句文体、知识库 chunk 中可能含有与 query
 * 逐字相同的问句（FAQ/标题），相同文本的 embedding 完全相同（cosine=1.0），
 * 会把真正含答案的 chunk 挤出 top-K。HyDE 把检索对象从"问句文体"换成"答案文体"，
 * 问句 chunk 与假设答案的相似度天然低于真实答案 chunk。
 *
 * 降级策略：任何一步失败都返回 null，调用方退回原始 query 向量检索（不阻断 RAG）。
 */
import { logger } from "./logger.js";
import type { ChatRequest } from "../providers/ProviderAdapter.js";

// ── 类型定义 ──────────────────────────────────────────

export interface HydeConfig {
  apiKey?: string | undefined;
  providerPreference?: string[] | undefined;
  modelId?: string | undefined;
  modelFallbacks?: Record<string, string[]> | undefined;
  enableModelFallback?: Record<string, boolean> | undefined;
  providerBaseUrls?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}

// ── Prompt 构造 ───────────────────────────────────────

/**
 * HyDE 标准 prompt（论文 web search 模板 "Please write a passage to answer the question"
 * 的专利法律域适配版）。生成文本仅用于语义检索，不会展示给用户。
 */
export function buildHydePrompt(query: string): { system: string; user: string } {
  const system = [
    "你是专利法律领域的检索增强助手。请针对用户的问题写一段假设性的参考答案，用于向量检索（HyDE 技术）。",
    "要求：",
    "1. 直接陈述答案内容，100~150字，使用专利法律法规/审查指南的正式文体，写成连贯段落；",
    "2. 不要出现「问题」「回答」「假设」等元叙述字眼，不要分点列表，不要复述原问题；",
    "3. 可以包含合理的法条编号或专业术语，即使细节不完全准确也没有关系——这段文字仅用于语义检索，不会展示给用户。",
  ].join("\n");

  return { system, user: query };
}

// ── HyDE 生成 ─────────────────────────────────────────

/** 生成假设答案文档。失败/异常/内容无效时返回 null（调用方降级为原始 query 检索）。 */
export async function generateHydeDocument(query: string, config: HydeConfig): Promise<string | null> {
  try {
    if (!query.trim()) return null;
    if ((config.providerPreference ?? []).length === 0) {
      logger.warn("[HyDE] 无可用 provider，跳过 HyDE，降级为原始 query 检索");
      return null;
    }

    const { system, user } = buildHydePrompt(query);

    const { registry } = await import("../providers/registry.js");
    const { getApiKey } = await import("../security/keyStore.js");

    // 构建 provider → apiKey 映射（B-041：测试 key 走请求体 apiKey 字段，绝不读 .env）
    const providerApiKeys: Record<string, string> = {};
    for (const pid of config.providerPreference ?? []) {
      const key = config.apiKey ?? getApiKey(pid);
      if (key) providerApiKeys[pid] = key;
    }

    const chatReq: ChatRequest = {
      modelId: config.modelId ?? "",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      apiKey: "",
      // maxTokens 必须覆盖「推理 + 正文」：thinking 模型的 reasoning_tokens 计入 completion
      // 额度，预算不足时模型还没开始写正文就 finishReason=length、返回空内容（ glm-5.2
      // 实测：400 基数经框架 resolveMaxTokens ×4=1600，全部被 reasoning 耗尽）。基数 1500
      // 经框架 ×4 后 reasoning 模型实得 6000；非 reasoning 模型 1500 只是上限，实际仍只生成 ~150 字。
      maxTokens: 1500,
      temperature: 0.3,
      ...(config.signal !== undefined && { signal: config.signal }),
    };

    const result = await registry.runWithFallback(
      config.providerPreference ?? [],
      chatReq,
      config.modelFallbacks,
      config.enableModelFallback,
      config.providerBaseUrls,
      providerApiKeys
    );

    if (result.response.error) {
      logger.warn(`[HyDE] LLM 调用失败，降级为原始 query 检索: ${result.response.error.message}`);
      return null;
    }

    const doc = result.response.text.trim();
    // 过短（<20字）说明生成失败或答非所问，向量质量不可靠
    if (doc.length < 20) {
      logger.warn(`[HyDE] 生成内容过短 (${doc.length}字)，降级为原始 query 检索`);
      return null;
    }

    logger.info(`[HyDE] 生成假设答案 (${doc.length}字): "${doc.slice(0, 60)}${doc.length > 60 ? "..." : ""}"`);
    return doc;
  } catch (err) {
    logger.warn(`[HyDE] 生成异常，降级为原始 query 检索: ${err}`);
    return null;
  }
}

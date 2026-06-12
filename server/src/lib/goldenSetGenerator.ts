/**
 * Golden Set Generator — 生成专利复审 RAG 质量评估集
 *
 * 从知识库中采样 chunk，调用 LLM 生成模拟审查员问题，
 * 存入 metrics_golden_set 表，用于 RAG 检索质量评估。
 */
import { randomUUID } from "node:crypto";
import { getSyncDb } from "./syncDb.js";
import { logger } from "./logger.js";
import { registry } from "../providers/registry.js";
import { searchPatents } from "../services/webSearch.js";
import { getAllSources, getChunksBySourceId } from "./knowledgeDb.js";
import type { ProviderId } from "@shared/types/agents";

// ── Types ──────────────────────────────────────────────

import type { SourceType, ExpectedSource, RelevanceGrade, JudgeResult } from "@shared/types/metrics";
import { callMultiJudge, aggregateDiscrete, DEFAULT_JUDGE_CONFIGS } from "./multiJudge.js";

export interface GoldenQuestion {
  id: string;
  agent: string;           // which agent this tests
  query: string;           // examiner's question
  expectedAnswer: string;  // expected answer (200-500 chars for nf5)
  expectedSources: string[]; // knowledge base file names
  expectedArticles: string[]; // legal article references
  category: string;        // novelty|inventive|defect|procedure|legal
  difficulty: "easy" | "medium" | "hard";
  generatedBy: string;     // which LLM generated this

  // ── nf5 新增字段 ──
  sourceType: SourceType;
  expectedSource: ExpectedSource;
  sourceRoutingRationale: string;
  mustIncludeFacts: string[];
  relevanceGrading: RelevanceGrade[];
  verifiedBy: string;
}

// ── Question Categories ────────────────────────────────

interface QuestionCategory {
  category: string;
  agent: string;
  description: string;
  sampleQueries: string[];
}

const QUESTION_CATEGORIES: QuestionCategory[] = [
  {
    category: "新颖性",
    agent: "novelty",
    description: "新颖性判断 -- 单独对比、全部技术特征被公开",
    sampleQueries: [
      "如何判断一项权利要求是否具备新颖性？",
      "新颖性审查中“单独对比”原则如何适用？",
      "抵触申请的判断标准是什么？",
    ],
  },
  {
    category: "创造性",
    agent: "inventive",
    description: "创造性三步法 -- 最接近现有技术 -> 区别特征 -> 技术启示",
    sampleQueries: [
      "创造性三步法的具体步骤是什么？",
      "如何认定区别特征是否具有技术启示？",
      "预料不到的技术效果如何影响创造性判断？",
    ],
  },
  {
    category: "权利要求",
    agent: "claim-chart",
    description: "权利要求解读、特征拆解、保护范围",
    sampleQueries: [
      "权利要求应当满足哪些条件？",
      "如何进行权利要求特征拆解？",
      "功能性限定的权利要求如何理解？",
    ],
  },
  {
    category: "形式缺陷",
    agent: "defects",
    description: "说明书充分公开、权利要求清楚、支持、修改超范围",
    sampleQueries: [
      "说明书充分公开的判断标准是什么？",
      "权利要求不清楚的典型情形有哪些？",
      "修改超范围如何判断？",
    ],
  },
  {
    category: "程序",
    agent: "chat",
    description: "复审程序、期限、文件要求",
    sampleQueries: [
      "复审请求需要提交哪些文件？",
      "复审程序中申请人可以修改权利要求吗？",
      "复审决定的类型有哪些？",
    ],
  },
];

// ── LLM Providers for Generation ───────────────────────

interface LLMProviderConfig {
  providerId: ProviderId;
  apiKey: string;
  defaultModel: string;
  label: string;
  modelFallbacks?: string[];
  enableModelFallback?: boolean;
}

/** 灵活的 Provider 配置——由 server 端根据用户实际配置解析 */
export interface GoldenSetProviderConfig {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  label: string;
  modelFallbacks?: string[];
  enableModelFallback?: boolean;
}

/**
 * 从 server DB 直接读取 provider keys，解析出可用于 Golden Set 生成的 LLM 配置。
 * 无视 enabled 状态——只要有 key 就可用。
 * 规则：
 * - mimo → 直接使用（MiMo 自有端点）
 * - volcengine + deepseek → 火山托管的 DeepSeek 模型
 * - volcengine + doubao-seed → 火山自研 doubao-seed 模型（替换 Gemini）
 */
export function resolveGoldenSetProviders(): GoldenSetProviderConfig[] {
  const db = getSyncDb();
  const settingsRow = db.prepare(
    "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
  ).get() as { data: string } | undefined;

  if (!settingsRow) {
    logger.warn("[GoldenSet] No settings found in DB");
    return [];
  }

  let providers: Array<{
    providerId: string; apiKeyRef?: string;
    modelFallbacks?: string[]; enableModelFallback?: boolean;
    defaultModelId?: string;
  }>;
  try {
    const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
    providers = (settings.providers ?? []) as typeof providers;
  } catch {
    logger.warn("[GoldenSet] Failed to parse settings JSON");
    return [];
  }

  // 构建 providerId → apiKey + fallback 映射（无视 enabled，只要有 key）
  const apiKeys: Record<string, string> = {};
  const defaultModelIds: Record<string, string | undefined> = {};
  const fallbacks: Record<string, string[] | undefined> = {};
  const enableFallback: Record<string, boolean | undefined> = {};
  for (const p of providers) {
    if (p.apiKeyRef) apiKeys[p.providerId] = p.apiKeyRef;
    if (p.defaultModelId) defaultModelIds[p.providerId] = p.defaultModelId;
    if (p.modelFallbacks?.length) fallbacks[p.providerId] = p.modelFallbacks;
    if (p.enableModelFallback) enableFallback[p.providerId] = true;
  }

  const configs: GoldenSetProviderConfig[] = [];

  if (apiKeys["mimo"]) {
    configs.push({
      providerId: "mimo", model: "mimo-v2.5", apiKey: apiKeys["mimo"], label: "MiMo",
      ...(fallbacks["mimo"] && { modelFallbacks: fallbacks["mimo"] }),
      ...(enableFallback["mimo"] && { enableModelFallback: true }),
    });
  }
  // 火山引擎 doubao-seed（替换 Gemini，因 API 超时频繁失败）
  if (apiKeys["volcengine"]) {
    configs.push({
      providerId: "volcengine",
      model: "doubao-seed-2-0-pro-260215",
      apiKey: apiKeys["volcengine"],
      label: "doubao-seed",
    });
  }
  // DeepSeek 只从火山引擎 provider 取，不从 deepseek provider 取
  if (apiKeys["volcengine"]) {
    configs.push({
      providerId: "volcengine", model: "deepseek-v4-flash-260425", apiKey: apiKeys["volcengine"], label: "DeepSeek",
      ...(fallbacks["volcengine"] && { modelFallbacks: fallbacks["volcengine"] }),
      ...(enableFallback["volcengine"] && { enableModelFallback: true }),
    });
  }

  return configs;
}


// ── Database Helpers ───────────────────────────────────

interface ChunkRow {
  id: string;
  source_id: string;
  text: string;
  metadata: string;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
}

function createGoldenSetTable(): void {
  const db = getSyncDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_golden_set (
      id            TEXT PRIMARY KEY,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      agent         TEXT NOT NULL,
      query         TEXT NOT NULL,
      expected_answer TEXT NOT NULL,
      expected_sources TEXT DEFAULT '[]',
      expected_articles TEXT DEFAULT '[]',
      category      TEXT DEFAULT '',
      difficulty    TEXT DEFAULT 'medium',
      generated_by  TEXT DEFAULT ''
    )
  `);
}

function insertGoldenQuestion(q: GoldenQuestion): void {
  const db = getSyncDb();
  db.prepare(`
    INSERT OR IGNORE INTO metrics_golden_set
      (id, agent, query, expected_answer, expected_sources, expected_articles,
       category, difficulty, generated_by,
       source_type, expected_source, source_routing_rationale,
       must_include_facts, relevance_grading, verified_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    q.id,
    q.agent,
    q.query,
    q.expectedAnswer,
    JSON.stringify(q.expectedSources),
    JSON.stringify(q.expectedArticles),
    q.category,
    q.difficulty,
    q.generatedBy,
    q.sourceType,
    q.expectedSource,
    q.sourceRoutingRationale,
    JSON.stringify(q.mustIncludeFacts),
    JSON.stringify(q.relevanceGrading),
    q.verifiedBy,
  );
}

function loadAllGoldenQuestions(): GoldenQuestion[] {
  const db = getSyncDb();
  const rows = db.prepare(
    `SELECT id, agent, query, expected_answer, expected_sources, expected_articles,
            category, difficulty, generated_by,
            source_type, expected_source, source_routing_rationale,
            must_include_facts, relevance_grading, verified_by
     FROM metrics_golden_set ORDER BY created_at`
  ).all() as Array<{
    id: string;
    agent: string;
    query: string;
    expected_answer: string;
    expected_sources: string;
    expected_articles: string;
    category: string;
    difficulty: string;
    generated_by: string;
    source_type: string;
    expected_source: string;
    source_routing_rationale: string;
    must_include_facts: string;
    relevance_grading: string;
    verified_by: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    agent: r.agent,
    query: r.query,
    expectedAnswer: r.expected_answer,
    expectedSources: safeParseJson(r.expected_sources, []),
    expectedArticles: safeParseJson(r.expected_articles, []),
    category: r.category,
    difficulty: r.difficulty as "easy" | "medium" | "hard",
    generatedBy: r.generated_by,
    // ── nf5 新增 ──
    sourceType: (r.source_type || "kb_only") as SourceType,
    expectedSource: (r.expected_source || "kb") as ExpectedSource,
    sourceRoutingRationale: r.source_routing_rationale || "",
    mustIncludeFacts: safeParseJson(r.must_include_facts, []),
    relevanceGrading: safeParseJson(r.relevance_grading, []),
    verifiedBy: r.verified_by || "auto",
  }));
}

function safeParseJson<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Chunk Sampling ─────────────────────────────────────

/**
 * Sample chunks from the knowledge base, distributed across different source types.
 * Returns chunks with their source metadata for context.
 */
function sampleChunks(count: number): Array<{ chunk: ChunkRow; source: SourceRow }> {
  // 使用 knowledgeDb 的导出函数（kb_sources/kb_chunks 在 knowledge.db，不在 patent-examiner.db）
  const sources = getAllSources();
  if (sources.length === 0) {
    logger.warn("[GoldenSet] No sources found in knowledge base");
    return [];
  }

  const results: Array<{ chunk: ChunkRow; source: SourceRow }> = [];
  const chunksPerSource = Math.max(1, Math.ceil(count / sources.length));

  for (const source of sources) {
    const rawChunks = getChunksBySourceId(source.id, chunksPerSource * 3); // 多取一些以便过滤
    const chunks = rawChunks
      .filter((c) => c.text.length > 100)
      .slice(0, chunksPerSource);

    for (const chunk of chunks) {
      results.push({
        chunk: { id: chunk.id, source_id: source.id, text: chunk.text, metadata: chunk.metadata },
        source: { id: source.id, name: source.name, type: source.type },
      });
    }
  }

  // Shuffle and trim to requested count
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = results[i]!;
    results[i] = results[j]!;
    results[j] = tmp;
  }

  return results.slice(0, count);
}

// ── Relevance Grading (spec §3) ──────────────────────────

const GRADING_SYSTEM_PROMPT = `你是专利复审领域的评估专家。给定一个问题和一段文本，请判断该文本对回答问题的相关程度。

评分标准：
- 0分：完全不相关，内容与问题无关
- 1分：边际相关，提及了相关主题但不直接回答问题
- 2分：部分相关，包含回答问题所需的部分信息
- 3分：高度相关，直接且完整地回答了问题

请输出 JSON：
{
  "grade": 0|1|2|3,
  "rationale": "打分理由"
}`;

function buildGradingUserPrompt(query: string, chunkText: string): string {
  return `问题：${query}\n\n文本：${chunkText}`;
}

/** 从 DB settings 解析 judge API keys（spec §3.2: MiMo + DeepSeek + doubao-seed） */
function resolveJudgeApiKeys(): Record<string, string> {
  const db = getSyncDb();
  const settingsRow = db.prepare(
    "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
  ).get() as { data: string } | undefined;

  if (!settingsRow) return {};

  try {
    const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
    const providers = (settings.providers ?? []) as Array<{
      providerId: string; apiKeyRef?: string;
    }>;
    const keys: Record<string, string> = {};
    for (const p of providers) {
      if (p.apiKeyRef) keys[p.providerId] = p.apiKeyRef;
    }
    return keys;
  } catch {
    return {};
  }
}

/**
 * 对一组候选 chunks 进行 relevance grading（spec §3.3）
 *
 * 1. 3 个 judge 对每个候选独立打分（0-3）
 * 2. Majority Vote 聚合
 * 3. 返回 RelevanceGrade[]
 */
async function gradeRelevance(
  query: string,
  candidates: Array<{ docId: string; chunkId?: string; text: string; source: "kb" | "web" }>,
  judgeApiKeys: Record<string, string>,
): Promise<RelevanceGrade[]> {
  if (candidates.length === 0) return [];

  const grades: RelevanceGrade[] = [];

  for (const candidate of candidates) {
    const userPrompt = buildGradingUserPrompt(query, candidate.text);

    const judgeOutputs = await callMultiJudge(
      { system: GRADING_SYSTEM_PROMPT, user: userPrompt },
      judgeApiKeys,
      { judgeConfigs: DEFAULT_JUDGE_CONFIGS, temperature: 0, maxTokens: 500 },
    );

    // 解析每个 judge 的打分
    const judgeResults: JudgeResult[] = [];
    const numericGrades: number[] = [];

    for (const output of judgeOutputs) {
      if (!output.success) {
        judgeResults.push({
          provider: output.providerId,
          grade: null,
          rationale: `judge_failed: ${output.error}`,
        });
        continue;
      }

      try {
        // 提取 JSON（judge 可能返回 markdown 包裹的 JSON）
        const jsonMatch = output.rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");
        const parsed = JSON.parse(jsonMatch[0]) as { grade: number; rationale: string };
        const grade = Math.max(0, Math.min(3, Math.round(parsed.grade))) as 0 | 1 | 2 | 3;
        judgeResults.push({
          provider: output.providerId,
          grade,
          rationale: parsed.rationale || "",
        });
        numericGrades.push(grade);
      } catch {
        judgeResults.push({
          provider: output.providerId,
          grade: null,
          rationale: "parse_failed",
        });
      }
    }

    // 聚合：至少 2 个 judge 成功才打分
    const aggregatedGrade = numericGrades.length >= 2
      ? aggregateDiscrete(numericGrades) as 0 | 1 | 2 | 3
      : 0;

    grades.push({
      source: candidate.source,
      docId: candidate.docId,
      chunkId: candidate.chunkId,
      grade: aggregatedGrade,
      rationale: judgeResults.map(j => `${j.provider}:${j.grade ?? "fail"}(${j.rationale})`).join("; "),
      judges: judgeResults,
    });
  }

  return grades;
}

// ── LLM Call ───────────────────────────────────────────

interface GeneratedQuestion {
  query: string;
  expected_answer: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  expected_articles: string[];
  // ── nf5 新增 ──
  must_include_facts: string[];
  source_routing_rationale: string;
}

/** 从 metadata 中提取 section 信息 */
function extractSection(metadata: string): string {
  try {
    const meta = JSON.parse(metadata) as Record<string, unknown>;
    return typeof meta.section === "string"
      ? meta.section
      : typeof meta.heading === "string"
        ? meta.heading
        : "";
  } catch {
    return "";
  }
}

/** 单个问题的 prompt（用于串行回退）— nf5: 200-500 字参考答案 + mustIncludeFacts */
function buildSinglePrompt(text: string, fileName: string, section: string): string {
  return `你是一个专利复审评估集生成器。给定以下法律/审查文本，请生成一个专利审查员在复审工作中可能会问的问题，使得这段文本是回答该问题的最佳来源。

要求：
1. 问题必须是审查员在实际复审工作中会遇到的真实问题
2. 问题应该具体、明确，不要过于宽泛
3. 参考答案应完整准确（200-500字），引用具体法条
4. 列出答案必须包含的 3-8 个关键事实点
5. 标注适用的法条
6. 分类必须是以下之一：新颖性、创造性、权利要求、形式缺陷、程序
7. 难度根据问题的专业程度判断

文本内容：
${text}

来源文件：${fileName}
所属章节：${section}

请严格输出以下 JSON 格式，不要输出其他内容：
{
  "query": "审查员问题",
  "expected_answer": "完整参考答案（200-500字）",
  "category": "新颖性|创造性|权利要求|形式缺陷|程序",
  "difficulty": "easy|medium|hard",
  "expected_articles": ["第X条", "第X条第X款"],
  "must_include_facts": ["事实1", "事实2", "事实3"],
  "source_routing_rationale": "为什么这个问题的答案来自知识库"
}`;
}

/** 批量问题的 prompt */
function buildBatchPrompt(
  samples: Array<{ chunk: ChunkRow; source: SourceRow }>,
  count: number,
): string {
  const chunkTexts = samples.map((s, i) => {
    const section = extractSection(s.chunk.metadata);
    return `
--- Chunk ${i + 1} ---
文件：${s.source.name}
章节：${section}
${s.chunk.text}`;
  }).join("\n");

  return `你是一个专利复审评估集生成器。给定以下 ${count} 个法律/审查文本片段，
请为每个片段生成一个专利审查员在复审工作中可能会问的问题。

要求：
1. 每个问题必须是审查员在实际复审工作中会遇到的真实问题
2. 问题应该具体、明确，不要过于宽泛
3. 参考答案应完整准确（200-500字），引用具体法条
4. 列出答案必须包含的 3-8 个关键事实点
5. 标注适用的法条
6. 分类必须是以下之一：新颖性、创造性、权利要求、形式缺陷、程序
7. 难度根据问题的专业程度判断
8. 必须生成恰好 ${count} 个问题，顺序与提供的文本片段对应

文本内容：
${chunkTexts}

请严格输出以下 JSON 数组格式，不要输出其他内容：
[
  {
    "query": "审查员问题",
    "expected_answer": "完整参考答案（200-500字）",
    "category": "新颖性|创造性|权利要求|形式缺陷|程序",
    "difficulty": "easy|medium|hard",
    "expected_articles": ["第X条", "第X条第X款"],
    "must_include_facts": ["事实1", "事实2", "事实3"],
    "source_routing_rationale": "为什么这个问题的答案来自知识库"
  },
  // ... 共 ${count} 个对象
]`;
}

async function callLLM(
  config: LLMProviderConfig,
  prompt: string,
): Promise<GeneratedQuestion | null> {
  try {
    const result = await registry.runWithFallback(
      [config.providerId],
      {
        modelId: config.defaultModel,
        messages: [
          { role: "system", content: "你是专利复审评估集生成助手。严格输出 JSON，不要输出 markdown 代码块或其他内容。" },
          { role: "user", content: prompt },
        ],
        apiKey: config.apiKey,
        temperature: 0.7,
        maxTokens: 1024,
      },
      // BUG-176 fix: registry 期望 { providerId: string[] } 格式，不是原始数组
      config.modelFallbacks ? { [config.providerId]: config.modelFallbacks } : undefined,
      config.enableModelFallback !== undefined
        ? { [config.providerId]: config.enableModelFallback }
        : undefined,
    );

    const resp = result.response;
    if (resp.error) {
      logger.warn(`[GoldenSet] LLM error from ${config.label}: ${resp.error.message}`);
      return null;
    }

    const text = resp.text.trim();
    return parseGeneratedQuestion(text);
  } catch (err) {
    logger.warn(`[GoldenSet] LLM call failed for ${config.label}: ${err}`);
    return null;
  }
}

/** 批量 LLM 调用——一次请求生成多个问题 */
async function callLLMBatch(
  config: LLMProviderConfig,
  prompt: string,
  expectedCount: number,
): Promise<GeneratedQuestion[]> {
  try {
    const result = await registry.runWithFallback(
      [config.providerId],
      {
        modelId: config.defaultModel,
        messages: [
          { role: "system", content: "你是专利复审评估集生成助手。严格输出 JSON 数组，不要输出 markdown 代码块或其他内容。" },
          { role: "user", content: prompt },
        ],
        apiKey: config.apiKey,
        temperature: 0.7,
        maxTokens: 4096,  // 增加 token 限制以支持批量输出
      },
      // BUG-176 fix: registry 期望 { providerId: string[] } 格式，不是原始数组
      config.modelFallbacks ? { [config.providerId]: config.modelFallbacks } : undefined,
      config.enableModelFallback !== undefined
        ? { [config.providerId]: config.enableModelFallback }
        : undefined,
    );

    const resp = result.response;
    if (resp.error) {
      logger.warn(`[GoldenSet] Batch LLM error from ${config.label}: ${resp.error.message}`);
      return [];
    }

    const text = resp.text.trim();
    const questions = parseBatchQuestions(text);

    // 验证数量：如果生成数量不足 50%，认为批量失败
    if (questions.length < expectedCount * 0.5) {
      logger.warn(`[GoldenSet] ${config.label}: Batch generated only ${questions.length}/${expectedCount} questions, insufficient`);
      return [];
    }

    logger.info(`[GoldenSet] ${config.label}: Batch generated ${questions.length}/${expectedCount} questions`);
    return questions;
  } catch (err) {
    logger.warn(`[GoldenSet] Batch LLM call failed for ${config.label}: ${err}`);
    return [];
  }
}

function parseGeneratedQuestion(text: string): GeneratedQuestion | null {
  // Try direct JSON parse first
  let cleaned = text;
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return validateQuestion(parsed);
  } catch {
    // Try extracting JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return validateQuestion(parsed);
      } catch {
        // fall through
      }
    }
  }

  logger.warn(`[GoldenSet] Failed to parse LLM output as JSON: ${text.slice(0, 200)}`);
  return null;
}

/** 解析批量生成的 JSON 数组 */
function parseBatchQuestions(text: string): GeneratedQuestion[] {
  let cleaned = text;
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => validateQuestion(item as Record<string, unknown>))
        .filter((q): q is GeneratedQuestion => q !== null);
    }
  } catch {
    // 尝试提取 JSON 数组
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => validateQuestion(item as Record<string, unknown>))
            .filter((q): q is GeneratedQuestion => q !== null);
        }
      } catch {
        // fall through
      }
    }
  }

  logger.warn(`[GoldenSet] Failed to parse batch LLM output as JSON array: ${text.slice(0, 200)}`);
  return [];
}

function validateQuestion(parsed: Record<string, unknown>): GeneratedQuestion | null {
  const query = typeof parsed.query === "string" ? parsed.query : "";
  const expected_answer = typeof parsed.expected_answer === "string" ? parsed.expected_answer : "";
  const category = typeof parsed.category === "string" ? parsed.category : "";
  const difficulty = typeof parsed.difficulty === "string" ? parsed.difficulty : "medium";
  const expected_articles = Array.isArray(parsed.expected_articles)
    ? (parsed.expected_articles as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
  // nf5 新增字段
  const must_include_facts = Array.isArray(parsed.must_include_facts)
    ? (parsed.must_include_facts as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  const source_routing_rationale = typeof parsed.source_routing_rationale === "string"
    ? parsed.source_routing_rationale : "";

  if (!query || !expected_answer) {
    logger.warn("[GoldenSet] Parsed question missing required fields (query/expected_answer)");
    return null;
  }

  // Validate category
  const validCategories = ["新颖性", "创造性", "权利要求", "形式缺陷", "程序"];
  const safeCategory = validCategories.includes(category) ? category : "程序";

  // Validate difficulty
  const validDifficulties = ["easy", "medium", "hard"];
  const safeDifficulty = validDifficulties.includes(difficulty) ? difficulty as "easy" | "medium" | "hard" : "medium";

  return {
    query,
    expected_answer,
    category: safeCategory,
    difficulty: safeDifficulty,
    expected_articles,
    must_include_facts,
    source_routing_rationale,
  };
}

// ── Category Mapping ───────────────────────────────────

function findCategoryForAgent(category: string): QuestionCategory | undefined {
  return QUESTION_CATEGORIES.find((c) => c.category === category);
}

/** 串行生成回退函数——批量失败时使用 */
async function generateSerial(
  config: LLMProviderConfig,
  samples: Array<{ chunk: ChunkRow; source: SourceRow }>,
  targetCount: number,
): Promise<GeneratedQuestion[]> {
  const results: GeneratedQuestion[] = [];

  for (const { chunk, source } of samples) {
    if (results.length >= targetCount) break;

    const section = extractSection(chunk.metadata);
    const prompt = buildSinglePrompt(chunk.text, source.name, section);
    const question = await callLLM(config, prompt);

    if (question) {
      results.push(question);
    }
  }

  return results;
}

// ── Web Search ──────────────────────────────────────────

/**
 * 调用 web 搜索获取候选结果
 * 用于 web_only 和 cross_source 题目生成
 *
 * spec §11: 默认使用 SerpAPI，与 MCP Web Search 路径保持一致
 */
async function searchWebForQuestion(
  queries: string[],
  searchApiKey: string,
  maxResults: number = 5,
  providerId: string = "serpapi",
): Promise<Array<{ title: string; url: string; content: string }>> {
  try {
    const response = await searchPatents(queries, maxResults, {
      providerId,
      apiKey: searchApiKey,
    });
    return response.results;
  } catch (err) {
    logger.warn(`[GoldenSet] Web search failed: ${err}`);
    return [];
  }
}

// ── Public API ─────────────────────────────────────────

/**
 * Generate a golden evaluation set for patent re-examination RAG quality.
 * Generates questions using 1-3 LLMs for diversity.
 * Uses different chunks for each LLM to maximize diversity.
 * Results are stored in metrics_golden_set table.
 *
 * 优化版本：3 个 provider 并行执行，每个 provider 批量生成问题（1 次 LLM call）。
 * 批量失败时自动回退到串行模式。
 *
 * @param providerConfigs - Provider 配置数组（由 resolveGoldenSetProviders() 生成）
 * @param questionsPerProvider - Number of questions per provider (default 20)
 * @param searchApiKey - 搜索 API key（web_only/cross_source/conflict 需要）
 * @param searchProviderId - 搜索 provider ID（spec §11: 默认 "serpapi"，与 MCP 路径一致）
 * @returns The generated golden questions
 */
export async function generateGoldenSet(
  providerConfigs: GoldenSetProviderConfig[],
  questionsPerProvider = 20,
  searchApiKey?: string,
  searchProviderId?: string,
): Promise<GoldenQuestion[]> {
  createGoldenSetTable();

  if (providerConfigs.length === 0) {
    logger.warn("[GoldenSet] No provider configs provided, cannot generate golden set");
    return [];
  }

  const totalQuestions = questionsPerProvider * providerConfigs.length;
  logger.info(`[GoldenSet] Generating ${totalQuestions} questions (${questionsPerProvider} per provider x ${providerConfigs.length} providers)`);

  // spec §11: 检查 web 搜索可用性
  const hasWebSearch = !!searchApiKey;
  if (!hasWebSearch) {
    logger.warn("[GoldenSet] No searchApiKey provided — web_only/cross_source/conflict will fallback to kb_only");
  }

  // 为每个 provider 采样独立的 chunks（避免 chunk 共享导致的重复问题）
  const providerSamples = providerConfigs.map(() => sampleChunks(questionsPerProvider));

  // 预获取 web 搜索结果（所有 provider 共享）
  let webResults: Array<{ title: string; url: string; content: string }> = [];
  if (hasWebSearch) {
    const searchQueries = providerSamples[0]?.slice(0, 5).map(s => {
      const section = extractSection(s.chunk.metadata);
      return `${s.source.name} ${section}`.trim();
    }) ?? [];
    webResults = await searchWebForQuestion(searchQueries, searchApiKey!, 15, searchProviderId);
    logger.info(`[GoldenSet] Web search returned ${webResults.length} results`);
  }

  // spec §3: 解析 judge API keys（用于 relevance grading）
  const judgeApiKeys = resolveJudgeApiKeys();
  const hasJudges = Object.keys(judgeApiKeys).length >= 2;
  if (!hasJudges) {
    logger.warn("[GoldenSet] Insufficient judge API keys — relevance grading will be skipped");
  }

  // 并行生成所有 provider 的问题
  const providerPromises = providerConfigs.map(async (pc, providerIndex) => {
    const samples = providerSamples[providerIndex]!;
    if (samples.length === 0) {
      logger.warn(`[GoldenSet] No chunks available for ${pc.label}`);
      return [];
    }

    const llmConfig: LLMProviderConfig = {
      providerId: pc.providerId,
      apiKey: pc.apiKey,
      defaultModel: pc.model,
      label: pc.label,
      ...(pc.modelFallbacks && { modelFallbacks: pc.modelFallbacks }),
      ...(pc.enableModelFallback !== undefined && { enableModelFallback: pc.enableModelFallback }),
    };

    // 尝试批量生成，失败时逐级减半 batch size: x → x/2 → x/4 → ... → 1
    let questions: GeneratedQuestion[] = [];
    let batchSize = samples.length;
    while (batchSize >= 1) {
      const batchSamples = samples.slice(0, batchSize);
      const batchPrompt = buildBatchPrompt(batchSamples, batchSamples.length);
      questions = await callLLMBatch(llmConfig, batchPrompt, batchSamples.length);
      if (questions.length > 0) {
        logger.info(`[GoldenSet] ${pc.label}: Batch(${batchSize}) succeeded with ${questions.length} questions`);
        break;
      }
      logger.info(`[GoldenSet] ${pc.label}: Batch(${batchSize}) failed, trying smaller batch`);
      batchSize = Math.max(1, Math.floor(batchSize / 2));
    }

    // 所有 batch 都失败，回退到单题串行（最后手段）
    if (questions.length === 0) {
      logger.info(`[GoldenSet] ${pc.label}: All batches failed, falling back to serial generation`);
      questions = await generateSerial(llmConfig, samples, questionsPerProvider);
    }

    // 构建 GoldenQuestion 对象并存储
    const goldenQuestions: GoldenQuestion[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      const sample = samples[i];
      const categoryInfo = findCategoryForAgent(q.category);

      // spec §3: Relevance Grading — 生成阶段完成
      let relevanceGrading: RelevanceGrade[] = [];
      if (hasJudges && sample) {
        // 构建候选：生成 chunk + 2-3 个同批次其他 chunk 作为负样本
        const candidates: Array<{ docId: string; chunkId?: string; text: string; source: "kb" | "web" }> = [
          { docId: sample.source.name, chunkId: sample.chunk.id, text: sample.chunk.text, source: "kb" },
        ];
        // 从同批次其他 chunk 中随机取 2-3 个作为负样本
        const otherSamples = samples.filter((_, j) => j !== i).slice(0, 3);
        for (const os of otherSamples) {
          candidates.push({ docId: os.source.name, chunkId: os.chunk.id, text: os.chunk.text, source: "kb" });
        }

        try {
          relevanceGrading = await gradeRelevance(q.query, candidates, judgeApiKeys);
          logger.info(`[GoldenSet] Graded ${relevanceGrading.length} candidates for "${q.query.slice(0, 40)}..."`);
        } catch (err) {
          logger.warn(`[GoldenSet] Grading failed for question "${q.query.slice(0, 40)}...": ${err}`);
        }
      }

      const goldenQuestion: GoldenQuestion = {
        id: `gs-${randomUUID().slice(0, 8)}`,
        agent: categoryInfo?.agent ?? "chat",
        query: q.query,
        expectedAnswer: q.expected_answer,
        expectedSources: [sample?.source.name ?? "unknown"],
        expectedArticles: q.expected_articles,
        category: q.category,
        difficulty: q.difficulty,
        generatedBy: pc.label,
        // ── nf5: 默认 kb_only 类型 ──
        sourceType: "kb_only",
        expectedSource: "kb",
        sourceRoutingRationale: q.source_routing_rationale || "答案来自知识库",
        mustIncludeFacts: q.must_include_facts || [],
        relevanceGrading,
        verifiedBy: "auto",
      };
      insertGoldenQuestion(goldenQuestion);
      goldenQuestions.push(goldenQuestion);
    }

    logger.info(`[GoldenSet] ${pc.label}: generated ${goldenQuestions.length}/${questionsPerProvider} questions`);
    return goldenQuestions;
  });

  // 等待所有 provider 完成（允许部分失败）
  const providerResults = await Promise.allSettled(providerPromises);

  // 收集结果
  const results: GoldenQuestion[] = [];
  for (const result of providerResults) {
    if (result.status === "fulfilled") {
      results.push(...result.value);
    } else {
      logger.error(`[GoldenSet] Provider failed: ${result.reason}`);
    }
  }

  logger.info(`[GoldenSet] Total generated: ${results.length}/${totalQuestions} questions`);
  return results;
}

/**
 * Load the existing golden set from the database.
 * Returns empty array if no golden set has been generated.
 */
export async function getGoldenSet(): Promise<GoldenQuestion[]> {
  createGoldenSetTable();
  return loadAllGoldenQuestions();
}

/**
 * Clear the golden set table so it can be regenerated.
 */
export async function clearGoldenSet(): Promise<void> {
  const db = getSyncDb();
  // 先删 runs（有 FK 引用 golden_set），再删 golden_set
  db.exec("DELETE FROM metrics_golden_runs");
  db.exec("DELETE FROM metrics_golden_set");
  logger.info("[GoldenSet] Cleared golden set");
}

/**
 * Get golden set statistics.
 */
export function getGoldenSetStats(): {
  total: number;
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
  byProvider: Record<string, number>;
  bySourceType: Record<string, number>;
} {
  const db = getSyncDb();
  createGoldenSetTable();

  const total = (db.prepare("SELECT COUNT(*) as c FROM metrics_golden_set").get() as { c: number }).c;

  const categoryRows = db.prepare("SELECT category, COUNT(*) as c FROM metrics_golden_set GROUP BY category").all() as Array<{ category: string; c: number }>;
  const byCategory: Record<string, number> = {};
  for (const r of categoryRows) byCategory[r.category] = r.c;

  const difficultyRows = db.prepare("SELECT difficulty, COUNT(*) as c FROM metrics_golden_set GROUP BY difficulty").all() as Array<{ difficulty: string; c: number }>;
  const byDifficulty: Record<string, number> = {};
  for (const r of difficultyRows) byDifficulty[r.difficulty] = r.c;

  const providerRows = db.prepare("SELECT generated_by, COUNT(*) as c FROM metrics_golden_set GROUP BY generated_by").all() as Array<{ generated_by: string; c: number }>;
  const byProvider: Record<string, number> = {};
  for (const r of providerRows) byProvider[r.generated_by] = r.c;

  // nf5: 按 sourceType 统计
  const sourceTypeRows = db.prepare("SELECT source_type, COUNT(*) as c FROM metrics_golden_set GROUP BY source_type").all() as Array<{ source_type: string; c: number }>;
  const bySourceType: Record<string, number> = {};
  for (const r of sourceTypeRows) bySourceType[r.source_type || "kb_only"] = r.c;

  return { total, byCategory, byDifficulty, byProvider, bySourceType };
}

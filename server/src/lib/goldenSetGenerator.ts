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

import type { SourceType, ExpectedSource, RelevanceGrade } from "@shared/types/metrics";

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
  contextChunkIds: string[];  // A.1 生成时使用的 KB chunk IDs（A.2 grading 正样本，仅 kb_only）
}

// ── Matrix Allocation (spec §4.4) ──────────────────────

/** spec §4.4: 21-cell 矩阵中的一个 cell */
interface MatrixCell {
  sourceType: SourceType;
  category: string;
}

/**
 * spec §4.4: sourceType × category 矩阵（21 个非零 cell）
 *
 * 分配策略：round-robin 分给 N 个 provider，每个 provider 7 题。
 * 如果 provider 不足 3 个，多余的 cell 分配给最后一个 provider。
 */
function buildMatrixAllocation(providerCount: number): MatrixCell[][] {
  const ALL_CELLS: MatrixCell[] = [
    // R1: kb_only × 5 categories
    { sourceType: "kb_only", category: "新颖性" },
    { sourceType: "kb_only", category: "创造性" },
    { sourceType: "kb_only", category: "权利要求" },
    { sourceType: "kb_only", category: "形式缺陷" },
    { sourceType: "kb_only", category: "程序" },
    // R2: web_only × 5 categories
    { sourceType: "web_only", category: "新颖性" },
    { sourceType: "web_only", category: "创造性" },
    { sourceType: "web_only", category: "权利要求" },
    { sourceType: "web_only", category: "形式缺陷" },
    { sourceType: "web_only", category: "程序" },
    // R3: cross_source × 5 categories
    { sourceType: "cross_source", category: "新颖性" },
    { sourceType: "cross_source", category: "创造性" },
    { sourceType: "cross_source", category: "权利要求" },
    { sourceType: "cross_source", category: "形式缺陷" },
    { sourceType: "cross_source", category: "程序" },
    // R4: conflict × 3 categories
    { sourceType: "conflict", category: "新颖性" },
    { sourceType: "conflict", category: "创造性" },
    { sourceType: "conflict", category: "权利要求" },
    // R5: no_answer × 3 categories
    { sourceType: "no_answer", category: "创造性" },
    { sourceType: "no_answer", category: "创造性" },
    { sourceType: "no_answer", category: "程序" },
  ];

  // Round-robin 分配
  const allocation: MatrixCell[][] = Array.from({ length: providerCount }, () => []);
  for (let i = 0; i < ALL_CELLS.length; i++) {
    allocation[i % providerCount]!.push(ALL_CELLS[i]!);
  }

  // 日志
  for (let i = 0; i < allocation.length; i++) {
    const cells = allocation[i]!;
    const byType: Record<string, number> = {};
    for (const c of cells) byType[c.sourceType] = (byType[c.sourceType] ?? 0) + 1;
    logger.info(`[GoldenSet] Provider ${i}: ${cells.length} cells — ${JSON.stringify(byType)}`);
  }

  return allocation;
}

/** sourceType → expectedSource 映射 */
function mapExpectedSource(st: SourceType): ExpectedSource {
  if (st === "kb_only") return "kb";
  if (st === "web_only") return "web";
  if (st === "cross_source" || st === "conflict") return "kb+web";
  return "any"; // no_answer
}

/** sourceType → sourceRoutingRationale 映射 */
function mapSourceRoutingRationale(st: SourceType): string {
  switch (st) {
    case "kb_only": return "答案来自知识库";
    case "web_only": return "答案来自 web 搜索";
    case "cross_source": return "答案需要综合知识库和 web 搜索结果";
    case "conflict": return "知识库和 web 搜索结果存在矛盾，需选择权威来源";
    case "no_answer": return "知识库和 web 搜索均无法可靠回答此问题";
  }
}

// ── Context Collection ─────────────────────────────────

/** 单个 cell 的上下文材料 */
interface CellContext {
  kbChunks: Array<{ chunk: ChunkRow; source: SourceRow }>;
  webResults: Array<{ title: string; url: string; content: string }>;
}

/**
 * 为每个 cell 收集上下文：
 * - kb_only → KB chunks
 * - web_only → web results（无 searchApiKey 时 fallback 到 KB chunks）
 * - cross_source → KB + web
 * - conflict → KB + web（天然矛盾）
 * - no_answer → 随机不相关 KB chunks
 */
function collectCellContexts(
  cells: MatrixCell[],
  webResults: Array<{ title: string; url: string; content: string }>,
  hasWebSearch: boolean,
): CellContext[] {
  return cells.map(cell => {
    switch (cell.sourceType) {
      case "kb_only":
        return { kbChunks: sampleChunks(2), webResults: [] };

      case "web_only":
        if (hasWebSearch && webResults.length > 0) {
          return { kbChunks: [], webResults: webResults.slice(0, 3) };
        }
        // Fallback: 无 web 结果时用 KB chunks
        return { kbChunks: sampleChunks(2), webResults: [] };

      case "cross_source":
        return {
          kbChunks: sampleChunks(2),
          webResults: hasWebSearch ? webResults.slice(0, 3) : [],
        };

      case "conflict":
        return {
          kbChunks: sampleChunks(2),
          webResults: hasWebSearch ? webResults.slice(0, 3) : [],
        };

      case "no_answer": {
        // 随机不相关 chunks
        const chunks = sampleChunks(2);
        return { kbChunks: chunks, webResults: [] };
      }
    }
  });
}

// ── Question Categories (用于 prompt 示例) ──────────────

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "新颖性": "新颖性判断 -- 单独对比原则、全部技术特征被公开、抵触申请",
  "创造性": "创造性三步法 -- 最接近现有技术、区别特征、技术启示、预料不到的技术效果",
  "权利要求": "权利要求解读、特征拆解、保护范围、功能性限定",
  "形式缺陷": "说明书充分公开、权利要求清楚、支持、修改超范围",
  "程序": "复审程序、期限、文件要求、当事人变更",
};

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
      providerId: "volcengine", model: "deepseek-v3-2-251201", apiKey: apiKeys["volcengine"], label: "DeepSeek",
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
       must_include_facts, relevance_grading, verified_by, context_chunk_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(q.contextChunkIds),
  );
}

/**
 * Import golden questions from JSON array (用于 C 阶段验证前的数据准备).
 * Accepts the same shape as the golden-set JSON file exported by A.2.
 */
export function importGoldenQuestions(raw: Array<Record<string, unknown>>): number {
  const db = getSyncDb();
  // Clear existing first
  db.prepare("DELETE FROM metrics_golden_set").run();
  let count = 0;
  for (const r of raw) {
    const q: GoldenQuestion = {
      id: String(r.id ?? ""),
      agent: String(r.agent ?? "chat"),
      query: String(r.query ?? ""),
      expectedAnswer: String(r.expectedAnswer ?? ""),
      expectedSources: (r.expectedSources ?? []) as string[],
      expectedArticles: (r.expectedArticles ?? []) as string[],
      category: String(r.category ?? ""),
      difficulty: String(r.difficulty ?? "medium"),
      generatedBy: String(r.generatedBy ?? ""),
      sourceType: (r.sourceType ?? "kb_only") as GoldenQuestion["sourceType"],
      expectedSource: String(r.expectedSource ?? "kb"),
      sourceRoutingRationale: String(r.sourceRoutingRationale ?? ""),
      mustIncludeFacts: (r.mustIncludeFacts ?? []) as string[],
      relevanceGrading: (r.relevanceGrading ?? []) as RelevanceGrade[],
      verifiedBy: String(r.verifiedBy ?? "auto"),
      contextChunkIds: (r.contextChunkIds ?? []) as string[],
    };
    if (!q.id || !q.query) continue;
    insertGoldenQuestion(q);
    count++;
  }
  logger.info(`[GoldenSet] Imported ${count} questions from JSON`);
  return count;
}

function loadAllGoldenQuestions(): GoldenQuestion[] {
  const db = getSyncDb();
  const rows = db.prepare(
    `SELECT id, agent, query, expected_answer, expected_sources, expected_articles,
            category, difficulty, generated_by,
            source_type, expected_source, source_routing_rationale,
            must_include_facts, relevance_grading, verified_by, context_chunk_ids
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
    context_chunk_ids: string;
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
    contextChunkIds: safeParseJson(r.context_chunk_ids, []),
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

// ── 约束修复 ────────────────────────────────────────────

const ANSWER_MIN_LEN = 200;
const ANSWER_MAX_LEN = 500;
const FACTS_MIN = 3;
const FACTS_MAX = 8;

/**
 * 在句号处截断文本到 maxLen 字符（保留完整句子）
 */
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // 从 maxLen 位置往前找最后一个句号
  const truncated = text.slice(0, maxLen);
  const lastPeriod = Math.max(
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf("；"),
    truncated.lastIndexOf("！"),
    truncated.lastIndexOf("？"),
  );
  return lastPeriod > maxLen * 0.6 ? truncated.slice(0, lastPeriod + 1) : truncated;
}

/**
 * 调 LLM 扩写短答案或补充 facts
 */
async function repairWithLLM(
  config: LLMProviderConfig,
  query: string,
  answer: string,
  facts: string[],
  issue: "short_answer" | "few_facts",
): Promise<{ answer: string; facts: string[] } | null> {
  try {
    const prompt = issue === "short_answer"
      ? `以下是一个专利复审问题和参考答案。答案太短（当前 ${answer.length} 字，需要 ${ANSWER_MIN_LEN}-${ANSWER_MAX_LEN} 字），请扩写到 200-300 字，保持原意不变，补充必要的法律依据和分析。

问题：${query}

原答案：${answer}

请输出 JSON：
{
  "answer": "扩写后的答案"
}`
      : `以下是一个专利复审问题和参考答案。请基于答案内容，提取或补充到 ${FACTS_MIN}-${FACTS_MAX} 个关键事实点。

问题：${query}
答案：${answer}

现有 facts：${JSON.stringify(facts)}

请输出 JSON：
{
  "facts": ["事实1", "事实2", "事实3", ...]
}`;

    const result = await registry.runWithFallback(
      [config.providerId],
      {
        modelId: config.defaultModel,
        messages: [
          { role: "system", content: "你是专利复审评估集生成助手。严格输出 JSON，不要输出其他内容。" },
          { role: "user", content: prompt },
        ],
        apiKey: config.apiKey,
        temperature: 0.5,
        maxTokens: 1024,
      },
      config.modelFallbacks ? { [config.providerId]: config.modelFallbacks } : undefined,
      config.enableModelFallback !== undefined
        ? { [config.providerId]: config.enableModelFallback }
        : undefined,
    );

    const resp = result.response;
    if (resp.error) {
      logger.warn(`[GoldenSet] Repair LLM error: ${resp.error.message}`);
      return null;
    }

    const text = resp.text.trim();
    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    if (issue === "short_answer" && typeof parsed.answer === "string") {
      return { answer: parsed.answer, facts };
    }
    if (issue === "few_facts" && Array.isArray(parsed.facts)) {
      const newFacts = parsed.facts.filter((f: unknown) => typeof f === "string");
      return { answer, facts: newFacts };
    }
    return null;
  } catch (err) {
    logger.warn(`[GoldenSet] Repair failed: ${err}`);
    return null;
  }
}

/**
 * 验证并修复单个问题的约束（answer 长度、facts 数量）
 *
 * 对违反约束的字段进行修复：
 * - 答案太长：在句号处截断
 * - 答案太短：调 LLM 扩写
 * - Facts 太多：保留前 N 个
 * - Facts 太少：调 LLM 补充
 */
async function repairQuestionConstraints(
  q: GeneratedQuestion,
  config: LLMProviderConfig,
): Promise<GeneratedQuestion> {
  let { expected_answer, must_include_facts } = q;

  // ── 答案长度修复 ──
  if (expected_answer.length > ANSWER_MAX_LEN) {
    const before = expected_answer.length;
    expected_answer = truncateAtSentence(expected_answer, ANSWER_MAX_LEN);
    logger.info(`[GoldenSet] Answer truncated: ${before} → ${expected_answer.length} chars`);
  } else if (expected_answer.length < ANSWER_MIN_LEN) {
    logger.info(`[GoldenSet] Answer too short (${expected_answer.length} chars), attempting LLM repair`);
    const repaired = await repairWithLLM(config, q.query, expected_answer, must_include_facts, "short_answer");
    if (repaired && repaired.answer.length >= ANSWER_MIN_LEN) {
      expected_answer = repaired.answer;
      logger.info(`[GoldenSet] Answer expanded to ${expected_answer.length} chars`);
    } else {
      logger.warn(`[GoldenSet] Answer repair failed or still too short, keeping original`);
    }
  }

  // ── Facts 数量修复 ──
  if (must_include_facts.length > FACTS_MAX) {
    must_include_facts = must_include_facts.slice(0, FACTS_MAX);
    logger.info(`[GoldenSet] Facts trimmed to ${FACTS_MAX}`);
  } else if (must_include_facts.length < FACTS_MIN) {
    logger.info(`[GoldenSet] Too few facts (${must_include_facts.length}), attempting LLM repair`);
    const repaired = await repairWithLLM(config, q.query, expected_answer, must_include_facts, "few_facts");
    if (repaired && repaired.facts.length >= FACTS_MIN) {
      must_include_facts = repaired.facts;
      logger.info(`[GoldenSet] Facts expanded to ${must_include_facts.length}`);
    } else {
      logger.warn(`[GoldenSet] Facts repair failed or still too few, keeping original`);
    }
  }

  return { ...q, expected_answer, must_include_facts };
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

/**
 * 构建矩阵驱动的批量 prompt（spec §4.4 + §5.1）
 *
 * 每个 cell 有明确的 category 和 sourceType，LLM 必须按指定分类生成。
 * 上下文根据 sourceType 提供：KB chunks、web results、或两者混合。
 */
function buildCellBatchPrompt(
  cells: MatrixCell[],
  contexts: CellContext[],
): string {
  const cellDescriptions = cells.map((cell, i) => {
    const ctx = contexts[i]!;
    const catDesc = CATEGORY_DESCRIPTIONS[cell.category] ?? cell.category;

    let contextBlock = "";
    if (ctx.kbChunks.length > 0) {
      contextBlock += "\n【知识库来源】\n" + ctx.kbChunks.map((s, j) => {
        const section = extractSection(s.chunk.metadata);
        return `KB-${j + 1} [${s.source.name}] ${section}:\n${s.chunk.text}`;
      }).join("\n\n");
    }
    if (ctx.webResults.length > 0) {
      contextBlock += "\n【Web 搜索结果】\n" + ctx.webResults.map((w, j) =>
        `Web-${j + 1} [${w.title}](${w.url}):\n${w.content}`
      ).join("\n\n");
    }
    if (!contextBlock) {
      contextBlock = "\n（无相关上下文 — 请生成一个知识库和 web 搜索均无法可靠回答的问题）";
    }

    const sourceTypeHint = cell.sourceType === "no_answer"
      ? "⚠️ 这是一个「无法回答」类问题：请生成一个当前上下文无法可靠回答的问题，参考答案应明确指出信息不足。"
      : cell.sourceType === "conflict"
        ? "⚠️ 这是一个「信息冲突」类问题：上下文中可能存在矛盾信息，参考答案应选择权威来源并解释理由。"
        : "";

    return `
━━━ 题目 ${i + 1} ━━━
指定分类：${cell.category}（${catDesc}）
来源类型：${cell.sourceType}
${sourceTypeHint}
${contextBlock}`;
  }).join("\n");

  return `你是专利复审评估集生成器。下面为 ${cells.length} 个题目分别提供了指定的分类和参考上下文。
请为每个题目生成一个审查员问题，问题必须与指定分类直接相关。

${cellDescriptions}

要求：
1. 每个问题必须是审查员在实际复审工作中会遇到的真实问题
2. 问题必须属于指定的分类（不要自行更改分类）
3. 参考答案应完整准确（200-500字），引用具体法条
4. 列出答案必须包含的 3-8 个关键事实点
5. 标注适用的法条（格式：第X条第X款，使用中文数字如"第二条第二款"）
6. 难度根据问题的专业程度判断（easy/medium/hard）
7. 必须生成恰好 ${cells.length} 个问题，顺序与提供的题目对应

请严格输出以下 JSON 数组格式，不要输出其他内容：
[
  {
    "query": "审查员问题",
    "expected_answer": "完整参考答案（200-500字）",
    "difficulty": "easy|medium|hard",
    "expected_articles": ["第X条第X款"],
    "must_include_facts": ["事实1", "事实2", "事实3"]
  },
  // ... 共 ${cells.length} 个对象（不要输出 category 和 source_routing_rationale，由系统自动填充）
]`;
}

/** 串行回退：单个 cell 的 prompt */
function buildCellSinglePrompt(cell: MatrixCell, ctx: CellContext): string {
  const catDesc = CATEGORY_DESCRIPTIONS[cell.category] ?? cell.category;

  let contextBlock = "";
  if (ctx.kbChunks.length > 0) {
    contextBlock += "\n【知识库来源】\n" + ctx.kbChunks.map((s, j) => {
      const section = extractSection(s.chunk.metadata);
      return `KB-${j + 1} [${s.source.name}] ${section}:\n${s.chunk.text}`;
    }).join("\n\n");
  }
  if (ctx.webResults.length > 0) {
    contextBlock += "\n【Web 搜索结果】\n" + ctx.webResults.map((w, j) =>
      `Web-${j + 1} [${w.title}](${w.url}):\n${w.content}`
    ).join("\n\n");
  }

  const sourceTypeHint = cell.sourceType === "no_answer"
    ? "⚠️ 这是一个「无法回答」类问题：请生成一个当前上下文无法可靠回答的问题。"
    : cell.sourceType === "conflict"
      ? "⚠️ 这是一个「信息冲突」类问题：上下文中可能存在矛盾信息。"
      : "";

  return `你是专利复审评估集生成器。请为以下指定分类生成一个审查员问题。

指定分类：${cell.category}（${catDesc}）
来源类型：${cell.sourceType}
${sourceTypeHint}
${contextBlock}

要求：
1. 问题必须属于指定分类
2. 参考答案应完整准确（200-500字），引用具体法条
3. 列出 3-8 个关键事实点
4. 标注适用法条（格式：第X条第X款，使用中文数字）

请严格输出以下 JSON 格式：
{
  "query": "审查员问题",
  "expected_answer": "完整参考答案（200-500字）",
  "difficulty": "easy|medium|hard",
  "expected_articles": ["第X条第X款"],
  "must_include_facts": ["事实1", "事实2", "事实3"]
}`;
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

/** 串行生成回退函数——批量失败时使用 */
async function generateSerial(
  config: LLMProviderConfig,
  cells: MatrixCell[],
  contexts: CellContext[],
  targetCount: number,
): Promise<GeneratedQuestion[]> {
  const results: GeneratedQuestion[] = [];

  for (let i = 0; i < cells.length && results.length < targetCount; i++) {
    const cell = cells[i]!;
    const ctx = contexts[i]!;
    const prompt = buildCellSinglePrompt(cell, ctx);
    const question = await callLLM(config, prompt);

    if (question) {
      // 覆盖 LLM 返回的 category 为矩阵指定值
      question.category = cell.category;
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
 * A.1 生成 Golden Set（spec §5.1 + §4.4）
 *
 * 矩阵驱动：按 sourceType × category 矩阵分配 21 个 cell 给 N 个 provider。
 * 每个 provider 批量生成分配到的问题（1 次 LLM call）。
 * 批量失败时自动回退到串行模式。
 *
 * ⚠️ 不做的事：不调用 multi-judge，不做 relevance grading。
 *
 * @param providerConfigs - Provider 配置数组（由 resolveGoldenSetProviders() 生成）
 * @param searchApiKey - 搜索 API key（web_only/cross_source/conflict 需要）
 * @param searchProviderId - 搜索 provider ID（spec §8.1: 默认 "serpapi"，与 MCP 路径一致）
 * @returns The generated golden questions（relevanceGrading = []）
 */
export async function generateGoldenSet(
  providerConfigs: GoldenSetProviderConfig[],
  searchApiKey?: string,
  searchProviderId?: string,
): Promise<GoldenQuestion[]> {
  createGoldenSetTable();

  if (providerConfigs.length === 0) {
    logger.warn("[GoldenSet] No provider configs provided, cannot generate golden set");
    return [];
  }

  // spec §4.4: 矩阵分配（21 cells / N providers）
  const allocation = buildMatrixAllocation(providerConfigs.length);
  const totalQuestions = allocation.flat().length;
  logger.info(`[GoldenSet] Generating ${totalQuestions} questions via matrix allocation (${providerConfigs.length} providers)`);

  // spec §8.1: 检查 web 搜索可用性
  const hasWebSearch = !!searchApiKey;
  if (!hasWebSearch) {
    logger.warn("[GoldenSet] No searchApiKey — web_only/cross_source/conflict will fallback to kb_only");
  }

  // 预获取 web 搜索结果（所有 provider 共享）
  let webResults: Array<{ title: string; url: string; content: string }> = [];
  if (hasWebSearch) {
    // 从 KB sources 提取搜索关键词
    const sources = getAllSources();
    const searchQueries = sources.slice(0, 5).map(s => s.name.replace(/\.\w+$/, ""));
    if (searchQueries.length > 0) {
      webResults = await searchWebForQuestion(searchQueries, searchApiKey!, 15, searchProviderId);
      logger.info(`[GoldenSet] Web search returned ${webResults.length} results`);
    }
  }

  // 并行生成所有 provider 的问题
  const providerPromises = providerConfigs.map(async (pc, providerIndex) => {
    const cells = allocation[providerIndex]!;
    if (cells.length === 0) return [];

    const llmConfig: LLMProviderConfig = {
      providerId: pc.providerId,
      apiKey: pc.apiKey,
      defaultModel: pc.model,
      label: pc.label,
      ...(pc.modelFallbacks && { modelFallbacks: pc.modelFallbacks }),
      ...(pc.enableModelFallback !== undefined && { enableModelFallback: pc.enableModelFallback }),
    };

    // 为每个 cell 收集上下文
    const contexts = collectCellContexts(cells, webResults, hasWebSearch);

    // 尝试批量生成，失败时逐级减半 batch size
    let questions: GeneratedQuestion[] = [];
    let batchSize = cells.length;
    while (batchSize >= 1) {
      const batchCells = cells.slice(0, batchSize);
      const batchContexts = contexts.slice(0, batchSize);
      const batchPrompt = buildCellBatchPrompt(batchCells, batchContexts);
      questions = await callLLMBatch(llmConfig, batchPrompt, batchCells.length);
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
      questions = await generateSerial(llmConfig, cells, contexts, cells.length);
    }

    // 修复 answer 长度和 facts 数量约束（并行执行）
    const repairedQuestions = await Promise.all(
      questions.map(q => repairQuestionConstraints(q, llmConfig)),
    );

    // 构建 GoldenQuestion 对象并存储（spec §5.1: relevanceGrading 留空由 A.2 填充）
    const goldenQuestions: GoldenQuestion[] = [];
    for (let i = 0; i < repairedQuestions.length; i++) {
      const q = repairedQuestions[i]!;
      const cell = cells[i]!;

      // 从 KB chunks 推断 expectedSources
      const ctx = contexts[i]!;
      const expectedSources = ctx.kbChunks.map(c => c.source.name);

      const goldenQuestion: GoldenQuestion = {
        id: `gs-${randomUUID().slice(0, 8)}`,
        agent: "chat",  // spec §5.1: Phase 1 固定为 "chat"
        query: q.query,
        expectedAnswer: q.expected_answer,
        expectedSources: expectedSources.length > 0 ? expectedSources : ["unknown"],
        expectedArticles: q.expected_articles,
        category: cell.category,  // 从矩阵分配，不依赖 LLM 输出
        difficulty: q.difficulty,
        generatedBy: pc.label,
        sourceType: cell.sourceType,  // 从矩阵分配
        expectedSource: mapExpectedSource(cell.sourceType),
        sourceRoutingRationale: mapSourceRoutingRationale(cell.sourceType),
        mustIncludeFacts: q.must_include_facts || [],
        relevanceGrading: [],  // A.2 阶段独立填充
        verifiedBy: "auto",
        contextChunkIds: ctx.kbChunks.map(c => c.chunk.id),  // A.2 grading 正样本
      };
      insertGoldenQuestion(goldenQuestion);
      goldenQuestions.push(goldenQuestion);
    }

    logger.info(`[GoldenSet] ${pc.label}: generated ${goldenQuestions.length}/${cells.length} questions`);
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

  // 验证矩阵覆盖
  const matrixCoverage = new Set(results.map(r => `${r.sourceType}|${r.category}`));
  const expectedCells = allocation.flat().map(c => `${c.sourceType}|${c.category}`);
  const missingCells = expectedCells.filter(c => !matrixCoverage.has(c));
  if (missingCells.length > 0) {
    logger.warn(`[GoldenSet] Matrix coverage gap: ${missingCells.length} cells missing — ${missingCells.join(", ")}`);
  }

  logger.info(`[GoldenSet] Total generated: ${results.length}/${totalQuestions} questions, matrix cells covered: ${matrixCoverage.size}`);
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

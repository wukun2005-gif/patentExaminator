/**
 * Offline Evaluation Runner
 *
 * Runs model configurations against the golden set to compare
 * retrieval quality (recall, MRR, NDCG) and generation quality
 * (faithfulness, groundedness, answer correctness, fact coverage).
 *
 * nf5: Extended with multi-judge metrics and chunk-level relevance grading.
 *
 * Follows CLAUDE.md key isolation: all API keys come from function
 * parameters, never from process.env or keyStore.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getSyncDb, getEvalRunMetas } from "./syncDb.js";

/** 本地时间 ISO-like 格式（不带 Z 后缀） */
function localISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offset) / 60));
  const offM = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${offH}:${offM}`;
}
import { logger } from "./logger.js";
import type { AgentRunRequest, AgentRunResponse } from "./orchestrator.js";
import type { SourceType, ExpectedSource } from "../../../shared/src/types/metrics.js";
import {
  computeRetrievalMetricsBatch,
  computeSemanticMetricsBatch,
  computeSourceRoutingAccuracy,
  computeSourceAttributionAccuracy,
  computeConflictResolution,
  computeRefusalAccuracy,
} from "./evalMetrics.js";
import type { MultiJudgeResult } from "./multiJudge.js";

// ── Type definitions ──────────────────────────────────────

export interface EvalConfig {
  label: string;              // human-readable name
  providerId: string;
  modelId: string;
  searchProvider?: string;
  rerankerType?: string;
  embeddingModel?: string;
}

export interface EvalResult {
  goldenId: string;
  query: string;
  configLabel: string;
  // Chunk-level retrieval metrics（统一用 chunk-level，不再计算 file-level）
  // kb_only 题目有值，其他类型为 undefined（不计入均值）
  recallAtK: number | undefined;  // chunk-level recall（实时 LLM judge 评估）
  ndcgAtK: number | undefined;    // chunk-level NDCG（实时 LLM judge 评估）
  // Generation metrics
  faithfulness: number;       // LLM-as-judge 0-1
  // Performance
  durationMs: number;
  // Raw outputs
  actualAnswer: string;
  actualSources: SourceCitation[];
  error?: string;

  // ── nf5 指标 ──
  answerCorrectness: number;
  factCoverage: number;
  sourceRoutingAccuracy: number;
  sourceAttributionAccuracy: number;
  conflictResolution: number;
  refusalAccuracy: number | undefined;
  kbHitRate: number | undefined;
}

export interface EvalReport {
  runId: string;
  timestamp: string;
  configs: EvalConfigSummary[];
  questionCount: number;
  questionBreakdown: EvalResult[];
  reportJsonPath?: string;
  logPath?: string;
  durationMs?: number;
}

export interface EvalConfigSummary {
  label: string;
  avgRecall: number;          // chunk-level
  avgNdcg: number;            // chunk-level
  avgFaithfulness: number;
  avgDurationMs: number;
  passRate: number;           // % with faithfulness > 0.7

  // ── nf5 指标平均值 ──
  avgAnswerCorrectness: number;
  avgFactCoverage: number;
  avgSourceRoutingAccuracy: number;
  avgKbHitRate: number;
}

interface GoldenQuestion {
  id: string;
  agent: string;
  query: string;
  expectedAnswer: string;
  expectedSources: string[];
  category: string;
  difficulty: string;

  // ── nf5 新增字段 ──
  sourceType: SourceType;
  expectedSource: ExpectedSource;
  sourceRoutingRationale: string;
  mustIncludeFacts: string[];
  verifiedBy: string;
  contextChunkIds?: string[];  // 调试用
}

// ── Golden set loading ────────────────────────────────────

/**
 * Load questions from the metrics_golden_set table.
 * @param evalSetId - optional filter by eval set ID; if omitted, loads all questions
 */
export function loadGoldenSet(evalSetId?: string): GoldenQuestion[] {
  const db = getSyncDb();
  const whereClause = evalSetId ? "WHERE eval_set_id = ?" : "";
  const params = evalSetId ? [evalSetId] : [];
  const rows = db.prepare(
    `SELECT id, agent, query, expected_answer, expected_sources, expected_articles,
            category, difficulty, source_type, expected_source, source_routing_rationale,
            must_include_facts, verified_by, context_chunk_ids
     FROM metrics_golden_set
     ${whereClause}
     ORDER BY category, id`
  ).all(...params) as Array<{
    id: string;
    agent: string;
    query: string;
    expected_answer: string;
    expected_sources: string;
    expected_articles: string;
    category: string;
    difficulty: string;
    source_type: string;
    expected_source: string;
    source_routing_rationale: string;
    must_include_facts: string;
    verified_by: string;
    context_chunk_ids: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    agent: r.agent,
    query: r.query,
    expectedAnswer: r.expected_answer,
    expectedSources: parseJsonArray(r.expected_sources),
    category: r.category,
    difficulty: r.difficulty,
    sourceType: (r.source_type || "kb_only") as SourceType,
    expectedSource: (r.expected_source || "kb") as ExpectedSource,
    sourceRoutingRationale: r.source_routing_rationale || "",
    mustIncludeFacts: parseJsonArray(r.must_include_facts),
    verifiedBy: r.verified_by || "auto",
    contextChunkIds: parseJsonArray(r.context_chunk_ids),
  }));
}

// ── Faithfulness check ────────────────────────────────────

/**
 * Use LLM-as-judge to check if answer is grounded in context.
 * Returns 0-1 score (groundedRatio from judge).
 *
 * @param answer - the generated answer
 * @param context - the knowledge context used for generation
 * @param apiKey - LLM API key for the judge call (CLAUDE.md key isolation)
 * @param providerPreference - providers to use for the judge
 * @param modelId - model for the judge call
 */
// ── Main evaluation runner ────────────────────────────────

/**
 * Run evaluation of one or more model configurations against the golden set.
 *
 * For each config x question, it calls the actual RAG pipeline via `runAgent`,
 * computes retrieval and generation metrics, and stores results in the database.
 *
 * @param configs - model configurations to evaluate
 * @param options.maxConcurrency - max parallel evaluations (default 1)
 * @param options.agentFilter - only run questions for this agent type
 * @param options.judgeApiKeys - API keys for multi-judge metrics
 */
export async function runEvaluation(
  configs: EvalConfig[],
  options?: {
    maxConcurrency?: number;
    /** 批次间延迟（毫秒），避免触发 provider rate limit */
    batchDelayMs?: number;
    agentFilter?: string;
    /** 每个 judge provider 的 API key（MiMo/DeepSeek/Gemini 各自独立） */
    judgeApiKeys?: Record<string, string>;
    /** 可选：指定 eval set ID，只评估该 eval set 中的题目 */
    evalSetId?: string;
    /** 可选：指定 judge 配置（覆盖默认 2-judge 配置） */
    judgeConfigs?: Array<{ providerId: string; modelId: string }>;
    /** 进度回调：每完成一个题目时调用 */
    onProgress?: (current: number, total: number, phase: string) => void;
  }
): Promise<EvalReport> {
  const maxConcurrency = options?.maxConcurrency ?? 3;
  const batchDelayMs = options?.batchDelayMs ?? 5000;
  const judgeApiKeys = options?.judgeApiKeys ?? {};

  // Load golden set (filtered by evalSetId if provided)
  let questions = loadGoldenSet(options?.evalSetId);
  if (options?.agentFilter) {
    questions = questions.filter((q) => q.agent === options.agentFilter);
  }

  if (questions.length === 0) {
    logger.warn("[EvalRunner] No golden questions found. Seed the golden set first.");
    const emptyNow = new Date();
    const emptyPad = (n: number) => String(n).padStart(2, "0");
    const emptyRunId = `eval-${emptyNow.getFullYear()}-${emptyPad(emptyNow.getMonth() + 1)}-${emptyPad(emptyNow.getDate())}T${emptyPad(emptyNow.getHours())}:${emptyPad(emptyNow.getMinutes())}:${emptyPad(emptyNow.getSeconds())}`;
    const report: EvalReport = {
      runId: emptyRunId,
      timestamp: localISO(),
      configs: configs.map((c) => ({
        label: c.label,
        avgRecall: 0, avgNdcg: 0,
        avgFaithfulness: 0,
        avgDurationMs: 0,
        passRate: 0,
        avgAnswerCorrectness: 0, avgFactCoverage: 0,
        avgSourceRoutingAccuracy: 0,
        avgKbHitRate: 0,
      })),
      questionCount: 0,
      questionBreakdown: [],
    };
    return report;
  }

  logger.info(`[EvalRunner] Starting evaluation: ${configs.length} configs x ${questions.length} questions`);

  const allResults: EvalResult[] = [];
  // nf5-2: datetime-based run ID (e.g., "eval-2026-06-18T11:03:41")
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const runId = `eval-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Execute evaluations with controlled concurrency
  for (const config of configs) {
    logger.info(`[EvalRunner] Running config: "${config.label}" (provider=${config.providerId}, model=${config.modelId})`);

    // Phase 1: 批量 RAG 生成（已有并发控制）
    const ragResults = new Map<string, {
      question: GoldenQuestion;
      response: AgentRunResponse;
      durationMs: number;
    }>();

    const chunks = chunkArray(questions, maxConcurrency);
    for (const batch of chunks) {
      const batchPromises = batch.map(async (question) => {
        const startMs = Date.now();
        try {
          const agentReq = buildAgentRequest(question, config);
          const { runAgent } = await import("./orchestrator.js");
          const response = await runAgent(agentReq);
          const durationMs = Date.now() - startMs;
          return { question, response, durationMs };
        } catch (err) {
          const durationMs = Date.now() - startMs;
          const errorMsg = err instanceof Error ? err.message : String(err);
          return { question, response: { ok: false, error: { message: errorMsg } } as AgentRunResponse, durationMs };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const r of batchResults) {
        ragResults.set(r.question.id, r);
      }

      // 报告进度：Phase 1 完成的题目数
      const completedInPhase1 = ragResults.size;
      options?.onProgress?.(completedInPhase1, questions.length, "检索生成");

      // 批次间延迟，避免触发 provider rate limit
      if (batchDelayMs > 0) {
        logger.info(`[EvalRunner] Batch done, waiting ${batchDelayMs}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }

    // Phase 2: 批量检索指标评估（所有题目，包括 KB chunks 和 web search results）
    const retrievalBatchData: Array<{
      questionId: string;
      query: string;
      chunks: Array<{ id: string; text?: string }>;
    }> = [];

    for (const q of questions) {
      const ragResult = ragResults.get(q.id);
      if (ragResult?.response.ok) {
        // 提取所有 citations（KB chunks + web search results）
        const chunks = extractRetrievedChunks(ragResult.response);
        if (chunks.length > 0) {
          retrievalBatchData.push({ questionId: q.id, query: q.query, chunks });
        }
      }
    }

    // 分批评估检索指标（每批 5 题，避免 prompt 过大导致 judge 超时）
    const retrievalBatchSize = 5;
    logger.info(`[EvalRunner] Phase 2: 检索指标评估，${retrievalBatchData.length} 题分批（每批 ${retrievalBatchSize} 题）`);
    const retrievalMetricsMap = retrievalBatchData.length > 0
      ? await computeRetrievalMetricsBatch(retrievalBatchData, judgeApiKeys, 10, retrievalBatchSize, options?.judgeConfigs)
      : new Map();

    // 报告进度：Phase 2 完成
    options?.onProgress?.(questions.length, questions.length, "检索指标评估完成");

    // Phase 3: 批量语义指标评估（分批，每批 7 题）
    const semanticBatchSize = 7;
    const semanticMetricsMap = new Map<string, {
      faithfulness: MultiJudgeResult<number>;
      answerCorrectness: MultiJudgeResult<number>;
      factCoverage: MultiJudgeResult<number>;
    }>();

    for (let i = 0; i < questions.length; i += semanticBatchSize) {
      const batchQuestions = questions.slice(i, i + semanticBatchSize);
      const batchData: Array<{
        questionId: string;
        answer: string;
        context: string;
        expectedAnswer?: string;
        mustIncludeFacts?: string[];
      }> = [];

      for (const q of batchQuestions) {
        const ragResult = ragResults.get(q.id);
        if (ragResult?.response.ok) {
          const answer = extractAnswer(ragResult.response);
          const sources = extractSources(ragResult.response);
          batchData.push({
            questionId: q.id,
            answer,
            context: sources.join("\n"),
            expectedAnswer: q.expectedAnswer,
            ...(q.mustIncludeFacts.length > 0 ? { mustIncludeFacts: q.mustIncludeFacts } : {}),
          });
        }
      }

      if (batchData.length > 0) {
        const semanticOpts = options?.judgeConfigs ? { judgeConfigs: options.judgeConfigs } : undefined;
        const batchResults = await computeSemanticMetricsBatch(batchData, judgeApiKeys, semanticOpts);
        for (const [id, metrics] of batchResults) {
          semanticMetricsMap.set(id, metrics);
        }
      }
    }

    // 报告进度：Phase 3 完成
    options?.onProgress?.(questions.length, questions.length, "语义指标评估完成");

    // Phase 4: 组装最终结果
    for (const question of questions) {
      const ragResult = ragResults.get(question.id);
      if (!ragResult) continue;

      const { response, durationMs } = ragResult;

      if (!response.ok) {
        const result = buildErrorResult(question, config, durationMs, response.error?.message);
        saveSingleResult(result, runId, config);
        allResults.push(result);
        continue;
      }

      const actualAnswer = extractAnswer(response);
      const actualSources = extractSources(response);

      // 获取预计算的指标
      const retrievalMetrics = retrievalMetricsMap.get(question.id);
      const semanticMetrics = semanticMetricsMap.get(question.id);

      const recallAtK = retrievalMetrics?.recall;
      const ndcgAtK = retrievalMetrics?.ndcg;
      const kbHitRate = question.sourceType === "kb_only" ? recallAtK : undefined;

      const faithfulness = semanticMetrics?.faithfulness.aggregated ?? 0;
      const answerCorrectness = semanticMetrics?.answerCorrectness.aggregated ?? 0;
      const factCoverage = semanticMetrics?.factCoverage.aggregated ?? 0;

      const actualSourceFlags = {
        kb: response.knowledgeCitations ? response.knowledgeCitations.length > 0 : false,
        web: response.webSearchCitations ? response.webSearchCitations.length > 0 : false,
      };
      const sourceRoutingAccuracy = computeSourceRoutingAccuracy(question.expectedSource, actualSourceFlags);

      const actualSourceTitles = actualSources.map(s => s.title);
      const allCandidateSources = [...new Set([...question.expectedSources, ...actualSourceTitles])];
      const citedSources = extractCitedSourcesFromAnswer(actualAnswer, allCandidateSources);
      const sourceAttributionAccuracy = computeSourceAttributionAccuracy(citedSources, actualSourceTitles);

      const conflictResolution = computeConflictResolution(
        question.sourceType, question.expectedSource,
        actualSourceFlags.kb && actualSourceFlags.web ? "mixed" : actualSourceFlags.kb ? "kb" : "web"
      );

      // Refusal Accuracy 单独调用（仅 no_answer 题需要）
      let refusalAccuracy: number | undefined;
      if (question.sourceType === "no_answer" && actualAnswer.trim().length > 0) {
        const refusalResult = await computeRefusalAccuracy(question.sourceType, actualAnswer, judgeApiKeys);
        refusalAccuracy = refusalResult.aggregated;
      }

      const result: EvalResult = {
        goldenId: question.id,
        query: question.query,
        configLabel: config.label,
        recallAtK,
        ndcgAtK,
        faithfulness,
        durationMs,
        actualAnswer: actualAnswer.slice(0, 2000),
        actualSources,
        answerCorrectness,
        factCoverage,
        sourceRoutingAccuracy,
        sourceAttributionAccuracy,
        conflictResolution,
        refusalAccuracy,
        kbHitRate,
      };

      saveSingleResult(result, runId, config);
      allResults.push(result);

      // 报告进度：Phase 4 组装结果
      options?.onProgress?.(allResults.length, questions.length, "组装评估结果");

      const recallStr = recallAtK !== undefined ? recallAtK.toFixed(2) : "N/A";
      const ndcgStr = ndcgAtK !== undefined ? ndcgAtK.toFixed(2) : "N/A";
      const status = response.ok ? "OK" : "MISS";
      logger.info(`[EvalRunner]   Q=${question.id} ${status}: recall=${recallStr} ndcg=${ndcgStr} faith=${faithfulness.toFixed(2)} ${durationMs}ms`);
    }
  }

  // Generate summary report
  const report = buildReport(runId, configs, questions.length, allResults);

  // Note: results already saved by saveSingleResult() during evaluation, no need to saveReport() again

  logger.info(`[EvalRunner] Evaluation complete: ${allResults.length} results, report=${report.runId}`);
  return report;
}

// ── Report building ───────────────────────────────────────

function buildReport(
  runId: string,
  configs: EvalConfig[],
  questionCount: number,
  results: EvalResult[]
): EvalReport {
  const configSummaries: EvalConfigSummary[] = configs.map((config) => {
    const configResults = results.filter((r) => r.configLabel === config.label);
    const successResults = configResults.filter((r) => !r.error);

    return {
      label: config.label,
      avgRecall: avg(successResults.map((r) => r.recallAtK).filter((v): v is number => v !== undefined)),
      avgNdcg: avg(successResults.map((r) => r.ndcgAtK).filter((v): v is number => v !== undefined)),
      avgFaithfulness: avg(successResults.map((r) => r.faithfulness)),
      avgDurationMs: avg(configResults.map((r) => r.durationMs)),
      passRate: configResults.length > 0
        ? configResults.filter((r) => r.faithfulness > 0.7).length / configResults.length
        : 0,
      avgAnswerCorrectness: avg(successResults.map((r) => r.answerCorrectness)),
      avgFactCoverage: avg(successResults.map((r) => r.factCoverage)),
      avgSourceRoutingAccuracy: avg(successResults.map((r) => r.sourceRoutingAccuracy)),
      avgKbHitRate: avg(successResults.map((r) => r.kbHitRate).filter((v): v is number => v !== undefined)),
    };
  });

  return {
    runId,
    timestamp: localISO(),
    configs: configSummaries,
    questionCount,
    questionBreakdown: results,
  };
}

// ── Database persistence ──────────────────────────────────

/**
 * Save an entire evaluation report to metrics_golden_runs.
 */
export function saveReport(report: EvalReport): void {
  const db = getSyncDb();
  const stmt = db.prepare(`
    INSERT INTO metrics_golden_runs (id, golden_id, run_id, timestamp, config_json,
      recall_at_k, mrr, ndcg_at_k, faithfulness, groundedness, actual_answer, actual_sources,
      answer_correctness, fact_coverage, source_routing_accuracy,
      source_attribution_accuracy, conflict_resolution, refusal_accuracy, kb_hit_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction(() => {
    for (const r of report.questionBreakdown) {
      stmt.run(
        randomUUID(),
        r.goldenId,
        report.runId,
        report.timestamp,
        JSON.stringify({
          label: r.configLabel,
          durationMs: r.durationMs,
          error: r.error,
        }),
        r.recallAtK,
        0,              // mrr: 已废弃（chunk-level 不需要）
        r.ndcgAtK,
        r.faithfulness,
        0,              // groundedness: 已废弃（与 faithfulness 重复）
        r.actualAnswer,
        JSON.stringify(r.actualSources),
        r.answerCorrectness,
        r.factCoverage,
        r.sourceRoutingAccuracy,
        r.sourceAttributionAccuracy,
        r.conflictResolution,
        r.refusalAccuracy,
        r.kbHitRate
      );
    }
  });

  insert();
  logger.info(`[EvalRunner] Saved ${report.questionBreakdown.length} results for report ${report.runId}`);
}

/**
 * Save a single eval result to metrics_golden_runs.
 */
function saveSingleResult(result: EvalResult, runId: string, config: EvalConfig): void {
  try {
    const db = getSyncDb();
    db.prepare(`
      INSERT INTO metrics_golden_runs (id, golden_id, run_id, timestamp, config_json,
        recall_at_k, mrr, ndcg_at_k, faithfulness, groundedness, actual_answer, actual_sources,
        answer_correctness, fact_coverage, source_routing_accuracy,
        source_attribution_accuracy, conflict_resolution, refusal_accuracy, kb_hit_rate)
      VALUES (?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      result.goldenId,
      runId,
      JSON.stringify({
        label: config.label,
        durationMs: result.durationMs,
        error: result.error,
      }),
      result.recallAtK,
      0,              // mrr: 已废弃
      result.ndcgAtK,
      result.faithfulness,
      0,              // groundedness: 已废弃
      result.actualAnswer,
      JSON.stringify(result.actualSources),
      result.answerCorrectness,
      result.factCoverage,
      result.sourceRoutingAccuracy,
      result.sourceAttributionAccuracy,
      result.conflictResolution,
      result.refusalAccuracy,
      result.kbHitRate
    );
  } catch (err) {
    logger.warn(`[EvalRunner] Failed to save single result: ${err}`);
  }
}

/**
 * Load all past evaluation reports from metrics_golden_runs.
 */
export function getReports(): EvalReport[] {
  const db = getSyncDb();
  const rows = db.prepare(
    `SELECT DISTINCT run_id, timestamp FROM metrics_golden_runs ORDER BY timestamp DESC`
  ).all() as Array<{ run_id: string; timestamp: string }>;

  // 加载 run 级文件路径元数据
  const runMetas = getEvalRunMetas();

  const reports: EvalReport[] = [];
  for (const row of rows) {
    const resultRows = db.prepare(
      `SELECT golden_id, config_json, recall_at_k, mrr, ndcg_at_k, faithfulness, groundedness,
              actual_answer, actual_sources,
              answer_correctness, fact_coverage, source_routing_accuracy,
              source_attribution_accuracy, conflict_resolution, refusal_accuracy, kb_hit_rate
       FROM metrics_golden_runs WHERE run_id = ? ORDER BY golden_id`
    ).all(row.run_id) as Array<{
      golden_id: string;
      config_json: string;
      recall_at_k: number;
      mrr: number;
      ndcg_at_k: number;
      faithfulness: number;
      groundedness: number;
      actual_answer: string;
      actual_sources: string;
      answer_correctness: number;
      fact_coverage: number;
      source_routing_accuracy: number;
      source_attribution_accuracy: number;
      conflict_resolution: number;
      refusal_accuracy: number;
      kb_hit_rate: number;
    }>;

    const results: EvalResult[] = resultRows.map((r) => {
      const configMeta = parseJsonSafe<{ label?: string; durationMs?: number; error?: string }>(r.config_json, {});
      const result: EvalResult = {
        goldenId: r.golden_id,
        query: "", // not stored per-row, available from golden set join
        configLabel: configMeta.label ?? "unknown",
        recallAtK: r.recall_at_k,
        ndcgAtK: r.ndcg_at_k,
        faithfulness: r.faithfulness,
        durationMs: configMeta.durationMs ?? 0,
        actualAnswer: r.actual_answer,
        actualSources: parseJsonArray(r.actual_sources) as unknown as import("./evalRunner.js").SourceCitation[],
        answerCorrectness: r.answer_correctness ?? 0,
        factCoverage: r.fact_coverage ?? 0,
        sourceRoutingAccuracy: r.source_routing_accuracy ?? 0,
        sourceAttributionAccuracy: r.source_attribution_accuracy ?? 0,
        conflictResolution: r.conflict_resolution ?? 0,
        refusalAccuracy: r.refusal_accuracy ?? 0,
        kbHitRate: r.kb_hit_rate ?? 0,
      };
      if (configMeta.error !== undefined) result.error = configMeta.error;
      return result;
    });

    // Collect unique configs from results
    const configLabels = [...new Set(results.map((r) => r.configLabel))];
    const configSummaries = configLabels.map((label) => {
      const configResults = results.filter((r) => r.configLabel === label);
      const successResults = configResults.filter((r) => !r.error);
      return {
        label,
        avgRecall: avg(successResults.map((r) => r.recallAtK).filter((v): v is number => v !== undefined)),
        avgNdcg: avg(successResults.map((r) => r.ndcgAtK).filter((v): v is number => v !== undefined)),
        avgFaithfulness: avg(successResults.map((r) => r.faithfulness)),
        avgDurationMs: avg(configResults.map((r) => r.durationMs)),
        passRate: configResults.length > 0
          ? configResults.filter((r) => r.faithfulness > 0.7).length / configResults.length
          : 0,
        avgAnswerCorrectness: avg(successResults.map((r) => r.answerCorrectness)),
        avgFactCoverage: avg(successResults.map((r) => r.factCoverage)),
        avgSourceRoutingAccuracy: avg(successResults.map((r) => r.sourceRoutingAccuracy)),
        avgKbHitRate: avg(successResults.map((r) => r.kbHitRate).filter((v): v is number => v !== undefined)),
      };
    });

    const meta = runMetas.get(row.run_id);
    const report: EvalReport = {
      runId: row.run_id,
      timestamp: row.timestamp,
      configs: configSummaries,
      questionCount: new Set(results.map(r => r.goldenId)).size,
      questionBreakdown: results,
    };
    if (meta?.reportJsonPath) report.reportJsonPath = meta.reportJsonPath;
    if (meta?.logPath) report.logPath = meta.logPath;
    if (meta?.durationMs) {
      report.durationMs = meta.durationMs;
    } else {
      // 从 questionBreakdown 计算总耗时（取各 config 最大值之和）
      const configDurations = new Map<string, number>();
      for (const r of results) {
        const cur = configDurations.get(r.configLabel) ?? 0;
        configDurations.set(r.configLabel, cur + (r.durationMs ?? 0));
      }
      const totalDuration = [...configDurations.values()].reduce((a, b) => a + b, 0);
      if (totalDuration > 0) report.durationMs = totalDuration;
    }

    // 如果 meta 没有路径，尝试从 eval-logs 目录搜索匹配文件
    if (!report.reportJsonPath || !report.logPath) {
      try {
        const evalLogsDir = path.resolve(process.cwd(), "data", "eval-logs");
        if (fs.existsSync(evalLogsDir)) {
          const files = fs.readdirSync(evalLogsDir);
          if (!report.reportJsonPath) {
            const jsonFile = files.find(f => f.includes(row.run_id) && f.endsWith(".json"));
            if (jsonFile) report.reportJsonPath = path.join(evalLogsDir, jsonFile);
          }
          if (!report.logPath) {
            const logFile = files.find(f => f.includes(row.run_id) && f.endsWith(".log"));
            if (logFile) report.logPath = path.join(evalLogsDir, logFile);
          }
        }
      } catch { /* ignore */ }
    }

    reports.push(report);
  }

  return reports;
}

/**
 * Delete an evaluation report by runId.
 */
export function deleteReport(runId: string): boolean {
  const db = getSyncDb();
  const result = db.prepare("DELETE FROM metrics_golden_runs WHERE run_id = ?").run(runId);
  return result.changes > 0;
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Build an AgentRunRequest from a golden question and eval config.
 * 只传 question 相关数据，其他配置由 orchestrator 从 DB 自动读取。
 */
function buildAgentRequest(
  question: GoldenQuestion,
  _config: EvalConfig,
): AgentRunRequest {
  const requestPayload = buildPayloadForAgent(question.agent, question.query);

  return {
    agent: question.agent,
    caseId: `eval-${question.id}`,
    request: requestPayload,
    // 不传 providerPreference、modelId、knowledgeEnabled、
    // knowledgeEmbedding、knowledgeReranker、searchApiKey、webSearchEnabled
    // orchestrator 从 DB 自动读取所有 production 配置
    // thinking mode 模型（如 qwen3.7-max）推理时间长，需要 5 分钟超时
    timeoutMs: 300_000,
  };
}

/**
 * Build the request payload for a specific agent type.
 * Maps the golden question's query to the expected agent input format.
 */
function buildPayloadForAgent(agent: string, query: string): Record<string, unknown> {
  switch (agent) {
    case "chat":
      return { userMessage: query, caseId: "eval", moduleScope: "eval" };
    case "claim-chart":
      return { claimText: query, claimNumber: 1 };
    case "novelty":
    case "inventive":
      return { features: [{ featureCode: "A", description: query }] };
    case "defects":
      return { claimText: query };
    case "interpret":
      return { documentText: query, documentType: "application" };
    case "opinion-analysis":
      return { officeActionText: query };
    case "argument-analysis":
      return { responseText: query };
    case "reexam-draft":
      return { rejectionGrounds: [{ code: "RG-1", category: "other", summary: query }] };
    case "summary":
      return { confirmedFeatures: query };
    case "translate":
      return { documentText: query, targetLang: "中文" };
    default:
      return { userMessage: query };
  }
}

/**
 * Extract the answer text from an agent response.
 */
function extractAnswer(response: AgentRunResponse): string {
  if (!response.output) return "";
  if (typeof response.output === "string") return response.output;
  if (typeof response.output === "object" && response.output !== null) {
    const obj = response.output as Record<string, unknown>;
    // Common response shapes
    if (typeof obj.reply === "string") return obj.reply;
    if (typeof obj.body === "string") return obj.body;
    // Fallback: stringify the output
    return JSON.stringify(obj).slice(0, 4000);
  }
  return String(response.output).slice(0, 4000);
}

/**
 * Extract source names from an agent response.
 * Combines knowledge citations and web search citations.
 */
/** 单条引用信息（含可选 URL 供 web 结果点击跳转） */
export interface SourceCitation {
  title: string;
  url?: string;
  type: "knowledge" | "web";
}

function extractSources(response: AgentRunResponse): SourceCitation[] {
  const seen = new Set<string>();
  const sources: SourceCitation[] = [];

  // 使用 mergedCitations（reranker 排序后的结果），保持原始顺序
  if (response.mergedCitations) {
    for (const c of response.mergedCitations) {
      if (!seen.has(c.title)) {
        seen.add(c.title);
        // 根据 engine 判断类型：rag = knowledge, 其他 = web
        const type: "knowledge" | "web" = c.engine === "rag" ? "knowledge" : "web";
        const citation: SourceCitation = { title: c.title, type };
        if (c.url) citation.url = c.url;
        sources.push(citation);
      }
    }
  }

  return sources;
}

function buildErrorResult(
  question: GoldenQuestion,
  config: EvalConfig,
  durationMs: number,
  error?: string
): EvalResult {
  return {
    goldenId: question.id,
    query: question.query,
    configLabel: config.label,
    recallAtK: 0,
    ndcgAtK: 0,
    faithfulness: 0,
    durationMs,
    actualAnswer: "",
    actualSources: [],
    error: error ?? "unknown error",
    answerCorrectness: 0,
    factCoverage: 0,
    sourceRoutingAccuracy: 0,
    sourceAttributionAccuracy: 0,
    conflictResolution: 0,
    refusalAccuracy: 0,
    kbHitRate: 0,
  };
}

/**
 * 从 agent response 中提取检索到的 chunk 信息
 * 用于 chunk 级 NDCG/Recall 计算
 */
function extractRetrievedChunks(
  response: AgentRunResponse
): Array<{ id: string; text?: string }> {
  // 优先用 mergedCitations（已融合重排的结果），符合 golden-set-spec.md §2.1 M1/M2 定义：
  // "retrievedChunks：实际检索到的 citations 列表（包括 KB chunks 和 web search results，按排序顺序）"
  if (response.mergedCitations && response.mergedCitations.length > 0) {
    const seen = new Set<string>();
    return response.mergedCitations
      .map(c => ({ id: c.url || c.title || "", text: c.snippet }))
      .filter(c => {
        if (!c.id || seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
  }

  // Fallback：无 mergedCitations 时，合并 KB + web
  const chunks: Array<{ id: string; text?: string }> = [];

  if (response.knowledgeCitations) {
    for (const c of response.knowledgeCitations) {
      chunks.push({ id: c.chunkId || c.sourceId || c.source || "", text: c.excerpt });
    }
  }

  if (response.webSearchCitations) {
    for (const c of response.webSearchCitations) {
      chunks.push({ id: c.url || c.title || "", text: c.snippet });
    }
  }

  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (!c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// ── Source attribution ─────────────────────────────────────

/**
 * 从答案文本中提取引用的来源名称
 *
 * 在答案中搜索 candidateSources 里出现的来源名，
 * 返回答案实际引用的来源列表。
 * 用于 sourceAttributionAccuracy：对比"答案中引用的来源"vs"实际检索到的来源"。
 */
function extractCitedSourcesFromAnswer(
  answer: string,
  candidateSources: string[]
): string[] {
  if (!answer || candidateSources.length === 0) return [];
  const lowerAnswer = answer.toLowerCase();
  return candidateSources.filter((source) => {
    const normSource = source
      .toLowerCase()
      .replace(/\.\w{1,5}$/i, "")
      .trim();
    return normSource.length > 2 && lowerAnswer.includes(normSource);
  });
}

// ── Utility ───────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function parseJsonArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonSafe<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

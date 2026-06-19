// ── Metrics Run Record ─────────────────────────────────
// One record per agent call, persisted to metrics_runs table

export interface MetricsRun {
  id: string;
  timestamp: string;          // ISO datetime
  agent: string;              // claim-chart, novelty, chat, etc.
  caseId: string;

  // Model combination
  providerId: string;
  modelId: string;
  searchProvider: string;     // tavily, serpapi, epo, ''
  rerankerType: string;       // remote, cross-encoder, local, ''
  embeddingModel: string;     // BAAI/bge-m3, ''

  // Latency
  durationMs: number;
  ttftMs: number;             // time to first token
  toolRounds: number;

  // Token usage
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thinkingTokens: number;

  // RAG quality
  ragCitationCount: number;
  topCitationScore: number;   // best cosine similarity
  rerankerTopScore: number;

  // Web search
  webSearchCount: number;
  webSearchRounds: number;

  // Groundedness
  groundingScore: number;     // -1 = not checked, 0-1 = score
  groundingVerdict: string;   // pass, partial, fail, ''
  removedClaimsCount: number;

  // Outcome
  success: boolean;
  errorType: string;
  errorCode: string;

  // JSON fields
  attemptsJson: string;       // Array<{providerId, ok, errorCode}>
  timingsJson: string;        // RunTimings JSON

  // Feedback & experiments
  userFeedback: string;       // like, dislike, ''
  experimentId: string;
  variant: string;
}

// ── Per-Stage Timing Breakdown ─────────────────────────

export interface RunTimings {
  promptBuildMs: number;
  ragSearchMs: number;
  rerankMs: number;
  llmCallMs: number;
  groundednessMs: number;
  totalMs: number;
}

// ── Quality Signals from Tool Executor ──────────────────

export interface QualitySignals {
  ragTopScore: number;
  rerankerTopScore: number;
  webResultCount: number;
  toolRounds: number;
  fusionMethod: 'remote-reranker' | 'cross-encoder' | 'local-heuristic';
}

// ── API Response Types ─────────────────────────────────

export interface MetricsSummary {
  totalRuns: number;
  successRate: number;
  avgGroundedness: number;
  avgDurationMs: number;
  totalTokens: number;
  byModel: ModelMetricsRow[];
}

export interface ModelMetricsRow {
  providerId: string;
  modelId: string;
  runCount: number;
  successRate: number;
  avgGroundedness: number;
  avgDurationMs: number;
  avgTokensPerRun: number;
  avgRagScore: number;
}

export interface MetricsTrendPoint {
  date: string;
  value: number;
  count: number;
}

export interface MetricsComparison {
  configs: ComparisonColumn[];
}

export interface ComparisonColumn {
  label: string;
  providerId: string;
  modelId: string;
  runCount: number;
  avgGroundedness: number;
  avgDurationMs: number;
  successRate: number;
  avgRagScore: number;
}

export interface LatencyPercentiles {
  p50: number;
  p90: number;
  p99: number;
  avg: number;
  stage: string;
}

// ── Eval Set Management (nf5-2 Phase 1) ───────────────

/** 评估集元数据（不含具体 questions） */
export interface EvalSet {
  id: string;                        // datetime-based unique set ID
  name: string;                      // 用户可编辑的名称
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  sourceTypeDistribution: Record<string, number>;  // {kb_only: 5, web_only: 5, ...}
  status: 'ready' | 'generating' | 'error';
  errorMessage: string;
  metadata: Record<string, unknown>;
}

// ── Golden Evaluation Set ──────────────────────────────

/** 题目来源类型（nf5 spec §2.3） */
export type SourceType = "kb_only" | "web_only" | "cross_source" | "conflict" | "no_answer";

/** 预期答案来源 */
export type ExpectedSource = "kb" | "web" | "kb+web" | "any";

/** 验证方式 */
export type VerificationMethod = "human" | "llm-judge" | "auto";

/** 单个 Judge 的独立打分结果（nf5 spec §7.2） */
export interface JudgeResult {
  provider: string;             // judge provider ID（mimo / volcengine / gemini）
  grade: 0 | 1 | 2 | 3 | null; // null = judge 调用失败
  rationale: string;            // 打分理由（judge_failed 表示调用失败）
}

/** Chunk 级 relevance grading（nf5 spec §2.2，TREC/NIST 0-3 标准） */
export interface RelevanceGrade {
  source: "kb" | "web";
  docId: string;
  chunkId?: string;
  grade: 0 | 1 | 2 | 3;      // 聚合后的最终 grade（majority vote / 中位数）
  rationale: string;           // 聚合理由
  judges?: JudgeResult[];      // 每个 judge 的独立打分 + 理由（spec §7.2）
}

export interface GoldenQuestion {
  id: string;
  createdAt: string;
  agent: string;
  query: string;
  expectedAnswer: string;
  expectedSources: string[];    // file names
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  generatedBy: string;

  // ── nf5 新增字段 ──
  sourceType: SourceType;
  expectedSource: ExpectedSource;
  sourceRoutingRationale: string;
  mustIncludeFacts: string[];
  verifiedBy: VerificationMethod;
  contextChunkIds?: string[];   // 调试用：记录生成时使用的 chunk IDs
}

export interface GoldenRunResult {
  id: string;
  goldenId: string;
  runId: string;
  timestamp: string;
  configJson: string;
  recallAtK: number;          // chunk-level
  ndcgAtK: number;            // chunk-level
  faithfulness: number;
  actualAnswer: string;
  actualSources: string[];

  answerCorrectness: number;
  factCoverage: number;
  sourceRoutingAccuracy: number;
  sourceAttributionAccuracy: number;
  conflictResolution: number;
  refusalAccuracy: number;
  kbHitRate: number;
}

export interface EvalReport {
  runId: string;
  timestamp: string;
  configs: EvalConfigSummary[];
  questionBreakdown: EvalQuestionRow[];
}

export interface EvalConfigSummary {
  label: string;
  avgRecall: number;
  avgNdcg: number;
  avgFaithfulness: number;
  avgDurationMs: number;
  passRate: number;

  avgAnswerCorrectness: number;
  avgFactCoverage: number;
  avgSourceRoutingAccuracy: number;
  avgKbHitRate: number;
}

export interface EvalQuestionRow {
  query: string;
  results: Array<{ configLabel: string; recall: number; ndcg: number }>;
}

// ── Drift Detection ────────────────────────────────────

export interface DriftAlert {
  id: string;
  agent: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  deviationSigma: number;
  detectedAt: string;
  severity: 'warning' | 'critical';
}

// ── Filters for API Queries ────────────────────────────

export interface MetricsFilters {
  agent?: string;
  providerId?: string;
  modelId?: string;
  from?: string;
  to?: string;
  experimentId?: string;
}

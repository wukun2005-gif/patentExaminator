/**
 * Golden Set B — 质量评估
 *
 * spec §5.2: 验证 A.1 产出的 golden set 本身质量是否达标。
 *
 * 为什么需要这个阶段？
 * Golden set 是所有指标的 ground truth 来源。如果 golden set 质量差
 * （题目不合理、答案错误），后续 D 阶段产出的所有指标都不可信——垃圾进，垃圾出。
 *
 * B 阶段是 golden set 的"出厂质检"，确保只有合格的 golden set 才进入 D 阶段。
 *
 * 所有检查都是确定性规则，不调用 LLM。
 */
import path from "path";
import { getSyncDb } from "./syncDb.js";
import { logger } from "./logger.js";

const DATA_DIR = process.env.SYNC_DB_DIR ?? path.resolve(process.cwd(), "data");
const GOLDEN_SET_DB_PATH = process.env.SYNC_DB_PATH ?? path.join(DATA_DIR, "patent-examiner.db");

// ── Types ─────────────────────────────────────────────

export interface CheckResult {
  passed: boolean;
  detail: string;
  questions?: string[];  // 有问题的题目 ID
}

export interface QualityReport {
  passed: boolean;
  totalQuestions: number;
  goldenSetPath: string;  // golden set JSON 文件的完整路径
  checks: {
    B1_count: CheckResult;
    B2_matrix: CheckResult;
    B3_query_quality: CheckResult;
    B4_answer_quality: CheckResult;
    B5_facts_quality: CheckResult;
    B10_no_duplicates: CheckResult;
  };
  warnings: string[];
  recommendation: string;
}

// ── DB Helpers ────────────────────────────────────────

interface GoldenQuestionRow {
  id: string;
  query: string;
  expected_answer: string;
  expected_articles: string;
  category: string;
  source_type: string;
  must_include_facts: string;
  context_chunk_ids: string;
}

function loadAllQuestions(evalSetId?: string): GoldenQuestionRow[] {
  const db = getSyncDb();
  const where = evalSetId ? "WHERE eval_set_id = ?" : "";
  const params = evalSetId ? [evalSetId] : [];
  return db.prepare(
    `SELECT id, query, expected_answer, expected_articles, category,
            source_type, must_include_facts, context_chunk_ids
     FROM metrics_golden_set ${where} ORDER BY created_at`
  ).all(...params) as GoldenQuestionRow[];
}

function safeParseJson<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Expected Matrix (spec §4.4) ───────────────────────

/** 21 个非零 cell 的 sourceType × category 组合（与 goldenSetGenerator.ts 一致） */
const ALL_CELLS: Array<{ sourceType: string; category: string }> = [
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

/**
 * 根据题数动态构建期望矩阵（与 goldenSetGenerator.ts 的 buildMatrixAllocation 一致）。
 * - questionCount < 21: 均匀采样，每个 sourceType 至少保留 1 个
 * - questionCount > 21: 重复 cell 直到达到目标数量
 * - questionCount == 21 或未指定: 使用全部 21 个 cell
 */
function buildExpectedMatrix(questionCount?: number): Array<{ sourceType: string; category: string }> {
  if (!questionCount || questionCount === ALL_CELLS.length) return ALL_CELLS;
  if (questionCount < ALL_CELLS.length) {
    const step = ALL_CELLS.length / questionCount;
    return Array.from({ length: questionCount }, (_, i) => ALL_CELLS[Math.floor(i * step)]!);
  }
  // 扩展
  const cells: typeof ALL_CELLS = [];
  while (cells.length < questionCount) {
    for (const cell of ALL_CELLS) {
      if (cells.length >= questionCount) break;
      cells.push(cell);
    }
  }
  return cells;
}

// ── Quality Checks ────────────────────────────────────

function checkB1Count(questions: GoldenQuestionRow[], expectedCount: number): CheckResult {
  const passed = questions.length === expectedCount;
  return { passed, detail: `${questions.length}/${expectedCount}` };
}

function checkB2Matrix(questions: GoldenQuestionRow[], expectedMatrix: Array<{ sourceType: string; category: string }>): CheckResult {
  const covered = new Set<string>();
  for (const q of questions) {
    covered.add(`${q.source_type}|${q.category}`);
  }

  const missing: string[] = [];
  for (const cell of expectedMatrix) {
    const key = `${cell.sourceType}|${cell.category}`;
    if (!covered.has(key)) missing.push(key);
  }

  const passed = missing.length === 0;
  return {
    passed,
    detail: passed
      ? `${expectedMatrix.length}/${expectedMatrix.length} cells covered`
      : `${expectedMatrix.length - missing.length}/${expectedMatrix.length} cells covered, missing: ${missing.join(", ")}`,
  };
}

function checkB3QueryQuality(questions: GoldenQuestionRow[]): CheckResult {
  const issues: string[] = [];
  for (const q of questions) {
    if (q.query.length < 20) {
      issues.push(`${q.id}: query too short (${q.query.length} chars)`);
    }
  }
  return {
    passed: issues.length === 0,
    detail: issues.length === 0 ? "0 issues" : `${issues.length} queries too short`,
    questions: issues.map(i => i.split(":")[0]!),
  };
}

function checkB4AnswerQuality(questions: GoldenQuestionRow[]): CheckResult {
  const issues: string[] = [];
  for (const q of questions) {
    const len = q.expected_answer.length;
    if (len < 200) {
      issues.push(`${q.id}: answer too short (${len} chars, min 200)`);
    } else if (len > 500) {
      issues.push(`${q.id}: answer too long (${len} chars, max 500)`);
    }
  }
  return {
    passed: issues.length === 0,
    detail: issues.length === 0 ? "0 issues" : `${issues.length} answers out of range`,
    questions: issues.map(i => i.split(":")[0]!),
  };
}

function checkB5FactsQuality(questions: GoldenQuestionRow[]): CheckResult {
  const issues: string[] = [];
  for (const q of questions) {
    const facts = safeParseJson<string[]>(q.must_include_facts, []);
    if (facts.length < 3) {
      issues.push(`${q.id}: only ${facts.length} facts (min 3)`);
    } else if (facts.length > 8) {
      issues.push(`${q.id}: too many facts (${facts.length}, max 8)`);
    }
  }
  return {
    passed: issues.length === 0,
    detail: issues.length === 0 ? "0 issues" : `${issues.length} questions with bad fact count`,
    questions: issues.map(i => i.split(":")[0]!),
  };
}

function checkB10NoDuplicates(questions: GoldenQuestionRow[]): CheckResult {
  const seen = new Map<string, string>();  // normalized query → first id
  const duplicates: string[] = [];

  for (const q of questions) {
    const normalized = q.query.toLowerCase().replace(/\s+/g, "").slice(0, 50);
    const existing = seen.get(normalized);
    if (existing) {
      duplicates.push(q.id);
    } else {
      seen.set(normalized, q.id);
    }
  }

  return {
    passed: duplicates.length === 0,
    detail: duplicates.length === 0
      ? "0 duplicates"
      : `${duplicates.length} duplicate queries`,
    questions: duplicates,
  };
}

// ── Decision Rules ────────────────────────────────────

function buildRecommendation(
  checks: QualityReport["checks"],
  _warnings: string[],
): string {
  // B1/B2 不通过 → 重跑 A.1
  if (!checks.B1_count.passed || !checks.B2_matrix.passed) {
    return "REGENERATE_A1 — 评估用例数或矩阵覆盖不合格";
  }
  // 其他检查不通过 → 标记不可信
  const failedChecks = Object.entries(checks).filter(([_, v]) => !v.passed);
  if (failedChecks.length > 0) {
    return `PROCEED_WITH_CAUTION — ${failedChecks.length} checks failed, review flagged questions`;
  }
  return "PROCEED — all checks passed";
}

// ── Public API ────────────────────────────────────────

/**
 * 对 golden set 执行 B 阶段质量评估。
 *
 * spec §5.2: 确定性检查，不调用 LLM。
 *
 * @returns 质量报告（通过 / 不通过 + 具体问题清单）
 */
export function evaluateGoldenSetQuality(evalSetId?: string): QualityReport {
  const questions = loadAllQuestions(evalSetId);

  // 从 eval set 的 question_count 读取期望题数；没有 eval set 时用实际题数
  let expectedCount = questions.length;
  if (evalSetId) {
    const db = getSyncDb();
    const row = db.prepare("SELECT question_count FROM metrics_eval_sets WHERE id = ?").get(evalSetId) as { question_count: number } | undefined;
    if (row && row.question_count > 0) expectedCount = row.question_count;
  }

  const expectedMatrix = buildExpectedMatrix(expectedCount);
  logger.info(`[B Quality] Starting quality evaluation for ${questions.length} questions (expected=${expectedCount})${evalSetId ? ` (evalSet=${evalSetId})` : ""}`);

  const checks = {
    B1_count: checkB1Count(questions, expectedCount),
    B2_matrix: checkB2Matrix(questions, expectedMatrix),
    B3_query_quality: checkB3QueryQuality(questions),
    B4_answer_quality: checkB4AnswerQuality(questions),
    B5_facts_quality: checkB5FactsQuality(questions),
    B10_no_duplicates: checkB10NoDuplicates(questions),
  };

  const warnings: string[] = [];
  for (const [name, result] of Object.entries(checks)) {
    if (!result.passed && result.questions) {
      for (const qId of result.questions) {
        warnings.push(`${qId}: ${name} check failed`);
      }
    }
  }

  const recommendation = buildRecommendation(checks, warnings);
  const passed = recommendation.startsWith("PROCEED") && !recommendation.includes("CAUTION");

  const report: QualityReport = {
    passed,
    totalQuestions: questions.length,
    goldenSetPath: GOLDEN_SET_DB_PATH,
    checks,
    warnings,
    recommendation,
  };

  logger.info(`[B Quality] Complete: ${recommendation}`);
  return report;
}

// ── C Stage: Clean failing questions ──────────────────

/** 从质量报告中收集不合格题目 ID */
function collectFailingIds(report: QualityReport): Set<string> {
  const ids = new Set<string>();

  for (const key of ["B3_query_quality", "B4_answer_quality", "B5_facts_quality", "B10_no_duplicates"] as const) {
    const check = report.checks[key];
    if (!check.passed && check.questions) {
      for (const id of check.questions) ids.add(id);
    }
  }

  return ids;
}

/**
 * C 阶段：删除 B 阶段不通过的题目。
 *
 * spec §5.2: 删除后导出两个 JSON：
 * - golden-set-raw-{ts}.json：A.1 后的原始快照（全部题目，调试用）
 * - golden-set-{ts}.json：清理后的干净版（仅合格题目，用于 D 阶段评估）
 */
export function cleanGoldenSet(report: QualityReport, evalSetId?: string): { deleted: number; remaining: number } {
  const failingIds = collectFailingIds(report);

  if (failingIds.size === 0) {
    logger.info(`[C Clean] No questions to delete`);
    return { deleted: 0, remaining: report.totalQuestions };
  }

  const db = getSyncDb();
  const deleteStmt = evalSetId
    ? db.prepare(`DELETE FROM metrics_golden_set WHERE id = ? AND eval_set_id = ?`)
    : db.prepare(`DELETE FROM metrics_golden_set WHERE id = ?`);

  const transaction = db.transaction(() => {
    for (const id of failingIds) {
      if (evalSetId) {
        deleteStmt.run(id, evalSetId);
      } else {
        deleteStmt.run(id);
      }
    }
  });

  transaction();

  const remaining = report.totalQuestions - failingIds.size;
  logger.info(`[C Clean] Deleted ${failingIds.size} questions, ${remaining} remaining`);

  return { deleted: failingIds.size, remaining };
}

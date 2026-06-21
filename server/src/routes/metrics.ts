import { Router } from "express";
import { getSyncDb } from "../lib/syncDb.js";
import { writeAudit } from "../lib/auditLog.js";
import { createTask, cancelTask, getTask, listTasks } from "../lib/asyncTaskManager.js";

export const metricsRouter = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ── Row types ─────────────────────────────────────────────

interface SummaryRow {
  provider_id: string;
  model_id: string;
  search_provider: string;
  reranker_type: string;
  embedding_model: string;
  run_count: number;
  success_rate: number;
  avg_groundedness: number | null;
  avg_duration_ms: number;
  avg_rag_score: number | null;
  avg_ttft_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_web_top_score: number;
  avg_fusion_top_score: number;
  avg_tool_rounds: number;
}

interface TrendRow {
  bucket: string;
  avg_value: number;
  sample_count: number;
}

interface DurationRow {
  duration_ms: number;
}

interface TtftRow {
  ttft_ms: number;
}

interface ComparisonRow {
  run_count: number;
  success_rate: number;
  avg_groundedness: number | null;
  avg_duration: number;
  avg_rag_score: number | null;
}

interface AgentRow {
  agent: string;
  count: number;
}

interface ReportRow {
  id: string;
  timestamp: string;
  config_json: string;
}

// GET /api/metrics/by-dimension?dimension=provider_id&agent=&from=&to=
// Returns aggregated metrics grouped by a single dimension
const ALLOWED_DIMENSIONS: Record<string, string> = {
  provider_id: "provider_id",
  model_id: "model_id",
  search_provider: "search_provider",
  reranker_type: "reranker_type",
  embedding_model: "embedding_model",
  agent: "agent",
};

interface DimRow {
  dimension_value: string;
  run_count: number;
  success_rate: number;
  avg_groundedness: number | null;
  avg_duration_ms: number;
  avg_rag_score: number | null;
  avg_ttft_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_web_top_score: number;
  avg_fusion_top_score: number;
  avg_tool_rounds: number;
}

metricsRouter.get("/metrics/by-dimension", (req, res) => {
  try {
    const db = getSyncDb();
    const dim = (req.query.dimension as string) || "provider_id";
    const column = ALLOWED_DIMENSIONS[dim];
    if (!column) {
      res.status(400).json({ error: `Invalid dimension: ${dim}. Allowed: ${Object.keys(ALLOWED_DIMENSIONS).join(", ")}` });
      return;
    }
    const agent = req.query.agent as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions: string[] = [];
    const params: string[] = [];
    if (agent) { conditions.push("agent = ?"); params.push(agent); }
    if (from) { conditions.push("timestamp >= ?"); params.push(from); }
    if (to) { conditions.push("timestamp <= ?"); params.push(to); }
    // 过滤掉不适用的维度值（如搜索操作没有 reranker/embedding）
    conditions.push(`${column} != ''`);
    const where = `WHERE ${conditions.join(" AND ")}`;

    // 耗时 = 组件级端到端延迟（从 timings_json 提取）
    // A(LLM)→llmCallMs, B(Search)→total-llm-rag-gnd, C/D→ragSearchMs
    const dimTimingKey: Record<string, string> = {
      provider_id: "llmCallMs",
      search_provider: "__other__",
      reranker_type: "ragSearchMs",
      embedding_model: "ragSearchMs",
    };
    const timingKey = dimTimingKey[dim] || "";

    // LLM Provider 维度按 provider_id + model_id 分组，显示为 "provider:model"
    const dimExpr = dim === "provider_id"
      ? `CASE WHEN provider_id = '' THEN '（未知）' ELSE provider_id END || ':' || model_id`
      : `CASE WHEN ${column} = '' THEN '（未知）' ELSE ${column} END`;

    // Step 1: aggregated stats
    const aggRows = db.prepare(`
      SELECT
        ${dimExpr} as dimension_value,
        COUNT(*) as run_count,
        AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(CASE WHEN grounding_score >= 0 THEN grounding_score END) as avg_groundedness,
        AVG(top_citation_score) as avg_rag_score,
        AVG(ttft_ms) as avg_ttft_ms,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        AVG(web_top_score) as avg_web_top_score,
        AVG(fusion_top_score) as avg_fusion_top_score,
        AVG(tool_rounds) as avg_tool_rounds
      FROM metrics_runs ${where}
      GROUP BY ${dimExpr}
      ORDER BY run_count DESC
    `).all(...params) as DimRow[];

    // Step 2: per-component latency from timings_json
    const componentLatency: Record<string, number> = {};
    if (timingKey) {
      const timingRows = db.prepare(`
        SELECT
          ${dimExpr} as dv,
          timings_json
        FROM metrics_runs ${where}
      `).all(...params) as Array<{ dv: string; timings_json: string }>;

      const buckets: Record<string, number[]> = {};
      for (const r of timingRows) {
        try {
          const t = JSON.parse(r.timings_json) as Record<string, number>;
          let val: number;
          if (timingKey === "__other__") {
            // Search: total - llm - rag - groundedness = web search time
            val = (t.totalMs ?? 0) - (t.llmCallMs ?? 0) - (t.ragSearchMs ?? 0) - (t.groundednessMs ?? 0);
            val = Math.max(0, val);
          } else {
            val = t[timingKey] ?? 0;
          }
          if (!buckets[r.dv]) buckets[r.dv] = [];
          buckets[r.dv]!.push(val);
        } catch { /* skip malformed */ }
      }
      for (const [dv, vals] of Object.entries(buckets)) {
        componentLatency[dv] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
    }

    // Step 3: merge
    const rows: DimRow[] = aggRows.map((row) => ({
      ...row,
      avg_duration_ms: timingKey ? (componentLatency[row.dimension_value] ?? 0) : 0,
    }));

    res.json({ dimension: dim, rows: rows || [] });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/summary?agent=&from=&to=
// Returns aggregated metrics by model combination
metricsRouter.get("/metrics/summary", (req, res) => {
  try {
    const db = getSyncDb();
    const agent = req.query.agent as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions: string[] = [];
    const params: string[] = [];
    if (agent) { conditions.push("agent = ?"); params.push(agent); }
    if (from) { conditions.push("timestamp >= ?"); params.push(from); }
    if (to) { conditions.push("timestamp <= ?"); params.push(to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT
        provider_id,
        model_id,
        search_provider,
        reranker_type,
        embedding_model,
        COUNT(*) as run_count,
        AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(CASE WHEN grounding_score >= 0 THEN grounding_score END) as avg_groundedness,
        AVG(duration_ms) as avg_duration_ms,
        AVG(top_citation_score) as avg_rag_score,
        AVG(ttft_ms) as avg_ttft_ms,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        AVG(web_top_score) as avg_web_top_score,
        AVG(fusion_top_score) as avg_fusion_top_score,
        AVG(tool_rounds) as avg_tool_rounds
      FROM metrics_runs ${where}
      GROUP BY provider_id, model_id, search_provider, reranker_type, embedding_model
      ORDER BY run_count DESC
    `).all(...params) as SummaryRow[];

    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/trends?metric=groundedness&agent=&granularity=day
// Returns time-series data
metricsRouter.get("/metrics/trends", (req, res) => {
  try {
    const db = getSyncDb();
    const metric = (req.query.metric as string) || "groundedness";
    const agent = req.query.agent as string | undefined;
    const granularity = (req.query.granularity as string) || "day";

    // Map metric name to column
    const metricColumnMap: Record<string, string> = {
      groundedness: "grounding_score",
      duration: "duration_ms",
      ttft: "ttft_ms",
      rag_score: "top_citation_score",
      success_rate: "CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END",
      token_usage: "total_tokens",
    };
    const column = metricColumnMap[metric] || "grounding_score";

    // Map granularity to SQLite date format
    const granularityMap: Record<string, string> = {
      hour: "%Y-%m-%dT%H:00:00",
      day: "%Y-%m-%d",
      week: "%Y-W%W",
      month: "%Y-%m",
    };
    const dateFormat = granularityMap[granularity] || "%Y-%m-%d";

    const conditions: string[] = [];
    const params: string[] = [];
    if (agent) { conditions.push("agent = ?"); params.push(agent); }
    // Only include rows where the metric is meaningful (>= 0 for grounding_score)
    if (metric === "groundedness") { conditions.push("grounding_score >= 0"); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT
        strftime('${dateFormat}', timestamp) as bucket,
        AVG(${column}) as avg_value,
        COUNT(*) as sample_count
      FROM metrics_runs ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(...params) as TrendRow[];

    res.json({
      metric,
      granularity,
      data: rows || [],
    });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/latency?agent=
// Returns latency percentiles per pipeline stage
metricsRouter.get("/metrics/latency", (req, res) => {
  try {
    const db = getSyncDb();
    const agent = req.query.agent as string | undefined;

    const conditions: string[] = [];
    const params: string[] = [];
    if (agent) { conditions.push("agent = ?"); params.push(agent); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Overall latency percentiles
    const allDurations = db.prepare(`
      SELECT duration_ms FROM metrics_runs ${where} ORDER BY duration_ms ASC
    `).all(...params) as DurationRow[];

    // TTFT percentiles
    const ttftConditions = [...conditions, "ttft_ms > 0"];
    const ttftWhere = ttftConditions.length > 0 ? `WHERE ${ttftConditions.join(" AND ")}` : "";
    const allTtft = db.prepare(`
      SELECT ttft_ms FROM metrics_runs ${ttftWhere} ORDER BY ttft_ms ASC
    `).all(...params) as TtftRow[];

    const durations = allDurations.map(r => r.duration_ms);
    const ttfts = allTtft.map(r => r.ttft_ms);

    res.json({
      duration: {
        p50: percentile(durations, 50),
        p75: percentile(durations, 75),
        p90: percentile(durations, 90),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        count: durations.length,
      },
      ttft: {
        p50: percentile(ttfts, 50),
        p75: percentile(ttfts, 75),
        p90: percentile(ttfts, 90),
        p95: percentile(ttfts, 95),
        p99: percentile(ttfts, 99),
        count: ttfts.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/comparison?agent=&configs=gemini:gemini-2.5-flash,mimo:mimo-v2.5-pro
// Returns side-by-side comparison of model combinations
metricsRouter.get("/metrics/comparison", (req, res) => {
  try {
    const db = getSyncDb();
    const agent = req.query.agent as string | undefined;
    const configsStr = req.query.configs as string | undefined;

    if (!configsStr) {
      res.status(400).json({ error: "configs parameter required" });
      return;
    }

    const configs = configsStr.split(",").map(c => {
      const [providerId, modelId] = c.trim().split(":");
      return { providerId, modelId };
    });

    const results = configs.map(({ providerId, modelId }) => {
      const where = ["provider_id = ?", "model_id = ?"];
      const params: string[] = [providerId ?? "", modelId ?? ""];
      if (agent) { where.push("agent = ?"); params.push(agent); }

      const row = db.prepare(`
        SELECT COUNT(*) as run_count,
               AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
               AVG(CASE WHEN grounding_score >= 0 THEN grounding_score END) as avg_groundedness,
               AVG(duration_ms) as avg_duration,
               AVG(top_citation_score) as avg_rag_score
        FROM metrics_runs WHERE ${where.join(" AND ")}
      `).get(...params) as ComparisonRow | undefined;

      return {
        label: `${providerId}:${modelId}`,
        providerId,
        modelId,
        runCount: row?.run_count || 0,
        successRate: row?.success_rate || 0,
        avgGroundedness: row?.avg_groundedness || 0,
        avgDurationMs: row?.avg_duration || 0,
        avgRagScore: row?.avg_rag_score || 0,
      };
    });

    res.json({ configs: results });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/latency-breakdown?agent=
// Returns average time breakdown: LLM waiting (promptBuild+ragSearch+rerank+llmCall) vs groundedness check
metricsRouter.get("/metrics/latency-breakdown", (req, res) => {
  try {
    const db = getSyncDb();
    const agent = req.query.agent as string | undefined;

    const conditions: string[] = ["timings_json IS NOT NULL", "timings_json != '{}'"];
    const params: string[] = [];
    if (agent) { conditions.push("agent = ?"); params.push(agent); }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const rows = db.prepare(`
      SELECT timings_json FROM metrics_runs ${where}
    `).all(...params) as Array<{ timings_json: string }>;

    let totalLlmWait = 0;
    let totalGroundedness = 0;
    let totalOther = 0;
    let count = 0;

    for (const row of rows) {
      try {
        const t = JSON.parse(row.timings_json) as Record<string, number>;
        const llmWait = (t.promptBuildMs ?? 0) + (t.ragSearchMs ?? 0) + (t.rerankMs ?? 0) + (t.llmCallMs ?? 0);
        const gnd = t.groundednessMs ?? 0;
        const total = t.totalMs ?? (llmWait + gnd);
        const other = Math.max(0, total - llmWait - gnd);
        totalLlmWait += llmWait;
        totalGroundedness += gnd;
        totalOther += other;
        count++;
      } catch { /* skip malformed JSON */ }
    }

    if (count === 0) {
      res.json({ llmWaitMs: 0, groundednessMs: 0, otherMs: 0, count: 0 });
      return;
    }

    res.json({
      llmWaitMs: Math.round(totalLlmWait / count),
      groundednessMs: Math.round(totalGroundedness / count),
      otherMs: Math.round(totalOther / count),
      count,
    });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/agents
// Returns list of distinct agents that have metrics
metricsRouter.get("/metrics/agents", (_req, res) => {
  try {
    const db = getSyncDb();
    const rows = db.prepare(`
      SELECT DISTINCT agent, COUNT(*) as count
      FROM metrics_runs GROUP BY agent ORDER BY count DESC
    `).all() as AgentRow[];
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/golden-set/generate
// Generate golden evaluation set
// Body: { providerConfigs?, generatorProviderId?, generatorModel?, questionCount?, searchApiKey?, judgeApiKeys? }
// - App client: 不传 key，server 从 DB settings 读
// - 测试脚本: 从 .env 读 key，通过请求体传递（CLAUDE.md）
metricsRouter.post("/metrics/golden-set/generate", async (req, res) => {
  try {
    const { generateGoldenSet, resolveGoldenSetProviders } = await import("../lib/goldenSetGenerator.js");

    const body = req.body as {
      providerConfigs?: Array<{ providerId: string; model: string; apiKey: string; label: string; modelFallbacks?: string[]; enableModelFallback?: boolean }>;
      /** 简化参数：指定单个 generator provider（替代 providerConfigs） */
      generatorProviderId?: string;
      /** 简化参数：指定 generator 模型 */
      generatorModel?: string;
      /** 生成用例数量（默认 21） */
      questionCount?: number;
      searchApiKey?: string;
      judgeApiKeys?: Record<string, string>;
    };

    const providerConfigs = (body.providerConfigs && body.providerConfigs.length > 0)
      ? body.providerConfigs
      : resolveGoldenSetProviders(body.generatorProviderId, body.generatorModel);

    if (providerConfigs.length === 0) {
      return res.status(400).json({ error: "未找到可用于 Golden Set 生成的 Provider（需要 MiMo / DeepSeek 之一）" });
    }

    // searchApiKey / judgeApiKeys: 请求体优先（测试脚本），否则从 DB 读（App client）
    let searchApiKey = body.searchApiKey || "";
    let judgeApiKeys = body.judgeApiKeys || {};
    const judgeFallbacks: Record<string, string[]> = {};
    const judgeModelIds: Record<string, string> = {};

    // 始终从 DB 读取 fallback 配置（无论 providerConfigs 来自请求体还是 DB）
    const db = getSyncDb();
    const settingsRow = db.prepare(
      "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
    ).get() as { data: string } | undefined;
    if (settingsRow) {
      const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
      if (!searchApiKey) {
        const searchProviders = (settings.searchProviders ?? []) as Array<{
          providerId: string; apiKeyRef?: string;
        }>;
        for (const sp of searchProviders) {
          if (sp.providerId === "tavily" && sp.apiKeyRef) {
            searchApiKey = sp.apiKeyRef;
            break;
          }
        }
      }
      const dbProviders = (settings.providers ?? []) as Array<{
        providerId: string; apiKeyRef?: string; modelFallbacks?: string[]; defaultModelId?: string;
      }>;
      if (Object.keys(judgeApiKeys).length === 0) {
        const dbKeys: Record<string, string> = {};
        for (const p of dbProviders) {
          if (p.apiKeyRef) dbKeys[p.providerId] = p.apiKeyRef;
        }
        if (Object.keys(dbKeys).length > 0) judgeApiKeys = dbKeys;
      }
      // BUG-176: 构建 judge fallback 链（从 DB settings 读取每个 provider 的 modelFallbacks）
      // BUG-178: 构建 judge 模型映射（从 DB settings 读取每个 provider 的 defaultModelId）
      for (const p of dbProviders) {
        if (p.modelFallbacks?.length) judgeFallbacks[p.providerId] = p.modelFallbacks;
        if (p.defaultModelId) judgeModelIds[p.providerId] = p.defaultModelId;
      }

      // 将 DB 中的 modelFallbacks 合并到请求体的 providerConfigs（生成阶段 fallback）
      for (const pc of providerConfigs) {
        const dbp = dbProviders.find(p => p.providerId === pc.providerId);
        if (dbp?.modelFallbacks?.length && !pc.modelFallbacks) {
          pc.modelFallbacks = dbp.modelFallbacks;
          pc.enableModelFallback = true;
        }
      }
    }

    const questions = await generateGoldenSet(
      providerConfigs as Array<{ providerId: import("@shared/types/agents").ProviderId; model: string; apiKey: string; label: string; modelFallbacks?: string[]; enableModelFallback?: boolean }>,
      searchApiKey || undefined,
      "tavily",
      body.questionCount,
    );

    // BUG-180: 持久化已移入 generateGoldenSet() 内部（生成完成立即写文件，不等 route return）
    writeAudit({ op: "CREATE", store: "metrics_golden_set", caller: "user", dataAfter: { count: questions.length } });
    res.json({ count: questions.length, questions });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/golden-set
// Get existing golden set
metricsRouter.get("/metrics/golden-set", async (_req, res) => {
  try {
    const { getGoldenSet } = await import("../lib/goldenSetGenerator.js");
    const questions = await getGoldenSet();
    res.json({ count: questions.length, questions });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/golden-set/import
// Import golden set questions from JSON (用于 C 阶段验证前的数据准备)
metricsRouter.post("/metrics/golden-set/import", async (req, res) => {
  try {
    const { questions } = req.body as { questions: unknown[] };
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "需要提供 questions 数组" });
    }
    const { importGoldenQuestions } = await import("../lib/goldenSetGenerator.js");
    const count = importGoldenQuestions(questions as never[]);
    writeAudit({
      op: "CREATE",
      store: "metrics_golden_set",
      caller: "user",
      dataAfter: { imported: count },
    });
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/metrics/golden-set
// Clear golden set for regeneration
metricsRouter.delete("/metrics/golden-set", async (_req, res) => {
  try {
    const { clearGoldenSet, getGoldenSetStats } = await import("../lib/goldenSetGenerator.js");
    const before = await getGoldenSetStats();
    await clearGoldenSet();
    writeAudit({ op: "DELETE_ALL", store: "metrics_golden_set", caller: "user", dataBefore: before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// ── Eval Set CRUD (nf5-2 Phase 1) ─────────────────────

/** 本地时间 ISO 8601 格式（带时区偏移） */
function localISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offset) / 60));
  const offM = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${offH}:${offM}`;
}

interface EvalSetRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  question_count: number;
  source_type_distribution: string;
  status: string;
  error_message: string;
  metadata: string;
}

// GET /api/metrics/eval-sets — 列出所有 eval sets
metricsRouter.get("/metrics/eval-sets", (_req, res) => {
  try {
    const db = getSyncDb();
    const rows = db.prepare(`
      SELECT id, name, created_at, updated_at, question_count,
             source_type_distribution, status, error_message, metadata
      FROM metrics_eval_sets
      ORDER BY created_at DESC
    `).all() as EvalSetRow[];
    const sets = rows.map(r => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      questionCount: r.question_count,
      sourceTypeDistribution: JSON.parse(r.source_type_distribution || '{}'),
      status: r.status,
      errorMessage: r.error_message,
      metadata: JSON.parse(r.metadata || '{}'),
    }));
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/eval-sets/:id — 获取单个 eval set 详情（含 questions）
metricsRouter.get("/metrics/eval-sets/:id", (req, res) => {
  try {
    const db = getSyncDb();
    const row = db.prepare(`
      SELECT id, name, created_at, updated_at, question_count,
             source_type_distribution, status, error_message, metadata
      FROM metrics_eval_sets WHERE id = ?
    `).get(req.params.id) as EvalSetRow | undefined;
    if (!row) {
      return res.status(404).json({ error: "Eval set not found" });
    }
    // 获取关联的 questions
    const rawQuestions = db.prepare(`
      SELECT * FROM metrics_golden_set WHERE eval_set_id = ?
    `).all(req.params.id) as Array<Record<string, unknown>>;
    const questions = rawQuestions.map(q => ({
      id: q.id,
      agent: q.agent,
      query: q.query,
      expectedAnswer: q.expected_answer,
      expectedSources: JSON.parse((q.expected_sources as string) || '[]'),
      expectedArticles: JSON.parse((q.expected_articles as string) || '[]'),
      category: q.category,
      difficulty: q.difficulty,
      generatedBy: q.generated_by,
      sourceType: q.source_type,
      expectedSource: q.expected_source,
      sourceRoutingRationale: q.source_routing_rationale,
      mustIncludeFacts: JSON.parse((q.must_include_facts as string) || '[]'),
      verifiedBy: q.verified_by,
      contextChunkIds: JSON.parse((q.context_chunk_ids as string) || '[]'),
    }));
    res.json({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      questionCount: row.question_count,
      sourceTypeDistribution: JSON.parse(row.source_type_distribution || '{}'),
      status: row.status,
      errorMessage: row.error_message,
      metadata: JSON.parse(row.metadata || '{}'),
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval-sets — 创建 eval set（从 questions 数组）
metricsRouter.post("/metrics/eval-sets", (req, res) => {
  try {
    const db = getSyncDb();
    const { name, questions } = req.body as { name?: string; questions?: unknown[] };
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "需要提供 questions 数组" });
    }
    const setId = `eval-${localISO()}`;
    const sourceTypeDist: Record<string, number> = {};
    for (const q of questions) {
      const st = (q as Record<string, unknown>).sourceType as string || "kb_only";
      sourceTypeDist[st] = (sourceTypeDist[st] ?? 0) + 1;
    }
    db.prepare(`
      INSERT INTO metrics_eval_sets (id, name, question_count, source_type_distribution, status)
      VALUES (?, ?, ?, ?, 'ready')
    `).run(setId, name || setId, questions.length, JSON.stringify(sourceTypeDist));
    // 将 questions 写入 metrics_golden_set（已存在则更新 eval_set_id）
    const insertQ = db.prepare(`
      INSERT INTO metrics_golden_set
      (id, created_at, agent, query, expected_answer, expected_sources, expected_articles,
       category, difficulty, generated_by, source_type, expected_source,
       source_routing_rationale, must_include_facts, verified_by, context_chunk_ids, eval_set_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET eval_set_id = excluded.eval_set_id
    `);
    let inserted = 0;
    for (const q of questions) {
      const qq = q as Record<string, unknown>;
      const qId = (qq.id as string) || `q-${localISO()}-${Math.random().toString(36).slice(2, 8)}`;
      insertQ.run(
        qId,
        (qq.createdAt as string) || localISO(),
        (qq.agent as string) || "chat",
        (qq.query as string) || "",
        (qq.expectedAnswer as string) || "",
        JSON.stringify(qq.expectedSources || []),
        JSON.stringify(qq.expectedArticles || []),
        (qq.category as string) || "",
        (qq.difficulty as string) || "medium",
        (qq.generatedBy as string) || "",
        (qq.sourceType as string) || "kb_only",
        (qq.expectedSource as string) || "kb",
        (qq.sourceRoutingRationale as string) || "",
        JSON.stringify(qq.mustIncludeFacts || []),
        (qq.verifiedBy as string) || "auto",
        JSON.stringify(qq.contextChunkIds || []),
        setId,
      );
      inserted++;
    }
    writeAudit({ op: "CREATE", store: "metrics_eval_sets", caller: "user", dataAfter: { id: setId, questionCount: inserted } });
    res.json({ id: setId, questionCount: inserted });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// PUT /api/metrics/eval-sets/:id — 重命名 eval set
metricsRouter.put("/metrics/eval-sets/:id", (req, res) => {
  try {
    const db = getSyncDb();
    const { name } = req.body as { name: string };
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "需要提供 name" });
    }
    const result = db.prepare(`
      UPDATE metrics_eval_sets SET name = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).run(name, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Eval set not found" });
    }
    writeAudit({ op: "UPDATE", store: "metrics_eval_sets", caller: "user", dataAfter: { id: req.params.id, name } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/metrics/eval-sets/:id — 删除 eval set
metricsRouter.delete("/metrics/eval-sets/:id", (req, res) => {
  try {
    const db = getSyncDb();
    // 先删除关联的 questions
    db.prepare(`DELETE FROM metrics_golden_set WHERE eval_set_id = ?`).run(req.params.id);
    const result = db.prepare(`DELETE FROM metrics_eval_sets WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Eval set not found" });
    }
    writeAudit({ op: "DELETE", store: "metrics_eval_sets", caller: "user", dataAfter: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval-sets/:id/quality-check — 对已有 eval set 补跑 B→C 质量评估
metricsRouter.post("/metrics/eval-sets/:id/quality-check", async (req, res) => {
  try {
    const evalSetId = req.params.id;
    const db = getSyncDb();

    // 检查 eval set 是否存在
    const row = db.prepare("SELECT id FROM metrics_eval_sets WHERE id = ?").get(evalSetId) as { id: string } | undefined;
    if (!row) {
      return res.status(404).json({ error: "Eval set not found" });
    }

    const { evaluateGoldenSetQuality, cleanGoldenSet } = await import("../lib/goldenSetQuality.js");

    // B: 质量评估
    const qualityReport = evaluateGoldenSetQuality(evalSetId);

    let cleanResult: { deleted: number; remaining: number } | null = null;
    let evalStatus = "ready";

    if (qualityReport.recommendation.startsWith("REGENERATE_A1")) {
      evalStatus = "failed";
    } else if (!qualityReport.passed) {
      // C: 清理不合格题目
      cleanResult = cleanGoldenSet(qualityReport, evalSetId);
      evalStatus = cleanResult.deleted > 0 ? "degraded" : "ready";
      db.prepare("UPDATE metrics_eval_sets SET question_count = ? WHERE id = ?")
        .run(cleanResult.remaining, evalSetId);
    }

    // 更新 metadata 和 status
    db.prepare("UPDATE metrics_eval_sets SET status = ?, metadata = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(evalStatus, JSON.stringify({ qualityReport, cleaned: cleanResult }), evalSetId);

    writeAudit({
      op: "UPDATE", store: "metrics_eval_sets", caller: "user",
      dataAfter: { id: evalSetId, status: evalStatus, qualityReport },
    });

    res.json({ qualityReport, cleanResult, status: evalStatus });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval-sets/import — 从 JSON 导入 eval set
metricsRouter.post("/metrics/eval-sets/import", (req, res) => {
  try {
    const db = getSyncDb();
    const { name, questions } = req.body as { name?: string; questions: unknown[] };
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "需要提供 questions 数组" });
    }
    const setId = `eval-${localISO()}`;
    const sourceTypeDist: Record<string, number> = {};
    for (const q of questions) {
      const st = (q as Record<string, unknown>).sourceType as string || "kb_only";
      sourceTypeDist[st] = (sourceTypeDist[st] ?? 0) + 1;
    }
    db.prepare(`
      INSERT INTO metrics_eval_sets (id, name, question_count, source_type_distribution, status)
      VALUES (?, ?, ?, ?, 'ready')
    `).run(setId, name || setId, questions.length, JSON.stringify(sourceTypeDist));
    const insertQ = db.prepare(`
      INSERT INTO metrics_golden_set
      (id, created_at, agent, query, expected_answer, expected_sources, expected_articles,
       category, difficulty, generated_by, source_type, expected_source,
       source_routing_rationale, must_include_facts, verified_by, context_chunk_ids, eval_set_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET eval_set_id = excluded.eval_set_id
    `);
    let inserted = 0;
    for (const q of questions) {
      const qq = q as Record<string, unknown>;
      const qId = (qq.id as string) || `q-${localISO()}-${Math.random().toString(36).slice(2, 8)}`;
      insertQ.run(
        qId,
        (qq.createdAt as string) || localISO(),
        (qq.agent as string) || "chat",
        (qq.query as string) || "",
        (qq.expectedAnswer as string) || "",
        JSON.stringify(qq.expectedSources || []),
        JSON.stringify(qq.expectedArticles || []),
        (qq.category as string) || "",
        (qq.difficulty as string) || "medium",
        (qq.generatedBy as string) || "",
        (qq.sourceType as string) || "kb_only",
        (qq.expectedSource as string) || "kb",
        (qq.sourceRoutingRationale as string) || "",
        JSON.stringify(qq.mustIncludeFacts || []),
        (qq.verifiedBy as string) || "auto",
        JSON.stringify(qq.contextChunkIds || []),
        setId,
      );
      inserted++;
    }
    writeAudit({ op: "CREATE", store: "metrics_eval_sets", caller: "user", dataAfter: { id: setId, imported: inserted } });
    res.json({ id: setId, count: inserted });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/golden-set/grade
// A.2 Relevance Grading — 独立采样 + 2-judge 打分
// Body: { judgeApiKeys? }
metricsRouter.post("/metrics/golden-set/grade", async (req, res) => {
  try {
    // gradeGoldenSet module not yet implemented (goldenSetGrading.ts does not exist)
    return res.status(501).json({ error: "Relevance grading not yet implemented" });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/golden-set/quality
// B Golden Set 质量评估 — 确定性检查，不调用 LLM
metricsRouter.get("/metrics/golden-set/quality", async (_req, res) => {
  try {
    const { evaluateGoldenSetQuality } = await import("../lib/goldenSetQuality.js");
    const report = evaluateGoldenSetQuality();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/golden-set/clean
// C 清理不合格题目 — 删除 B 阶段检查不通过的题目，返回清理后的 golden set
metricsRouter.post("/metrics/golden-set/clean", async (_req, res) => {
  try {
    const { cleanGoldenSet, evaluateGoldenSetQuality } = await import("../lib/goldenSetQuality.js");
    const { getGoldenSet } = await import("../lib/goldenSetGenerator.js");
    const report = evaluateGoldenSetQuality();
    const result = cleanGoldenSet(report);
    writeAudit({
      op: "DELETE",
      store: "metrics_golden_set",
      caller: "user",
      dataBefore: { totalBefore: result.deleted + result.remaining },
      dataAfter: { deleted: result.deleted, remaining: result.remaining },
    });
    // 返回清理结果 + 清理后的 golden set（供导出 JSON）
    const questions = await getGoldenSet();
    res.json({ ...result, questions });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval/run
// Run offline evaluation — orchestrator 从 DB 自动读取 production 配置
// Body: { configs: EvalConfig[], agentFilter?, judgeApiKeys?, judgeConfigs?, evalSetId?, maxConcurrency? }
metricsRouter.post("/metrics/eval/run", async (req, res) => {
  try {
    const { configs, agentFilter, judgeApiKeys, judgeConfigs, evalSetId, maxConcurrency, batchDelayMs } = req.body as {
      configs?: unknown[];
      agentFilter?: string;
      judgeApiKeys?: Record<string, string>;
      judgeConfigs?: Array<{ providerId: string; modelId: string }>;
      evalSetId?: string;
      maxConcurrency?: number;
      batchDelayMs?: number;
    };
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: "需要提供至少一个模型配置" });
    }

    // judgeApiKeys: 请求体优先（测试脚本），否则从 DB 读（App client）
    let resolvedJudgeApiKeys = judgeApiKeys || {};
    if (Object.keys(resolvedJudgeApiKeys).length === 0) {
      const db = getSyncDb();
      const settingsRow = db.prepare(
        "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
      ).get() as { data: string } | undefined;
      if (settingsRow) {
        const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
        const dbProviders = (settings.providers ?? []) as Array<{ providerId: string; apiKeyRef?: string }>;
        const dbKeys: Record<string, string> = {};
        for (const p of dbProviders) {
          if (p.apiKeyRef) dbKeys[p.providerId] = p.apiKeyRef;
        }
        if (Object.keys(dbKeys).length > 0) resolvedJudgeApiKeys = dbKeys;
      }
    }

    const { runEvaluation } = await import("../lib/evalRunner.js");
    const evalOptions: {
      maxConcurrency?: number;
      batchDelayMs?: number;
      agentFilter?: string;
      judgeApiKeys?: Record<string, string>;
      evalSetId?: string;
      judgeConfigs?: Array<{ providerId: string; modelId: string }>;
    } = {};
    if (agentFilter !== undefined) evalOptions.agentFilter = agentFilter;
    if (Object.keys(resolvedJudgeApiKeys).length > 0) evalOptions.judgeApiKeys = resolvedJudgeApiKeys;
    if (judgeConfigs !== undefined) evalOptions.judgeConfigs = judgeConfigs;
    if (evalSetId !== undefined) evalOptions.evalSetId = evalSetId;
    if (maxConcurrency !== undefined) evalOptions.maxConcurrency = maxConcurrency;
    if (batchDelayMs !== undefined) evalOptions.batchDelayMs = batchDelayMs;
    const report = await runEvaluation(configs as import("../lib/evalRunner.js").EvalConfig[], evalOptions);
    writeAudit({
      op: "CREATE",
      store: "metrics_golden_runs",
      caller: "user",
      dataAfter: { id: report.runId, configCount: report.configs.length, questionCount: report.questionCount },
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/eval/reports
// Get past evaluation reports
metricsRouter.get("/metrics/eval/reports", async (_req, res) => {
  try {
    const db = getSyncDb();
    const rows = db.prepare(`
      SELECT run_id as id, MAX(timestamp) as timestamp, MIN(config_json) as config_json
      FROM metrics_golden_runs
      GROUP BY run_id
      ORDER BY REPLACE(timestamp, 'T', ' ') DESC LIMIT 20
    `).all() as ReportRow[];

    // 加载 run 级元数据（耗时、文件路径、judge 配置）
    let metaMap = new Map<string, { durationMs: number; reportJsonPath: string; logPath: string; judgeConfigs?: Array<{ providerId: string; modelId: string }> }>();
    try {
      const { getEvalRunMetas } = await import("../lib/syncDb.js");
      metaMap = getEvalRunMetas();
    } catch { /* 表可能不存在，忽略 */ }

    // 如果 meta 没有路径，尝试从 eval-logs 目录搜索
    const fs = await import("fs");
    const pathMod = await import("path");
    const evalLogsDir = pathMod.resolve(process.cwd(), "data", "eval-logs");

    const enriched = (rows || []).map((r) => {
      const meta = metaMap.get(r.id);
      let durationMs = meta?.durationMs ?? 0;
      let reportJsonPath = meta?.reportJsonPath ?? "";
      let logPath = meta?.logPath ?? "";

      // fallback: 从 eval-logs 目录搜索文件
      if ((!reportJsonPath || !logPath || !durationMs) && fs.existsSync(evalLogsDir)) {
        try {
          const files = fs.readdirSync(evalLogsDir);
          if (!reportJsonPath) {
            const f = files.find(f => f.includes(r.id) && f.endsWith(".json"));
            if (f) reportJsonPath = pathMod.join(evalLogsDir, f);
          }
          if (!logPath) {
            const f = files.find(f => f.includes(r.id) && f.endsWith(".log"));
            if (f) logPath = pathMod.join(evalLogsDir, f);
          }
          // 从报告 JSON 恢复 durationMs
          if (!durationMs && reportJsonPath && fs.existsSync(reportJsonPath)) {
            const reportData = JSON.parse(fs.readFileSync(reportJsonPath, "utf-8"));
            if (reportData?.questionBreakdown) {
              const configDurations = new Map<string, number>();
              for (const q of reportData.questionBreakdown) {
                const cur = configDurations.get(q.configLabel) ?? 0;
                configDurations.set(q.configLabel, cur + (q.durationMs ?? 0));
              }
              durationMs = [...configDurations.values()].reduce((a, b) => a + b, 0);
            }
          }
        } catch { /* ignore */ }
      }

      // judgeConfigs: 优先从 meta 读，否则从报告 JSON 读
      let judgeConfigs = meta?.judgeConfigs;
      if (!judgeConfigs && reportJsonPath && fs.existsSync(reportJsonPath)) {
        try {
          const reportData = JSON.parse(fs.readFileSync(reportJsonPath, "utf-8"));
          if (reportData?.judgeConfigs) judgeConfigs = reportData.judgeConfigs;
        } catch { /* ignore */ }
      }

      return { ...r, durationMs, reportJsonPath, logPath, judgeConfigs };
    });

    // 对没有 judgeConfigs 的报告回退到默认配置
    const { DEFAULT_JUDGE_CONFIGS } = await import("../lib/multiJudge.js");
    for (const r of enriched) {
      if (!r.judgeConfigs) r.judgeConfigs = DEFAULT_JUDGE_CONFIGS;
    }
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/eval/reports/:id
// Get full detail of a single evaluation report (nf5)
metricsRouter.get("/metrics/eval/reports/:id", async (req, res) => {
  try {
    const { getReports } = await import("../lib/evalRunner.js");
    const reports = getReports();
    const report = reports.find((r) => r.runId === req.params.id);
    if (!report) {
      return res.status(404).json({ error: "报告未找到" });
    }
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// GET /api/metrics/eval/reports/:id/analysis
// 详细分析报告：per-category, per-sourceType, per-difficulty breakdowns + 四角度分析 + 逐题详情
metricsRouter.get("/metrics/eval/reports/:id/analysis", async (req, res) => {
  try {
    const { getReports } = await import("../lib/evalRunner.js");
    const reports = getReports();
    const report = reports.find((r) => r.runId === req.params.id);
    if (!report) {
      return res.status(404).json({ error: "报告未找到" });
    }

    // 从 golden set 加载元数据（category, sourceType, difficulty）
    const { loadGoldenSet } = await import("../lib/evalRunner.js");
    const goldenSet = loadGoldenSet();
    const goldenMap = new Map(goldenSet.map(q => [q.id, q]));

    // 按维度分组计算平均指标
    const breakdowns = {
      byCategory: groupByDimension(report.questionBreakdown, goldenMap, "category"),
      bySourceType: groupByDimension(report.questionBreakdown, goldenMap, "sourceType"),
      byDifficulty: groupByDimension(report.questionBreakdown, goldenMap, "difficulty"),
    };

    // ── 逐题详情（合并 golden set 元数据 + 实际结果）──
    const questionDetails = report.questionBreakdown.map(r => {
      const golden = goldenMap.get(r.goldenId);
      return {
        goldenId: r.goldenId,
        configLabel: r.configLabel,
        query: golden?.query ?? r.query,
        category: golden?.category ?? "unknown",
        sourceType: golden?.sourceType ?? "unknown",
        difficulty: golden?.difficulty ?? "unknown",
        expectedAnswer: golden?.expectedAnswer ?? "",
        expectedSources: golden?.expectedSources ?? [],
        mustIncludeFacts: golden?.mustIncludeFacts ?? [],
        actualAnswer: r.actualAnswer,
        actualSources: r.actualSources,
        recallAtK: r.recallAtK,
        ndcgAtK: r.ndcgAtK,
        faithfulness: r.faithfulness,
        answerCorrectness: r.answerCorrectness,
        factCoverage: r.factCoverage,
        sourceRoutingAccuracy: r.sourceRoutingAccuracy,
        durationMs: r.durationMs,
        error: r.error,
      };
    });

    // ── 四角度分析（深度诊断）──

    const config = report.configs[0];
    const allResults = report.questionBreakdown;

    // (a) Golden Set 问题检查
    const goldenIssues: string[] = [];
    // 基本完整性检查
    let missingExpectedAnswer = 0, missingFacts = 0, missingSources = 0;
    for (const q of goldenSet) {
      if (!q.expectedAnswer || q.expectedAnswer.trim().length < 10) missingExpectedAnswer++;
      if (!q.mustIncludeFacts || q.mustIncludeFacts.length === 0) missingFacts++;
      if (!q.expectedSources || q.expectedSources.length === 0) missingSources++;
    }
    if (missingExpectedAnswer > 0) goldenIssues.push(`${missingExpectedAnswer} 题缺少或 expectedAnswer 过短`);
    if (missingFacts > 0) goldenIssues.push(`${missingFacts} 题缺少 mustIncludeFacts`);
    if (missingSources > 0) goldenIssues.push(`${missingSources} 题缺少 expectedSources`);

    // sourceType 分布检查（信息性，不影响 status）
    const sourceTypeCounts: Record<string, number> = {};
    for (const q of goldenSet) {
      const st = q.sourceType || "unknown";
      sourceTypeCounts[st] = (sourceTypeCounts[st] ?? 0) + 1;
    }
    const sourceTypeStr = Object.entries(sourceTypeCounts).map(([k, v]) => `${k}:${v}`).join(", ");
    goldenIssues.push(`📊 sourceType 分布: ${sourceTypeStr}`);

    // conflict 题目定义检查
    const conflictQuestions = goldenSet.filter(q => q.sourceType === "conflict");
    if (conflictQuestions.length > 0) {
      const ambiguous = conflictQuestions.filter(q => {
        const result = allResults.find(r => r.goldenId === q.id);
        return result && result.sourceRoutingAccuracy < 1;
      });
      if (ambiguous.length > 0) {
        goldenIssues.push(`⚠️ ${ambiguous.length} 道 conflict 题路由准确率 < 1.0，期望行为可能不够明确`);
      }
    }

    // 计算警告数量（排除信息性消息）
    const goldenWarnings = goldenIssues.filter(i => i.startsWith("⚠️") || !i.startsWith("📊")).length;

    // (b) Production Answer & Citation 执行问题
    const executionIssues: string[] = [];
    const emptyAnswers = allResults.filter(r => !r.actualAnswer || r.actualAnswer.trim().length === 0);
    const emptySources = allResults.filter(r => !r.actualSources || r.actualSources.length === 0);
    const hasErrors = allResults.filter(r => r.error);
    if (emptyAnswers.length > 0) executionIssues.push(`${emptyAnswers.length} 题 actualAnswer 为空`);
    if (emptySources.length > 0) executionIssues.push(`${emptySources.length} 题 actualSources 为空`);
    if (hasErrors.length > 0) executionIssues.push(`${hasErrors.length} 题执行报错`);

    // 答案质量：检查"未找到"模式
    const notFoundPattern = /未找到|未检索到|无法找到|没有找到|参考文档中未找到/;
    const notFoundQuestions = allResults.filter(r => r.actualAnswer && notFoundPattern.test(r.actualAnswer));
    if (notFoundQuestions.length > 0) {
      executionIssues.push(`⚠️ ${notFoundQuestions.length} 题答案含"未找到"声明，RAG 检索覆盖可能不足`);
    }

    // 耗时异常检查
    const durations = allResults.filter(r => r.durationMs > 0).map(r => r.durationMs);
    if (durations.length > 0) {
      const maxDuration = Math.max(...durations);
      const slowQuestions = allResults.filter(r => r.durationMs > 300000); // > 5 分钟
      if (slowQuestions.length > 0) {
        executionIssues.push(`⚠️ ${slowQuestions.length} 题耗时 > 5 分钟（最慢 ${(maxDuration / 1000).toFixed(0)}s），可能存在性能问题`);
      }
    }

    // Web 搜索过度使用检查（kb_only 题也返回 web 来源）
    const kbOnlyQuestions = goldenSet.filter(q => q.sourceType === "kb_only");
    if (kbOnlyQuestions.length > 0) {
      const kbWithWeb = kbOnlyQuestions.filter(q => {
        const result = allResults.find(r => r.goldenId === q.id);
        if (!result?.actualSources) return false;
        return result.actualSources.some(s => {
          const type = typeof s === "string" ? "knowledge" : (s as { type?: string }).type;
          return type === "web";
        });
      });
      if (kbWithWeb.length > 0) {
        executionIssues.push(`⚠️ ${kbWithWeb.length}/${kbOnlyQuestions.length} 道 kb_only 题返回了 web 来源，系统未根据 sourceType 控制搜索行为`);
      }
    }

    // (c) 离线评估流程问题
    const flowIssues: string[] = [];
    const allZeroFaith = allResults.every(r => r.faithfulness === 0);
    const allZeroRecall = allResults.filter(r => r.recallAtK !== undefined).every(r => r.recallAtK === 0);
    const allZeroAnswer = allResults.every(r => r.answerCorrectness === 0);
    if (allZeroFaith && allResults.length > 0) flowIssues.push("所有题 faithfulness=0，可能是 judge API key 缺失或 judge 调用失败");
    if (allZeroRecall && allResults.filter(r => r.recallAtK !== undefined).length > 0) flowIssues.push("所有题 recall=0，可能是 chunk grading judge 未执行");
    if (allZeroAnswer && allResults.length > 0) flowIssues.push("所有题 answerCorrectness=0，可能是 multi-judge 未执行");

    // Recall=1.0 可疑检查
    const recallValues = allResults.filter(r => r.recallAtK !== undefined).map(r => r.recallAtK!);
    if (recallValues.length > 0 && recallValues.every(r => r === 1.0)) {
      flowIssues.push(`⚠️ 所有 ${recallValues.length} 题 recall=1.0，非常可疑。LLM judge 可能对所有 chunk 都给了 grade≥2，judge prompt 的评分标准可能过于宽松`);
    }

    // Recall 与 Faithfulness 矛盾检查
    if (config && config.avgRecall > 0.95 && config.avgFaithfulness < 0.8) {
      flowIssues.push(`⚠️ Recall=${config.avgRecall.toFixed(3)} 但 Faithfulness=${config.avgFaithfulness.toFixed(3)}，矛盾：检索"完美召回"但答案"不忠实"。说明 judge 对"检索质量"和"生成忠实度"的评判标准不一致`);
    }

    // (d) Metrics 异常分析
    const metricsIssues: string[] = [];
    if (config) {
      // 基本一致性检查
      if (config.avgSourceRoutingAccuracy > 0.8 && config.avgFaithfulness === 0) {
        metricsIssues.push("路由准确率正常但 faithfulness=0 → 路由准确率是纯规则判定（不需 judge），其他指标依赖 LLM judge");
      }
      if (config.avgRecall === 0 && config.avgSourceRoutingAccuracy > 0) {
        metricsIssues.push("recall=0 但路由准确 > 0 → 检索实际命中了文档，但 chunk grading judge 未执行");
      }
      if (config.passRate === 0 && config.avgSourceRoutingAccuracy > 0.8) {
        metricsIssues.push("通过率=0 但路由准确 > 0 → 通过率依赖 faithfulness + answerCorrectness，judge 未执行导致全部不通过");
      }

      // Faithfulness 分布异常
      const faithValues = allResults.map(r => r.faithfulness);
      const lowFaithCount = faithValues.filter(f => f < 0.7).length;
      if (lowFaithCount > allResults.length * 0.3) {
        metricsIssues.push(`⚠️ ${lowFaithCount}/${allResults.length} 题 faithfulness < 0.7（通过阈值），通过率仅 ${(config.passRate * 100).toFixed(1)}%`);
      }

      // Fact Coverage 异常
      const factValues = allResults.map(r => r.factCoverage);
      const lowFactCount = factValues.filter(f => f < 0.5).length;
      if (lowFactCount > 0) {
        const worst = allResults.filter(r => r.factCoverage < 0.5).map(r => `${r.goldenId}(${r.factCoverage.toFixed(2)})`).join(", ");
        metricsIssues.push(`⚠️ ${lowFactCount} 题 factCoverage < 0.5: ${worst}`);
      }

      // NDCG 与 Recall 矛盾
      if (config.avgRecall > 0.95 && config.avgNdcg < 0.8) {
        metricsIssues.push(`⚠️ Recall=${config.avgRecall.toFixed(3)} 但 NDCG=${config.avgNdcg.toFixed(3)}：相关文档都被检索到，但排序不佳（最相关的文档没有排在最前面）`);
      }
    }

    // ── 低分项详细分析 ──
    // 按 goldenId 去重（多 config 时每个题有多条记录，取第一条）
    const seen = new Set<string>();
    const uniqueQuestions = questionDetails.filter(q => {
      if (seen.has(q.goldenId)) return false;
      seen.add(q.goldenId);
      return true;
    });

    // 低分阈值：检索类指标 0.5，生成类指标 0.8
    const RETRIEVAL_THRESHOLD = 0.5;
    const GENERATION_THRESHOLD = 0.8;

    const questionAnalysis: Array<{
      goldenId: string;
      query: string;
      category: string;
      sourceType: string;
      difficulty: string;
      isLow: boolean;
      issues: string[];
      goldenSays: string;
      actualAnswer: string;
      actualSources: string[];
      expectedSources: string[];
      mustIncludeFacts: string[];
      scores: { recall: number | undefined; ndcg: number | undefined; faithfulness: number; answerCorrectness: number; factCoverage: number; routing: number };
      metricDiagnosis: string;
      metricDefs: string;
    }> = [];

    for (const r of uniqueQuestions) {
      const issues: string[] = [];
      if (r.recallAtK !== undefined && r.recallAtK < RETRIEVAL_THRESHOLD) issues.push(`recall=${r.recallAtK.toFixed(3)} < ${RETRIEVAL_THRESHOLD}`);
      if (r.ndcgAtK !== undefined && r.ndcgAtK < RETRIEVAL_THRESHOLD) issues.push(`ndcg=${r.ndcgAtK.toFixed(3)} < ${RETRIEVAL_THRESHOLD}`);
      if (r.faithfulness < GENERATION_THRESHOLD) issues.push(`faithfulness=${r.faithfulness.toFixed(3)} < ${GENERATION_THRESHOLD}`);
      if (r.answerCorrectness < GENERATION_THRESHOLD) issues.push(`answerCorrectness=${r.answerCorrectness.toFixed(3)} < ${GENERATION_THRESHOLD}`);
      if (r.factCoverage < GENERATION_THRESHOLD) issues.push(`factCoverage=${r.factCoverage.toFixed(3)} < ${GENERATION_THRESHOLD}`);
      if (r.sourceRoutingAccuracy < 1.0) issues.push(`routing=${r.sourceRoutingAccuracy.toFixed(3)} < 1.0`);
      if (r.error) issues.push(`执行错误: ${r.error}`);

      // Per-metric diagnosis: explain WHY the score is low for this specific question
      const metricDiagnosis: string[] = [];

      // Recall diagnosis (spec M2: reference-free, LLM judge 对每个 citation 打分)
      if (r.recallAtK !== undefined && r.recallAtK < RETRIEVAL_THRESHOLD) {
        if (r.recallAtK === 0) {
          metricDiagnosis.push(`Recall=0: Top-K 检索结果中没有任何 citation 被 LLM judge 判定为相关（grade≥2）。可能原因：query 与知识库文档语义差异大、embedding 模型不匹配、或文档未入库。`);
        } else {
          metricDiagnosis.push(`Recall=${r.recallAtK.toFixed(3)}: 部分相关 citation 未进入 Top-K 排名。LLM judge 判定的相关 citation 中，有一部分被排到了 Top-K 之外，用户无法看到。可能原因：跨源融合重排（reranker）排序不佳，或检索阶段未召回相关文档。`);
        }
      }

      // NDCG diagnosis (spec M1: reference-free, LLM judge 对每个 citation 打 0-3 分)
      if (r.ndcgAtK !== undefined && r.ndcgAtK < RETRIEVAL_THRESHOLD) {
        metricDiagnosis.push(`NDCG=${r.ndcgAtK.toFixed(3)}: 检索排序质量低。LLM judge 对 Top-K citation 的相关性评分（0-3）显示，高相关度的 citation 未被排在靠前位置。DCG/IDCG 差距大，说明跨源融合重排（reranker）未能将最相关的文档排在前面。`);
      }

      // Faithfulness diagnosis
      if (r.faithfulness < GENERATION_THRESHOLD) {
        if (r.actualSources.length === 0) {
          metricDiagnosis.push(`Faithfulness=${r.faithfulness.toFixed(3)}: 答案无引用支撑。actualSources 为空，答案中的声明无法验证来源，导致忠实度为 0。`);
        } else {
          metricDiagnosis.push(`Faithfulness=${r.faithfulness.toFixed(3)}: 答案中部分声明缺乏引用支撑。LLM 生成的内容可能包含检索文档中不存在的信息（幻觉），或引用了错误的来源。`);
        }
      }

      // Answer Correctness diagnosis
      if (r.answerCorrectness < GENERATION_THRESHOLD) {
        const expectedFacts = r.mustIncludeFacts ?? [];
        if (expectedFacts.length > 0) {
          metricDiagnosis.push(`Answer Correctness=${r.answerCorrectness.toFixed(3)}: 实际答案与期望答案的语义一致性低。期望答案要求覆盖 [${expectedFacts.slice(0, 3).join("；")}] 等关键点，实际答案可能遗漏或表述偏差较大。`);
        } else {
          metricDiagnosis.push(`Answer Correctness=${r.answerCorrectness.toFixed(3)}: 实际答案与期望答案语义不一致。可能遗漏关键结论、法条引用或推理逻辑。`);
        }
      }

      // Fact Coverage diagnosis
      if (r.factCoverage < GENERATION_THRESHOLD) {
        const expectedFacts = r.mustIncludeFacts ?? [];
        if (expectedFacts.length > 0) {
          metricDiagnosis.push(`Fact Coverage=${r.factCoverage.toFixed(3)}: 期望必须包含 ${expectedFacts.length} 个事实点，实际答案仅覆盖部分。期望事实：[${expectedFacts.slice(0, 4).join("；")}]。答案可能遗漏了关键事实。`);
        } else {
          metricDiagnosis.push(`Fact Coverage=${r.factCoverage.toFixed(3)}: 事实覆盖度低，答案未充分涵盖 golden set 中的关键事实点。`);
        }
      }

      // Routing diagnosis
      if (r.sourceRoutingAccuracy < 1.0) {
        metricDiagnosis.push(`Routing=${r.sourceRoutingAccuracy.toFixed(3)}: 来源路由不匹配。期望来源类型为 ${r.sourceType}，但实际来源 [${r.actualSources.slice(0, 3).join(", ")}] 不符合预期。`);
      }

      // Metric definitions (always show, collapsed by default)
      const metricDefs: string[] = [];
      metricDefs.push(`Recall@K (score=${r.recallAtK?.toFixed(3) ?? "N/A"}): 检索的 chunks 对期望答案的覆盖度。阈值 ${RETRIEVAL_THRESHOLD}。`);
      metricDefs.push(`NDCG@K (score=${r.ndcgAtK?.toFixed(3) ?? "N/A"}): 检索排序质量。阈值 ${RETRIEVAL_THRESHOLD}。`);
      metricDefs.push(`Faithfulness (score=${r.faithfulness.toFixed(3)}): 答案对引用内容的忠实度。阈值 ${GENERATION_THRESHOLD}。`);
      metricDefs.push(`Answer Correctness (score=${r.answerCorrectness.toFixed(3)}): 实际答案 vs 期望答案语义一致性。阈值 ${GENERATION_THRESHOLD}。`);
      metricDefs.push(`Fact Coverage (score=${r.factCoverage.toFixed(3)}): 期望事实点被覆盖的比例。阈值 ${GENERATION_THRESHOLD}。`);
      metricDefs.push(`Source Routing (score=${r.sourceRoutingAccuracy.toFixed(3)}): 来源类型是否匹配。阈值 1.0。`);

      questionAnalysis.push({
        goldenId: r.goldenId,
        query: r.query,
        category: r.category,
        sourceType: r.sourceType,
        difficulty: r.difficulty,
        isLow: issues.length > 0,
        issues,
        goldenSays: r.expectedAnswer || "(无期望答案)",
        actualAnswer: r.actualAnswer || "(空)",
        actualSources: r.actualSources as unknown as string[],
        expectedSources: r.expectedSources,
        mustIncludeFacts: r.mustIncludeFacts,
        scores: { recall: r.recallAtK, ndcg: r.ndcgAtK, faithfulness: r.faithfulness, answerCorrectness: r.answerCorrectness, factCoverage: r.factCoverage, routing: r.sourceRoutingAccuracy },
        metricDiagnosis: metricDiagnosis.join("\n"),
        metricDefs: metricDefs.join("\n"),
      });
    }

    const lowScoreItems = questionAnalysis.filter(q => q.isLow);

    res.json({
      runId: report.runId,
      timestamp: report.timestamp,
      breakdowns,
      questionDetails: uniqueQuestions,
      analysis: {
        goldenSet: { totalQuestions: goldenSet.length, issues: goldenIssues, status: goldenWarnings === 0 ? "OK" : "有问题" },
        execution: { issues: executionIssues, status: executionIssues.length === 0 ? "OK" : "有问题" },
        evalFlow: { issues: flowIssues, status: flowIssues.length === 0 ? "OK" : "有问题" },
        metrics: { issues: metricsIssues, status: metricsIssues.length === 0 ? "OK" : "有异常" },
      },
      questionAnalysis,
      lowScoreItems,
    });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// DELETE /api/metrics/eval/reports/:id
// Delete an evaluation report
metricsRouter.delete("/metrics/eval/reports/:id", async (req, res) => {
  try {
    const { deleteReport } = await import("../lib/evalRunner.js");
    const deleted = deleteReport(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "报告未找到" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

/** 按维度分组计算平均指标 */
function groupByDimension(
  results: import("../lib/evalRunner.js").EvalResult[],
  goldenMap: Map<string, { category: string; sourceType: string; difficulty: string }>,
  dimension: "category" | "sourceType" | "difficulty",
): Array<{ dimension: string; count: number; avgRecall: number; avgNdcg: number; avgFaithfulness: number; avgAnswerCorrectness: number; avgFactCoverage: number; avgSourceRoutingAccuracy: number }> {
  const groups = new Map<string, import("../lib/evalRunner.js").EvalResult[]>();
  for (const r of results) {
    const golden = goldenMap.get(r.goldenId);
    const key = golden?.[dimension] ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return Array.from(groups.entries()).map(([dim, items]) => {
    const successItems = items.filter(i => !i.error);
    return {
      dimension: dim,
      count: items.length,
      avgRecall: avg(successItems.map(i => i.recallAtK).filter((v): v is number => v !== undefined)),
      avgNdcg: avg(successItems.map(i => i.ndcgAtK).filter((v): v is number => v !== undefined)),
      avgFaithfulness: avg(successItems.map(i => i.faithfulness)),
      avgAnswerCorrectness: avg(successItems.map(i => i.answerCorrectness)),
      avgFactCoverage: avg(successItems.map(i => i.factCoverage)),
      avgSourceRoutingAccuracy: avg(successItems.map(i => i.sourceRoutingAccuracy)),
    };
  }).sort((a, b) => b.count - a.count);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// GET /api/metrics/eval/compare?runIds=id1,id2,id3
// 比较多个评估 run 的 side-by-side metrics
metricsRouter.get("/metrics/eval/compare", async (req, res) => {
  try {
    const runIdsStr = req.query.runIds as string;
    if (!runIdsStr) {
      return res.status(400).json({ error: "需要提供 runIds 参数（逗号分隔）" });
    }
    const runIds = runIdsStr.split(",").map(s => s.trim()).filter(Boolean);
    if (runIds.length < 2) {
      return res.status(400).json({ error: "至少需要 2 个 run ID 进行比较" });
    }

    const { getReports } = await import("../lib/evalRunner.js");
    const allReports = getReports();
    const selected = runIds
      .map(id => allReports.find(r => r.runId === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    if (selected.length < 2) {
      return res.status(404).json({ error: "未找到足够的报告进行比较" });
    }

    // 构建比较数据：每个 run 的 configs + metrics
    const comparison = selected.map(report => ({
      runId: report.runId,
      timestamp: report.timestamp,
      questionCount: report.questionCount,
      configs: report.configs,
    }));

    res.json({ runs: comparison });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// ── Async Task Endpoints (nf5-2 Phase 2) ──────────────────

// POST /api/metrics/eval-sets/generate
// 异步生成 eval set（不阻塞客户端）
// Body: { name?, providerConfigs?, generatorProviderId?, generatorModel?, questionCount?, searchApiKey? }
metricsRouter.post("/metrics/eval-sets/generate", async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      providerConfigs?: Array<{ providerId: string; model: string; apiKey: string; label: string; modelFallbacks?: string[]; enableModelFallback?: boolean }>;
      generatorProviderId?: string;
      generatorModel?: string;
      questionCount?: number;
      searchApiKey?: string;
    };

    const name = body.name || `Eval Set ${localISO().slice(0, 19).replace("T", " ")}`;

    const taskId = createTask("generate", async (ctx) => {
      try {
        const { generateGoldenSet, resolveGoldenSetProviders } = await import("../lib/goldenSetGenerator.js");

        const providerConfigs = (body.providerConfigs && body.providerConfigs.length > 0)
          ? body.providerConfigs
          : resolveGoldenSetProviders(body.generatorProviderId, body.generatorModel);

        if (providerConfigs.length === 0) {
          ctx.fail("未找到可用于 Golden Set 生成的 Provider（需要 MiMo / DeepSeek 之一）");
          return;
        }

        // 从 DB 读取 search API key（如果请求体未提供）
        let searchApiKey = body.searchApiKey || "";
        if (!searchApiKey) {
          const db = getSyncDb();
          const settingsRow = db.prepare(
            "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
          ).get() as { data: string } | undefined;
          if (settingsRow) {
            const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
            const searchProviders = (settings.searchProviders ?? []) as Array<{ providerId: string; apiKeyRef?: string }>;
            for (const sp of searchProviders) {
              if (sp.providerId === "tavily" && sp.apiKeyRef) {
                searchApiKey = sp.apiKeyRef;
                break;
              }
            }
          }
        }

        ctx.updateProgress("开始生成 Golden Set 问题...", 0, body.questionCount ?? 21);

        const questions = await generateGoldenSet(providerConfigs as never[], searchApiKey || undefined, "tavily", body.questionCount);

        // 创建 eval set 并关联 questions
        const db = getSyncDb();
        const evalSetId = `eval-${localISO().slice(0, 19).replace(/[T:+]/g, "-")}`;

        // 计算 source type distribution
        const dist: Record<string, number> = {};
        for (const q of questions) {
          const st = q.sourceType || "unknown";
          dist[st] = (dist[st] || 0) + 1;
        }

        db.prepare(`
          INSERT INTO metrics_eval_sets (id, name, question_count, source_type_distribution, status)
          VALUES (?, ?, ?, ?, 'ready')
        `).run(evalSetId, name, questions.length, JSON.stringify(dist));

        // 更新 questions 的 eval_set_id
        const updateStmt = db.prepare("UPDATE metrics_golden_set SET eval_set_id = ? WHERE eval_set_id = ''");
        updateStmt.run(evalSetId);

        // ── B 阶段：质量评估 ──
        ctx.updateProgress("质量评估中...", questions.length, questions.length);
        const { evaluateGoldenSetQuality, cleanGoldenSet } = await import("../lib/goldenSetQuality.js");
        const qualityReport = evaluateGoldenSetQuality(evalSetId);

        let cleanResult: { deleted: number; remaining: number } | null = null;
        let evalStatus = "ready";

        if (qualityReport.recommendation.startsWith("REGENERATE_A1")) {
          evalStatus = "failed";
        } else if (!qualityReport.passed) {
          // ── C 阶段：清理不合格题目 ──
          cleanResult = cleanGoldenSet(qualityReport, evalSetId);
          evalStatus = cleanResult.deleted > 0 ? "degraded" : "ready";
          db.prepare("UPDATE metrics_eval_sets SET question_count = ? WHERE id = ?")
            .run(cleanResult.remaining, evalSetId);
        }

        // 写入 metadata（含 qualityReport + cleanResult）
        db.prepare("UPDATE metrics_eval_sets SET status = ?, metadata = ? WHERE id = ?")
          .run(evalStatus, JSON.stringify({ qualityReport, cleaned: cleanResult }), evalSetId);

        ctx.updateProgress("生成完成", questions.length, questions.length);
        ctx.complete({ evalSetId, questionCount: cleanResult?.remaining ?? questions.length, qualityReport });

        writeAudit({ op: "CREATE", store: "metrics_eval_sets", caller: "user", dataAfter: { id: evalSetId, count: questions.length } });
      } catch (err) {
        ctx.fail(err instanceof Error ? err.message : String(err));
      }
    });

    res.json({ taskId });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval-sets/generate-task/:taskId/cancel
// 取消进行中的 eval set 生成
metricsRouter.post("/metrics/eval-sets/generate-task/:taskId/cancel", (req, res) => {
  const ok = cancelTask(req.params.taskId);
  if (!ok) {
    res.status(404).json({ error: "任务不存在或已完成" });
    return;
  }
  res.json({ ok: true });
});

// GET /api/metrics/eval-sets/generate-task/:taskId/progress
// 查询 eval set 生成进度
metricsRouter.get("/metrics/eval-sets/generate-task/:taskId/progress", (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "任务不存在" });
    return;
  }
  res.json({
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    result: task.result,
    error: task.error,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  });
});

// POST /api/metrics/eval/run-async
// 异步运行离线评估
// Body: { evalSetId?: string, configs: EvalConfig[], judgeApiKeys?, judgeConfigs?, maxConcurrency? }
metricsRouter.post("/metrics/eval/run-async", async (req, res) => {
  try {
    const { evalSetId, configs, agentFilter, judgeApiKeys, judgeConfigs, maxConcurrency, batchDelayMs } = req.body as {
      evalSetId?: string;
      configs?: unknown[];
      agentFilter?: string;
      judgeApiKeys?: Record<string, string>;
      judgeConfigs?: Array<{ providerId: string; modelId: string }>;
      maxConcurrency?: number;
      batchDelayMs?: number;
    };

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: "需要提供至少一个模型配置" });
    }

    // judgeApiKeys: 请求体优先（测试脚本），否则从 DB 读（App client）
    let resolvedJudgeApiKeys = judgeApiKeys || {};
    if (Object.keys(resolvedJudgeApiKeys).length === 0) {
      const db = getSyncDb();
      const settingsRow = db.prepare(
        "SELECT data FROM sync_data WHERE store_name = 'settings' AND record_id = 'app'"
      ).get() as { data: string } | undefined;
      if (settingsRow) {
        const settings = JSON.parse(settingsRow.data) as Record<string, unknown>;
        const dbProviders = (settings.providers ?? []) as Array<{ providerId: string; apiKeyRef?: string }>;
        const dbKeys: Record<string, string> = {};
        for (const p of dbProviders) {
          if (p.apiKeyRef) dbKeys[p.providerId] = p.apiKeyRef;
        }
        if (Object.keys(dbKeys).length > 0) resolvedJudgeApiKeys = dbKeys;
      }
    }

    const taskId = createTask("evaluate", async (ctx) => {
      try {
        const { runEvaluation, loadGoldenSet } = await import("../lib/evalRunner.js");

        const evalOptions: {
          maxConcurrency?: number;
          batchDelayMs?: number;
          agentFilter?: string;
          judgeApiKeys?: Record<string, string>;
          evalSetId?: string;
          judgeConfigs?: Array<{ providerId: string; modelId: string }>;
          onProgress?: (current: number, total: number, phase: string) => void;
        } = {};
        if (agentFilter !== undefined) evalOptions.agentFilter = agentFilter;
        if (Object.keys(resolvedJudgeApiKeys).length > 0) evalOptions.judgeApiKeys = resolvedJudgeApiKeys;
        if (judgeConfigs !== undefined) evalOptions.judgeConfigs = judgeConfigs;
        if (evalSetId !== undefined) evalOptions.evalSetId = evalSetId;
        if (maxConcurrency !== undefined) evalOptions.maxConcurrency = maxConcurrency;
        if (batchDelayMs !== undefined) evalOptions.batchDelayMs = batchDelayMs;

        const goldenSet = loadGoldenSet(evalSetId);
        const totalQuestions = goldenSet.length;

        ctx.updateProgress(`开始评估 ${configs.length} 个配置 × ${totalQuestions} 用例...`, 0, totalQuestions);

        // 添加进度回调
        evalOptions.onProgress = (current, total, phase) => {
          ctx.updateProgress(phase, current, total);
        };

        // 开始捕获全部 server 日志（包括 ProviderAdapter 的 console.log）
        const { startCapture, stopCapture } = await import("../lib/logger.js");
        startCapture();

        const evalStartTime = Date.now();
        let report;
        let serverLogs = "";
        try {
          report = await runEvaluation(configs as never[], evalOptions);
        } finally {
          // 无论成功失败都停止捕获
          serverLogs = stopCapture();
        }
        const evalDurationMs = Date.now() - evalStartTime;

        // Save report JSON and eval summary to files
        const fs = await import("fs");
        const path = await import("path");
        const dataDir = path.resolve(process.cwd(), "data");
        const evalLogsDir = path.join(dataDir, "eval-logs");
        fs.mkdirSync(evalLogsDir, { recursive: true });

        // File names with local datetime stamp
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        const reportJsonPath = path.join(evalLogsDir, `report-${stamp}-${report.runId}.json`);
        const logPath = path.join(evalLogsDir, `eval-${stamp}-${report.runId}.log`);

        // Set paths on report object before saving
        report.reportJsonPath = reportJsonPath;
        report.logPath = logPath;

        fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf-8");

        const logLines: string[] = [];
        logLines.push(`=== 离线评估报告 ===`);
        logLines.push(`Run ID: ${report.runId}`);
        logLines.push(`时间: ${report.timestamp}`);
        logLines.push(`评估用例数: ${report.questionCount}`);
        logLines.push(`配置数: ${report.configs.length}`);
        logLines.push(`报告 JSON: ${reportJsonPath}`);
        logLines.push(`日志文件: ${logPath}`);
        logLines.push("");
        for (const cfg of report.configs) {
          logLines.push(`--- ${cfg.label} ---`);
          logLines.push(`  Recall@K:       ${cfg.avgRecall.toFixed(3)}`);
          logLines.push(`  NDCG@K:         ${cfg.avgNdcg.toFixed(3)}`);
          logLines.push(`  Faithfulness:   ${cfg.avgFaithfulness.toFixed(3)}`);
          logLines.push(`  答案正确性:     ${(cfg.avgAnswerCorrectness ?? 0).toFixed(3)}`);
          logLines.push(`  事实覆盖:       ${(cfg.avgFactCoverage ?? 0).toFixed(3)}`);
          logLines.push(`  路由准确:       ${(cfg.avgSourceRoutingAccuracy ?? 0).toFixed(3)}`);
          logLines.push(`  KB Hit:         ${(cfg.avgKbHitRate ?? 0).toFixed(3)}`);
          logLines.push(`  通过率:         ${(cfg.passRate * 100).toFixed(1)}%`);
          logLines.push("");
        }
        logLines.push(`=== 逐用例结果 ===`);
        for (const r of report.questionBreakdown) {
          const recallStr = r.recallAtK !== undefined ? r.recallAtK.toFixed(3) : "N/A";
          const ndcgStr = r.ndcgAtK !== undefined ? r.ndcgAtK.toFixed(3) : "N/A";
          logLines.push(`[${r.goldenId}] recall=${recallStr} ndcg=${ndcgStr} faith=${r.faithfulness.toFixed(3)} correct=${r.answerCorrectness.toFixed(3)} route=${r.sourceRoutingAccuracy.toFixed(3)} ${r.error ? `ERROR: ${r.error}` : ""}`);
        }
        // 追加完整 server 日志（LLM 请求/响应、rerank、tool 执行等）
        if (serverLogs && serverLogs.trim().length > 0) {
          logLines.push("", "=== Server Log (完整输出) ===");
          logLines.push(serverLogs);
        }
        fs.writeFileSync(logPath, logLines.join("\n"), "utf-8");

        // 持久化 run 级文件路径、耗时和 judge 配置到数据库（非关键，失败不影响评估结果）
        try {
          const { saveEvalRunMeta } = await import("../lib/syncDb.js");
          saveEvalRunMeta(report.runId, reportJsonPath, logPath, evalDurationMs, report.judgeConfigs);
        } catch (metaErr) {
          logLines.push(`\n⚠️ 保存 run 元数据失败: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`);
          fs.writeFileSync(logPath, logLines.join("\n"), "utf-8");
          console.warn(`[EvalRunner] Failed to save run meta (non-critical): ${metaErr}`);
        }

        ctx.updateProgress("评估完成", totalQuestions, totalQuestions);
        ctx.complete({ runId: report.runId, questionCount: report.questionCount, configCount: report.configs.length, reportJsonPath, logPath });

        writeAudit({
          op: "CREATE", store: "metrics_golden_runs", caller: "user",
          dataAfter: { id: report.runId, configCount: report.configs.length, questionCount: report.questionCount },
        });
      } catch (err) {
        ctx.fail(err instanceof Error ? err.message : String(err));
      }
    });

    res.json({ taskId });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /api/metrics/eval/tasks/:taskId/cancel
// 取消进行中的评估
metricsRouter.post("/metrics/eval/tasks/:taskId/cancel", (req, res) => {
  const ok = cancelTask(req.params.taskId);
  if (!ok) {
    res.status(404).json({ error: "任务不存在或已完成" });
    return;
  }
  res.json({ ok: true });
});

// GET /api/metrics/eval/tasks/:taskId/progress
// 查询评估进度
metricsRouter.get("/metrics/eval/tasks/:taskId/progress", (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "任务不存在" });
    return;
  }
  res.json({
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    result: task.result,
    error: task.error,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  });
});

// GET /api/metrics/tasks
// 列出所有异步任务
metricsRouter.get("/metrics/tasks", (req, res) => {
  const type = req.query.type as string | undefined;
  const validType = (type === "generate" || type === "evaluate") ? type : undefined;
  res.json(listTasks(validType));
});

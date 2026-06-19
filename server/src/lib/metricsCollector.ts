/**
 * Metrics Collector — 火后即忘的运行指标记录器
 *
 * 每次 agent 调用产生一条 metrics_runs 记录，
 * 用于 /api/metrics/* 端点的聚合查询。
 */
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import { getSyncDb } from "./syncDb.js";
import { writeAudit } from "./auditLog.js";

export interface MetricsRunRecord {
  agent: string;
  caseId: string;
  providerId: string;
  modelId: string;
  searchProvider: string;
  rerankerType: string;
  embeddingModel: string;
  durationMs: number;
  ttftMs: number;
  toolRounds: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thinkingTokens: number;
  ragCitationCount: number;
  topCitationScore: number;
  webSearchCount: number;
  webTopScore: number;
  fusionTopScore: number;
  groundingScore: number;
  groundingVerdict: string;
  removedClaimsCount: number;
  success: boolean;
  errorType: string;
  errorCode: string;
  timingsJson: string;
  attemptsJson: string;
}

class MetricsCollector {
  /** Fire-and-forget: insert one row into metrics_runs */
  record(data: MetricsRunRecord): void {
    try {
      const db = getSyncDb();

      const stmt = db.prepare(`
        INSERT INTO metrics_runs (
          id, timestamp, agent, case_id, provider_id, model_id,
          search_provider, reranker_type, embedding_model,
          duration_ms, ttft_ms, tool_rounds,
          input_tokens, output_tokens, total_tokens, thinking_tokens,
          rag_citation_count, top_citation_score,
          web_search_count, web_top_score, fusion_top_score,
          grounding_score, grounding_verdict, removed_claims_count,
          success, error_type, error_code,
          timings_json, attempts_json
        ) VALUES (
          ?, datetime('now','localtime'), ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `);

      const id = randomUUID();
      stmt.run(
        id,
        data.agent,
        data.caseId,
        data.providerId,
        data.modelId,
        data.searchProvider,
        data.rerankerType,
        data.embeddingModel,
        data.durationMs,
        data.ttftMs,
        data.toolRounds,
        data.inputTokens,
        data.outputTokens,
        data.totalTokens,
        data.thinkingTokens,
        data.ragCitationCount,
        data.topCitationScore,
        data.webSearchCount,
        data.webTopScore,
        data.fusionTopScore,
        data.groundingScore,
        data.groundingVerdict,
        data.removedClaimsCount,
        data.success ? 1 : 0,
        data.errorType,
        data.errorCode,
        data.timingsJson,
        data.attemptsJson,
      );

      writeAudit({
        op: "CREATE",
        store: "metrics_runs",
        recordId: id,
        caller: `orchestrator:${data.agent}`,
        dataAfter: { id, agent: data.agent, providerId: data.providerId, modelId: data.modelId, success: data.success },
      });
    } catch (err) {
      // Fire-and-forget: never throw, just log
      logger.warn(`[MetricsCollector] Failed to record metrics: ${err}`);
    }
  }
}

export const metricsCollector = new MetricsCollector();

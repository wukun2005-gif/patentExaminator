/**
 * Metrics Dashboard — Settings 页「指标」tab
 *
 * 纯 UI 组件：所有数据直接从 server API 获取，
 * 本地只有 useState（UI 状态），无 store，无逻辑处理。
 */
import { useEffect, useState, useCallback } from "react";
import { createLogger } from "../../lib/logger";

const log = createLogger("MetricsDashboard");

// ── Server response shapes（与 server routes 对齐）───────

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

interface AgentRow {
  agent: string;
  count: number;
}

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

interface DimResponse {
  dimension: string;
  rows: DimRow[];
}

// ── Component ────────────────────────────────────────────

export function MetricsDashboard() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [byDimension, setByDimension] = useState<Record<string, DimRow[]>>({});
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedAgent) params.set("agent", selectedAgent);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const qs = params.toString();
      const suffix = qs ? `?${qs}` : "";

      const [sumRes, agentRes] = await Promise.all([
        fetch(`/api/metrics/summary${suffix}`),
        fetch("/api/metrics/agents"),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (agentRes.ok) setAgents(await agentRes.json());

      // Fetch per-dimension summaries
      const dims = ["provider_id", "search_provider", "reranker_type", "embedding_model"];
      const dimResults = await Promise.all(
        dims.map(d => fetch(`/api/metrics/by-dimension?dimension=${d}${selectedAgent ? `&agent=${selectedAgent}` : ""}${dateFrom ? `&from=${dateFrom}` : ""}${dateTo ? `&to=${dateTo}` : ""}`))
      );
      const dimMap: Record<string, DimRow[]> = {};
      for (let i = 0; i < dims.length; i++) {
        const res = dimResults[i];
        if (res?.ok) {
          const data = await res.json() as DimResponse;
          dimMap[data.dimension] = data.rows;
        }
      }
      setByDimension(dimMap);
    } catch (err) {
      log("[MetricsDashboard] fetch error:", err);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, dateFrom, dateTo]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Derived UI data ────────────────────────────────────

  const handleSort = (col: string) => {
    if (sortCol === col) { setSortAsc(!sortAsc); } else { setSortCol(col); setSortAsc(true); }
  };

  const sortedModels = (() => {
    if (!summary || summary.length === 0) return [];
    // 只展示有完整模型信息的行（排除纯搜索操作）
    const rows = summary.filter(r => r.reranker_type && r.embedding_model);
    if (rows.length === 0) return [];
    if (!sortCol) return rows;
    const getVal = (r: SummaryRow): string | number => {
      switch (sortCol) {
        case "model": return `${r.provider_id}:${r.model_id}`;
        case "runCount": return r.run_count;
        case "successRate": return r.success_rate;
        case "avgGroundedness": return r.avg_groundedness ?? -1;
        case "avgDurationMs": return r.avg_duration_ms;
        case "avgRagScore": return r.avg_rag_score ?? 0;
        case "avgFusionTopScore": return r.avg_fusion_top_score ?? 0;
        case "avgToolRounds": return r.avg_tool_rounds ?? 0;
        default: return 0;
      }
    };
    rows.sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return rows;
  })();

  const totalRuns = summary.reduce((s, r) => s + r.run_count, 0);
  const avgSuccess = totalRuns > 0 ? summary.reduce((s, r) => s + r.success_rate * r.run_count, 0) / totalRuns : 0;
  const groundedRows = summary.filter(r => r.avg_groundedness != null && r.avg_groundedness >= 0);
  const avgGroundedness = groundedRows.length > 0 ? groundedRows.reduce((s, r) => s + (r.avg_groundedness ?? 0), 0) / groundedRows.length : 0;
  const avgRag = totalRuns > 0 ? summary.reduce((s, r) => s + (r.avg_rag_score ?? 0) * r.run_count, 0) / totalRuns : 0;
  const avgWeb = totalRuns > 0 ? summary.reduce((s, r) => s + (r.avg_web_top_score ?? 0) * r.run_count, 0) / totalRuns : 0;
  const avgFusion = totalRuns > 0 ? summary.reduce((s, r) => s + (r.avg_fusion_top_score ?? 0) * r.run_count, 0) / totalRuns : 0;
  const avgDuration = totalRuns > 0 ? summary.reduce((s, r) => s + r.avg_duration_ms * r.run_count, 0) / totalRuns : 0;
  const ttftRows = summary.filter(r => r.avg_ttft_ms != null && r.avg_ttft_ms > 0);
  const totalTtftRuns = ttftRows.reduce((s, r) => s + r.run_count, 0);
  const avgTtft = totalTtftRuns > 0 ? ttftRows.reduce((s, r) => s + (r.avg_ttft_ms ?? 0) * r.run_count, 0) / totalTtftRuns : 0;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <span className="metrics-table__sort-icon"> </span>;
    return <span className="metrics-table__sort-icon">{sortAsc ? " ↑" : " ↓"}</span>;
  };

  return (
    <div className="metrics-dashboard" data-testid="metrics-dashboard">
      <h2>指标</h2>

      {/* Filters */}
      <div className="metrics-filters">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          data-testid="metrics-agent-filter"
        >
          <option value="">全部 Agent</option>
          {agents.map((a) => (
            <option key={a.agent} value={a.agent}>{a.agent} ({a.count})</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="metrics-date-from" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="metrics-date-to" />
        <button type="button" onClick={refreshAll} disabled={loading} data-testid="metrics-refresh">
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>

      {error && <div className="metrics-error" data-testid="metrics-error">{error}</div>}

      {/* Overview Cards */}
      {summary.length > 0 && (
        <div className="metrics-overview">
          <MetricCard label="成功率" value={`${(avgSuccess * 100).toFixed(1)}%`} />
          <MetricCard label="Groundedness" value={groundedRows.length > 0 ? avgGroundedness.toFixed(2) : "-"} />
          <MetricCard label="RAG" value={avgRag > 0 ? avgRag.toFixed(3) : "-"} />
          <MetricCard label="Web" value={avgWeb > 0 ? avgWeb.toFixed(3) : "-"} />
          <MetricCard label="跨源" value={avgFusion > 0 ? avgFusion.toFixed(3) : "-"} />
          <MetricCard label="延迟" value={avgDuration > 0 ? `${(avgDuration / 1000).toFixed(1)}s` : "-"} />
          <MetricCard label="TTFT" value={avgTtft > 0 ? `${avgTtft.toFixed(0)}ms` : "-"} />
        </div>
      )}

      {/* Model Combination Table — 维度 E: LLM+Search+Reranker+Embedding, 7 指标 */}
      {sortedModels.length > 0 && (
        <div className="metrics-section">
          <h3>模型组合对比</h3>
          <div className="metrics-table-wrap">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("model")}>LLM<SortIcon col="model" /></th>
                  <th>Search</th>
                  <th>Reranker</th>
                  <th>Embedding</th>
                  <th onClick={() => handleSort("runCount")}>调用<SortIcon col="runCount" /></th>
                  <th onClick={() => handleSort("successRate")}>成功率<SortIcon col="successRate" /></th>
                  <th onClick={() => handleSort("avgDurationMs")}>耗时<SortIcon col="avgDurationMs" /></th>
                  <th onClick={() => handleSort("avgGroundedness")}>Groundedness<SortIcon col="avgGroundedness" /></th>
                  <th>RAG</th>
                  <th>TTFT</th>
                  <th>Web</th>
                  <th onClick={() => handleSort("avgFusionTopScore")}>跨源<SortIcon col="avgFusionTopScore" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((row, i) => {
                  const llmLabel = row.provider_id ? `${row.provider_id}:${row.model_id}` : `（未知）:${row.model_id}`;
                  return (
                  <tr key={`${row.provider_id}-${row.model_id}-${row.search_provider}-${row.reranker_type}-${row.embedding_model}-${i}`}>
                    <td title={llmLabel}>{llmLabel}</td>
                    <td title={row.search_provider || "（未知）"}>{row.search_provider || "（未知）"}</td>
                    <td title={row.reranker_type || "（未知）"}>{row.reranker_type || "（未知）"}</td>
                    <td title={row.embedding_model || "（未知）"}>{row.embedding_model || "（未知）"}</td>
                    <td>{row.run_count}</td>
                    <td>{(row.success_rate * 100).toFixed(1)}%</td>
                    <td>{(row.avg_duration_ms / 1000).toFixed(1)}s</td>
                    <td>{row.avg_groundedness != null && row.avg_groundedness >= 0 ? row.avg_groundedness.toFixed(2) : "-"}</td>
                    <td>{(row.avg_rag_score ?? 0).toFixed(3)}</td>
                    <td>{row.avg_ttft_ms != null && row.avg_ttft_ms > 0 ? `${row.avg_ttft_ms.toFixed(0)}ms` : "-"}</td>
                    <td>{(row.avg_web_top_score ?? 0).toFixed(3)}</td>
                    <td>{(row.avg_fusion_top_score ?? 0).toFixed(3)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Dimension Breakdown — each dimension has its own metric set per design matrix */}
      {Object.entries(byDimension).map(([dim, rows]) => {
        if (rows.length === 0) return null;
        const dimLabels: Record<string, string> = {
          provider_id: "LLM Provider",
          search_provider: "Search Provider",
          reranker_type: "Reranker",
          embedding_model: "Embedding Model",
        };
        // Dimension → applicable metrics (see docs/metrics-design.md matrix)
        const dimMetrics: Record<string, { key: string; label: string }[]> = {
          provider_id: [
            { key: "ttft", label: "TTFT" },
            { key: "fusion", label: "跨源" },
          ],
          search_provider: [
            { key: "web", label: "Web" },
            { key: "fusion", label: "跨源" },
          ],
          reranker_type: [
            { key: "rag", label: "RAG" },
            { key: "web", label: "Web" },
            { key: "fusion", label: "跨源" },
          ],
          embedding_model: [
            { key: "rag", label: "RAG" },
            { key: "fusion", label: "跨源" },
          ],
        };
        const metrics = dimMetrics[dim] ?? [];
        return (
          <div className="metrics-section" key={dim}>
            <h3>{dimLabels[dim] ?? dim}</h3>
            <div className="metrics-table-wrap">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>{dimLabels[dim] ?? dim}</th>
                    <th>调用</th>
                    <th>成功率</th>
                    <th>耗时</th>
                    <th>Groundedness</th>
                    {metrics.map(m => <th key={m.key}>{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.dimension_value}>
                      <td>{row.dimension_value}</td>
                      <td>{row.run_count}</td>
                      <td>{(row.success_rate * 100).toFixed(1)}%</td>
                      <td>{(row.avg_duration_ms / 1000).toFixed(1)}s</td>
                      <td>{row.avg_groundedness != null && row.avg_groundedness >= 0 ? row.avg_groundedness.toFixed(2) : "-"}</td>
                      {metrics.map(m => {
                        if (m.key === "rag") return <td key={m.key}>{(row.avg_rag_score ?? 0).toFixed(3)}</td>;
                        if (m.key === "ttft") return <td key={m.key}>{row.avg_ttft_ms != null && row.avg_ttft_ms > 0 ? `${row.avg_ttft_ms.toFixed(0)}ms` : "-"}</td>;
                        if (m.key === "web") return <td key={m.key}>{(row.avg_web_top_score ?? 0).toFixed(3)}</td>;
                        if (m.key === "fusion") return <td key={m.key}>{(row.avg_fusion_top_score ?? 0).toFixed(3)}</td>;
                        return null;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Empty */}
      {!loading && !error && summary.length === 0 && (
        <div className="metrics-empty">
          <p>暂无指标数据</p>
          <p className="metrics-empty__hint">运行 Agent 后将自动记录性能指标</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__label">{label}</div>
    </div>
  );
}

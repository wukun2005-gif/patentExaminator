import { useState } from "react";
import type { SummaryResponse } from "../../agent/contracts";

interface SummaryPanelProps {
  caseId: string;
  runSummary?: () => Promise<SummaryResponse>;
}

export function SummaryPanel({ caseId, runSummary }: SummaryPanelProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!runSummary || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runSummary();
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="summary-panel" data-testid="summary-panel">
      <h2>审查意见简述</h2>
      <p className="summary-description">
        基于已确认的权利要求特征表、新颖性对照和创造性分析，生成带原文引用的审查意见简述。
      </p>

      {runSummary && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          data-testid="btn-generate-summary"
        >
          {loading ? "生成中..." : summary ? "重新生成简述" : "生成简述"}
        </button>
      )}

      {error && (
        <div className="alert alert--error" data-testid="summary-error">{error}</div>
      )}

      {summary ? (
        <div className="summary-content">
          <section className="summary-section" data-testid="summary-body">
            <h3>正文</h3>
            <div className="summary-body-text">{summary.body}</div>
          </section>

          {summary.aiNotes && (
            <section className="summary-section" data-testid="summary-ai-notes">
              <h3>AI 备注</h3>
              <div className="summary-ai-notes-text">{summary.aiNotes}</div>
            </section>
          )}

          <p className="legal-caution-text">
            <em>{summary.legalCaution}</em>
          </p>
        </div>
      ) : (
        <div data-testid="summary-placeholder" className="placeholder-content">
          <p>简述模块将基于已确认的权利要求特征表和 Citation 自动生成审查意见简述。</p>
          <div className="summary-rules">
            <h3>生成规则</h3>
            <ul>
              <li>仅使用已被用户确认的权利要求特征表特征</li>
              <li>每条事实必须附原文引用（Grounding Citation），无出处不进正文</li>
              <li>原文引用在正文中以引号标注 + 来源段落号的形式内联呈现</li>
              <li>不输出法律结论</li>
            </ul>
          </div>
          <p className="case-ref">案件 ID: {caseId}</p>
        </div>
      )}
    </div>
  );
}
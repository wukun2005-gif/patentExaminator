import { useState } from "react";
import type { OpinionAnalysisResponse } from "../../agent/contracts";

interface Props {
  caseId: string;
  officeActionText: string;
  documentId: string;
  runAnalysis: () => Promise<OpinionAnalysisResponse>;
  onComplete?: (result: OpinionAnalysisResponse) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  novelty: "新颖性",
  inventive: "创造性",
  clarity: "清楚/支持",
  support: "充分公开",
  amendment: "修改超范围",
  other: "其他"
};

export function OpinionAnalysisPanel({
  caseId,
  officeActionText,
  documentId,
  runAnalysis,
  onComplete
}: Props) {
  const [result, setResult] = useState<OpinionAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await runAnalysis();
      setResult(response);
      onComplete?.(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel" data-testid="opinion-analysis-panel">
      <h2>审查意见解析</h2>
      <p className="panel__desc">解析审查意见通知书，提取结构化驳回理由。</p>

      {!documentId && <p className="placeholder-hint">请先在案件导入页上传审查意见通知书。</p>}

      {!result && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleRun}
          disabled={loading || !officeActionText}
          data-testid="run-opinion-analysis"
        >
          {loading ? "解析中..." : "开始解析"}
        </button>
      )}

      {error && <div className="alert alert--error" data-testid="opinion-error">{error}</div>}

      {result && (
        <div className="opinion-results" data-testid="opinion-results">
          <h3>驳回理由 ({result.rejectionGrounds.length} 条)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>类别</th>
                <th>涉及权项</th>
                <th>法律依据</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {result.rejectionGrounds.map((ground) => (
                <tr key={ground.code} data-testid={`rejection-ground-${ground.code}`}>
                  <td><strong>{ground.code}</strong></td>
                  <td>{CATEGORY_LABELS[ground.category] ?? ground.category}</td>
                  <td>{ground.claimNumbers.join(", ")}</td>
                  <td>{ground.legalBasis}</td>
                  <td>{ground.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.citedReferences.length > 0 && (
            <div className="opinion-cited-references">
              <h3>引用文献</h3>
              <ul>
                {result.citedReferences.map((ref) => (
                  <li key={`${ref.publicationNumber}-${ref.rejectionGroundCodes.join("-")}`}>
                    <strong>{ref.publicationNumber}</strong> → {ref.rejectionGroundCodes.join(", ")}：
                    {ref.featureMapping}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="legal-caution">{result.legalCaution}</div>
          <p className="case-ref">案件 ID: {caseId}</p>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { ArgumentAnalysisResponse, OpinionAnalysisResponse } from "../../agent/contracts";

interface Props {
  caseId: string;
  rejectionGrounds: OpinionAnalysisResponse["rejectionGrounds"];
  responseText: string;
  runAnalysis: () => Promise<ArgumentAnalysisResponse>;
  onComplete?: (result: ArgumentAnalysisResponse) => void;
}

export function ArgumentMappingPanel({
  caseId,
  rejectionGrounds,
  responseText,
  runAnalysis,
  onComplete
}: Props) {
  const [result, setResult] = useState<ArgumentAnalysisResponse | null>(null);
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
    <div className="panel" data-testid="argument-mapping-panel">
      <h2>答辩理由映射</h2>
      <p className="panel__desc">将意见陈述书中的答辩理由映射到对应的驳回理由。</p>

      {rejectionGrounds.length === 0 && (
        <p className="placeholder-hint">请先完成审查意见解析。</p>
      )}
      {!responseText && <p className="placeholder-hint">请先上传意见陈述书。</p>}

      {!result && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleRun}
          disabled={loading || rejectionGrounds.length === 0 || !responseText}
          data-testid="run-argument-analysis"
        >
          {loading ? "映射中..." : "开始映射"}
        </button>
      )}

      {error && <div className="alert alert--error" data-testid="argument-error">{error}</div>}

      {result && (
        <div className="argument-results" data-testid="argument-results">
          <h3>答辩映射 ({result.mappings.length} 条)</h3>
          {result.mappings.map((mapping) => (
            <div
              key={mapping.rejectionGroundCode}
              className="argument-card"
              data-testid={`mapping-${mapping.rejectionGroundCode}`}
            >
              <div className="argument-card__header">
                <strong>{mapping.rejectionGroundCode}</strong>
                <span className={`badge badge--confidence-${mapping.confidence}`}>
                  {mapping.confidence}
                </span>
              </div>
              <div className="argument-card__body">
                <p><strong>答辩摘要：</strong>{mapping.argumentSummary}</p>
                <blockquote>{mapping.applicantArgument}</blockquote>
                {mapping.amendedClaims && mapping.amendedClaims.length > 0 && (
                  <div className="argument-card__amendments">
                    <strong>权利要求修改：</strong>
                    {mapping.amendedClaims.map((claim) => (
                      <div key={claim.claimNumber} className="amendment-diff">
                        权利要求{claim.claimNumber}: {claim.changeDescription}
                      </div>
                    ))}
                  </div>
                )}
                {mapping.newEvidence && (
                  <p><strong>新证据：</strong>{mapping.newEvidence}</p>
                )}
              </div>
            </div>
          ))}

          {result.unmappedGrounds && result.unmappedGrounds.length > 0 && (
            <div className="alert alert--warning" data-testid="unmapped-warning">
              以下驳回理由未找到对应答辩: {result.unmappedGrounds.join(", ")}
            </div>
          )}

          <div className="legal-caution">{result.legalCaution}</div>
          <p className="case-ref">案件 ID: {caseId}</p>
        </div>
      )}
    </div>
  );
}

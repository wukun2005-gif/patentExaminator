import { useState } from "react";
import type { ArgumentAnalysisResponse, OpinionAnalysisResponse } from "../../agent/contracts";
import type { ArgumentMapping } from "@shared/types/domain";
import { useOpinionStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

interface Props {
  caseId: string;
  rejectionGrounds: OpinionAnalysisResponse["rejectionGrounds"];
  responseText: string;
  initialResult?: ArgumentAnalysisResponse | null;
  runAnalysis: () => Promise<ArgumentAnalysisResponse>;
  onComplete?: (result: ArgumentAnalysisResponse) => void;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高置信度",
  medium: "中置信度",
  low: "低置信度（请人工确认）"
};

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "conf-high",
  medium: "conf-medium",
  low: "conf-low"
};

export function ArgumentMappingPanel({
  caseId,
  rejectionGrounds,
  responseText,
  initialResult,
  runAnalysis,
  onComplete
}: Props) {
  const [result, setResult] = useState<ArgumentAnalysisResponse | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedArgs, setExpandedArgs] = useState<Set<string>>(new Set());

  const { updateArgumentMapping, removeArgumentMapping, addArgumentMapping } = useOpinionStore();

  const toggleArg = (code: string) => {
    setExpandedArgs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleDeleteMapping = (code: string) => {
    removeArgumentMapping(code);
    setResult((prev) => prev ? {
      ...prev,
      mappings: prev.mappings.filter((m) => m.rejectionGroundCode !== code)
    } : null);
  };

  const handleAddMapping = () => {
    const newMapping: ArgumentMapping = {
      id: `arg-new-${Date.now()}`,
      caseId,
      rejectionGroundCode: "",
      applicantArgument: "",
      argumentSummary: "",
      confidence: "medium",
      status: "draft",
      createdAt: new Date().toISOString()
    };
    addArgumentMapping(newMapping);
    setResult((prev) => prev ? {
      ...prev,
      mappings: [...prev.mappings, {
        rejectionGroundCode: newMapping.rejectionGroundCode,
        applicantArgument: newMapping.applicantArgument,
        argumentSummary: newMapping.argumentSummary,
        confidence: newMapping.confidence
      }]
    } : null);
  };

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
      <p className="panel__desc">
        将意见陈述书中的答辩理由映射到对应的驳回理由，标注对应关系和置信度。
      </p>

      {rejectionGrounds.length === 0 && (
        <p className="placeholder-hint">请先完成审查意见解析。</p>
      )}
      {!responseText && (
        <p className="placeholder-hint">请先上传意见陈述书。</p>
      )}

      <div className="opinion-toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleRun}
          disabled={loading || rejectionGrounds.length === 0 || !responseText}
          data-testid="run-argument-analysis"
        >
          {loading ? "映射中..." : result ? "重新映射" : "开始映射"}
        </button>
      </div>

      {error && (
        <div className="alert alert--error" data-testid="argument-error">
          {error}
        </div>
      )}

      {result && (
        <div className="argument-results" data-testid="argument-results">
          {/* 概要统计 */}
          <div className="opinion-summary">
            <div className="opinion-summary__stat">
              <span className="stat-number">{result.mappings.length}</span>
              <span className="stat-label">已映射</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">
                {result.mappings.filter((m) => m.confidence === "high").length}
              </span>
              <span className="stat-label">高置信度</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">
                {(result.unmappedGrounds?.length ?? 0)}
              </span>
              <span className="stat-label">未回应</span>
            </div>
          </div>

          {/* 未回应警告 */}
          {result.unmappedGrounds && result.unmappedGrounds.length > 0 && (
            <div className="alert alert--warning unmapped-alert" data-testid="unmapped-warning">
              <strong>以下驳回理由未找到对应答辩：</strong>
              {result.unmappedGrounds.join("、")}
            </div>
          )}

          {/* 映射卡片列表 */}
          <h3>答辩映射明细</h3>
          <div className="argument-mapping-list">
            {result.mappings.map((mapping) => (
              <div
                key={mapping.rejectionGroundCode}
                className="argument-mapping-card"
                data-testid={`mapping-${mapping.rejectionGroundCode}`}
              >
                <div className="argument-mapping-card__header">
                  <span className="rejection-ground-code">
                    {mapping.rejectionGroundCode || "新建"}
                  </span>
                  <span className="mapping-arrow">→</span>
                  <InlineEdit
                    as="select"
                    value={mapping.confidence}
                    options={Object.entries(CONFIDENCE_LABELS).map(([value, label]) => ({ value, label }))}
                    onSave={(v) => {
                      const conf = v as ArgumentMapping["confidence"];
                      updateArgumentMapping(mapping.rejectionGroundCode, { confidence: conf });
                      setResult((prev) => prev ? {
                        ...prev,
                        mappings: prev.mappings.map((m) =>
                          m.rejectionGroundCode === mapping.rejectionGroundCode
                            ? { ...m, confidence: conf }
                            : m
                        )
                      } : null);
                    }}
                  >
                    <span className={`confidence-badge ${CONFIDENCE_CLASS[mapping.confidence]}`}>
                      {CONFIDENCE_LABELS[mapping.confidence]}
                    </span>
                  </InlineEdit>
                  <button
                    type="button"
                    className="btn-delete-icon"
                    onClick={() => handleDeleteMapping(mapping.rejectionGroundCode)}
                    title="删除此映射"
                    data-testid={`delete-mapping-${mapping.rejectionGroundCode}`}
                  >
                    ✕
                  </button>
                </div>

                <div className="argument-mapping-card__body">
                  <div className="rejection-ground-field">
                    <span className="field-label">AI 摘要</span>
                    <InlineEdit
                      as="textarea"
                      value={mapping.argumentSummary}
                      onSave={(v) => {
                        updateArgumentMapping(mapping.rejectionGroundCode, { argumentSummary: v });
                        setResult((prev) => prev ? {
                          ...prev,
                          mappings: prev.mappings.map((m) =>
                            m.rejectionGroundCode === mapping.rejectionGroundCode
                              ? { ...m, argumentSummary: v }
                              : m
                          )
                        } : null);
                      }}
                    >
                      <span className="field-value">{mapping.argumentSummary}</span>
                    </InlineEdit>
                  </div>

                  <div className="rejection-ground-card__original">
                    <button
                      type="button"
                      className="btn-link original-toggle"
                      onClick={() => toggleArg(mapping.rejectionGroundCode)}
                    >
                      {expandedArgs.has(mapping.rejectionGroundCode)
                        ? "收起原文"
                        : "查看申请人答辩原文"}
                    </button>
                    {expandedArgs.has(mapping.rejectionGroundCode) && (
                      <blockquote className="original-text">
                        {mapping.applicantArgument}
                      </blockquote>
                    )}
                  </div>

                  {/* 权利要求修改 */}
                  {mapping.amendedClaims && mapping.amendedClaims.length > 0 && (
                    <div className="amended-claims-section">
                      <span className="field-label">权利要求修改</span>
                      <div className="amended-claims-list">
                        {mapping.amendedClaims.map((claim) => (
                          <div
                            key={claim.claimNumber}
                            className="amended-claim-card"
                          >
                            <span className="amended-claim-num">
                              权利要求 {claim.claimNumber}
                            </span>
                            <p className="amended-claim-desc">
                              {claim.changeDescription}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 新证据 */}
                  {mapping.newEvidence && (
                    <div className="new-evidence">
                      <span className="field-label">新证据</span>
                      <p className="field-value">{mapping.newEvidence}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn-add-item"
              onClick={handleAddMapping}
              data-testid="add-argument-mapping"
            >
              + 添加映射
            </button>
          </div>

          <div className="legal-caution">{result.legalCaution}</div>
        </div>
      )}
    </div>
  );
}

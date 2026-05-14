import { useState } from "react";
import type { OpinionAnalysisResponse, ArgumentAnalysisResponse } from "../../agent/contracts";
import type { RejectionGround, ArgumentMapping } from "@shared/types/domain";
import { useOpinionStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

interface Props {
  caseId: string;
  officeActionText: string;
  documentId: string;
  responseText: string;
  rejectionGrounds: OpinionAnalysisResponse["rejectionGrounds"];
  initialOpinionResult?: OpinionAnalysisResponse | null;
  initialArgumentResult?: ArgumentAnalysisResponse | null;
  runOpinionAnalysis: () => Promise<OpinionAnalysisResponse>;
  runArgumentAnalysis: () => Promise<ArgumentAnalysisResponse>;
  runFullAnalysis: () => Promise<{
    opinionResult: OpinionAnalysisResponse;
    argumentResult: ArgumentAnalysisResponse;
  }>;
  onOpinionComplete?: (result: OpinionAnalysisResponse) => void;
  onArgumentComplete?: (result: ArgumentAnalysisResponse) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  novelty: "新颖性",
  inventive: "创造性",
  clarity: "清楚/支持",
  support: "充分公开",
  amendment: "修改超范围",
  other: "其他"
};

const CATEGORY_CLASS: Record<string, string> = {
  novelty: "cat-novelty",
  inventive: "cat-inventive",
  clarity: "cat-clarity",
  support: "cat-support",
  amendment: "cat-amendment",
  other: "cat-other"
};

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

export function OpinionComparisonPanel({
  caseId,
  officeActionText,
  documentId,
  responseText,
  rejectionGrounds,
  initialOpinionResult,
  initialArgumentResult,
  runOpinionAnalysis,
  runArgumentAnalysis,
  runFullAnalysis,
  onOpinionComplete,
  onArgumentComplete
}: Props) {
  const [opinionResult, setOpinionResult] = useState<OpinionAnalysisResponse | null>(
    initialOpinionResult ?? null
  );
  const [argumentResult, setArgumentResult] = useState<ArgumentAnalysisResponse | null>(
    initialArgumentResult ?? null
  );
  const [loading, setLoading] = useState<"opinion" | "argument" | "full" | null>(null);
  const [opinionError, setOpinionError] = useState<string | null>(null);
  const [argumentError, setArgumentError] = useState<string | null>(null);
  const [expandedOriginals, setExpandedOriginals] = useState<Set<string>>(new Set());
  const [expandedArgs, setExpandedArgs] = useState<Set<string>>(new Set());

  const hasOfficeAction = !!officeActionText;
  const hasResponse = !!responseText;
  const hasRejectionGrounds = opinionResult
    ? opinionResult.rejectionGrounds.length > 0
    : rejectionGrounds.length > 0;

  const grounds = opinionResult?.rejectionGrounds ?? rejectionGrounds;
  const mappings = argumentResult?.mappings ?? [];
  const citedRefs = opinionResult?.citedReferences ?? [];

  const {
    updateRejectionGround,
    removeRejectionGround,
    updateArgumentMapping,
    removeArgumentMapping
  } = useOpinionStore();

  const mappingByCode = new Map(mappings.map((m) => [m.rejectionGroundCode, m]));
  const unrespondedCodes = argumentResult?.unmappedGrounds
    ?? (mappings.length > 0
      ? grounds.filter((g) => !mappingByCode.has(g.code)).map((g) => g.code)
      : []);

  const handleDeleteGround = (code: string) => {
    removeRejectionGround(code);
    setOpinionResult((prev) => prev ? {
      ...prev,
      rejectionGrounds: prev.rejectionGrounds.filter((g) => g.code !== code)
    } : null);
  };

  const handleDeleteMapping = (code: string) => {
    removeArgumentMapping(code);
    setArgumentResult((prev) => prev ? {
      ...prev,
      mappings: prev.mappings.filter((m) => m.rejectionGroundCode !== code)
    } : null);
  };

  const toggleOriginal = (code: string) => {
    setExpandedOriginals((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleArg = (code: string) => {
    setExpandedArgs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleOpinionAnalysis = async () => {
    setLoading("opinion");
    setOpinionError(null);
    try {
      const result = await runOpinionAnalysis();
      setOpinionResult(result);
      onOpinionComplete?.(result);
    } catch (err) {
      setOpinionError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const handleArgumentAnalysis = async () => {
    setLoading("argument");
    setArgumentError(null);
    try {
      const result = await runArgumentAnalysis();
      setArgumentResult(result);
      onArgumentComplete?.(result);
    } catch (err) {
      setArgumentError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const handleFullAnalysis = async () => {
    setLoading("full");
    setOpinionError(null);
    setArgumentError(null);
    try {
      const { opinionResult, argumentResult } = await runFullAnalysis();
      setOpinionResult(opinionResult);
      setArgumentResult(argumentResult);
      onOpinionComplete?.(opinionResult);
      onArgumentComplete?.(argumentResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOpinionError(msg);
      setArgumentError(msg);
    } finally {
      setLoading(null);
    }
  };

  const showResults = opinionResult || argumentResult || grounds.length > 0;

  return (
    <div className="panel" data-testid="opinion-comparison-panel">
      <h2>审查意见对照</h2>
      <p className="panel__desc">
        Side-by-side 对照审查意见与答辩理由，逐条比对驳回依据与申请人答复。
      </p>

      {!documentId && !hasOfficeAction && (
        <p className="placeholder-hint">
          请先在案件导入页上传审查意见通知书（文件类型选择"审查意见通知书"）。
        </p>
      )}
      {hasOfficeAction && !hasResponse && (
        <p className="placeholder-hint">
          请先上传意见陈述书。
        </p>
      )}

      <div className="opinion-toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleOpinionAnalysis}
          disabled={loading !== null || !hasOfficeAction}
          data-testid="run-opinion-only"
        >
          {loading === "opinion" ? "解析中..." : opinionResult ? "重新解析" : "解析审查意见"}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleArgumentAnalysis}
          disabled={loading !== null || !hasRejectionGrounds || !hasResponse}
          data-testid="run-argument-only"
        >
          {loading === "argument" ? "映射中..." : argumentResult ? "重新映射" : "映射答辩理由"}
        </button>
        <button
          type="button"
          className="btn btn--accent"
          onClick={handleFullAnalysis}
          disabled={loading !== null || !hasOfficeAction || !hasResponse}
          data-testid="run-full-analysis"
        >
          {loading === "full" ? "分析中..." : "一键全析"}
        </button>
      </div>

      {(opinionError || argumentError) && (
        <div className="alert alert--error" data-testid="comparison-error">
          {opinionError && <div>审查意见解析：{opinionError}</div>}
          {argumentError && <div>答辩理由映射：{argumentError}</div>}
        </div>
      )}

      {showResults && (
        <div className="comparison-results" data-testid="comparison-results">
          {/* 概要统计 */}
          <div className="opinion-summary">
            <div className="opinion-summary__stat">
              <span className="stat-number">{grounds.length}</span>
              <span className="stat-label">驳回理由</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">{mappings.length}</span>
              <span className="stat-label">已映射</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">
                {mappings.filter((m) => m.confidence === "high").length}
              </span>
              <span className="stat-label">AI 高置信映射</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">{unrespondedCodes.length}</span>
              <span className="stat-label">未回应</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">{citedRefs.length}</span>
              <span className="stat-label">引用文献</span>
            </div>
          </div>

          {/* 未回应警告 */}
          {unrespondedCodes.length > 0 && (
            <div className="alert alert--warning unmapped-alert" data-testid="unmapped-warning">
              <strong>以下驳回理由未找到对应答辩：</strong>
              {unrespondedCodes.join("、")}
            </div>
          )}

          {/* 逐条对照 */}
          <h3>驳回理由 vs 答辩理由对照</h3>
          <div className="comparison-list">
            {grounds.map((ground) => {
              const mapping = mappingByCode.get(ground.code);
              return (
                <div key={ground.code} className="comparison-row">
                  {/* 左侧：审查意见 */}
                  <div className="comparison-row__left">
                    <div
                      className="rejection-ground-card"
                      data-testid={`comparison-ground-${ground.code}`}
                    >
                      <div className="rejection-ground-card__header">
                        <span className="rejection-ground-code">{ground.code}</span>
                        <span className={`category-badge ${CATEGORY_CLASS[ground.category] ?? "cat-other"}`}>
                          {CATEGORY_LABELS[ground.category] ?? ground.category}
                        </span>
                        <span className="rejection-ground-claims">
                          涉及权利要求 {ground.claimNumbers.join("、")}
                        </span>
                        <button
                          type="button"
                          className="btn-delete-icon"
                          onClick={() => handleDeleteGround(ground.code)}
                          title="删除此驳回理由"
                          data-testid={`cmp-delete-ground-${ground.code}`}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="rejection-ground-card__body">
                        <div className="rejection-ground-field">
                          <span className="field-label">法律依据</span>
                          <InlineEdit
                            value={ground.legalBasis}
                            onSave={(v) => {
                              updateRejectionGround(ground.code, { legalBasis: v });
                              setOpinionResult((prev) => prev ? {
                                ...prev,
                                rejectionGrounds: prev.rejectionGrounds.map((g) =>
                                  g.code === ground.code ? { ...g, legalBasis: v } : g
                                )
                              } : null);
                            }}
                          >
                            <span className="field-value">{ground.legalBasis}</span>
                          </InlineEdit>
                        </div>
                        <div className="rejection-ground-field">
                          <span className="field-label">驳回理由</span>
                          <InlineEdit
                            as="textarea"
                            value={ground.summary}
                            onSave={(v) => {
                              updateRejectionGround(ground.code, { summary: v });
                              setOpinionResult((prev) => prev ? {
                                ...prev,
                                rejectionGrounds: prev.rejectionGrounds.map((g) =>
                                  g.code === ground.code ? { ...g, summary: v } : g
                                )
                              } : null);
                            }}
                          >
                            <span className="field-value">{ground.summary}</span>
                          </InlineEdit>
                        </div>
                      </div>
                      {ground.originalText && (
                        <div className="rejection-ground-card__original">
                          <button
                            type="button"
                            className="btn-link original-toggle"
                            onClick={() => toggleOriginal(ground.code)}
                          >
                            {expandedOriginals.has(ground.code) ? "收起原文" : "查看通知书原文"}
                          </button>
                          {expandedOriginals.has(ground.code) && (
                            <blockquote className="original-text">
                              {ground.originalText}
                            </blockquote>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 右侧：答辩映射 */}
                  <div className="comparison-row__right">
                    {mapping ? (
                      <div
                        className="argument-mapping-card"
                        data-testid={`comparison-mapping-${mapping.rejectionGroundCode}`}
                      >
                        <div className="argument-mapping-card__header">
                          <span className="rejection-ground-code">
                            {mapping.rejectionGroundCode}
                          </span>
                          <span className="mapping-arrow">→</span>
                          <InlineEdit
                            as="select"
                            value={mapping.confidence}
                            options={Object.entries(CONFIDENCE_LABELS).map(([value, label]) => ({ value, label }))}
                            onSave={(v) => {
                              const conf = v as ArgumentMapping["confidence"];
                              updateArgumentMapping(mapping.rejectionGroundCode, { confidence: conf });
                              setArgumentResult((prev) => prev ? {
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
                            data-testid={`cmp-delete-mapping-${mapping.rejectionGroundCode}`}
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
                                setArgumentResult((prev) => prev ? {
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
                          {mapping.newEvidence && (
                            <div className="new-evidence">
                              <span className="field-label">新证据</span>
                              <p className="field-value">{mapping.newEvidence}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="missing-mapping"
                        data-testid={`comparison-missing-${ground.code}`}
                      >
                        <span className="missing-mapping__icon">—</span>
                        <span className="missing-mapping__text">未找到对应答辩</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 引用文献清单 */}
          {citedRefs.length > 0 && (
            <div className="opinion-cited-references">
              <h3>引用文献清单</h3>
              <div className="cited-refs-list">
                {citedRefs.map((ref) => (
                  <div
                    key={`${ref.publicationNumber}-${ref.rejectionGroundCodes.join("-")}`}
                    className="cited-ref-card"
                  >
                    <div className="cited-ref-card__header">
                      <strong>{ref.publicationNumber}</strong>
                      <span className="cited-ref-codes">
                        关联驳回：{ref.rejectionGroundCodes.join("、")}
                      </span>
                    </div>
                    <p className="cited-ref-feature">{ref.featureMapping}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="legal-caution">
            {(opinionResult ?? argumentResult)?.legalCaution ??
              "本对照为 AI 辅助分析结果，需审查员逐项确认。"}
          </div>
        </div>
      )}
    </div>
  );
}

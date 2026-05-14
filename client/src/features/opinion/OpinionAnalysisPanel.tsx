import { useState } from "react";
import type { OpinionAnalysisResponse } from "../../agent/contracts";
import type { RejectionGround, RejectionCitedReference } from "@shared/types/domain";
import { useOpinionStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

interface Props {
  caseId: string;
  officeActionText: string;
  documentId: string;
  initialResult?: OpinionAnalysisResponse | null;
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

const CATEGORY_CLASS: Record<string, string> = {
  novelty: "cat-novelty",
  inventive: "cat-inventive",
  clarity: "cat-clarity",
  support: "cat-support",
  amendment: "cat-amendment",
  other: "cat-other"
};

export function OpinionAnalysisPanel({
  caseId,
  officeActionText,
  documentId,
  initialResult,
  runAnalysis,
  onComplete
}: Props) {
  const [result, setResult] = useState<OpinionAnalysisResponse | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOriginals, setExpandedOriginals] = useState<Set<string>>(new Set());

  const {
    updateRejectionGround,
    removeRejectionGround,
    addRejectionGround,
    addCitedRef,
    removeCitedRef
  } = useOpinionStore();

  const toggleOriginal = (code: string) => {
    setExpandedOriginals((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleDeleteGround = (code: string) => {
    removeRejectionGround(code);
    setResult((prev) => prev ? {
      ...prev,
      rejectionGrounds: prev.rejectionGrounds.filter((g) => g.code !== code)
    } : null);
  };

  const handleAddGround = () => {
    const newGround: RejectionGround = {
      code: `GR-${Date.now().toString(36).toUpperCase()}`,
      category: "other",
      claimNumbers: [],
      summary: "",
      legalBasis: ""
    };
    addRejectionGround(newGround);
    setResult((prev) => prev ? {
      ...prev,
      rejectionGrounds: [...prev.rejectionGrounds, newGround]
    } : null);
  };

  const handleAddRef = () => {
    const newRef: RejectionCitedReference = {
      publicationNumber: "",
      rejectionGroundCodes: [],
      featureMapping: ""
    };
    addCitedRef(newRef);
    setResult((prev) => prev ? {
      ...prev,
      citedReferences: [...prev.citedReferences, newRef]
    } : null);
  };

  const handleDeleteRef = (pubNumber: string) => {
    removeCitedRef(pubNumber);
    setResult((prev) => prev ? {
      ...prev,
      citedReferences: prev.citedReferences.filter((r) => r.publicationNumber !== pubNumber)
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
    <div className="panel" data-testid="opinion-analysis-panel">
      <h2>审查意见解析</h2>
      <p className="panel__desc">
        解析审查意见通知书，提取结构化驳回理由和引用文献。
      </p>

      {!documentId && (
        <p className="placeholder-hint">
          请先在案件导入页上传审查意见通知书（文件类型选择"审查意见通知书"）。
        </p>
      )}

      <div className="opinion-toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleRun}
          disabled={loading || !officeActionText}
          data-testid="run-opinion-analysis"
        >
          {loading ? "解析中..." : result ? "重新解析" : "开始解析"}
        </button>
      </div>

      {error && (
        <div className="alert alert--error" data-testid="opinion-error">
          {error}
        </div>
      )}

      {result && (
        <div className="opinion-results" data-testid="opinion-results">
          {/* 概要 */}
          <div className="opinion-summary">
            <div className="opinion-summary__stat">
              <span className="stat-number">{result.rejectionGrounds.length}</span>
              <span className="stat-label">驳回理由</span>
            </div>
            <div className="opinion-summary__stat">
              <span className="stat-number">{result.citedReferences.length}</span>
              <span className="stat-label">引用文献</span>
            </div>
          </div>

          {/* 驳回理由卡片 */}
          <h3>驳回理由清单</h3>
          <div className="rejection-grounds-list">
            {result.rejectionGrounds.map((ground) => (
              <div
                key={ground.code}
                className="rejection-ground-card"
                data-testid={`rejection-ground-${ground.code}`}
              >
                <div className="rejection-ground-card__header">
                  <InlineEdit
                    value={ground.code}
                    onSave={(v) => {
                      updateRejectionGround(ground.code, { code: v });
                      setResult((prev) => prev ? {
                        ...prev,
                        rejectionGrounds: prev.rejectionGrounds.map((g) =>
                          g.code === ground.code ? { ...g, code: v } : g
                        )
                      } : null);
                    }}
                  >
                    <span className="rejection-ground-code">{ground.code}</span>
                  </InlineEdit>
                  <InlineEdit
                    as="select"
                    value={ground.category}
                    options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
                    onSave={(v) => {
                      const cat = v as RejectionGround["category"];
                      updateRejectionGround(ground.code, { category: cat });
                      setResult((prev) => prev ? {
                        ...prev,
                        rejectionGrounds: prev.rejectionGrounds.map((g) =>
                          g.code === ground.code ? { ...g, category: cat } : g
                        )
                      } : null);
                    }}
                  >
                    <span className={`category-badge ${CATEGORY_CLASS[ground.category] ?? "cat-other"}`}>
                      {CATEGORY_LABELS[ground.category] ?? ground.category}
                    </span>
                  </InlineEdit>
                  <span className="rejection-ground-claims">
                    涉及权利要求 {ground.claimNumbers.join("、")}
                  </span>
                  <button
                    type="button"
                    className="btn-delete-icon"
                    onClick={() => handleDeleteGround(ground.code)}
                    title="删除此驳回理由"
                    data-testid={`delete-ground-${ground.code}`}
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
                        setResult((prev) => prev ? {
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
                        setResult((prev) => prev ? {
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
            ))}
            <button
              type="button"
              className="btn-add-item"
              onClick={handleAddGround}
              data-testid="add-rejection-ground"
            >
              + 添加驳回理由
            </button>
          </div>

          {/* 引用文献 */}
          {result.citedReferences.length > 0 && (
            <div className="opinion-cited-references">
              <h3>引用文献清单</h3>
              <div className="cited-refs-list">
                {result.citedReferences.map((ref) => (
                  <div
                    key={`${ref.publicationNumber}-${ref.rejectionGroundCodes.join("-")}`}
                    className="cited-ref-card"
                  >
                    <div className="cited-ref-card__header">
                      <InlineEdit
                        value={ref.publicationNumber}
                        onSave={(v) => {
                          const oldPub = ref.publicationNumber;
                          updateRejectionGround("", {});
                          setResult((prev) => prev ? {
                            ...prev,
                            citedReferences: prev.citedReferences.map((r) =>
                              r.publicationNumber === oldPub ? { ...r, publicationNumber: v } : r
                            )
                          } : null);
                        }}
                      >
                        <strong>{ref.publicationNumber}</strong>
                      </InlineEdit>
                      <span className="cited-ref-codes">
                        关联驳回：{ref.rejectionGroundCodes.join("、")}
                      </span>
                      <button
                        type="button"
                        className="btn-delete-icon"
                        onClick={() => handleDeleteRef(ref.publicationNumber)}
                        title="删除此文献"
                        data-testid={`delete-ref-${ref.publicationNumber}`}
                      >
                        ✕
                      </button>
                    </div>
                    <InlineEdit
                      as="textarea"
                      value={ref.featureMapping}
                      onSave={(v) => {
                        setResult((prev) => prev ? {
                          ...prev,
                          citedReferences: prev.citedReferences.map((r) =>
                            r.publicationNumber === ref.publicationNumber
                              ? { ...r, featureMapping: v }
                              : r
                          )
                        } : null);
                      }}
                    >
                      <p className="cited-ref-feature">{ref.featureMapping}</p>
                    </InlineEdit>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-add-item"
                  onClick={handleAddRef}
                  data-testid="add-cited-ref"
                >
                  + 添加文献
                </button>
              </div>
            </div>
          )}

          <div className="legal-caution">{result.legalCaution}</div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useCaseStore, useClaimsStore, useNoveltyStore, useInventiveStore, useDefectsStore, useDraftStore } from "../../store";
import type { ReexamDraftResponse } from "../../agent/contracts";
import { InlineEdit } from "../../components/InlineEdit";
import { ErrorBanner } from "../../lib/errorDisplay";

interface DraftMaterialPanelProps {
  caseId: string;
  runReexamDraft?: (options?: { signal?: AbortSignal }) => Promise<ReexamDraftResponse>;
}

const ASSESSMENT_LABELS: Record<string, string> = {
  "possibly-lacks-inventiveness": "可能缺乏创造性",
  "possibly-inventive": "可能具有创造性",
  "insufficient-evidence": "证据不足",
  "not-analyzed": "尚未分析"
};

const CATEGORY_LABELS: Record<string, string> = {
  novelty: "新颖性",
  inventive: "创造性",
  clarity: "清楚/支持",
  support: "充分公开",
  amendment: "修改超范围",
  other: "其他"
};

const SEVERITY_LABELS: Record<string, string> = {
  error: "严重",
  warning: "警告",
  info: "提示"
};

const REEXAM_CONCLUSION_LABELS: Record<string, string> = {
  "argument-accepted": "答辩成立",
  "argument-partially-accepted": "答辩部分成立",
  "argument-rejected": "答辩不成立",
  "needs-further-review": "需进一步审查"
};

export function DraftMaterialPanel({ caseId, runReexamDraft }: DraftMaterialPanelProps) {
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { defects } = useDefectsStore();
  const { reexamDrafts, setReexamDraft } = useDraftStore();
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller, key) => {
        controller.abort();
        console.log(`[DraftMaterialPanel] Aborted request ${key} on unmount`);
      });
      controllers.clear();
    };
  }, []);

  const persistedDraft = reexamDrafts[caseId] ?? null;
  const [reexamDraft, setReexamDraftLocal] = useState<ReexamDraftResponse | null>(persistedDraft);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Restore persisted draft when caseId changes
  useEffect(() => {
    setReexamDraftLocal(persistedDraft);
  }, [caseId]);

  const features = claimFeatures.filter((f) => f.caseId === caseId);
  const noveltyComparisons = comparisons.filter((c) => c.caseId === caseId);
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const inventiveAnalysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );
  const caseDefects = defects.filter((d) => d.caseId === caseId);

  const confirmedFeatures = features.filter((f) => f.citationStatus !== "not-found");
  const diffCodes = [...new Set(noveltyComparisons.flatMap((c) => c.differenceFeatureCodes))];
  const pendingQuestions = [...new Set(noveltyComparisons.flatMap((c) => c.pendingSearchQuestions))];
  const unresolvedDefects = caseDefects.filter((d) => !d.resolved);

  const persistReexamDraft = (draft: ReexamDraftResponse) => {
    setReexamDraftLocal(draft);
    setReexamDraft(caseId, draft);
  };

  const updateItemResponse = (item: ReexamDraftResponse["responseItems"][number], field: string, value: string) => {
    if (!reexamDraft) return;
    const updated: ReexamDraftResponse = {
      ...reexamDraft,
      responseItems: reexamDraft.responseItems.map((ri) =>
        ri.rejectionGroundCode === item.rejectionGroundCode ? { ...ri, [field]: value } : ri
      )
    };
    persistReexamDraft(updated);
  };

  const updateEvidenceField = (item: ReexamDraftResponse["responseItems"][number], evIdx: number, field: string, value: string) => {
    if (!reexamDraft) return;
    const updated: ReexamDraftResponse = {
      ...reexamDraft,
      responseItems: reexamDraft.responseItems.map((ri) =>
        ri.rejectionGroundCode === item.rejectionGroundCode
          ? {
              ...ri,
              supportingEvidence: (ri.supportingEvidence ?? []).map((ev, i) =>
                i === evIdx ? { ...ev, [field]: value } : ev
              )
            }
          : ri
      )
    };
    persistReexamDraft(updated);
  };

  const removeEvidence = (item: ReexamDraftResponse["responseItems"][number], evIdx: number) => {
    if (!reexamDraft) return;
    const updated: ReexamDraftResponse = {
      ...reexamDraft,
      responseItems: reexamDraft.responseItems.map((ri) =>
        ri.rejectionGroundCode === item.rejectionGroundCode
          ? { ...ri, supportingEvidence: (ri.supportingEvidence ?? []).filter((_, i) => i !== evIdx) }
          : ri
      )
    };
    persistReexamDraft(updated);
  };

  const addEvidence = (item: ReexamDraftResponse["responseItems"][number]) => {
    if (!reexamDraft) return;
    const newEvidence = { label: `新依据 (${(item.supportingEvidence?.length ?? 0) + 1})`, quote: "", confidence: "medium" as const };
    const updated: ReexamDraftResponse = {
      ...reexamDraft,
      responseItems: reexamDraft.responseItems.map((ri) =>
        ri.rejectionGroundCode === item.rejectionGroundCode
          ? { ...ri, supportingEvidence: [...(ri.supportingEvidence ?? []), newEvidence] }
          : ri
      )
    };
    persistReexamDraft(updated);
  };

  const handleGenerateReexamDraft = async () => {
    if (!runReexamDraft || loadingDraft) return;

    const existingController = abortControllersRef.current.get("reexamDraft");
    if (existingController) existingController.abort();

    const controller = new AbortController();
    abortControllersRef.current.set("reexamDraft", controller);

    setLoadingDraft(true);
    setDraftError(null);
    try {
      const draft = await runReexamDraft({ signal: controller.signal });

      if (!isMountedRef.current || controller.signal.aborted) return;

      setReexamDraftLocal(draft);
      setReexamDraft(caseId, draft);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!isMountedRef.current) return;
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      abortControllersRef.current.delete("reexamDraft");
      if (isMountedRef.current) setLoadingDraft(false);
    }
  };

  return (
    <div className="draft-material-panel" data-testid="draft-material-panel">
      <h2>复审意见草稿</h2>
      <p className="draft-description">
        基于驳回理由、答辩映射和上游分析结果生成逐条回应格式草稿。
      </p>
      {runReexamDraft && (
        <button
          type="button"
          onClick={handleGenerateReexamDraft}
          disabled={loadingDraft}
          data-testid="btn-generate-reexam-draft"
        >
          {loadingDraft ? "生成中..." : reexamDraft ? "重新生成复审意见草稿" : "生成复审意见草稿"}
        </button>
      )}
      {draftError && <ErrorBanner error={draftError} data-testid="draft-error" />}

      <div className="draft-sections">
        {reexamDraft && (
          <section className="draft-section" data-testid="section-reexam-draft">
            <h3>逐条回应</h3>
            <div className="section-content">
              {reexamDraft.responseItems.map((item) => (
                <div key={item.rejectionGroundCode} className="reexam-response-item">
                  <h4>{item.rejectionGroundCode} · {CATEGORY_LABELS[item.category] ?? item.category}</h4>
                  <p><strong>申请人意见：</strong>{item.applicantArgumentSummary}</p>
                  <p><strong>审查员回应草稿：</strong>
                    <InlineEdit
                      as="textarea"
                      value={item.examinerResponse}
                      rows={4}
                      onSave={(v) => {
                        updateItemResponse(item, "examinerResponse", v);
                      }}
                    >
                      <span>{item.examinerResponse}</span>
                    </InlineEdit>
                  </p>
                  <p><strong>候选结论：</strong>
                    <InlineEdit
                      as="select"
                      value={item.conclusion}
                      options={Object.entries(REEXAM_CONCLUSION_LABELS).map(([value, label]) => ({ value, label }))}
                      onSave={(v) => {
                        updateItemResponse(item, "conclusion", v);
                      }}
                    >
                      <span>{REEXAM_CONCLUSION_LABELS[item.conclusion] ?? item.conclusion}</span>
                    </InlineEdit>
                  </p>
                  <div className="supporting-evidence">
                    <strong>原文依据：</strong>
                    {item.supportingEvidence?.map((evidence, evIdx) => (
                      <blockquote
                        key={`${item.rejectionGroundCode}-${evidence.label}-${evIdx}`}
                        className={`citation-quote citation-quote--${evidence.confidence}`}
                        data-testid={`citation-${evidence.confidence}`}
                      >
                        <cite>
                          <InlineEdit
                            as="input"
                            value={evidence.label}
                            onSave={(v) => {
                              updateEvidenceField(item, evIdx, "label", v);
                            }}
                          >
                            <span>{evidence.label}</span>
                          </InlineEdit>
                        </cite>
                        <InlineEdit
                          as="textarea"
                          value={evidence.quote ?? ""}
                          rows={2}
                          onSave={(v) => {
                            updateEvidenceField(item, evIdx, "quote", v);
                          }}
                        >
                          {evidence.quote ? <p>「{evidence.quote}」</p> : <p className="citation-quote--missing">待补充原文依据</p>}
                        </InlineEdit>
                        <span className="citation-confidence">
                          置信度：{evidence.confidence}
                          <button
                            type="button"
                            className="btn-evidence-remove"
                            onClick={() => removeEvidence(item, evIdx)}
                            title="删除此原文依据"
                          >
                            删除
                          </button>
                        </span>
                      </blockquote>
                    ))}
                    {(!item.supportingEvidence || item.supportingEvidence.length === 0) && (
                      <p className="placeholder-hint">暂无原文依据。</p>
                    )}
                    <button
                      type="button"
                      className="btn-evidence-add"
                      onClick={() => addEvidence(item)}
                    >
                      + 添加原文依据
                    </button>
                  </div>
                </div>
              ))}
              <h4>综合评估</h4>
              <InlineEdit
                as="textarea"
                value={reexamDraft.overallAssessment}
                rows={4}
                onSave={(v) => {
                  setReexamDraftLocal((prev) => prev ? { ...prev, overallAssessment: v } : null);
                  setReexamDraft(caseId, { ...reexamDraft, overallAssessment: v });
                }}
              >
                <p>{reexamDraft.overallAssessment}</p>
              </InlineEdit>
              {reexamDraft.defectReviewSummary && (
                <>
                  <h4>缺陷复查总结</h4>
                  <p>{reexamDraft.defectReviewSummary}</p>
                </>
              )}
              <p className="legal-caution-text"><em>{reexamDraft.legalCaution}</em></p>
            </div>
          </section>
        )}

        {/* Section 1: 上游事实材料 */}
        <section className="draft-section" data-testid="section-body-draft">
          <h3>上游事实材料</h3>
          <div className="section-content">
            {currentCase && (
              <div className="draft-case-summary">
                <p><strong>{currentCase.title}</strong>（{currentCase.applicationNumber}）</p>
              </div>
            )}
            {confirmedFeatures.length > 0 && (
              <div className="draft-features">
                <h4>权利要求特征表（{confirmedFeatures.length} 个已确认特征）</h4>
                <ul>
                  {confirmedFeatures.map((f) => (
                    <li key={f.id}>{f.featureCode}: {f.description}</li>
                  ))}
                </ul>
              </div>
            )}
            {noveltyComparisons.length > 0 && (
              <div className="draft-novelty">
                <h4>新颖性对照（{noveltyComparisons.length} 篇对比文件）</h4>
                {noveltyComparisons.map((comp) => (
                  <div key={comp.id}>
                    <p>对比文件: {comp.referenceId} — 状态: {comp.status}</p>
                  </div>
                ))}
              </div>
            )}
            {confirmedFeatures.length === 0 && noveltyComparisons.length === 0 && (
              <p className="placeholder-hint">请先完成权利要求特征表和新颖性分析。</p>
            )}
          </div>
        </section>

        {/* Section 2: 创造性分析 */}
        <section className="draft-section" data-testid="section-inventive">
          <h3>创造性复核</h3>
          <div className="section-content">
            {inventiveAnalysis ? (
              <>
                <p><strong>最接近现有技术：</strong>{inventiveAnalysis.closestPriorArtId ?? "—"}</p>
                <p><strong>共有特征：</strong>{inventiveAnalysis.sharedFeatureCodes.join("、") || "无"}</p>
                <p><strong>区别特征：</strong>{inventiveAnalysis.distinguishingFeatureCodes.join("、") || "无"}</p>
                {inventiveAnalysis.objectiveTechnicalProblem && (
                  <p><strong>客观技术问题：</strong>{inventiveAnalysis.objectiveTechnicalProblem}</p>
                )}
                <p><strong>候选结论：</strong>{ASSESSMENT_LABELS[inventiveAnalysis.candidateAssessment]}</p>
                {inventiveAnalysis.motivationEvidence.length > 0 && (
                  <>
                    <h4>技术启示</h4>
                    <ul>
                      {inventiveAnalysis.motivationEvidence.map((e, i) => (
                        <li key={i}>{e.label}{e.quote ? `：「${e.quote}」` : ""}（置信度：{e.confidence}）</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="legal-caution-text"><em>{inventiveAnalysis.legalCaution}</em></p>
              </>
            ) : (
              <p className="placeholder-hint">尚未运行创造性分析。</p>
            )}
          </div>
        </section>

        {/* Section 3: 新颖性复核摘要 */}
        <section className="draft-section" data-testid="section-analysis-strategy">
          <h3>新颖性复核摘要</h3>
          <div className="section-content">
            {diffCodes.length > 0 && (
              <div>
                <h4>区别特征候选（{diffCodes.length} 个）</h4>
                <ul>
                  {diffCodes.map((code) => <li key={code}>{code}</li>)}
                </ul>
              </div>
            )}
            {pendingQuestions.length > 0 && (
              <div>
                <h4>待检索问题（{pendingQuestions.length} 条）</h4>
                <ul>
                  {pendingQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
            {diffCodes.length === 0 && pendingQuestions.length === 0 && (
              <p className="placeholder-hint">基于新颖性对照和创造性分析结果生成。</p>
            )}
          </div>
        </section>

        {/* Section 4: 形式缺陷 */}
        <section className="draft-section" data-testid="section-defects">
          <h3>缺陷复查</h3>
          <div className="section-content">
            {caseDefects.length > 0 ? (
              <>
                <p>共 {caseDefects.length} 项缺陷，{unresolvedDefects.length} 项未解决</p>
                <table className="draft-defect-table">
                  <thead>
                    <tr>
                      <th>严重度</th>
                      <th>分类</th>
                      <th>描述</th>
                      <th>位置</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseDefects.map((d) => (
                      <tr key={d.id} className={d.resolved ? "defect-row--resolved" : ""}>
                        <td>{SEVERITY_LABELS[d.severity]}</td>
                        <td>{d.category}</td>
                        <td>{d.description}</td>
                        <td>{d.location ?? "—"}</td>
                        <td>{d.resolved ? "已解决" : "未解决"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="placeholder-hint">尚未运行形式缺陷检查。</p>
            )}
          </div>
        </section>

        {/* Section 5: 待确认事项 */}
        <section className="draft-section" data-testid="section-pending-items">
          <h3>待确认事项</h3>
          <div className="section-content">
            <ul>
              {pendingQuestions.map((q, i) => <li key={`q-${i}`}>{q}</li>)}
              {inventiveAnalysis?.cautions.map((c, i) => <li key={`c-${i}`}>{c}</li>)}
              {unresolvedDefects.map((d) => <li key={d.id}>[{SEVERITY_LABELS[d.severity]}] {d.description}</li>)}
              {pendingQuestions.length === 0 && !inventiveAnalysis?.cautions.length && unresolvedDefects.length === 0 && (
                <li className="placeholder-hint">暂无待确认事项。</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      <p className="case-ref">案件 ID: {caseId}</p>
    </div>
  );
}

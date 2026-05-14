import { useState } from "react";
import type { InventiveStepAnalysis, ReferenceDocument } from "@shared/types/domain";
import type { InventiveRequest, InventiveResponse } from "../../agent/contracts";
import { useInventiveStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

interface InventiveStepPanelProps {
  caseId: string;
  claimNumber: number;
  features: Array<{ featureCode: string; description: string }>;
  references: ReferenceDocument[];
  applicantArguments?: string | undefined;
  amendedClaimText?: string | undefined;
  runInventive: (request: InventiveRequest) => Promise<InventiveResponse>;
}

const ASSESSMENT_LABELS: Record<string, string> = {
  "possibly-lacks-inventiveness": "可能缺乏创造性（待确认）",
  "possibly-inventive": "可能具有创造性（待确认）",
  "insufficient-evidence": "证据不足",
  "not-analyzed": "尚未分析"
};

export function InventiveStepPanel({
  caseId,
  claimNumber,
  features,
  references,
  applicantArguments,
  amendedClaimText,
  runInventive
}: InventiveStepPanelProps) {
  const { analyses, addAnalysis, updateAnalysis, isLoading, setLoading } = useInventiveStore();
  const analysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );

  const availableRefs = references.filter((r) => r.timelineStatus === "available");

  const [selectedClosestId, setSelectedClosestId] = useState<string>(
    () => analysis?.closestPriorArtId ?? ""
  );
  const [selectedDistinguishing, setSelectedDistinguishing] = useState<string[]>(
    () => analysis?.distinguishingFeatureCodes ?? []
  );
  const [techProblem, setTechProblem] = useState<string>(
    () => analysis?.objectiveTechnicalProblem ?? ""
  );
  const [examinerResponse, setExaminerResponse] = useState<string>(
    () => analysis?.examinerResponse ?? ""
  );

  const handleRun = async () => {
    if (isLoading || availableRefs.length === 0) return;

    setLoading(true);
    try {
      const request: InventiveRequest = {
        caseId,
        claimNumber,
        features,
        availableReferences: availableRefs.map((r) => ({
          referenceId: r.id,
          label: r.title ?? r.publicationNumber ?? r.fileName,
          excerpt: r.extractedText.slice(0, 2000)
        })),
        ...(selectedClosestId ? { closestPriorArtId: selectedClosestId } : {}),
        ...(applicantArguments ? { applicantArguments } : {}),
        ...(amendedClaimText ? { amendedClaimText } : {})
      };

      const response = await runInventive(request);
      const appliedApplicantArguments = response.applicantArguments ?? applicantArguments;

      const newAnalysis: InventiveStepAnalysis = {
        id: `inventive-${caseId}-${claimNumber}`,
        caseId,
        sharedFeatureCodes: response.sharedFeatureCodes,
        distinguishingFeatureCodes: response.distinguishingFeatureCodes,
        status: "draft",
        motivationEvidence: response.motivationEvidence.map((e) => ({
          ...e,
          documentId: e.referenceId
        })),
        candidateAssessment: response.candidateAssessment,
        cautions: response.cautions,
        legalCaution: response.legalCaution,
        ...(appliedApplicantArguments ? { applicantArguments: appliedApplicantArguments } : {}),
        ...(response.examinerResponse ? { examinerResponse: response.examinerResponse } : {}),
        ...(response.closestPriorArtId ? { closestPriorArtId: response.closestPriorArtId } : {}),
        ...(response.objectiveTechnicalProblem
          ? { objectiveTechnicalProblem: response.objectiveTechnicalProblem }
          : {})
      };

      if (analysis) {
        updateAnalysis(newAnalysis);
      } else {
        addAnalysis(newAnalysis);
      }

      setSelectedClosestId(response.closestPriorArtId ?? "");
      setSelectedDistinguishing(response.distinguishingFeatureCodes);
      setTechProblem(response.objectiveTechnicalProblem ?? "");
      if (response.examinerResponse) {
        setExaminerResponse(response.examinerResponse);
      } else {
        const parts = [
          `【候选结论】${ASSESSMENT_LABELS[response.candidateAssessment] ?? response.candidateAssessment}`,
          "",
          ...(response.motivationEvidence.length > 0
            ? ["【技术启示】", ...response.motivationEvidence.map((e) =>
                `- ${e.label}${e.quote ? `：「${e.quote}」` : ""} (${e.confidence})`
              ), ""]
            : []),
          ...(response.cautions.length > 0
            ? ["【注意事项】", ...response.cautions.map((c) => `- ${c}`), ""]
            : []),
          response.legalCaution ? `(${response.legalCaution})` : ""
        ];
        setExaminerResponse(parts.join("\n"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClosest = (refId: string) => {
    setSelectedClosestId(refId);
  };

  const handleToggleDistinguishing = (code: string) => {
    setSelectedDistinguishing((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSaveResponse = () => {
    if (!analysis) return;
    updateAnalysis({ ...analysis, examinerResponse });
  };

  const handleUpdateEvidence = (index: number, patch: Partial<{ label: string; quote: string; confidence: string }>) => {
    if (!analysis) return;
    const updated = [...analysis.motivationEvidence];
    updated[index] = { ...updated[index], ...patch } as typeof updated[number];
    updateAnalysis({ ...analysis, motivationEvidence: updated });
  };

  const handleDeleteEvidence = (index: number) => {
    if (!analysis) return;
    const updated = analysis.motivationEvidence.filter((_, i) => i !== index);
    updateAnalysis({ ...analysis, motivationEvidence: updated });
  };

  const handleAddEvidence = () => {
    if (!analysis) return;
    const newEvidence = {
      referenceId: "",
      documentId: "",
      label: "",
      confidence: "medium" as const
    };
    updateAnalysis({
      ...analysis,
      motivationEvidence: [...analysis.motivationEvidence, newEvidence]
    });
  };

  return (
    <div className="inventive-step-panel" data-testid="inventive-step-panel">
      <h2>创造性复核</h2>

      {/* Top toolbar — run button visible immediately */}
      <div className="inventive-toolbar">
        <button
          type="button"
          onClick={handleRun}
          disabled={isLoading || availableRefs.length === 0}
          data-testid="btn-run-inventive"
        >
          {isLoading ? "分析中..." : analysis ? "重新运行复核" : "运行创造性复核"}
        </button>
        {availableRefs.length === 0 && (
          <span className="inventive-no-refs" data-testid="inventive-no-references">
            未上传可用对比文件
          </span>
        )}
      </div>

      {analysis && (
        <div data-testid="inventive-legal-caution" className="legal-caution">
          {analysis.legalCaution}
        </div>
      )}

      {/* Applicant arguments context */}
      {(analysis?.applicantArguments ?? applicantArguments) && (
        <div className="reexam-context" data-testid="inventive-reexam-context">
          <h4>申请人答辩理由</h4>
          <blockquote>{analysis?.applicantArguments ?? applicantArguments}</blockquote>
        </div>
      )}

      <div className="inventive-steps">
        {/* Step 1: Closest Prior Art */}
        <div className="step" data-testid="step-1">
          <h3>Step 1：最接近现有技术</h3>
          <p className="step-desc">AI 从可用对比文件中推荐最接近现有技术，点击可更换。</p>
          <div className="prior-art-list" data-testid="prior-art-list">
            {availableRefs.map((ref) => {
              const isRecommended = analysis?.closestPriorArtId === ref.id;
              const isSelected = selectedClosestId === ref.id || (!selectedClosestId && isRecommended);
              return (
                <button
                  type="button"
                  key={ref.id}
                  className={`prior-art-item ${isSelected ? "prior-art-item--selected" : ""} ${isRecommended ? "prior-art-item--recommended" : ""}`}
                  onClick={() => handleSelectClosest(ref.id)}
                  data-testid={`prior-art-${ref.id}`}
                >
                  <div className={`prior-art-item__radio${isSelected ? " prior-art-item__radio--selected" : ""}`} />
                  <div className="prior-art-item__info">
                    <div className="prior-art-item__title">
                      {ref.title ?? ref.publicationNumber ?? ref.fileName}
                      {isRecommended && <span className="prior-art-badge">AI 推荐</span>}
                    </div>
                    {ref.summary && (
                      <div className="prior-art-item__summary">{ref.summary}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {analysis && (
            <p className="step-shared-features">
              共有特征：{analysis.sharedFeatureCodes.length > 0
                ? analysis.sharedFeatureCodes.join("、")
                : "无"}
            </p>
          )}
        </div>

        {/* Step 2: Distinguishing Features */}
        <div className="step" data-testid="step-2">
          <h3>Step 2：区别特征与客观技术问题</h3>
          <p className="step-desc">勾选属于区别技术特征的条目，AI 将据此推导客观技术问题。</p>

          <div className="step2-content">
            <div className="step2-features">
              <strong>区别特征：</strong>
              <div className="feature-checkboxes">
                {features.map((f) => (
                  <label key={f.featureCode} data-testid={`checkbox-feature-${f.featureCode}`}>
                    <input
                      type="checkbox"
                      checked={selectedDistinguishing.includes(f.featureCode)}
                      onChange={() => handleToggleDistinguishing(f.featureCode)}
                    />
                    {f.featureCode}: {f.description}
                  </label>
                ))}
              </div>
            </div>

            <div className="step2-tech-problem">
              <label htmlFor="tech-problem">
                客观技术问题：
                {techProblem && <span className="step2-ai-hint">（AI 输出，可修改）</span>}
              </label>
              <textarea
                id="tech-problem"
                value={techProblem}
                onChange={(e) => setTechProblem(e.target.value)}
                data-testid="input-objective-technical-problem"
                placeholder="根据区别特征推导客观技术问题，AI 运行后自动填充，也可手动输入。"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Step 3: AI Draft — read-only display + one editable textarea */}
        <div className="step" data-testid="step-3">
          <h3>Step 3：审查员回应草稿</h3>
          {analysis ? (
            <div className="step3-draft">
              <p className="step3-summary" data-testid="candidate-assessment">
                {ASSESSMENT_LABELS[analysis.candidateAssessment] ?? analysis.candidateAssessment}
                {analysis.motivationEvidence.length > 0 && (
                  <span> · 技术启示 {analysis.motivationEvidence.length} 条</span>
                )}
                {analysis.cautions.length > 0 && (
                  <span> · 注意事项 {analysis.cautions.length} 条</span>
                )}
              </p>

              <textarea
                id="examiner-response"
                value={examinerResponse}
                onChange={(e) => setExaminerResponse(e.target.value)}
                placeholder="运行分析后，AI 将在此生成回应草稿..."
                rows={12}
                data-testid="edit-examiner-response"
              />

              {analysis.motivationEvidence.length > 0 && (
                <div className="step3-evidence-editor">
                  <h4>技术启示证据（可编辑）</h4>
                  <div className="evidence-list">
                    {analysis.motivationEvidence.map((ev, i) => (
                      <div key={i} className="evidence-item" data-testid={`evidence-${i}`}>
                        <div className="evidence-item__fields">
                          <InlineEdit
                            value={ev.label}
                            onSave={(v) => handleUpdateEvidence(i, { label: v })}
                          >
                            <strong>{ev.label || "（空）"}</strong>
                          </InlineEdit>
                          <InlineEdit
                            as="textarea"
                            value={ev.quote ?? ""}
                            onSave={(v) => handleUpdateEvidence(i, v ? { quote: v } : {})}
                          >
                            <span className="evidence-quote">{ev.quote ? `「${ev.quote}」` : "（无引用）"}</span>
                          </InlineEdit>
                          <InlineEdit
                            as="select"
                            value={ev.confidence}
                            options={[
                              { value: "high", label: "高" },
                              { value: "medium", label: "中" },
                              { value: "low", label: "低" }
                            ]}
                            onSave={(v) => handleUpdateEvidence(i, { confidence: v })}
                          >
                            <span className="evidence-confidence">置信度: {ev.confidence}</span>
                          </InlineEdit>
                        </div>
                        <button
                          type="button"
                          className="btn-delete-icon"
                          onClick={() => handleDeleteEvidence(i)}
                          data-testid={`delete-evidence-${i}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddEvidence}
                    data-testid="add-evidence"
                    style={{ marginTop: 8 }}
                  >
                    + 添加证据
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveResponse}
                data-testid="btn-save-step3"
                className="btn-save"
              >
                保存修改
              </button>
            </div>
          ) : (
            <p className="placeholder-hint" data-testid="no-motivation-evidence">
              运行分析后，AI 将在此直接生成可直接编辑的回应草稿。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

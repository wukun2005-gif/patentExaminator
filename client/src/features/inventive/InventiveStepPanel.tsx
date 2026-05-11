import { useState } from "react";
import type { InventiveStepAnalysis, ReferenceDocument } from "@shared/types/domain";
import type { InventiveRequest, InventiveResponse } from "../../agent/contracts";
import { useInventiveStore } from "../../store";

interface InventiveStepPanelProps {
  caseId: string;
  claimNumber: number;
  features: Array<{ featureCode: string; description: string }>;
  references: ReferenceDocument[];
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
  runInventive
}: InventiveStepPanelProps) {
  const { analyses, addAnalysis, updateAnalysis, isLoading, setLoading } = useInventiveStore();
  const analysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );

  const availableRefs = references.filter((r) => r.timelineStatus === "available");

  // Initialize local state from existing analysis (computed, not useEffect)
  const [selectedClosestId, setSelectedClosestId] = useState<string>(
    () => analysis?.closestPriorArtId ?? ""
  );
  const [selectedDistinguishing, setSelectedDistinguishing] = useState<string[]>(
    () => analysis?.distinguishingFeatureCodes ?? []
  );
  const [techProblem, setTechProblem] = useState<string>(
    () => analysis?.objectiveTechnicalProblem ?? ""
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
        ...(selectedClosestId ? { closestPriorArtId: selectedClosestId } : {})
      };

      const response = await runInventive(request);

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
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDistinguishing = (code: string) => {
    setSelectedDistinguishing((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const closestRefName = analysis?.closestPriorArtId
    ? availableRefs.find((r) => r.id === analysis.closestPriorArtId)?.title
      ?? availableRefs.find((r) => r.id === analysis.closestPriorArtId)?.publicationNumber
      ?? analysis.closestPriorArtId
    : null;

  return (
    <div className="inventive-step-panel" data-testid="inventive-step-panel">
      {analysis && (
        <div data-testid="inventive-legal-caution" className="legal-caution">
          {analysis.legalCaution}
        </div>
      )}

      <div className="inventive-steps">
        {/* Step 1: Closest Prior Art */}
        <div className="step" data-testid="step-1">
          <h3>Step 1：最接近现有技术</h3>
          <p className="step-desc">AI 从可用对比文件中推荐最接近现有技术，您可点击更换。</p>
          <div className="prior-art-list" data-testid="prior-art-list">
            {availableRefs.map((ref) => {
              const isRecommended = analysis?.closestPriorArtId === ref.id;
              const isSelected = selectedClosestId === ref.id || (!selectedClosestId && isRecommended);
              return (
                <div
                  key={ref.id}
                  className={`prior-art-item ${isSelected ? "prior-art-item--selected" : ""} ${isRecommended ? "prior-art-item--recommended" : ""}`}
                  onClick={() => setSelectedClosestId(ref.id)}
                  data-testid={`prior-art-${ref.id}`}
                >
                  <div className="prior-art-item__radio">
                    <input
                      type="radio"
                      name="closest-prior-art"
                      checked={isSelected}
                      onChange={() => setSelectedClosestId(ref.id)}
                    />
                  </div>
                  <div className="prior-art-item__info">
                    <div className="prior-art-item__title">
                      {ref.title ?? ref.publicationNumber ?? ref.fileName}
                      {isRecommended && <span className="prior-art-badge">AI 推荐</span>}
                    </div>
                    {ref.summary && (
                      <div className="prior-art-item__summary">{ref.summary}</div>
                    )}
                  </div>
                </div>
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

          <div className="step2-content">
            <div className="step2-features">
              <strong>区别特征：</strong>
              {analysis?.distinguishingFeatureCodes && analysis.distinguishingFeatureCodes.length > 0 ? (
                <div className="distinguishing-features-display" data-testid="distinguishing-features-result">
                  {features
                    .filter((f) => analysis.distinguishingFeatureCodes.includes(f.featureCode))
                    .map((f) => (
                      <span key={f.featureCode} className="feature-tag">
                        {f.featureCode}: {f.description}
                      </span>
                    ))}
                </div>
              ) : (
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
              )}
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
                placeholder="AI 将根据区别特征推导客观技术问题，您也可以手动修改。"
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* Step 3: Technical Motivation */}
        <div className="step" data-testid="step-3">
          <h3>Step 3：技术启示与结论</h3>
          {analysis ? (
            <div className="step-result">
              {analysis.motivationEvidence && analysis.motivationEvidence.length > 0 && (
                <div className="motivation-evidence-list">
                  <strong>现有技术启示：</strong>
                  <ul>
                    {analysis.motivationEvidence.map((evidence, i) => (
                      <li key={i} data-testid={`motivation-evidence-${i}`}>
                        {evidence.label}
                        {evidence.quote && <span>：&ldquo;{evidence.quote}&rdquo;</span>}
                        <span className="confidence">（置信度：{evidence.confidence}）</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="candidate-assessment-display" data-testid="candidate-assessment">
                <strong>候选结论：</strong>
                <span className={`assessment-${analysis.candidateAssessment}`}>
                  {ASSESSMENT_LABELS[analysis.candidateAssessment]}
                </span>
              </div>
              {analysis.cautions && analysis.cautions.length > 0 && (
                <div className="inventive-cautions" data-testid="inventive-cautions">
                  <strong>注意事项：</strong>
                  <ul>
                    {analysis.cautions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p data-testid="no-motivation-evidence">运行分析后将显示技术启示和候选结论。</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading || availableRefs.length === 0}
        data-testid="btn-run-inventive"
      >
        {isLoading ? "分析中..." : analysis ? "重新运行分析" : "运行创造性三步法"}
      </button>

      {availableRefs.length === 0 && (
        <p data-testid="inventive-no-references">未上传可用对比文件，无法运行三步法</p>
      )}
    </div>
  );
}

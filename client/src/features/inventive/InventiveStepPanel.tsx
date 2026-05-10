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
  const [selectedClosestId, setSelectedClosestId] = useState<string>("");
  const [selectedDistinguishing, setSelectedDistinguishing] = useState<string[]>([]);
  const [techProblem, setTechProblem] = useState<string>("");

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
          <select
            value={selectedClosestId}
            onChange={(e) => setSelectedClosestId(e.target.value)}
            data-testid="select-closest-prior-art"
          >
            <option value="">— 由 AI 候选推荐 —</option>
            {availableRefs.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.title ?? ref.publicationNumber ?? ref.fileName}
              </option>
            ))}
          </select>
          {analysis?.closestPriorArtId && (
            <p data-testid="closest-prior-art-result">
              AI 推荐：{analysis.closestPriorArtId}
            </p>
          )}
        </div>

        {/* Step 2: Distinguishing Features */}
        <div className="step" data-testid="step-2">
          <h3>Step 2：区别特征与技术问题</h3>
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
          <div>
            <label htmlFor="tech-problem">客观技术问题：</label>
            <textarea
              id="tech-problem"
              value={techProblem}
              onChange={(e) => setTechProblem(e.target.value)}
              data-testid="input-objective-technical-problem"
              rows={3}
            />
          </div>
          {analysis?.distinguishingFeatureCodes && (
            <p data-testid="distinguishing-features-result">
              区别特征：{analysis.distinguishingFeatureCodes.join(", ")}
            </p>
          )}
        </div>

        {/* Step 3: Technical Motivation */}
        <div className="step" data-testid="step-3">
          <h3>Step 3：技术启示</h3>
          {analysis?.motivationEvidence && analysis.motivationEvidence.length > 0 ? (
            <ul>
              {analysis.motivationEvidence.map((evidence, i) => (
                <li key={i} data-testid={`motivation-evidence-${i}`}>
                  <strong>{evidence.label}</strong>
                  {evidence.quote && <span>：&ldquo;{evidence.quote}&rdquo;</span>}
                  <span className="confidence">（{evidence.confidence}）</span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="no-motivation-evidence">尚未分析技术启示</p>
          )}
          {analysis?.candidateAssessment && (
            <p data-testid="candidate-assessment">
              候选结论：{ASSESSMENT_LABELS[analysis.candidateAssessment]}
            </p>
          )}
          {analysis?.cautions && analysis.cautions.length > 0 && (
            <div data-testid="inventive-cautions">
              <h4>注意事项</h4>
              <ul>
                {analysis.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading || availableRefs.length === 0}
        data-testid="btn-run-inventive"
      >
        {isLoading ? "分析中..." : "运行创造性三步法"}
      </button>

      {availableRefs.length === 0 && (
        <p data-testid="inventive-no-references">未上传可用对比文件，无法运行三步法</p>
      )}
    </div>
  );
}

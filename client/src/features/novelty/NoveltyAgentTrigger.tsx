import { useState } from "react";
import type { ReferenceDocument, ClaimFeature } from "@shared/types/domain";
import type { NoveltyRequest, NoveltyResponse } from "../../agent/contracts";
import { useNoveltyStore } from "../../store";

interface NoveltyAgentTriggerProps {
  caseId: string;
  claimNumber: number;
  features: ClaimFeature[];
  references: ReferenceDocument[];
  runNovelty: (request: NoveltyRequest) => Promise<NoveltyResponse>;
}

export function NoveltyAgentTrigger({
  caseId,
  claimNumber,
  features,
  references,
  runNovelty
}: NoveltyAgentTriggerProps) {
  const { addComparison, setLoading, isLoading } = useNoveltyStore();
  const [selectedRefId, setSelectedRefId] = useState<string>("");

  const availableRefs = references.filter((r) => r.timelineStatus === "available");
  const unavailableRefs = references.filter((r) => r.timelineStatus !== "available");

  const handleRun = async () => {
    if (!selectedRefId || isLoading) return;

    const ref = references.find((r) => r.id === selectedRefId);
    if (!ref || ref.timelineStatus !== "available") return;

    setLoading(true);
    try {
      const request: NoveltyRequest = {
        caseId,
        claimNumber,
        features: features.map((f) => ({
          featureCode: f.featureCode,
          description: f.description
        })),
        referenceId: selectedRefId,
        referenceText: ref.extractedText
      };

      const response = await runNovelty(request);

      const comparison = {
        id: `novelty-${caseId}-${selectedRefId}-${claimNumber}`,
        caseId,
        referenceId: selectedRefId,
        claimNumber,
        rows: response.rows.map((row) => {
          const { mismatchNotes, ...rest } = row;
          return {
            ...rest,
            citations: rest.citations.map((c) => ({
              ...c,
              documentId: selectedRefId
            })),
            ...(mismatchNotes ? { mismatchNotes } : {})
          };
        }),
        differenceFeatureCodes: response.differenceFeatureCodes,
        pendingSearchQuestions: response.pendingSearchQuestions,
        status: "draft" as const,
        legalCaution: response.legalCaution
      };

      addComparison(comparison);
    } finally {
      setLoading(false);
    }
  };

  if (references.length === 0) {
    return <p data-testid="novelty-no-references">未上传对比文件，跳过对照</p>;
  }

  return (
    <div className="novelty-agent-trigger" data-testid="novelty-agent-trigger">
      <div>
        <label htmlFor="ref-select">选择对比文件：</label>
        <select
          id="ref-select"
          value={selectedRefId}
          onChange={(e) => setSelectedRefId(e.target.value)}
          data-testid="select-reference"
        >
          <option value="">— 请选择 —</option>
          {availableRefs.map((ref) => (
            <option key={ref.id} value={ref.id}>
              {ref.title ?? ref.publicationNumber ?? ref.fileName}
            </option>
          ))}
          {unavailableRefs.map((ref) => (
            <option key={ref.id} value={ref.id} disabled>
              {ref.title ?? ref.publicationNumber ?? ref.fileName}（{UNAVAILABLE_LABELS[ref.timelineStatus]}）
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={!selectedRefId || isLoading}
        data-testid={`btn-run-novelty-${selectedRefId || "none"}`}
      >
        {isLoading ? "对照中..." : `对 ${selectedRefId ? "D1" : "—"} 进行新颖性对照`}
      </button>
    </div>
  );
}

const UNAVAILABLE_LABELS: Record<string, string> = {
  "unavailable-same-day": "同日公开，不可用",
  "unavailable-later": "晚于基准日，不可用",
  "needs-publication-date": "缺少公开日"
};

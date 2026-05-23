import { useState, useEffect } from "react";
import type { ReferenceDocument, ClaimFeature } from "@shared/types/domain";
import type { NoveltyRequest, NoveltyResponse } from "../../agent/contracts";
import { useNoveltyStore } from "../../store";

// DEBUG: 调试 bug 18 - 删除对比文件后无法再加载再比较
const DEBUG_NOVELTY = true;

function debugLog(...args: unknown[]) {
  if (DEBUG_NOVELTY) {
    console.log("[NoveltyAgentTrigger]", ...args);
  }
}

interface NoveltyAgentTriggerProps {
  caseId: string;
  claimNumber: number;
  features: ClaimFeature[];
  references: ReferenceDocument[];
  applicantArguments?: string;
  amendedClaimText?: string;
  runNovelty: (request: NoveltyRequest) => Promise<NoveltyResponse>;
}

export function NoveltyAgentTrigger({
  caseId,
  claimNumber,
  features,
  references,
  applicantArguments,
  amendedClaimText,
  runNovelty
}: NoveltyAgentTriggerProps) {
  const { addComparison, setLoading, isLoading } = useNoveltyStore();
  const [selectedRefId, setSelectedRefId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // DEBUG: 记录 props 变化
  useEffect(() => {
    debugLog("props更新:", {
      caseId,
      claimNumber,
      featuresCount: features.length,
      referencesCount: references.length,
      referenceIds: references.map(r => r.id),
      selectedRefId
    });
  }, [caseId, claimNumber, features, references, selectedRefId]);

  // 当删除文件时清除无效的 selectedRefId和相关 comparison
  useEffect(() => {
    debugLog("useEffect触发 - 检查references变化:", {
      selectedRefId,
      referencesCount: references.length,
      referenceIds: references.map(r => r.id)
    });
    
    if (selectedRefId && !references.find((r) => r.id === selectedRefId)) {
      debugLog("selectedRefId无效，清空:", { oldSelectedRefId: selectedRefId });
      setSelectedRefId("");
    }
    // 清除引用已删除 reference 的 comparison
    const refIds = new Set(references.map((r) => r.id));
    const { comparisons, removeComparison } = useNoveltyStore.getState();
    debugLog("检查comparisons:", {
      comparisonsCount: comparisons.length,
      comparisonReferenceIds: comparisons.map(c => c.referenceId),
      validRefIds: [...refIds]
    });
    for (const c of comparisons) {
      if (!refIds.has(c.referenceId)) {
        debugLog("删除无效comparison:", { comparisonId: c.id, referenceId: c.referenceId });
        removeComparison(c.id);
      }
    }
  }, [references, selectedRefId]);

  const availableRefs = references.filter((r) => r.timelineStatus === "available");
  const unavailableRefs = references.filter((r) => r.timelineStatus !== "available");

  debugLog("references分类:", {
    available: availableRefs.map(r => ({ id: r.id, title: r.title ?? r.fileName })),
    unavailable: unavailableRefs.map(r => ({ id: r.id, title: r.title ?? r.fileName, status: r.timelineStatus }))
  });

  const handleRun = async () => {
    debugLog("handleRun触发:", { selectedRefId, isLoading });
    if (!selectedRefId || isLoading) {
      debugLog("handleRun提前返回:", { reason: !selectedRefId ? "无selectedRefId" : "isLoading" });
      return;
    }

    const ref = references.find((r) => r.id === selectedRefId);
    debugLog("查找reference:", { selectedRefId, found: !!ref, timelineStatus: ref?.timelineStatus });
    if (!ref || ref.timelineStatus !== "available") {
      debugLog("handleRun提前返回: ref无效或不可用");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const request: NoveltyRequest = {
        caseId,
        claimNumber,
        features: features.map((f) => ({
          featureCode: f.featureCode,
          description: f.description
        })),
        referenceId: selectedRefId,
        referenceText: ref.extractedText,
        ...(applicantArguments ? { applicantArguments } : {}),
        ...(amendedClaimText ? { amendedClaimText } : {})
      };

      const response = await runNovelty(request);

      // 创建 featureCode 到 description 的映射
      const featureDescriptionMap = new Map(
        features.map((f) => [f.featureCode, f.description])
      );

      // 兼容旧数据：优先使用 reviewerConclusions，回退到 pendingSearchConclusions
      const reviewerConclusions = response.reviewerConclusions ?? response.pendingSearchConclusions;

      const comparison = {
        id: `novelty-${caseId}-${selectedRefId}-${claimNumber}`,
        caseId,
        referenceId: selectedRefId,
        claimNumber,
        rows: response.rows.map((row) => {
          const { mismatchNotes, ...rest } = row;
          const featureDescription = featureDescriptionMap.get(row.featureCode);
          return {
            ...rest,
            // 只有当特征描述存在时才添加该属性
            ...(featureDescription ? { featureDescription } : {}),
            citations: rest.citations.map((c) => ({
              ...c,
              documentId: selectedRefId
            })),
            ...(mismatchNotes ? { mismatchNotes } : {})
          };
        }),
        differenceFeatureCodes: response.differenceFeatureCodes,
        pendingSearchQuestions: response.pendingSearchQuestions,
        // 只有当值存在时才添加可选属性
        ...(reviewerConclusions ? { reviewerConclusions } : {}),
        ...(response.aiPreliminaryConclusions ? { aiPreliminaryConclusions: response.aiPreliminaryConclusions } : {}),
        status: "draft" as const,
        legalCaution: response.legalCaution
      };

      addComparison(comparison);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      debugLog("handleRun错误:", message);
      setError(message);
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

      {error && (
        <div className="alert alert--error" data-testid="novelty-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

const UNAVAILABLE_LABELS: Record<string, string> = {
  "unavailable-same-day": "同日公开，不可用",
  "unavailable-later": "晚于基准日，不可用",
  "needs-publication-date": "缺少公开日"
};

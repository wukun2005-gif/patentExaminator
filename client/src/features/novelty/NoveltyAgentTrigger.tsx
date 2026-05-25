import { useState, useEffect, useRef } from "react";
import type { ReferenceDocument, ClaimFeature } from "@shared/types/domain";
import type { NoveltyRequest, NoveltyResponse } from "../../agent/contracts";
import { useNoveltyStore } from "../../store";
import { ErrorBanner } from "../../lib/errorDisplay";

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
  runNovelty: (request: NoveltyRequest, options?: { signal?: AbortSignal }) => Promise<NoveltyResponse>;
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
  const [error, setError] = useState<unknown>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller, key) => {
        controller.abort();
        console.log(`[NoveltyAgentTrigger] Aborted request ${key} on unmount`);
      });
      controllers.clear();
    };
  }, []);

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

    const existingController = abortControllersRef.current.get("novelty");
    if (existingController) existingController.abort();

    const controller = new AbortController();
    abortControllersRef.current.set("novelty", controller);

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

      const response = await runNovelty(request, { signal: controller.signal });

      if (!isMountedRef.current || controller.signal.aborted) return;

      const featureDescriptionMap = new Map(
        features.map((f) => [f.featureCode, f.description])
      );

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
        ...(reviewerConclusions ? { reviewerConclusions } : {}),
        ...(response.aiPreliminaryConclusions ? { aiPreliminaryConclusions: response.aiPreliminaryConclusions } : {}),
        status: "draft" as const,
        legalCaution: response.legalCaution
      };

      addComparison(comparison);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!isMountedRef.current) return;
      debugLog("handleRun错误:", err instanceof Error ? err.message : err);
      setError(err);
    } finally {
      abortControllersRef.current.delete("novelty");
      if (isMountedRef.current) setLoading(false);
    }
  };

  if (references.length === 0) {
    return <p data-testid="novelty-no-references">未上传对比文件，跳过对照</p>;
  }

  const selectedRef = selectedRefId ? references.find(r => r.id === selectedRefId) : undefined;
  const selectedRefLabel = selectedRef?.title ?? selectedRef?.publicationNumber ?? selectedRef?.fileName ?? "D1";

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
        {isLoading ? "对照中..." : `对 ${selectedRefId ? selectedRefLabel : "—"} 进行新颖性对照`}
      </button>

      {error != null && (
        <ErrorBanner error={error} compact data-testid="novelty-error" />
      )}
    </div>
  );
}

const UNAVAILABLE_LABELS: Record<string, string> = {
  "unavailable-same-day": "同日公开，不可用",
  "unavailable-later": "晚于基准日，不可用",
  "needs-publication-date": "缺少公开日"
};

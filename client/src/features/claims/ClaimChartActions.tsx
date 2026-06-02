import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { agentRun } from "../../lib/repos";
import type { ClaimChartResponse } from "@shared/types/api";
import { useClaimsStore, useCaseStore, useSettingsStore } from "../../store";
import { ErrorBanner } from "../../lib/errorDisplay";
import type { ClaimNode } from "@shared/types/domain";
import { createLogger } from "../../lib/logger";

interface ClaimChartActionsProps {
  claimNodes: ClaimNode[];
  specificationText: string;
}

const log = createLogger("ClaimChartActions");

export function ClaimChartActions({ claimNodes, specificationText }: ClaimChartActionsProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const { settings } = useSettingsStore();
  const { currentCase } = useCaseStore();
  const { addClaimFeature, addRanCase } = useClaimsStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller, key) => {
        controller.abort();
        log(`Aborted request ${key} on unmount`);
      });
      controllers.clear();
    };
  }, []);

  const targetClaim = claimNodes.find(
    (n) => n.claimNumber === currentCase?.targetClaimNumber
  );

  const handleGenerate = async () => {
    if (!caseId || !targetClaim) return;

    const existingController = abortControllersRef.current.get("claimChart");
    if (existingController) existingController.abort();

    const controller = new AbortController();
    abortControllersRef.current.set("claimChart", controller);

    setIsGenerating(true);
    setError("");

    try {
      const response = await agentRun<ClaimChartResponse>("claim-chart", {
        caseId,
        claimText: targetClaim.rawText,
        claimNumber: targetClaim.claimNumber,
        specificationText
      }, settings, caseId, { signal: controller.signal });

      if (!isMountedRef.current || controller.signal.aborted) return;

      if (!response.features || !Array.isArray(response.features)) {
        throw new Error("AI 未返回有效的权利要求特征数据，请确认 AI Provider 配置正确或切换为 Mock 模式重试。");
      }

      const { claimFeatures } = useClaimsStore.getState();
      const oldIds = claimFeatures
        .filter((f) => f.caseId === caseId && f.claimNumber === targetClaim.claimNumber)
        .map((f) => f.id);
      for (const id of oldIds) {
        const { removeClaimFeature } = useClaimsStore.getState();
        removeClaimFeature(id);
      }

      for (const feature of response.features) {
        addClaimFeature(feature);
      }

      addRanCase(caseId);
      useCaseStore.getState().updateWorkflowState("claim-chart-ready");
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!isMountedRef.current) return;
      setError(String(err));
    } finally {
      abortControllersRef.current.delete("claimChart");
      if (isMountedRef.current) setIsGenerating(false);
    }
  };

  return (
    <div className="claim-chart-actions" data-testid="claim-chart-actions">
      {targetClaim && (
        <p>
          目标权利要求: 第 {targetClaim.claimNumber} 条 ({targetClaim.type})
        </p>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating || !targetClaim}
        data-testid="btn-run-claim-chart"
      >
        {isGenerating ? "生成中..." : "生成权利要求特征表"}
      </button>
      {error && <ErrorBanner error={error} compact data-testid="claim-chart-error" />}
    </div>
  );
}

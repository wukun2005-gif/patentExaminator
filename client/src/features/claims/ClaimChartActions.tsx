import { useState } from "react";
import { useParams } from "react-router-dom";
import { AgentClient } from "../../agent/AgentClient";
import { useClaimsStore, useCaseStore, useSettingsStore } from "../../store";
import type { ClaimNode } from "@shared/types/domain";

interface ClaimChartActionsProps {
  claimNodes: ClaimNode[];
  specificationText: string;
}

export function ClaimChartActions({ claimNodes, specificationText }: ClaimChartActionsProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const { settings } = useSettingsStore();
  const { currentCase } = useCaseStore();
  const { addClaimFeature } = useClaimsStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const targetClaim = claimNodes.find(
    (n) => n.claimNumber === currentCase?.targetClaimNumber
  );

  const handleGenerate = async () => {
    if (!caseId || !targetClaim) return;
    setIsGenerating(true);
    setError("");

    try {
      const client = new AgentClient(settings.mode, "/api", settings);
      const response = await client.runClaimChart({
        caseId,
        claimText: targetClaim.rawText,
        claimNumber: targetClaim.claimNumber,
        specificationText
      });

      // Clear old features for this claim
      const { claimFeatures } = useClaimsStore.getState();
      const oldIds = claimFeatures
        .filter((f) => f.caseId === caseId && f.claimNumber === targetClaim.claimNumber)
        .map((f) => f.id);
      for (const id of oldIds) {
        const { removeClaimFeature } = useClaimsStore.getState();
        removeClaimFeature(id);
      }

      // Add new features
      for (const feature of response.features) {
        addClaimFeature(feature);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsGenerating(false);
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
      {error && <p className="error" data-testid="claim-chart-error">{error}</p>}
    </div>
  );
}

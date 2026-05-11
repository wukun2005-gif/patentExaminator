import { useState } from "react";
import type { ClaimFeature } from "@shared/types/domain";
import { useClaimsStore } from "../../store";

interface ClaimChartTableProps {
  caseId: string;
  claimNumber: number;
}

export function ClaimChartTable({ caseId, claimNumber }: ClaimChartTableProps) {
  const { claimFeatures, updateClaimFeature } = useClaimsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const features = claimFeatures.filter(
    (f) => f.caseId === caseId && f.claimNumber === claimNumber
  );

  const handleEdit = (feature: ClaimFeature) => {
    setEditingId(feature.id);
    setEditValue(feature.description);
  };

  const handleSave = (feature: ClaimFeature) => {
    updateClaimFeature({
      ...feature,
      description: editValue,
      source: "user"
    });
    setEditingId(null);
  };

  if (features.length === 0) {
    return <p data-testid="claim-chart-empty">尚未生成 Claim Chart</p>;
  }

  return (
    <div className="claim-chart-table" data-testid="claim-chart-table">
      <table>
        <thead>
          <tr>
            <th>特征代码</th>
            <th>特征描述</th>
            <th>引用状态</th>
            <th>来源</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.id} data-testid={`row-feature-${feature.featureCode}`}>
              <td>{feature.featureCode}</td>
              <td>
                {editingId === feature.id ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    data-testid={`input-edit-${feature.featureCode}`}
                    rows={3}
                  />
                ) : (
                  <span>{feature.description}</span>
                )}
              </td>
              <td data-testid={`cell-citation-${feature.featureCode}`}>
                <span className={`citation-status-${feature.citationStatus}`}>
                  {STATUS_LABELS[feature.citationStatus]}
                </span>
              </td>
              <td>{feature.source}</td>
              <td>
                {editingId === feature.id ? (
                  <button
                    type="button"
                    onClick={() => handleSave(feature)}
                    data-testid={`btn-save-${feature.featureCode}`}
                  >
                    保存
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEdit(feature)}
                    data-testid={`btn-edit-${feature.featureCode}`}
                  >
                    编辑
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "已确认",
  "needs-review": "待确认",
  "not-found": "未找到"
};

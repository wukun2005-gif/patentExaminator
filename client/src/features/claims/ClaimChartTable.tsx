import { useState } from "react";
import type { ClaimFeature } from "@shared/types/domain";
import { useClaimsStore } from "../../store";

interface ClaimChartTableProps {
  caseId: string;
  claimNumber: number;
}

export function ClaimChartTable({ caseId, claimNumber }: ClaimChartTableProps) {
  const { claimFeatures, updateClaimFeature, addClaimFeature, removeClaimFeature } = useClaimsStore();
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

  const handleDelete = (id: string) => {
    removeClaimFeature(id);
  };

  const handleAdd = () => {
    const maxCode = features.reduce((max, f) => {
      const n = parseInt(f.featureCode.replace(/[^0-9]/g, ""), 10);
      return n > max ? n : max;
    }, 0);
    const newFeature: ClaimFeature = {
      id: `feat-${caseId}-${Date.now()}`,
      caseId,
      claimNumber,
      featureCode: `F${String(maxCode + 1).padStart(2, "0")}`,
      description: "",
      source: "user",
      citationStatus: "needs-review",
      specificationCitations: []
    };
    addClaimFeature(newFeature);
  };

  if (features.length === 0) {
    return <p data-testid="claim-chart-empty">尚未生成权利要求特征表</p>;
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
                <button
                  type="button"
                  className="btn-delete-icon"
                  onClick={() => handleDelete(feature.id)}
                  data-testid={`btn-delete-${feature.featureCode}`}
                  style={{ marginLeft: 4 }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="btn-add-item"
        onClick={handleAdd}
        data-testid="add-claim-feature"
        style={{ marginTop: 8 }}
      >
        + 添加特征
      </button>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "已确认",
  "needs-review": "待确认",
  "not-found": "未找到"
};

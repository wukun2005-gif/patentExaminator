import { useDefectsStore } from "../../store";
import type { DefectRequest, DefectResponse } from "../../agent/contracts";
import type { FormalDefect } from "@shared/types/domain";

interface DefectPanelProps {
  caseId: string;
  claimText: string;
  specificationText: string;
  claimFeatures: Array<{ featureCode: string; description: string }>;
  runDefectCheck: (request: DefectRequest) => Promise<DefectResponse>;
}

const SEVERITY_LABELS: Record<string, string> = {
  error: "严重",
  warning: "警告",
  info: "提示"
};

export function DefectPanel({
  caseId,
  claimText,
  specificationText,
  claimFeatures,
  runDefectCheck
}: DefectPanelProps) {
  const { defects, addDefect, updateDefect, setDefects, isLoading, setLoading } =
    useDefectsStore();

  const caseDefects = defects.filter((d) => d.caseId === caseId);
  const unresolvedCount = caseDefects.filter((d) => !d.resolved).length;

  const handleRun = async () => {
    if (isLoading) return;
    setLoading(true);
    try {
      const request: DefectRequest = {
        caseId,
        claimText,
        specificationText,
        claimFeatures
      };
      const response = await runDefectCheck(request);

      // Clear old defects for this case and add new ones
      const oldIds = caseDefects.map((d) => d.id);
      for (const id of oldIds) {
        useDefectsStore.getState().removeDefect(id);
      }

      for (const item of response.defects) {
        const defect: FormalDefect = {
          id: `defect-${caseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseId,
          category: item.category,
          description: item.description,
          severity: item.severity,
          resolved: false,
          ...(item.location ? { location: item.location } : {})
        };
        addDefect(defect);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleResolved = (defect: FormalDefect) => {
    updateDefect({ ...defect, resolved: !defect.resolved });
  };

  // Group defects by category
  const grouped = new Map<string, FormalDefect[]>();
  for (const d of caseDefects) {
    const list = grouped.get(d.category) ?? [];
    list.push(d);
    grouped.set(d.category, list);
  }

  return (
    <div className="defect-panel" data-testid="defect-panel">
      <h2>形式缺陷检查</h2>

      {caseDefects.length > 0 && (
        <div className="defect-legal-caution" data-testid="defect-legal-caution">
          以下为 AI 辅助检测结果，需审查员逐项确认。
        </div>
      )}

      {caseDefects.length > 0 ? (
        <div className="defect-result">
          <div className="defect-summary" data-testid="defect-summary">
            共 {caseDefects.length} 项缺陷，其中 {unresolvedCount} 项未解决
          </div>

          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="defect-category-group">
              <h3 className="defect-category-title">{category}</h3>
              <table className="defect-table" data-testid="defect-table">
                <thead>
                  <tr>
                    <th className="defect-col-severity">严重度</th>
                    <th className="defect-col-desc">缺陷描述</th>
                    <th className="defect-col-location">位置</th>
                    <th className="defect-col-status">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr
                      key={d.id}
                      className={d.resolved ? "defect-row--resolved" : ""}
                      data-testid={`defect-row-${d.id}`}
                    >
                      <td>
                        <span
                          className={`severity-badge severity-${d.severity}`}
                          data-testid={`severity-${d.id}`}
                        >
                          {SEVERITY_LABELS[d.severity]}
                        </span>
                      </td>
                      <td className="defect-desc">{d.description}</td>
                      <td className="defect-location">{d.location ?? "—"}</td>
                      <td>
                        <label className="defect-resolve-toggle">
                          <input
                            type="checkbox"
                            checked={d.resolved}
                            onChange={() => handleToggleResolved(d)}
                            data-testid={`resolve-${d.id}`}
                          />
                          {d.resolved ? "已解决" : "未解决"}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="defect-empty" data-testid="defect-empty">
          <p>尚未运行形式缺陷检查。</p>
          <p className="defect-empty-hint">点击下方按钮，AI 将自动检测申请文件中的形式缺陷。</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading}
        data-testid="btn-run-defect-check"
      >
        {isLoading ? "检测中..." : caseDefects.length > 0 ? "重新运行检测" : "运行形式缺陷检查"}
      </button>
    </div>
  );
}

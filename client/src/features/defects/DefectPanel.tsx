interface DefectPanelProps {
  caseId: string;
  defectHints?: string[];
}

export function DefectPanel({ caseId, defectHints = [] }: DefectPanelProps) {
  return (
    <div className="defect-panel" data-testid="defect-panel">
      <h2>形式缺陷</h2>

      {defectHints.length > 0 ? (
        <div data-testid="defect-hints">
          <h3>风险提示</h3>
          <ul>
            {defectHints.map((hint, i) => (
              <li key={i} data-testid={`defect-hint-${i}`} className="defect-hint-item">
                {hint}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p data-testid="no-defect-hints">暂无形式缺陷风险提示。</p>
      )}

      <div className="defect-placeholder">
        <p>形式缺陷检查模块将提供手动标记入口。</p>
        <p className="placeholder-hint">当前为占位内容。</p>
      </div>

      <p className="case-ref">案件 ID: {caseId}</p>
    </div>
  );
}

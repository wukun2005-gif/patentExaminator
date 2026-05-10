interface SummaryPanelProps {
  caseId: string;
}

export function SummaryPanel({ caseId }: SummaryPanelProps) {
  return (
    <div className="summary-panel" data-testid="summary-panel">
      <h2>简述</h2>
      <div data-testid="summary-placeholder" className="placeholder-content">
        <p>简述模块将基于已确认的 Claim Chart 和 Citation 自动生成审查意见简述。</p>
        <p>当前为占位内容，真实模式下将调用 AI 生成。</p>
        <div className="summary-rules">
          <h3>生成规则</h3>
          <ul>
            <li>仅使用已被用户确认的 Claim Chart 特征</li>
            <li>仅引用 citationStatus 为 &quot;confirmed&quot; 的 Citation</li>
            <li>每条事实必须附 Citation，无出处不进正文只进 AI 备注</li>
          </ul>
        </div>
        <p className="case-ref">案件 ID: {caseId}</p>
      </div>
    </div>
  );
}

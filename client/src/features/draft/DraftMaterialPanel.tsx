interface DraftMaterialPanelProps {
  caseId: string;
}

export function DraftMaterialPanel({ caseId }: DraftMaterialPanelProps) {
  return (
    <div className="draft-material-panel" data-testid="draft-material-panel">
      <h2>素材草稿</h2>
      <p className="draft-description">
        素材草稿由以下片段拼装，不做 AI 生成。
      </p>

      <div className="draft-sections">
        {/* Section 1: 正文草稿 */}
        <section className="draft-section" data-testid="section-body-draft">
          <h3>正文草稿</h3>
          <div className="section-content">
            <p>案件基线摘要 + Claim Chart（仅 citationStatus ≠ &quot;not-found&quot; 的特征）+ 新颖性对照（仅 user-reviewed 的记录）。</p>
            <p className="placeholder-hint">待载入案件数据后自动拼装。</p>
          </div>
        </section>

        {/* Section 2: AI 备注 */}
        <section className="draft-section" data-testid="section-ai-notes">
          <h3>AI 备注</h3>
          <div className="section-content">
            <p>AI 分析过程中产生的备注和观察。</p>
            <p className="placeholder-hint">无出处的事实将归入此区域。</p>
          </div>
        </section>

        {/* Section 3: 分析策略 */}
        <section className="draft-section" data-testid="section-analysis-strategy">
          <h3>分析策略</h3>
          <div className="section-content">
            <p>区别特征候选 + 待检索问题清单。</p>
            <p className="placeholder-hint">基于新颖性对照和创造性分析结果生成。</p>
          </div>
        </section>

        {/* Section 4: 待确认事项 */}
        <section className="draft-section" data-testid="section-pending-items">
          <h3>待确认事项</h3>
          <div className="section-content">
            <p>需要审查员确认的关键事项。</p>
            <p className="placeholder-hint">包含待检索问题和技术启示确认。</p>
          </div>
        </section>
      </div>

      <p className="case-ref">案件 ID: {caseId}</p>
    </div>
  );
}

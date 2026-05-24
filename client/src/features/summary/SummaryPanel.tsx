import { useState } from "react";
import type { SummaryResponse } from "../../agent/contracts";
import { useDraftStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

interface SummaryPanelProps {
  caseId: string;
  runSummary?: () => Promise<SummaryResponse>;
}

export function SummaryPanel({ caseId, runSummary }: SummaryPanelProps) {
  const { summaries, setSummary } = useDraftStore();
  const summary = summaries[caseId] ?? null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!runSummary || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runSummary();
      setSummary(caseId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="summary-panel" data-testid="summary-panel">
      <h2>审查意见简述</h2>
      <p className="summary-description">
        基于已确认的权利要求特征表、新颖性对照和创造性分析，生成带原文引用的审查意见简述。
      </p>
      <div className="summary-diff-help" data-testid="summary-diff-help">
        <details>
          <summary><strong>审查意见简述与复审意见草稿有何区别？</strong></summary>
          <ul>
            <li><strong>审查意见简述（本页）</strong>：简要概述审查意见的核心要点，包含新颖性、创造性的主要结论和关键依据，适合快速了解整体情况或作为汇报材料。</li>
            <li><strong>复审意见草稿（草稿页面）</strong>：完整的审查意见正文草稿，包含详细的事实认定、法律适用分析、原文引用、技术启示论证等，可直接用于起草正式审查意见通知书。</li>
          </ul>
          <p className="summary-diff-help-tip">建议：先生成"审查意见简述"确认整体方向，再到"草稿"页面生成完整正文。</p>
        </details>
      </div>

      {runSummary && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          data-testid="btn-generate-summary"
        >
          {loading ? "生成中..." : summary ? "重新生成简述" : "生成简述"}
        </button>
      )}

      {error && (
        <div className="alert alert--error" data-testid="summary-error">{error}</div>
      )}

      {summary ? (
        <div className="summary-content">
          <section className="summary-section" data-testid="summary-body">
            <h3>正文</h3>
            <InlineEdit
              as="textarea"
              value={summary.body}
              rows={8}
              onSave={(v) => {
                setSummary(caseId, { ...summary, body: v });
              }}
            >
              <div className="summary-body-text">{summary.body}</div>
            </InlineEdit>
          </section>

          <section className="summary-section" data-testid="summary-ai-notes">
            <h3>
              AI 备注
              {summary.aiNotes && (
                <button
                  type="button"
                  className="btn-evidence-remove"
                  onClick={() => setSummary(caseId, { ...summary, aiNotes: "" })}
                  title="清除 AI 备注"
                  style={{ float: "right", fontSize: "inherit" }}
                >
                  清除
                </button>
              )}
            </h3>
            <p className="summary-ai-notes-desc">
              这是 AI 的辅助注释，未经出处验证，请谨慎参考。AI 备注区的内容与整个产品的"候选/待确认"设计语义一致——所有未经原文引用验证的信息都不会进入正文，只在此处展示供审查员参考。
            </p>
            {summary.aiNotes != null ? (
              <InlineEdit
                as="textarea"
                value={summary.aiNotes}
                rows={4}
                onSave={(v) => {
                  setSummary(caseId, { ...summary, aiNotes: v });
                }}
              >
                <div className="summary-ai-notes-text">{summary.aiNotes || "（空）"}</div>
              </InlineEdit>
            ) : (
              <p className="placeholder-hint">AI 未生成备注内容。</p>
            )}
          </section>

          <p className="legal-caution-text">
            <em>{summary.legalCaution}</em>
          </p>
        </div>
      ) : (
        <div data-testid="summary-placeholder" className="placeholder-content">
          <p>简述模块将基于已确认的权利要求特征表和 Citation 自动生成审查意见简述。</p>
          <div className="summary-rules">
            <h3>生成规则</h3>
            <ul>
              <li>仅使用已被用户确认的权利要求特征表特征</li>
              <li>每条事实必须附原文引用（Grounding Citation），无出处不进正文</li>
              <li>原文引用在正文中以引号标注 + 来源段落号的形式内联呈现</li>
              <li>不输出法律结论</li>
            </ul>
          </div>
          <p className="case-ref">案件 ID: {caseId}</p>
        </div>
      )}
    </div>
  );
}
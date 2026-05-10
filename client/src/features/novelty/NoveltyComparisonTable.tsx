import { useState } from "react";
import { useNoveltyStore } from "../../store";
import { FeedbackButtons } from "../../components/FeedbackButtons";
import { getFeedback, saveFeedback } from "../../lib/feedbackRepo";

interface NoveltyComparisonTableProps {
  comparisonId: string;
}

const STATUS_LABELS: Record<string, string> = {
  "clearly-disclosed": "已明确公开",
  "possibly-disclosed": "可能公开",
  "not-found": "未找到",
  "not-applicable": "不适用"
};

export function NoveltyComparisonTable({ comparisonId }: NoveltyComparisonTableProps) {
  const { comparisons, updateComparison } = useNoveltyStore();
  const comparison = comparisons.find((c) => c.id === comparisonId);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  if (!comparison) {
    return <p data-testid="novelty-empty">未找到新颖性对照结果</p>;
  }

  const handleNotesChange = (featureCode: string, value: string) => {
    setEditingNotes((prev) => ({ ...prev, [featureCode]: value }));
  };

  const handleNotesSave = (featureCode: string) => {
    const updatedRows = comparison.rows.map((row) =>
      row.featureCode === featureCode
        ? { ...row, reviewerNotes: editingNotes[featureCode] ?? "" }
        : row
    );
    updateComparison({ ...comparison, rows: updatedRows });
    setEditingNotes((prev) => {
      const next = { ...prev };
      delete next[featureCode];
      return next;
    });
  };

  return (
    <div className="novelty-comparison-table" data-testid="novelty-comparison-table">
      <div data-testid="novelty-legal-caution" className="legal-caution">
        {comparison.legalCaution}
      </div>

      <table>
        <thead>
          <tr>
            <th>特征代码</th>
            <th>公开状态</th>
            <th>引用</th>
            <th>审查员备注</th>
            <th>反馈</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.featureCode} data-testid={`row-novelty-${row.featureCode}`}>
              <td>{row.featureCode}</td>
              <td data-testid={`cell-status-${row.featureCode}`}>
                {STATUS_LABELS[row.disclosureStatus] ?? row.disclosureStatus}
              </td>
              <td>
                {row.citations.length > 0
                  ? row.citations.map((c) => c.label).join(", ")
                  : "—"}
              </td>
              <td>
                {editingNotes[row.featureCode] !== undefined ? (
                  <div>
                    <textarea
                      value={editingNotes[row.featureCode]}
                      onChange={(e) => handleNotesChange(row.featureCode, e.target.value)}
                      data-testid={`input-reviewer-notes-${row.featureCode}`}
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={() => handleNotesSave(row.featureCode)}
                      data-testid={`btn-save-notes-${row.featureCode}`}
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <span
                    data-testid={`cell-reviewer-notes-${row.featureCode}`}
                    onClick={() =>
                      setEditingNotes((prev) => ({
                        ...prev,
                        [row.featureCode]: row.reviewerNotes ?? ""
                      }))
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {row.reviewerNotes || "（点击编辑）"}
                  </span>
                )}
              </td>
              <td>
                <FeedbackButtons
                  targetId={`${comparisonId}-${row.featureCode}`}
                  targetType="novelty-row"
                  existingFeedback={getFeedback(`${comparisonId}-${row.featureCode}`)}
                  onSave={saveFeedback}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {comparison.differenceFeatureCodes.length > 0 && (
        <div data-testid="difference-features">
          <h4>区别特征候选</h4>
          <ul>
            {comparison.differenceFeatureCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      )}

      {comparison.pendingSearchQuestions.length > 0 && (
        <div data-testid="pending-search-questions">
          <h4>待检索问题清单</h4>
          <ul>
            {comparison.pendingSearchQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

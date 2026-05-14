import { useState } from "react";
import { useNoveltyStore } from "../../store";
import { InlineEdit } from "../../components/InlineEdit";

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
  const { comparisons, updateComparison, removeComparison } = useNoveltyStore();
  const comparison = comparisons.find((c) => c.id === comparisonId);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [editingConclusions, setEditingConclusions] = useState<Record<number, string>>({});

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

  const handleConclusionChange = (index: number, value: string) => {
    setEditingConclusions((prev) => ({ ...prev, [index]: value }));
  };

  const handleConclusionSave = (index: number) => {
    const conclusions = [...(comparison.pendingSearchConclusions ?? [])];
    conclusions[index] = editingConclusions[index] ?? "";
    updateComparison({ ...comparison, pendingSearchConclusions: conclusions });
    setEditingConclusions((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  return (
    <div className="novelty-comparison-table" data-testid="novelty-comparison-table">
      <h2>新颖性复核</h2>
      <button
        type="button"
        className="btn-delete-icon"
        onClick={() => removeComparison(comparison.id)}
        data-testid="delete-novelty-comparison"
        style={{ float: "right", marginTop: -4 }}
      >
        ✕ 删除此比较
      </button>
      <div data-testid="novelty-legal-caution" className="legal-caution">
        以下为候选事实整理，不构成新颖性法律结论。审查员需结合对比文件全文进行独立判断。
      </div>

      <table>
        <thead>
          <tr>
            <th>特征代码</th>
            <th>公开状态</th>
            <th>引用</th>
            <th>审查员备注</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.featureCode} data-testid={`row-novelty-${row.featureCode}`}>
              <td>{row.featureCode}</td>
              <td data-testid={`cell-status-${row.featureCode}`}>
                <InlineEdit
                  as="select"
                  value={row.disclosureStatus}
                  options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  onSave={(v) => {
                    const updatedRows = comparison.rows.map((r) =>
                      r.featureCode === row.featureCode
                        ? { ...r, disclosureStatus: v as typeof row.disclosureStatus }
                        : r
                    );
                    updateComparison({ ...comparison, rows: updatedRows });
                  }}
                >
                  <span className={`disclosure-status-${row.disclosureStatus}`}>
                    {STATUS_LABELS[row.disclosureStatus] ?? row.disclosureStatus}
                  </span>
                </InlineEdit>
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
            </tr>
          ))}
        </tbody>
      </table>

      {comparison.differenceFeatureCodes.length > 0 && (
        <div data-testid="difference-features" className="novelty-section">
          <h4>区别特征候选</h4>
          <div className="difference-features-tags">
            {comparison.differenceFeatureCodes.map((code) => (
              <span key={code} className="feature-tag">{code}</span>
            ))}
          </div>
        </div>
      )}

      {comparison.pendingSearchQuestions.length > 0 && (
        <div data-testid="pending-search-questions" className="novelty-section">
          <h4>待确认问题与 AI 判断</h4>
          <ul className="pending-search-list">
            {comparison.pendingSearchQuestions.map((q, i) => (
              <li key={i} className="pending-search-item">
                <div className="pending-search-question">{q}</div>
                {editingConclusions[i] !== undefined ? (
                  <div className="pending-search-edit">
                    <textarea
                      value={editingConclusions[i]}
                      onChange={(e) => handleConclusionChange(i, e.target.value)}
                      rows={3}
                      data-testid={`input-conclusion-${i}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleConclusionSave(i)}
                      data-testid={`btn-save-conclusion-${i}`}
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <div
                    className="pending-search-conclusion"
                    onClick={() =>
                      setEditingConclusions((prev) => ({
                        ...prev,
                        [i]: comparison.pendingSearchConclusions?.[i] ?? ""
                      }))
                    }
                    style={{ cursor: "pointer" }}
                    data-testid={`cell-conclusion-${i}`}
                  >
                    {comparison.pendingSearchConclusions?.[i] || "（点击编辑 AI 结论）"}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparison.applicantArguments && (
        <div className="reexam-context" data-testid="novelty-reexam-context">
          <h4>申请人答辩理由</h4>
          <blockquote>{comparison.applicantArguments}</blockquote>
          {comparison.examinerResponse && (
            <>
              <h4>审查员回应（AI 草稿）</h4>
              <p>{comparison.examinerResponse}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

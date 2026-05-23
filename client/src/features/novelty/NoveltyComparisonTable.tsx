import { useState } from "react";
import type { NoveltyComparison } from "@shared/types/domain";
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

// 兼容旧数据：获取 reviewerConclusions，回退到 pendingSearchConclusions
function getReviewerConclusions(comparison: NoveltyComparison): string[] {
  return comparison.reviewerConclusions ?? comparison.pendingSearchConclusions ?? [];
}

export function NoveltyComparisonTable({ comparisonId }: NoveltyComparisonTableProps) {
  const { comparisons, updateComparison, removeComparison } = useNoveltyStore();
  const comparison = comparisons.find((c) => c.id === comparisonId);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [editingConclusions, setEditingConclusions] = useState<Record<number, string>>({});
  const [newQuestion, setNewQuestion] = useState("");

  if (!comparison) {
    return <p data-testid="novelty-empty">未找到新颖性对照结果</p>;
  }

  const reviewerConclusions = getReviewerConclusions(comparison);
  const aiConclusions = comparison.aiPreliminaryConclusions ?? [];

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
    const conclusions = [...reviewerConclusions];
    // 确保数组长度足够
    while (conclusions.length <= index) {
      conclusions.push("");
    }
    conclusions[index] = editingConclusions[index] ?? "";
    updateComparison({ ...comparison, reviewerConclusions: conclusions, pendingSearchConclusions: conclusions });
    setEditingConclusions((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  // 添加新问题
  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;
    const updatedQuestions = [...comparison.pendingSearchQuestions, newQuestion.trim()];
    // 同时为新增问题添加空的结论槽位
    const updatedConclusions = [...reviewerConclusions, ""];
    updateComparison({
      ...comparison,
      pendingSearchQuestions: updatedQuestions,
      reviewerConclusions: updatedConclusions,
      pendingSearchConclusions: updatedConclusions
    });
    setNewQuestion("");
  };

  // 删除问题
  const handleDeleteQuestion = (index: number) => {
    const updatedQuestions = comparison.pendingSearchQuestions.filter((_, i) => i !== index);
    const updatedConclusions = reviewerConclusions.filter((_, i) => i !== index);
    updateComparison({
      ...comparison,
      pendingSearchQuestions: updatedQuestions,
      reviewerConclusions: updatedConclusions,
      pendingSearchConclusions: updatedConclusions
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
            <th>特征描述</th>
            <th>公开状态</th>
            <th>引用</th>
            <th>审查员备注</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.featureCode} data-testid={`row-novelty-${row.featureCode}`}>
              <td><strong>{row.featureCode}</strong></td>
              <td data-testid={`cell-description-${row.featureCode}`}>
                {row.featureDescription || <span style={{ color: "#999" }}>(无描述)</span>}
              </td>
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
            {comparison.differenceFeatureCodes.map((code) => {
              // 查找对应特征描述
              const feature = comparison.rows.find(r => r.featureCode === code);
              return (
                <span key={code} className="feature-tag" title={feature?.featureDescription || ""}>
                  {code}
                </span>
              );
            })}
          </div>
          <p className="help-text" style={{ fontSize: "0.85em", color: "#666", marginTop: 8 }}>
            从特征的公开状态为"未找到"推导得出。用户可通过编辑每个特征的公开状态来修改。
          </p>
        </div>
      )}

      {(comparison.pendingSearchQuestions.length > 0 || aiConclusions.length > 0) && (
        <div data-testid="pending-search-questions" className="novelty-section">
          <h4>待确认问题与审查员确认意见</h4>
          <p className="help-text" style={{ fontSize: "0.85em", color: "#666", marginBottom: 12 }}>
            AI 生成的待确认问题清单，点击下方按钮可补充遗漏的问题，点击问题右侧 ✕ 可删除。
          </p>
          <ul className="pending-search-list">
            {comparison.pendingSearchQuestions.map((q, i) => (
              <li key={i} className="pending-search-item" data-testid={`pending-question-item-${i}`}>
                <div className="pending-search-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="pending-search-question" style={{ flex: 1 }}>
                    <strong>问题 {i + 1}：</strong>{q}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(i)}
                    data-testid={`btn-delete-question-${i}`}
                    style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "#999" }}
                    title="删除此问题"
                  >
                    ✕
                  </button>
                </div>
                
                {/* AI 初步判断 */}
                {aiConclusions[i] ? (
                  <div className="ai-preliminary-conclusion" style={{ marginTop: 8, padding: "8px 12px", background: "#f0f7ff", borderRadius: 4, borderLeft: "3px solid #0066cc" }}>
                    <div style={{ fontSize: "0.85em", color: "#0066cc", marginBottom: 4 }}>AI 初步判断：</div>
                    <div>{aiConclusions[i]}</div>
                  </div>
                ) : (
                  <div className="ai-no-conclusion" style={{ marginTop: 8, padding: "8px 12px", background: "#f5f5f5", borderRadius: 4, color: "#999", fontStyle: "italic" }}>
                    信息不足，AI 无法判断
                  </div>
                )}

                {/* 审查员确认意见 */}
                {editingConclusions[i] !== undefined ? (
                  <div className="pending-search-edit" style={{ marginTop: 8 }}>
                    <label style={{ fontSize: "0.85em", color: "#666", display: "block", marginBottom: 4 }}>
                      审查员确认意见：
                    </label>
                    <textarea
                      value={editingConclusions[i]}
                      onChange={(e) => handleConclusionChange(i, e.target.value)}
                      rows={3}
                      data-testid={`input-conclusion-${i}`}
                      placeholder="请输入审查员确认意见..."
                      style={{ width: "100%" }}
                    />
                    <button
                      type="button"
                      onClick={() => handleConclusionSave(i)}
                      data-testid={`btn-save-conclusion-${i}`}
                      style={{ marginTop: 4 }}
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
                        [i]: reviewerConclusions[i] ?? ""
                      }))
                    }
                    style={{ cursor: "pointer", marginTop: 8, padding: "8px 12px", background: reviewerConclusions[i] ? "#fff" : "#fafafa", border: "1px solid #e0e0e0", borderRadius: 4 }}
                    data-testid={`cell-conclusion-${i}`}
                  >
                    <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 4 }}>审查员确认意见：</div>
                    {reviewerConclusions[i] || <span style={{ color: "#999" }}>(点击编辑)</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* 添加新问题 */}
          <div className="add-question-section" style={{ marginTop: 16, padding: 12, background: "#fafafa", borderRadius: 4 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="输入新的待确认问题..."
                data-testid="input-new-question"
                style={{ flex: 1, padding: "8px 12px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddQuestion();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={!newQuestion.trim()}
                data-testid="btn-add-question"
                style={{ padding: "8px 16px" }}
              >
                + 添加问题
              </button>
            </div>
          </div>
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
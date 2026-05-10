import { useNavigate } from "react-router-dom";
import type { PatentCase } from "@shared/types/domain";
import { useCaseStore } from "../../store";

export function CaseHistoryPanel() {
  const { cases } = useCaseStore();
  const navigate = useNavigate();

  const handleOpenCase = (caseId: string) => {
    navigate(`/cases/${caseId}/baseline`);
  };

  return (
    <div className="case-history-panel" data-testid="case-history-panel">
      <h2>案件历史</h2>

      {cases.length === 0 ? (
        <p data-testid="no-cases">暂无案件记录。</p>
      ) : (
        <div className="case-list" data-testid="case-list">
          {cases.map((c) => (
            <CaseListItem key={c.id} caseData={c} onOpen={handleOpenCase} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseListItem({
  caseData,
  onOpen
}: {
  caseData: PatentCase;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      className="case-list-item"
      data-testid={`case-item-${caseData.id}`}
      onClick={() => onOpen(caseData.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(caseData.id);
      }}
    >
      <div className="case-title">{caseData.title}</div>
      <div className="case-meta">
        <span className="app-number">{caseData.applicationNumber}</span>
        <span className="app-date">{caseData.applicationDate}</span>
        <span className={`workflow-state ${caseData.workflowState}`}>
          {WORKFLOW_LABELS[caseData.workflowState]}
        </span>
      </div>
    </div>
  );
}

const WORKFLOW_LABELS: Record<string, string> = {
  empty: "空白",
  "docs-imported": "已导入文献",
  "chart-reviewed": "Chart 已审核",
  "novelty-done": "新颖性完成",
  "inventive-done": "创造性完成",
  complete: "已完成"
};

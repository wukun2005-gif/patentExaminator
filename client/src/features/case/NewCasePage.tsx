import { useNavigate } from "react-router-dom";
import { createCase } from "../../lib/repositories/caseRepo";
import { useCaseStore } from "../../store";
import type { PatentCase } from "@shared/types/domain";

export function NewCasePage() {
  const navigate = useNavigate();
  const { setCurrentCase } = useCaseStore();

  const handleCreate = async () => {
    const id = `case-${Date.now()}`;
    const now = new Date().toISOString();
    const newCase: PatentCase = {
      id,
      applicationNumber: null,
      title: "",
      applicationDate: "",
      patentType: "invention",
      textVersion: "original",
      targetClaimNumber: 1,
      guidelineVersion: "2023",
      workflowState: "empty",
      createdAt: now,
      updatedAt: now
    };
    await createCase(newCase);
    setCurrentCase(newCase);
    navigate(`/cases/${id}/baseline`);
  };

  return (
    <div className="new-case-page" data-testid="new-case-page">
      <h2>新建案件</h2>
      <p>创建一个新的专利审查案件，然后在案件基线页面填写基本信息。</p>
      <button
        type="button"
        onClick={handleCreate}
        data-testid="btn-create-case"
      >
        创建新案件
      </button>
    </div>
  );
}

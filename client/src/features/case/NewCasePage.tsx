import { useNavigate } from "react-router-dom";
import { createCase } from "../../lib/repositories/caseRepo";
import { loadPresetCase } from "../../lib/presetLoader";
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
    navigate(`/cases/${id}/setup`);
  };

  const handleLoadPreset = async () => {
    const caseId = await loadPresetCase();
    navigate(`/cases/${caseId}/setup`);
  };

  return (
    <div className="new-case-page" data-testid="new-case-page">
      <h2>新建案件</h2>
      <p>创建一个新的专利审查案件，然后在案件基本信息页面填写相关信息。</p>
      <button
        type="button"
        onClick={handleCreate}
        data-testid="btn-create-case"
      >
        创建新案件
      </button>
      <div className="new-case-page__preset">
        <p>或者加载一个预置案例，快速体验完整审查流程：</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleLoadPreset}
          data-testid="btn-load-preset"
        >
          加载预置案例
        </button>
      </div>
    </div>
  );
}

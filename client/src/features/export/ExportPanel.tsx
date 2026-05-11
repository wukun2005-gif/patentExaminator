import type { PatentCase, ClaimFeature, NoveltyComparison, InventiveStepAnalysis, FormalDefect } from "@shared/types/domain";
import { renderCaseHtml, downloadHtml } from "../../lib/exportHtml";
import { buildExportFileName } from "../../lib/fileNameSanitize";

interface ExportPanelProps {
  caseData: PatentCase;
  claimFeatures: ClaimFeature[];
  noveltyComparisons: NoveltyComparison[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  inventiveAnalysis?: InventiveStepAnalysis;
  defects?: FormalDefect[];
}

export function ExportPanel({
  caseData,
  claimFeatures,
  noveltyComparisons,
  differenceFeatureCodes,
  pendingSearchQuestions,
  inventiveAnalysis,
  defects
}: ExportPanelProps) {
  const viewModel = {
    caseData,
    claimFeatures,
    noveltyComparisons,
    differenceFeatureCodes,
    pendingSearchQuestions,
    inventiveAnalysis,
    defects
  };

  const appNumber = caseData.applicationNumber ?? "unknown";

  const handleExportHtml = () => {
    const html = renderCaseHtml(viewModel);
    const fileName = buildExportFileName(
      appNumber,
      caseData.title,
      "审查辅助",
      new Date().toISOString().slice(0, 10)
    );
    downloadHtml(html, fileName);
  };

  return (
    <div className="export-panel" data-testid="export-panel">
      <h2>导出</h2>

      <div className="export-section">
        <p>导出审查辅助材料，包含案件基本信息、Claim Chart、新颖性对照等内容。</p>

        <div className="export-preview">
          <h3>导出内容预览</h3>
          <ul>
            <li>案件基本信息</li>
            <li>Claim Chart（{claimFeatures.filter((f) => f.citationStatus !== "not-found").length} 个已确认特征）</li>
            {noveltyComparisons.length > 0 && (
              <li>新颖性对照（{noveltyComparisons.length} 篇对比文件）</li>
            )}
            {differenceFeatureCodes.length > 0 && (
              <li>区别特征候选（{differenceFeatureCodes.length} 个）</li>
            )}
            {pendingSearchQuestions.length > 0 && (
              <li>待检索问题清单（{pendingSearchQuestions.length} 条）</li>
            )}
            {inventiveAnalysis && (
              <li>创造性三步法分析（候选结论：{ASSESSMENT_LABELS[inventiveAnalysis.candidateAssessment] ?? inventiveAnalysis.candidateAssessment}）</li>
            )}
            {defects && defects.length > 0 && (
              <li>形式缺陷检查（{defects.length} 项，{defects.filter((d) => !d.resolved).length} 项未解决）</li>
            )}
          </ul>
        </div>

        <div className="export-actions">
          <button
            type="button"
            onClick={handleExportHtml}
            data-testid="btn-export-html"
          >
            导出 HTML
          </button>
        </div>

        <div className="export-filename">
          <p>
            文件名示例：
            <code>
              {buildExportFileName(appNumber, caseData.title, "审查辅助", new Date().toISOString().slice(0, 10))}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

const ASSESSMENT_LABELS: Record<string, string> = {
  "possibly-lacks-inventiveness": "可能缺乏创造性",
  "possibly-inventive": "可能具有创造性",
  "insufficient-evidence": "证据不足",
  "not-analyzed": "尚未分析"
};

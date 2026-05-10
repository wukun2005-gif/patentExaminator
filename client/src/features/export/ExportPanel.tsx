import type { PatentCase, ClaimFeature, NoveltyComparison } from "@shared/types/domain";
import { renderCaseHtml, downloadHtml } from "../../lib/exportHtml";
import { renderCaseMarkdown } from "../../lib/exportMarkdown";
import { buildExportFileName } from "../../lib/fileNameSanitize";

interface ExportPanelProps {
  caseData: PatentCase;
  claimFeatures: ClaimFeature[];
  noveltyComparisons: NoveltyComparison[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
}

export function ExportPanel({
  caseData,
  claimFeatures,
  noveltyComparisons,
  differenceFeatureCodes,
  pendingSearchQuestions
}: ExportPanelProps) {
  const viewModel = {
    caseData,
    claimFeatures,
    noveltyComparisons,
    differenceFeatureCodes,
    pendingSearchQuestions
  };

  const handleExportHtml = () => {
    const html = renderCaseHtml(viewModel);
    const fileName = buildExportFileName(
      caseData.applicationNumber,
      caseData.title,
      "审查辅助",
      new Date().toISOString().slice(0, 10)
    );
    downloadHtml(html, fileName);
  };

  const handleExportMarkdown = () => {
    const md = renderCaseMarkdown(viewModel);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildExportFileName(caseData.applicationNumber, caseData.title, "审查辅助", new Date().toISOString().slice(0, 10))}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-panel" data-testid="export-panel">
      <h2>导出</h2>

      <div className="export-section">
        <p>导出审查辅助材料，包含案件基线、Claim Chart、新颖性对照等内容。</p>

        <div className="export-preview">
          <h3>导出内容预览</h3>
          <ul>
            <li>案件基线信息</li>
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
          <button
            type="button"
            onClick={handleExportMarkdown}
            data-testid="btn-export-markdown"
          >
            导出 Markdown
          </button>
        </div>

        <div className="export-filename">
          <p>
            文件名示例：
            <code>
              {buildExportFileName(caseData.applicationNumber, caseData.title, "审查辅助", new Date().toISOString().slice(0, 10))}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

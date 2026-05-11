import type { ExportViewModel } from "./exportHtml";

const LEGAL_DISCLAIMER = "本文件为审查辅助素材，不构成法律结论。所有 AI 生成内容均为候选事实整理，需审查员确认。";

export function renderCaseMarkdown(viewModel: ExportViewModel): string {
  const { caseData, claimFeatures } = viewModel;

  const lines: string[] = [];

  lines.push(`# ${caseData.applicationNumber} - ${caseData.title}`);
  lines.push("");
  lines.push(`> ${LEGAL_DISCLAIMER}`);
  lines.push("");
  lines.push("## 案件基本信息");
  lines.push("");
  lines.push(`- 申请号: ${caseData.applicationNumber}`);
  lines.push(`- 发明名称: ${caseData.title}`);
  lines.push(`- 申请日: ${caseData.applicationDate}`);
  if (caseData.priorityDate) {
    lines.push(`- 优先权日: ${caseData.priorityDate}`);
  }
  lines.push("");
  lines.push("## Claim Chart");
  lines.push("");
  lines.push("| 特征代码 | 特征描述 | 引用状态 |");
  lines.push("|---------|---------|---------|");

  for (const feature of claimFeatures) {
    if (feature.citationStatus !== "not-found") {
      lines.push(`| ${feature.featureCode} | ${feature.description} | ${feature.citationStatus} |`);
    }
  }

  lines.push("");
  lines.push(`> ${LEGAL_DISCLAIMER}`);

  return lines.join("\n");
}

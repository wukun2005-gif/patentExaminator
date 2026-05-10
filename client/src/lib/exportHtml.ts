import type { PatentCase, ClaimFeature, NoveltyComparison } from "@shared/types/domain";

export interface ExportViewModel {
  caseData: PatentCase;
  claimFeatures: ClaimFeature[];
  noveltyComparisons: NoveltyComparison[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
}

const LEGAL_DISCLAIMER = "本文件为审查辅助素材，不构成法律结论。所有 AI 生成内容均为候选事实整理，需审查员确认。";

export function renderCaseHtml(viewModel: ExportViewModel): string {
  const { caseData, claimFeatures, noveltyComparisons, differenceFeatureCodes, pendingSearchQuestions } = viewModel;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${caseData.applicationNumber} - ${caseData.title} - 审查辅助</title>
  <style>
    body { font-family: "Microsoft YaHei", "SimSun", sans-serif; margin: 20px; line-height: 1.6; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    .legal-disclaimer { background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin-bottom: 20px; }
    .section { margin-bottom: 30px; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <div class="legal-disclaimer">
    <strong>法律免责声明：</strong>${LEGAL_DISCLAIMER}
  </div>

  <div class="section">
    <h1>案件基线</h1>
    <table>
      <tr><th>申请号</th><td>${caseData.applicationNumber}</td></tr>
      <tr><th>发明名称</th><td>${caseData.title}</td></tr>
      <tr><th>申请日</th><td>${caseData.applicationDate}</td></tr>
      ${caseData.priorityDate ? `<tr><th>优先权日</th><td>${caseData.priorityDate}</td></tr>` : ""}
      <tr><th>专利类型</th><td>${caseData.patentType}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Claim Chart</h2>
    <table>
      <thead>
        <tr>
          <th>特征代码</th>
          <th>特征描述</th>
          <th>引用状态</th>
        </tr>
      </thead>
      <tbody>
        ${claimFeatures
          .filter((f) => f.citationStatus !== "not-found")
          .map(
            (f) => `
        <tr>
          <td>${f.featureCode}</td>
          <td>${f.description}</td>
          <td>${STATUS_LABELS[f.citationStatus] ?? f.citationStatus}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>

  ${
    noveltyComparisons.length > 0
      ? `
  <div class="section">
    <h2>新颖性对照</h2>
    ${noveltyComparisons
      .map(
        (comp) => `
    <h3>对比文件: ${comp.referenceId}</h3>
    <table>
      <thead>
        <tr>
          <th>特征代码</th>
          <th>公开状态</th>
          <th>审查员备注</th>
        </tr>
      </thead>
      <tbody>
        ${comp.rows
          .map(
            (row) => `
        <tr>
          <td>${row.featureCode}</td>
          <td>${DISCLOSURE_LABELS[row.disclosureStatus] ?? row.disclosureStatus}</td>
          <td>${row.reviewerNotes ?? "—"}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p><strong>区别特征候选：</strong>${comp.differenceFeatureCodes.join(", ")}</p>
    `
      )
      .join("")}
  </div>`
      : ""
  }

  ${
    differenceFeatureCodes.length > 0
      ? `
  <div class="section">
    <h2>区别特征候选</h2>
    <ul>
      ${differenceFeatureCodes.map((code) => `<li>${code}</li>`).join("")}
    </ul>
  </div>`
      : ""
  }

  ${
    pendingSearchQuestions.length > 0
      ? `
  <div class="section">
    <h2>待检索问题清单</h2>
    <ul>
      ${pendingSearchQuestions.map((q) => `<li>${q}</li>`).join("")}
    </ul>
  </div>`
      : ""
  }

  <div class="legal-disclaimer">
    <strong>法律免责声明：</strong>${LEGAL_DISCLAIMER}
  </div>
</body>
</html>`;
}

export function downloadHtml(html: string, fileName: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "已确认",
  "needs-review": "待确认",
  "not-found": "未找到"
};

const DISCLOSURE_LABELS: Record<string, string> = {
  "clearly-disclosed": "已明确公开",
  "possibly-disclosed": "可能公开",
  "not-found": "未找到",
  "not-applicable": "不适用"
};

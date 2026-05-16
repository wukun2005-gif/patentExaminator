import type { PatentCase, ClaimFeature, NoveltyComparison, InventiveStepAnalysis, FormalDefect } from "@shared/types/domain";
import type { ReexamDraftResponse, SummaryResponse } from "../agent/contracts";

export interface ExportViewModel {
  caseData: PatentCase;
  claimFeatures: ClaimFeature[];
  noveltyComparisons: NoveltyComparison[];
  differenceFeatureCodes: string[];
  pendingSearchQuestions: string[];
  inventiveAnalysis?: InventiveStepAnalysis | undefined;
  defects?: FormalDefect[] | undefined;
  reexamDraft?: ReexamDraftResponse | undefined;
  summary?: SummaryResponse | undefined;
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
    <h1>案件基本信息</h1>
    <table>
      <tr><th>申请号</th><td>${caseData.applicationNumber}</td></tr>
      <tr><th>发明名称</th><td>${caseData.title}</td></tr>
      <tr><th>申请日</th><td>${caseData.applicationDate}</td></tr>
      ${caseData.priorityDate ? `<tr><th>优先权日</th><td>${caseData.priorityDate}</td></tr>` : ""}
      <tr><th>专利类型</th><td>${caseData.patentType}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>权利要求特征表</h2>
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
          <th>原文引用</th>
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
          <td>${row.citations?.[0]?.quote ? `「${row.citations[0].quote}」` : "—"}</td>
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

  ${
    viewModel.inventiveAnalysis
      ? (() => {
          const a = viewModel.inventiveAnalysis;
          return `
  <div class="section">
    <h2>创造性三步法分析</h2>
    <table>
      <tr><th>最接近现有技术</th><td>${a.closestPriorArtId ?? "—"}</td></tr>
      <tr><th>共有特征</th><td>${a.sharedFeatureCodes.join("、") || "无"}</td></tr>
      <tr><th>区别特征</th><td>${a.distinguishingFeatureCodes.join("、") || "无"}</td></tr>
      ${a.objectiveTechnicalProblem ? `<tr><th>客观技术问题</th><td>${a.objectiveTechnicalProblem}</td></tr>` : ""}
      <tr><th>候选结论</th><td>${ASSESSMENT_LABELS[a.candidateAssessment] ?? a.candidateAssessment}</td></tr>
    </table>
    ${
      a.motivationEvidence.length > 0
        ? `<h3>现有技术启示</h3>
    <ul>
      ${a.motivationEvidence.map((e) => `<li>${e.label}${e.quote ? `：「${e.quote}」` : ""}（置信度：${e.confidence}）</li>`).join("")}
    </ul>`
        : ""
    }
    ${
      a.cautions.length > 0
        ? `<h3>注意事项</h3>
    <ul>
      ${a.cautions.map((c) => `<li>${c}</li>`).join("")}
    </ul>`
        : ""
    }
    <p><em>${a.legalCaution}</em></p>
  </div>`;
        })()
      : ""
  }

  ${
    viewModel.defects && viewModel.defects.length > 0
      ? `
  <div class="section">
    <h2>形式缺陷检查</h2>
    <table>
      <thead>
        <tr>
          <th>严重度</th>
          <th>分类</th>
          <th>缺陷描述</th>
          <th>位置</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        ${viewModel.defects
          .map(
            (d) => `
        <tr>
          <td>${SEVERITY_LABELS[d.severity]}</td>
          <td>${d.category}</td>
          <td>${d.description}</td>
          <td>${d.location ?? "—"}</td>
          <td>${d.resolved ? "已解决" : "未解决"}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p><em>以下为 AI 辅助检测结果，需审查员逐项确认。</em></p>
  </div>`
      : ""
  }

  ${
    viewModel.reexamDraft
      ? `
  <div class="section">
    <h2>复审意见草稿</h2>
    ${viewModel.reexamDraft.responseItems
      .map(
        (item) => `
    <h3>${item.rejectionGroundCode} · ${item.category}</h3>
    <p><strong>申请人意见：</strong>${item.applicantArgumentSummary}</p>
    <p><strong>审查员回应草稿：</strong>${item.examinerResponse}</p>
    <p><strong>候选结论：</strong>${REEXAM_CONCLUSION_LABELS[item.conclusion] ?? item.conclusion}</p>
    ${
      item.supportingEvidence && item.supportingEvidence.length > 0
        ? `<div class="supporting-evidence">
    <strong>原文依据：</strong>
    ${item.supportingEvidence
      .map(
        (e) => `<blockquote class="citation-quote">
      <cite>${e.label}</cite>
      ${e.quote ? `<p>「${e.quote}」</p>` : "<p>待补充原文依据</p>"}
      <span>置信度：${e.confidence}</span>
    </blockquote>`
      )
      .join("")}
  </div>`
        : ""
    }`
      )
      .join("")}
    <h3>综合评估</h3>
    <p>${viewModel.reexamDraft.overallAssessment}</p>
    ${
      viewModel.reexamDraft.defectReviewSummary
        ? `<h3>缺陷复查总结</h3><p>${viewModel.reexamDraft.defectReviewSummary}</p>`
        : ""
    }
    <p><em>${viewModel.reexamDraft.legalCaution}</em></p>
  </div>`
      : ""
  }

  ${
    viewModel.summary
      ? `
  <div class="section">
    <h2>审查意见简述</h2>
    <h3>正文</h3>
    <div>${viewModel.summary.body}</div>
    ${
      viewModel.summary.aiNotes
        ? `<h3>AI 备注</h3><div>${viewModel.summary.aiNotes}</div>`
        : ""
    }
    <p><em>${viewModel.summary.legalCaution}</em></p>
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

const ASSESSMENT_LABELS: Record<string, string> = {
  "possibly-lacks-inventiveness": "可能缺乏创造性",
  "possibly-inventive": "可能具有创造性",
  "insufficient-evidence": "证据不足",
  "not-analyzed": "尚未分析"
};

const SEVERITY_LABELS: Record<string, string> = {
  error: "严重",
  warning: "警告",
  info: "提示"
};

const DISCLOSURE_LABELS: Record<string, string> = {
  "clearly-disclosed": "已明确公开",
  "possibly-disclosed": "可能公开",
  "not-found": "未找到",
  "not-applicable": "不适用"
};

const REEXAM_CONCLUSION_LABELS: Record<string, string> = {
  "argument-accepted": "答辩成立",
  "argument-partially-accepted": "答辩部分成立",
  "argument-rejected": "答辩不成立",
  "needs-further-review": "需进一步审查"
};

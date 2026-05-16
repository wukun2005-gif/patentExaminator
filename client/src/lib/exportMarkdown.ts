import type { ExportViewModel } from "./exportHtml";

const LEGAL_DISCLAIMER = "本文件为审查辅助素材，不构成法律结论。所有 AI 生成内容均为候选事实整理，需审查员确认。";

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

const REEXAM_CONCLUSION_LABELS: Record<string, string> = {
  "argument-accepted": "答辩成立",
  "argument-partially-accepted": "答辩部分成立",
  "argument-rejected": "答辩不成立",
  "needs-further-review": "需进一步审查"
};

export function renderCaseMarkdown(viewModel: ExportViewModel): string {
  const { caseData, claimFeatures, noveltyComparisons, differenceFeatureCodes, pendingSearchQuestions, inventiveAnalysis, defects, reexamDraft, summary } = viewModel;

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
  lines.push(`- 专利类型: ${caseData.patentType}`);
  lines.push("");

  lines.push("## 权利要求特征表");
  lines.push("");
  lines.push("| 特征代码 | 特征描述 | 引用状态 |");
  lines.push("|---------|---------|---------|");

  for (const feature of claimFeatures) {
    if (feature.citationStatus !== "not-found") {
      lines.push(`| ${feature.featureCode} | ${feature.description} | ${STATUS_LABELS[feature.citationStatus] ?? feature.citationStatus} |`);
    }
  }
  lines.push("");

  if (noveltyComparisons.length > 0) {
    lines.push("## 新颖性对照");
    lines.push("");
    for (const comp of noveltyComparisons) {
      lines.push(`### 对比文件: ${comp.referenceId}`);
      lines.push("");
      lines.push("| 特征代码 | 公开状态 | 原文引用 | 审查员备注 |");
      lines.push("|---------|---------|---------|----------|");
      for (const row of comp.rows) {
        const quote = row.citations?.[0]?.quote ? `「${row.citations[0].quote}」` : "—";
        lines.push(`| ${row.featureCode} | ${DISCLOSURE_LABELS[row.disclosureStatus] ?? row.disclosureStatus} | ${quote} | ${row.reviewerNotes ?? "—"} |`);
      }
      lines.push("");
      lines.push(`**区别特征候选：** ${comp.differenceFeatureCodes.join(", ")}`);
      lines.push("");
    }
  }

  if (differenceFeatureCodes.length > 0) {
    lines.push("## 区别特征候选");
    lines.push("");
    for (const code of differenceFeatureCodes) {
      lines.push(`- ${code}`);
    }
    lines.push("");
  }

  if (pendingSearchQuestions.length > 0) {
    lines.push("## 待检索问题清单");
    lines.push("");
    for (const q of pendingSearchQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  if (inventiveAnalysis) {
    const a = inventiveAnalysis;
    lines.push("## 创造性三步法分析");
    lines.push("");
    lines.push(`- 最接近现有技术: ${a.closestPriorArtId ?? "—"}`);
    lines.push(`- 共有特征: ${a.sharedFeatureCodes.join("、") || "无"}`);
    lines.push(`- 区别特征: ${a.distinguishingFeatureCodes.join("、") || "无"}`);
    if (a.objectiveTechnicalProblem) {
      lines.push(`- 客观技术问题: ${a.objectiveTechnicalProblem}`);
    }
    lines.push(`- 候选结论: ${ASSESSMENT_LABELS[a.candidateAssessment] ?? a.candidateAssessment}`);
    lines.push("");
    if (a.motivationEvidence.length > 0) {
      lines.push("### 现有技术启示");
      lines.push("");
      for (const e of a.motivationEvidence) {
        const quote = e.quote ? `「${e.quote}」` : "";
        lines.push(`- ${e.label}${quote}（置信度：${e.confidence}）`);
      }
      lines.push("");
    }
    if (a.cautions.length > 0) {
      lines.push("### 注意事项");
      lines.push("");
      for (const c of a.cautions) {
        lines.push(`- ${c}`);
      }
      lines.push("");
    }
    lines.push(`> ${a.legalCaution}`);
    lines.push("");
  }

  if (defects && defects.length > 0) {
    lines.push("## 形式缺陷检查");
    lines.push("");
    lines.push("| 严重度 | 分类 | 缺陷描述 | 位置 | 状态 |");
    lines.push("|-------|-----|---------|-----|-----|");
    for (const d of defects) {
      lines.push(`| ${SEVERITY_LABELS[d.severity]} | ${d.category} | ${d.description} | ${d.location ?? "—"} | ${d.resolved ? "已解决" : "未解决"} |`);
    }
    lines.push("");
    lines.push("> 以下为 AI 辅助检测结果，需审查员逐项确认。");
    lines.push("");
  }

  if (reexamDraft) {
    lines.push("## 复审意见草稿");
    lines.push("");
    for (const item of reexamDraft.responseItems) {
      lines.push(`### ${item.rejectionGroundCode} · ${item.category}`);
      lines.push("");
      lines.push(`**申请人意见：** ${item.applicantArgumentSummary}`);
      lines.push("");
      lines.push(`**审查员回应草稿：** ${item.examinerResponse}`);
      lines.push("");
      lines.push(`**候选结论：** ${REEXAM_CONCLUSION_LABELS[item.conclusion] ?? item.conclusion}`);
      lines.push("");
      if (item.supportingEvidence && item.supportingEvidence.length > 0) {
        lines.push("**原文依据：**");
        lines.push("");
        for (const e of item.supportingEvidence) {
          const quote = e.quote ? `「${e.quote}」` : "待补充原文依据";
          lines.push(`> **${e.label}**`);
          lines.push(`> ${quote}`);
          lines.push(`> 置信度：${e.confidence}`);
          lines.push("");
        }
      }
    }
    lines.push("### 综合评估");
    lines.push("");
    lines.push(reexamDraft.overallAssessment);
    lines.push("");
    if (reexamDraft.defectReviewSummary) {
      lines.push("### 缺陷复查总结");
      lines.push("");
      lines.push(reexamDraft.defectReviewSummary);
      lines.push("");
    }
    lines.push(`> ${reexamDraft.legalCaution}`);
    lines.push("");
  }

  if (summary) {
    lines.push("## 审查意见简述");
    lines.push("");
    lines.push("### 正文");
    lines.push("");
    lines.push(summary.body);
    lines.push("");
    if (summary.aiNotes) {
      lines.push("### AI 备注");
      lines.push("");
      lines.push(summary.aiNotes);
      lines.push("");
    }
    lines.push(`> ${summary.legalCaution}`);
    lines.push("");
  }

  lines.push(`> ${LEGAL_DISCLAIMER}`);

  return lines.join("\n");
}
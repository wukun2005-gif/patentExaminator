import {
  useCaseStore,
  useDocumentsStore,
  useClaimsStore,
  useNoveltyStore,
  useInventiveStore,
  useDefectsStore
} from "../store";
import type { ModuleScope } from "@shared/types/domain";

export function buildContextSummary(caseId: string, moduleScope: ModuleScope): string {
  const lines: string[] = [];

  // Always include basic case info
  const currentCase = useCaseStore.getState().currentCase;
  if (currentCase && currentCase.id === caseId) {
    lines.push(`案件: ${currentCase.title || "（无标题）"} (${currentCase.applicationNumber ?? "无申请号"})`);
    lines.push(`工作流状态: ${currentCase.workflowState}`);
    lines.push("");
  }

  switch (moduleScope) {
    case "case":
      if (currentCase) {
        lines.push(`申请日: ${currentCase.applicationDate}`);
        lines.push(`专利类型: ${currentCase.patentType}`);
        lines.push(`目标权利要求: ${currentCase.targetClaimNumber}`);
      }
      break;

    case "documents": {
      const docs = useDocumentsStore.getState().documents.filter((d) => d.caseId === caseId);
      lines.push(`已导入文档: ${docs.length} 份`);
      for (const d of docs) {
        lines.push(`  - ${d.fileName} (${d.role}, 文本状态: ${d.textStatus})`);
      }
      break;
    }

    case "claim-chart": {
      const features = useClaimsStore.getState().claimFeatures.filter((f) => f.caseId === caseId);
      const nodes = useClaimsStore.getState().claimNodes.filter((n) => n.caseId === caseId);
      lines.push(`权利要求节点: ${nodes.length} 个`);
      lines.push(`技术特征: ${features.length} 个`);
      for (const f of features) {
        lines.push(`  ${f.featureCode}: ${f.description} [${f.citationStatus}]`);
      }
      break;
    }

    case "novelty": {
      const comps = useNoveltyStore.getState().comparisons.filter((c) => c.caseId === caseId);
      lines.push(`新颖性对照: ${comps.length} 篇对比文件`);
      for (const c of comps) {
        lines.push(`  对比文件 ${c.referenceId}: ${c.rows.length} 行, 状态 ${c.status}`);
        if (c.differenceFeatureCodes.length > 0) {
          lines.push(`  区别特征: ${c.differenceFeatureCodes.join(", ")}`);
        }
      }
      break;
    }

    case "inventive": {
      const analyses = useInventiveStore.getState().analyses.filter((a) => a.caseId === caseId);
      if (analyses.length > 0) {
        const a = analyses[0];
        lines.push(`创造性分析: 候选结论 ${a.candidateAssessment}`);
        lines.push(`最接近现有技术: ${a.closestPriorArtId ?? "未选定"}`);
        lines.push(`共有特征: ${a.sharedFeatureCodes.join(", ") || "无"}`);
        lines.push(`区别特征: ${a.distinguishingFeatureCodes.join(", ") || "无"}`);
        if (a.objectiveTechnicalProblem) {
          lines.push(`客观技术问题: ${a.objectiveTechnicalProblem}`);
        }
      } else {
        lines.push("创造性分析: 尚未运行");
      }
      break;
    }

    case "defects": {
      const defects = useDefectsStore.getState().defects.filter((d) => d.caseId === caseId);
      lines.push(`形式缺陷: ${defects.length} 项 (${defects.filter((d) => !d.resolved).length} 项未解决)`);
      for (const d of defects) {
        lines.push(`  [${d.severity}] ${d.category}: ${d.description} ${d.resolved ? "(已解决)" : ""}`);
      }
      break;
    }

    case "draft":
    case "summary": {
      const features = useClaimsStore.getState().claimFeatures.filter((f) => f.caseId === caseId);
      const comps = useNoveltyStore.getState().comparisons.filter((c) => c.caseId === caseId);
      const analyses = useInventiveStore.getState().analyses.filter((a) => a.caseId === caseId);
      const defects = useDefectsStore.getState().defects.filter((d) => d.caseId === caseId);
      lines.push(`特征: ${features.length} 个 | 对照: ${comps.length} 篇 | 创造性: ${analyses.length > 0 ? analyses[0].candidateAssessment : "未分析"} | 缺陷: ${defects.length} 项`);
      break;
    }

    case "interpret":
      // interpret doesn't have structured store data yet
      break;
  }

  return lines.join("\n") || "（暂无模块数据）";
}

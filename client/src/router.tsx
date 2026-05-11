import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ShellPlaceholder } from "./components/ShellPlaceholder";
import { NewCasePage } from "./features/case/NewCasePage";
import { CaseSetupPage } from "./features/case/CaseSetupPage";
import { ReferenceLibraryPanel } from "./features/references/ReferenceLibraryPanel";
import { SettingsPage } from "./features/settings/SettingsPage";
import { InterpretPanel } from "./features/interpret/InterpretPanel";
import { CaseHistoryPanel } from "./features/history/CaseHistoryPanel";
import { ClaimChartTable } from "./features/claims/ClaimChartTable";
import { NoveltyComparisonTable } from "./features/novelty/NoveltyComparisonTable";
import { InventiveStepPanel } from "./features/inventive/InventiveStepPanel";
import { DefectPanel } from "./features/defects/DefectPanel";
import { DraftMaterialPanel } from "./features/draft/DraftMaterialPanel";
import { ExportPanel } from "./features/export/ExportPanel";
import { useClaimsStore } from "./store";
import { useCaseStore } from "./store";
import { useNoveltyStore } from "./store";
import { useDocumentsStore } from "./store";
import { useReferencesStore } from "./store";
import { useInventiveStore } from "./store";
import { useDefectsStore } from "./store";
import { useSettingsStore } from "./store";
import { AgentClient } from "./agent/AgentClient";
import type { InventiveResponse } from "./agent/contracts";
import type { DefectResponse } from "./agent/contracts";

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function ClaimChartWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  return <ClaimChartTable caseId={caseId ?? ""} claimNumber={claimNumber} />;
}

function NoveltyWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { comparisons } = useNoveltyStore();
  const comparison = comparisons.find((c) => c.caseId === caseId);
  if (!comparison) {
    return (
      <div data-testid="novelty-placeholder">
        <h2>新颖性对照</h2>
        <p>请先在 Claim Chart 中生成特征拆解，然后运行新颖性分析。</p>
      </div>
    );
  }
  return <NoveltyComparisonTable comparisonId={comparison.id} />;
}

function InventiveWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { references } = useReferencesStore();
  const { analyses } = useInventiveStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures
    .filter((f) => f.caseId === caseId && f.claimNumber === claimNumber)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  const caseRefs = references.filter((r) => r.caseId === caseId);
  const existingAnalysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );
  return (
    <InventiveStepPanel
      key={`inventive-${caseId}-${claimNumber}-${existingAnalysis?.id ?? "new"}`}
      caseId={caseId ?? ""}
      claimNumber={claimNumber}
      features={features}
      references={caseRefs}
      runInventive={async () => {
        if (existingAnalysis) {
          return {
            claimNumber,
            ...(existingAnalysis.closestPriorArtId ? { closestPriorArtId: existingAnalysis.closestPriorArtId } : {}),
            sharedFeatureCodes: existingAnalysis.sharedFeatureCodes,
            distinguishingFeatureCodes: existingAnalysis.distinguishingFeatureCodes,
            ...(existingAnalysis.objectiveTechnicalProblem ? { objectiveTechnicalProblem: existingAnalysis.objectiveTechnicalProblem } : {}),
            motivationEvidence: existingAnalysis.motivationEvidence.map((e) => ({
              referenceId: e.documentId,
              label: e.label,
              ...(e.quote ? { quote: e.quote } : {}),
              confidence: e.confidence
            })),
            candidateAssessment: existingAnalysis.candidateAssessment,
            cautions: existingAnalysis.cautions,
            legalCaution: existingAnalysis.legalCaution
          } satisfies InventiveResponse;
        }
        return {
          claimNumber,
          sharedFeatureCodes: [],
          distinguishingFeatureCodes: features.map((f) => f.featureCode),
          motivationEvidence: [],
          candidateAssessment: "not-analyzed" as const,
          cautions: [],
          legalCaution: "本分析为 AI 辅助候选，需审查员确认。"
        };
      }}
    />
  );
}

function InterpretWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();
  const appDoc = documents.find((d) => d.caseId === caseId && d.role === "application");
  const docText = appDoc?.extractedText || (currentCase?.title ? `案件：${currentCase.title}` : "");
  return (
    <InterpretPanel
      caseId={caseId ?? ""}
      documentText={docText}
      runInterpret={async (text: string) => {
        const client = new AgentClient(settings.mode, "/api", settings);
        const response = await client.runInterpret({ caseId: caseId ?? "", documentText: text });
        return response.reply;
      }}
    />
  );
}

function ExportWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { defects } = useDefectsStore();

  if (!currentCase) {
    return (
      <div data-testid="export-no-case">
        <h2>导出</h2>
        <p>请先创建或加载一个案件。</p>
      </div>
    );
  }

  const noveltyComparisons = comparisons.filter((c) => c.caseId === caseId);
  const diffCodes = noveltyComparisons.flatMap((c) => c.differenceFeatureCodes);
  const searchQuestions = noveltyComparisons.flatMap((c) => c.pendingSearchQuestions);
  const claimNumber = currentCase.targetClaimNumber ?? 1;
  const inventiveAnalysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );
  const caseDefects = defects.filter((d) => d.caseId === caseId);

  return (
    <ExportPanel
      caseData={currentCase}
      claimFeatures={claimFeatures.filter((f) => f.caseId === caseId)}
      noveltyComparisons={noveltyComparisons}
      differenceFeatureCodes={[...new Set(diffCodes)]}
      pendingSearchQuestions={[...new Set(searchQuestions)]}
      inventiveAnalysis={inventiveAnalysis}
      defects={caseDefects}
    />
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/cases/new" replace /> },
      { path: "cases/new", element: <NewCasePage /> },
      { path: "cases/:caseId/setup", element: <CaseSetupPage /> },
      { path: "cases/:caseId/baseline", element: <Navigate to="../setup" replace /> },
      { path: "cases/:caseId/documents", element: <Navigate to="../setup" replace /> },
      { path: "cases/:caseId/references", element: <ReferenceLibraryPanel /> },
      { path: "cases/:caseId/claim-chart", element: <ClaimChartWrapper /> },
      { path: "cases/:caseId/novelty", element: <NoveltyWrapper /> },
      { path: "cases/:caseId/inventive", element: <InventiveWrapper /> },
      { path: "cases/:caseId/defects", element: <DefectWrapper /> },
      { path: "cases/:caseId/draft", element: <DraftWrapper /> },
      { path: "cases/:caseId/response", element: <ShellPlaceholder title="答复审查" /> },
      { path: "cases/:caseId/interpret", element: <InterpretWrapper /> },
      { path: "cases/:caseId/export", element: <ExportWrapper /> },
      { path: "cases", element: <CaseHistoryPanel /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);

function DefectWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { claimNodes, claimFeatures } = useClaimsStore();
  const { documents } = useDocumentsStore();
  const { defects } = useDefectsStore();

  const appDoc = documents.find((d) => d.caseId === caseId && d.role === "application");
  const specificationText = appDoc?.extractedText ?? "";
  const caseNodes = claimNodes.filter((n) => n.caseId === caseId);
  const claimText = caseNodes.map((n) => n.rawText).join("\n");
  const features = claimFeatures
    .filter((f) => f.caseId === caseId)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  const existingDefects = defects.filter((d) => d.caseId === caseId);

  return (
    <DefectPanel
      key={`defect-${caseId}-${existingDefects.length}`}
      caseId={caseId ?? ""}
      claimText={claimText}
      specificationText={specificationText}
      claimFeatures={features}
      runDefectCheck={async () => {
        if (existingDefects.length > 0) {
          return {
            defects: existingDefects.map((d) => ({
              category: d.category,
              description: d.description,
              ...(d.location ? { location: d.location } : {}),
              severity: d.severity
            })),
            warnings: [],
            legalCaution: "以下为 AI 辅助检测结果，需审查员逐项确认。"
          } satisfies DefectResponse;
        }
        return {
          defects: [
            {
              category: "权利要求",
              description: "权利要求引用关系不明确，缺少对独立权利要求的具体引用",
              location: "权利要求2",
              severity: "error" as const
            },
            {
              category: "说明书",
              description: "具体实施方式中部分技术参数未公开具体数值范围",
              location: "说明书第4段",
              severity: "warning" as const
            }
          ],
          warnings: [],
          legalCaution: "以下为 AI 辅助检测结果，需审查员逐项确认。"
        };
      }}
    />
  );
}

function DraftWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  return <DraftMaterialPanel caseId={caseId ?? ""} />;
}

import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ShellPlaceholder } from "./components/ShellPlaceholder";
import { NewCasePage } from "./features/case/NewCasePage";
import { CaseBaselineForm } from "./features/case/CaseBaselineForm";
import { DocumentUploadPanel } from "./features/documents/DocumentUploadPanel";
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
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures
    .filter((f) => f.caseId === caseId && f.claimNumber === claimNumber)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  return (
    <InventiveStepPanel
      caseId={caseId ?? ""}
      claimNumber={claimNumber}
      features={features}
      references={[]}
      runInventive={async () => ({
        claimNumber,
        sharedFeatureCodes: [],
        distinguishingFeatureCodes: features.map((f) => f.featureCode),
        motivationEvidence: [],
        candidateAssessment: "not-analyzed",
        cautions: [],
        legalCaution: "本分析为 AI 辅助候选，需审查员确认。"
      })}
    />
  );
}

function InterpretWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const docText = currentCase?.title ? `案件：${currentCase.title}` : "";
  return (
    <InterpretPanel
      caseId={caseId ?? ""}
      documentText={docText}
      runInterpret={async (prompt) => `（演示模式）针对您的问题「${prompt}」，这是 AI 解读结果。实际使用时将调用大模型进行文档解读。`}
    />
  );
}

function ExportWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();

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

  return (
    <ExportPanel
      caseData={currentCase}
      claimFeatures={claimFeatures.filter((f) => f.caseId === caseId)}
      noveltyComparisons={noveltyComparisons}
      differenceFeatureCodes={[...new Set(diffCodes)]}
      pendingSearchQuestions={[]}
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
      { path: "cases/:caseId/baseline", element: <CaseBaselineForm /> },
      { path: "cases/:caseId/documents", element: <DocumentUploadPanel /> },
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
  return <DefectPanel caseId={caseId ?? ""} />;
}

function DraftWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  return <DraftMaterialPanel caseId={caseId ?? ""} />;
}

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
import { ClaimChartActions } from "./features/claims/ClaimChartActions";
import { NoveltyComparisonTable } from "./features/novelty/NoveltyComparisonTable";
import { NoveltyAgentTrigger } from "./features/novelty/NoveltyAgentTrigger";
import { InventiveStepPanel } from "./features/inventive/InventiveStepPanel";
import { DefectPanel } from "./features/defects/DefectPanel";
import { DraftMaterialPanel } from "./features/draft/DraftMaterialPanel";
import { SummaryPanel } from "./features/summary/SummaryPanel";
import { ExportPanel } from "./features/export/ExportPanel";
import { OpinionAnalysisPanel } from "./features/opinion/OpinionAnalysisPanel";
import { ArgumentMappingPanel } from "./features/argument/ArgumentMappingPanel";
import { OpinionComparisonPanel } from "./features/opinion/OpinionComparisonPanel";
import { useClaimsStore } from "./store";
import { useCaseStore } from "./store";
import { useNoveltyStore } from "./store";
import { useDocumentsStore } from "./store";
import { useReferencesStore } from "./store";
import { useInventiveStore } from "./store";
import { useDefectsStore } from "./store";
import { useDraftStore } from "./store";
import { useSettingsStore } from "./store";
import { useOpinionStore } from "./store";
import { AgentClient } from "./agent/AgentClient";
import type { ArgumentMapping, OfficeActionAnalysis } from "@shared/types/domain";

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
  const { documents } = useDocumentsStore();
  const { claimNodes } = useClaimsStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const appDoc = documents.find((d) => d.caseId === caseId && d.role === "application");
  const specificationText = appDoc?.extractedText ?? "";
  return (
    <>
      <ClaimChartTable caseId={caseId ?? ""} claimNumber={claimNumber} />
      <ClaimChartActions claimNodes={claimNodes} specificationText={specificationText} />
    </>
  );
}

function SummaryWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { settings } = useSettingsStore();
  return (
    <SummaryPanel
      caseId={caseId ?? ""}
      runSummary={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runSummary({
          caseId: caseId ?? "",
          caseBaseline: JSON.stringify(currentCase ?? {}),
          confirmedFeatures: JSON.stringify(claimFeatures.filter((f) => f.citationStatus === "confirmed")),
          reviewedNoveltyComparisons: JSON.stringify(comparisons.filter((c) => c.caseId === caseId)),
          inventiveAnalysis: JSON.stringify(analyses.filter((a) => a.caseId === caseId))
        });
      }}
    />
  );
}

function NoveltyWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { comparisons } = useNoveltyStore();
  const { claimFeatures } = useClaimsStore();
  const { references } = useReferencesStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, argumentMappings } = useOpinionStore();
  const { documents } = useDocumentsStore();
  const comparison = comparisons.find((c) => c.caseId === caseId);
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures.filter((f) => f.caseId === caseId && f.claimNumber === claimNumber);
  const caseRefs = references.filter((r) => r.caseId === caseId);

  const noveltyArgumentCodes = new Set(
    officeActionAnalysis?.rejectionGrounds
      .filter((g) => g.category === "novelty")
      .map((g) => g.code)
  );
  const applicantArguments = argumentMappings
    .filter((m) => noveltyArgumentCodes.has(m.rejectionGroundCode))
    .map((m) => `${m.rejectionGroundCode}: ${m.argumentSummary}`)
    .join("\n");
  const amendedDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "application" && d.fileName.includes("修改")
  );
  const amendedClaimText = amendedDoc?.extractedText;

  return (
    <>
      <NoveltyAgentTrigger
        caseId={caseId ?? ""}
        claimNumber={claimNumber}
        features={features}
        references={caseRefs}
        applicantArguments={applicantArguments || undefined}
        amendedClaimText={amendedClaimText}
        runNovelty={async (request) => {
          const client = new AgentClient(settings.mode, "/api", settings);
          return client.runNovelty(request);
        }}
      />
      {comparison ? (
        <NoveltyComparisonTable comparisonId={comparison.id} />
      ) : (
        <div data-testid="novelty-placeholder">
          <p>请先在权利要求特征表中生成特征拆解，然后选择对比文件运行新颖性分析。</p>
        </div>
      )}
    </>
  );
}

function InventiveWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { references } = useReferencesStore();
  const { analyses } = useInventiveStore();
  const { officeActionAnalysis, argumentMappings } = useOpinionStore();
  const { settings } = useSettingsStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures
    .filter((f) => f.caseId === caseId && f.claimNumber === claimNumber)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  const caseRefs = references.filter((r) => r.caseId === caseId);
  const existingAnalysis = analyses.find(
    (a) => a.caseId === caseId && a.id === `inventive-${caseId}-${claimNumber}`
  );
  const inventiveArgumentCodes = new Set(
    officeActionAnalysis?.rejectionGrounds
      .filter((g) => g.category === "inventive")
      .map((g) => g.code)
  );
  const applicantArguments = argumentMappings
    .filter((m) => inventiveArgumentCodes.has(m.rejectionGroundCode))
    .map((m) => `${m.rejectionGroundCode}: ${m.argumentSummary}`)
    .join("\n");
  return (
    <InventiveStepPanel
      key={`inventive-${caseId}-${claimNumber}-${existingAnalysis?.id ?? "new"}`}
      caseId={caseId ?? ""}
      claimNumber={claimNumber}
      features={features}
      references={caseRefs}
      applicantArguments={applicantArguments || undefined}
      runInventive={async (request) => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runInventive(request);
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
      runTranslate={async (text: string) => {
        const client = new AgentClient(settings.mode, "/api", settings);
        const response = await client.runTranslate({ caseId: caseId ?? "", documentText: text });
        return response.translatedText;
      }}
    />
  );
}

function OpinionAnalysisWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, setOfficeActionAnalysis } = useOpinionStore();
  const { updateWorkflowState } = useCaseStore();
  const officeActionDoc = documents.find((d) => d.caseId === caseId && d.role === "office-action");

  const initialResult = officeActionAnalysis
    ? {
        documentId: officeActionAnalysis.documentId,
        rejectionGrounds: officeActionAnalysis.rejectionGrounds,
        citedReferences: officeActionAnalysis.citedReferences,
        legalCaution: officeActionAnalysis.legalCaution
      }
    : null;

  return (
    <OpinionAnalysisPanel
      caseId={caseId ?? ""}
      documentId={officeActionDoc?.id ?? ""}
      officeActionText={officeActionDoc?.extractedText ?? ""}
      initialResult={initialResult}
      runAnalysis={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runOpinionAnalysis({
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        });
      }}
      onComplete={(result) => {
        const now = new Date().toISOString();
        const analysis: OfficeActionAnalysis = {
          id: `opinion-${caseId ?? "case"}-${Date.now()}`,
          caseId: caseId ?? "",
          documentId: result.documentId,
          rejectionGrounds: result.rejectionGrounds,
          citedReferences: result.citedReferences,
          legalCaution: result.legalCaution,
          status: "draft",
          createdAt: now
        };
        setOfficeActionAnalysis(analysis);
        updateWorkflowState("opinion-analyzed");
      }}
    />
  );
}

function ArgumentMappingWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, setArgumentMappings } = useOpinionStore();
  const { updateWorkflowState } = useCaseStore();
  const responseDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "office-action-response"
  );
  const amendedDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "application" && d.fileName.includes("修改")
  );
  const rejectionGrounds = officeActionAnalysis?.rejectionGrounds ?? [];

  return (
    <ArgumentMappingPanel
      caseId={caseId ?? ""}
      rejectionGrounds={rejectionGrounds}
      responseText={responseDoc?.extractedText ?? ""}
      runAnalysis={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runArgumentAnalysis({
          caseId: caseId ?? "",
          rejectionGrounds,
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        });
      }}
      onComplete={(result) => {
        const now = new Date().toISOString();
        const mappings: ArgumentMapping[] = result.mappings.map((mapping, index) => ({
          id: `argument-${caseId ?? "case"}-${mapping.rejectionGroundCode}-${index}`,
          caseId: caseId ?? "",
          rejectionGroundCode: mapping.rejectionGroundCode,
          applicantArgument: mapping.applicantArgument,
          argumentSummary: mapping.argumentSummary,
          confidence: mapping.confidence,
          status: "draft",
          createdAt: now,
          ...(mapping.amendedClaims ? { amendedClaims: mapping.amendedClaims } : {}),
          ...(mapping.newEvidence ? { newEvidence: mapping.newEvidence } : {})
        }));
        setArgumentMappings(mappings);
        updateWorkflowState("argument-mapped");
      }}
    />
  );
}

function OpinionComparisonWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, argumentMappings, unmappedGrounds, setOfficeActionAnalysis, setArgumentMappings, setUnmappedGrounds } =
    useOpinionStore();
  const { updateWorkflowState } = useCaseStore();
  const officeActionDoc = documents.find((d) => d.caseId === caseId && d.role === "office-action");
  const responseDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "office-action-response"
  );
  const amendedDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "application" && d.fileName.includes("修改")
  );

  const initialOpinionResult = officeActionAnalysis
    ? {
        documentId: officeActionAnalysis.documentId,
        rejectionGrounds: officeActionAnalysis.rejectionGrounds,
        citedReferences: officeActionAnalysis.citedReferences,
        legalCaution: officeActionAnalysis.legalCaution
      }
    : null;

  const initialArgumentResult =
    argumentMappings.length > 0
      ? {
          mappings: argumentMappings.map((m) => ({
            rejectionGroundCode: m.rejectionGroundCode,
            applicantArgument: m.applicantArgument,
            argumentSummary: m.argumentSummary,
            confidence: m.confidence,
            ...(m.amendedClaims ? { amendedClaims: m.amendedClaims } : {}),
            ...(m.newEvidence ? { newEvidence: m.newEvidence } : {})
          })),
          ...(unmappedGrounds.length > 0 ? { unmappedGrounds } : {}),
          legalCaution: "本分析为 AI 辅助候选，需审查员确认。"
        }
      : null;

  return (
    <OpinionComparisonPanel
      caseId={caseId ?? ""}
      officeActionText={officeActionDoc?.extractedText ?? ""}
      documentId={officeActionDoc?.id ?? ""}
      responseText={responseDoc?.extractedText ?? ""}
      rejectionGrounds={officeActionAnalysis?.rejectionGrounds ?? []}
      initialOpinionResult={initialOpinionResult}
      initialArgumentResult={initialArgumentResult}
      runOpinionAnalysis={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runOpinionAnalysis({
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        });
      }}
      runArgumentAnalysis={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runArgumentAnalysis({
          caseId: caseId ?? "",
          rejectionGrounds: officeActionAnalysis?.rejectionGrounds ?? [],
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        });
      }}
      runFullAnalysis={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        const opinionResult = await client.runOpinionAnalysis({
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        });
        const argResult = await client.runArgumentAnalysis({
          caseId: caseId ?? "",
          rejectionGrounds: opinionResult.rejectionGrounds,
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        });
        return { opinionResult, argumentResult: argResult };
      }}
      onOpinionComplete={(result) => {
        const now = new Date().toISOString();
        const analysis: OfficeActionAnalysis = {
          id: `opinion-${caseId ?? "case"}-${Date.now()}`,
          caseId: caseId ?? "",
          documentId: result.documentId,
          rejectionGrounds: result.rejectionGrounds,
          citedReferences: result.citedReferences,
          legalCaution: result.legalCaution,
          status: "draft",
          createdAt: now
        };
        setOfficeActionAnalysis(analysis);
        updateWorkflowState("opinion-analyzed");
      }}
      onArgumentComplete={(result) => {
        const now = new Date().toISOString();
        const mappings: ArgumentMapping[] = result.mappings.map((mapping, index) => ({
          id: `argument-${caseId ?? "case"}-${mapping.rejectionGroundCode}-${index}`,
          caseId: caseId ?? "",
          rejectionGroundCode: mapping.rejectionGroundCode,
          applicantArgument: mapping.applicantArgument,
          argumentSummary: mapping.argumentSummary,
          confidence: mapping.confidence,
          status: "draft",
          createdAt: now,
          ...(mapping.amendedClaims ? { amendedClaims: mapping.amendedClaims } : {}),
          ...(mapping.newEvidence ? { newEvidence: mapping.newEvidence } : {})
        }));
        setArgumentMappings(mappings);
        if (result.unmappedGrounds) setUnmappedGrounds(result.unmappedGrounds);
        updateWorkflowState("argument-mapped");
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
  const { reexamDrafts } = useDraftStore();

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
  const reexamDraft = reexamDrafts[caseId ?? ""] ?? undefined;

  return (
    <ExportPanel
      caseData={currentCase}
      claimFeatures={claimFeatures.filter((f) => f.caseId === caseId)}
      noveltyComparisons={noveltyComparisons}
      differenceFeatureCodes={[...new Set(diffCodes)]}
      pendingSearchQuestions={[...new Set(searchQuestions)]}
      inventiveAnalysis={inventiveAnalysis}
      defects={caseDefects}
      reexamDraft={reexamDraft}
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
      { path: "cases/:caseId/opinion-comparison", element: <OpinionComparisonWrapper /> },
      { path: "cases/:caseId/opinion-analysis", element: <OpinionAnalysisWrapper /> },
      { path: "cases/:caseId/argument-mapping", element: <ArgumentMappingWrapper /> },
      { path: "cases/:caseId/claim-chart", element: <ClaimChartWrapper /> },
      { path: "cases/:caseId/novelty", element: <NoveltyWrapper /> },
      { path: "cases/:caseId/inventive", element: <InventiveWrapper /> },
      { path: "cases/:caseId/defects", element: <DefectWrapper /> },
      { path: "cases/:caseId/draft", element: <DraftWrapper /> },
      { path: "cases/:caseId/summary", element: <SummaryWrapper /> },
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
  const { settings } = useSettingsStore();
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
      runDefectCheck={async (request) => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runDefectCheck(request);
      }}
    />
  );
}

function DraftWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { officeActionAnalysis, argumentMappings } = useOpinionStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { defects } = useDefectsStore();
  const { settings } = useSettingsStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  return (
    <DraftMaterialPanel
      caseId={caseId ?? ""}
      runReexamDraft={async () => {
        const client = new AgentClient(settings.mode, "/api", settings);
        return client.runReexamDraft({
          caseId: caseId ?? "",
          claimNumber,
          rejectionGrounds: officeActionAnalysis?.rejectionGrounds ?? [],
          argumentMappings,
          noveltyResults: JSON.stringify(comparisons.filter((c) => c.caseId === caseId)),
          inventiveResults: JSON.stringify(analyses.filter((a) => a.caseId === caseId)),
          defectResults: JSON.stringify(defects.filter((d) => d.caseId === caseId))
        });
      }}
    />
  );
}

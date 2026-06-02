import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router-dom";
import { useEffect, useMemo, useCallback, useState } from "react";
import type {
  SummaryResponse, NoveltyResponse, InventiveResponse, InterpretResponse,
  TranslateResponse, OpinionAnalysisResponse, ArgumentAnalysisResponse,
  DefectResponse, ReexamDraftResponse
} from "@shared/types/api";
import { createLogger } from "./lib/logger";
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
import { agentRun } from "./lib/agentApi";
import type { ArgumentMapping, OfficeActionAnalysis } from "@shared/types/domain";
import {
  readOpinionAnalysis,
  readArgumentMappings,
  saveOpinionAnalysis,
  saveArgumentMappings
} from "./lib/repos";

export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function ClaimChartWrapper() {
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

export function SummaryWrapper() {
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
        return agentRun<SummaryResponse>("summary", {
          caseId: caseId ?? "",
          caseBaseline: JSON.stringify(currentCase ?? {}),
          confirmedFeatures: JSON.stringify(claimFeatures.filter((f) => f.citationStatus === "confirmed")),
          reviewedNoveltyComparisons: JSON.stringify(comparisons.filter((c) => c.caseId === caseId)),
          inventiveAnalysis: JSON.stringify(analyses.filter((a) => a.caseId === caseId))
        }, settings, caseId ?? "");
      }}
    />
  );
}

const debugNoveltyLog = createLogger("NoveltyWrapper");
const debugInventiveLog = createLogger("InventiveWrapper");
const debugOpinionLog = createLogger("OpinionComparisonWrapper");

export function NoveltyWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { comparisons } = useNoveltyStore();
  const { claimFeatures } = useClaimsStore();
  const { references } = useReferencesStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, argumentMappings } = useOpinionStore();
  const { documents } = useDocumentsStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures.filter((f) => f.caseId === caseId && f.claimNumber === claimNumber);
  const caseRefs = references.filter((r) => r.caseId === caseId);
  const caseComparisons = comparisons.filter((c) => c.caseId === caseId);
  const [selectedComparisonId, setSelectedComparisonId] = useState<string>("");
  const comparisonIds = caseComparisons.map(c => c.id).join(",");

  useEffect(() => {
    const ids = comparisonIds ? comparisonIds.split(",") : [];
    if (ids.length > 0 && !ids.includes(selectedComparisonId)) {
      setSelectedComparisonId(ids[ids.length - 1]!);
    }
    if (ids.length === 0 && selectedComparisonId !== "") {
      setSelectedComparisonId("");
    }
  }, [comparisonIds, selectedComparisonId]);

  // DEBUG: 记录 NoveltyWrapper 状态
  debugNoveltyLog("渲染状态:", {
    caseId,
    claimNumber,
    allReferencesCount: references.length,
    caseRefsCount: caseRefs.length,
    caseRefsIds: caseRefs.map(r => r.id),
    featuresCount: features.length,
    comparisonsCount: caseComparisons.length,
    hasComparisons: caseComparisons.length > 0,
    selectedComparisonId
  });

  const noveltyArgumentCodes = new Set(
    (officeActionAnalysis?.rejectionGrounds ?? [])
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

  const activeComparison = caseComparisons.find(c => c.id === selectedComparisonId);

  const getRefLabel = (referenceId: string) => {
    const ref = caseRefs.find(r => r.id === referenceId);
    return ref?.title ?? ref?.publicationNumber ?? ref?.fileName ?? referenceId;
  };

  return (
    <>
      <NoveltyAgentTrigger
        caseId={caseId ?? ""}
        claimNumber={claimNumber}
        features={features}
        references={caseRefs}
        {...(applicantArguments ? { applicantArguments } : {} as Record<string, never>)}
        {...(amendedClaimText ? { amendedClaimText } : {} as Record<string, never>)}
        runNovelty={async (request, options) => {
          return agentRun<NoveltyResponse>("novelty", request, settings, request.caseId, { signal: options?.signal ?? null });
        }}
      />
      {caseComparisons.length > 0 ? (
        <>
          <div className="novelty-comparison-tabs" data-testid="novelty-comparison-tabs">
            {caseComparisons.map((comp) => (
              <button
                key={comp.id}
                type="button"
                className={`novelty-comparison-tab${comp.id === selectedComparisonId ? " novelty-comparison-tab--active" : ""}`}
                onClick={() => setSelectedComparisonId(comp.id)}
                data-testid={`novelty-tab-${comp.referenceId}`}
              >
                {getRefLabel(comp.referenceId)}
              </button>
            ))}
          </div>
          {activeComparison ? (
            <NoveltyComparisonTable comparisonId={activeComparison.id} />
          ) : null}
        </>
      ) : (
        <div data-testid="novelty-placeholder">
          <p>请先在权利要求特征表中生成特征拆解，然后选择对比文件运行新颖性分析。</p>
        </div>
      )}
    </>
  );
}

export function InventiveWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { references } = useReferencesStore();
  const { officeActionAnalysis, argumentMappings } = useOpinionStore();
  const { settings } = useSettingsStore();
  const claimNumber = currentCase?.targetClaimNumber ?? 1;
  const features = claimFeatures
    .filter((f) => f.caseId === caseId && f.claimNumber === claimNumber)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  const caseRefs = references.filter((r) => r.caseId === caseId);
  
  // DEBUG: Log all references in store and case-specific refs
  debugInventiveLog("[InventiveWrapper] Store references:", {
    allReferencesCount: references.length,
    allReferences: references.map(r => ({ id: r.id, caseId: r.caseId, title: r.title ?? r.fileName })),
    caseId,
    caseRefsCount: caseRefs.length,
    caseRefs: caseRefs.map(r => ({ id: r.id, title: r.title ?? r.fileName, timelineStatus: r.timelineStatus }))
  });
  const inventiveArgumentCodes = new Set(
    (officeActionAnalysis?.rejectionGrounds ?? [])
      .filter((g) => g.category === "inventive")
      .map((g) => g.code)
  );
  const applicantArguments = argumentMappings
    .filter((m) => inventiveArgumentCodes.has(m.rejectionGroundCode))
    .map((m) => `${m.rejectionGroundCode}: ${m.argumentSummary}`)
    .join("\n");
  return (
    <InventiveStepPanel
      caseId={caseId ?? ""}
      claimNumber={claimNumber}
      features={features}
      references={caseRefs}
      applicantArguments={applicantArguments || undefined}
      runInventive={async (request, options) => {
        return agentRun<InventiveResponse>("inventive", request, settings, request.caseId, { signal: options?.signal ?? null });
      }}
    />
  );
}

export function InterpretWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  // Scroll to top when navigating to a new case's interpret page
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [caseId]);
  const { documents } = useDocumentsStore();
  const { references } = useReferencesStore();
  const { settings } = useSettingsStore();
  const interpretDocuments = useMemo(() =>
    Array.from(
      new Map([...documents, ...references].map((doc) => [doc.id, doc])).values()
    )
      .filter((doc) => doc.caseId === caseId)
      .filter((doc) => doc.extractedText.trim().length > 0)
      .map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        role: doc.role,
        documentType:
          doc.role === "office-action"
            ? "office-action" as const
            : doc.role === "office-action-response"
              ? "office-action-response" as const
              : "application" as const,
        text: doc.extractedText
      })),
    [documents, references, caseId]
  );

  const runInterpret = useCallback(async (
    document: Parameters<typeof InterpretPanel>[0]["documents"][0],
    relatedDocuments: Parameters<typeof InterpretPanel>[0]["documents"],
    options?: { signal?: AbortSignal }
  ) => {
    const response = await agentRun<InterpretResponse>("interpret", {
      caseId: caseId ?? "",
      documentId: document.id,
      fileName: document.fileName,
      documentText: document.text,
      documentType: document.documentType,
      relatedDocuments: relatedDocuments.map((doc) => ({
        fileName: doc.fileName,
        documentType: doc.documentType
      }))
    }, settings, caseId ?? "", options?.signal ? { signal: options.signal } : undefined);
    return response.reply;
  }, [caseId, settings]);

  const runTranslate = useCallback(async (text: string) => {
    const response = await agentRun<TranslateResponse>("translate", { caseId: caseId ?? "", documentText: text }, settings, caseId ?? "");
    return response.translatedText;
  }, [caseId, settings]);

  return (
    <InterpretPanel
      caseId={caseId ?? ""}
      documents={interpretDocuments}
      runInterpret={runInterpret}
      runTranslate={runTranslate}
    />
  );
}

export function OpinionAnalysisWrapper() {
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
      runAnalysis={async (options) => {
        return agentRun<OpinionAnalysisResponse>("opinion-analysis", {
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
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

export function ArgumentMappingWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();
  const { officeActionAnalysis, argumentMappings, argumentRanCases, setArgumentMappings, addArgumentRanCase } = useOpinionStore();
  const { updateWorkflowState } = useCaseStore();
  const responseDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "office-action-response"
  );
  const amendedDoc = documents.find(
    (d) => d.caseId === caseId && d.role === "application" && d.fileName.includes("修改")
  );
  const rejectionGrounds = officeActionAnalysis?.rejectionGrounds ?? [];

  const initialResult = (argumentMappings.length > 0 || (caseId && argumentRanCases.includes(caseId)))
    ? {
        mappings: argumentMappings.map((m) => ({
          rejectionGroundCode: m.rejectionGroundCode,
          applicantArgument: m.applicantArgument,
          argumentSummary: m.argumentSummary,
          confidence: m.confidence,
          ...(m.amendedClaims ? { amendedClaims: m.amendedClaims } : {}),
          ...(m.newEvidence ? { newEvidence: m.newEvidence } : {})
        })),
        legalCaution: "本分析为 AI 辅助候选，需审查员确认。"
      }
    : null;

  return (
    <ArgumentMappingPanel
      caseId={caseId ?? ""}
      rejectionGrounds={rejectionGrounds}
      responseText={responseDoc?.extractedText ?? ""}
      initialResult={initialResult}
      runAnalysis={async (options) => {
        return agentRun<ArgumentAnalysisResponse>("argument-analysis", {
          caseId: caseId ?? "",
          rejectionGrounds,
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
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
        addArgumentRanCase(caseId ?? "");
        updateWorkflowState("argument-mapped");
      }}
    />
  );
}

export function OpinionComparisonWrapper() {
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

  // Load opinion data from IndexedDB on mount
  useEffect(() => {
    if (!caseId) return;
    
    async function loadOpinionData() {
      try {
        // Only load from IndexedDB if not already in memory store
        const storedAnalysis = await readOpinionAnalysis(caseId);
        if (storedAnalysis && !officeActionAnalysis) {
          setOfficeActionAnalysis(storedAnalysis);
        }

        const storedMappings = await readArgumentMappings(caseId);
        if (storedMappings.length > 0 && argumentMappings.length === 0) {
          setArgumentMappings(storedMappings);
        }
      } catch (err) {
        debugOpinionLog("Failed to load from IndexedDB:", err);
      }
    }
    
    loadOpinionData();
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      runOpinionAnalysis={async (options) => {
        return agentRun<OpinionAnalysisResponse>("opinion-analysis", {
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
      }}
      runArgumentAnalysis={async (options) => {
        return agentRun<ArgumentAnalysisResponse>("argument-analysis", {
          caseId: caseId ?? "",
          rejectionGrounds: officeActionAnalysis?.rejectionGrounds ?? [],
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
      }}
      runFullAnalysis={async (options) => {
        const opinionResult = await agentRun<OpinionAnalysisResponse>("opinion-analysis", {
          caseId: caseId ?? "",
          documentId: officeActionDoc?.id ?? "office-action",
          officeActionText: officeActionDoc?.extractedText ?? ""
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
        const argResult = await agentRun<ArgumentAnalysisResponse>("argument-analysis", {
          caseId: caseId ?? "",
          rejectionGrounds: opinionResult.rejectionGrounds ?? [],
          responseText: responseDoc?.extractedText ?? "",
          ...(amendedDoc?.extractedText ? { amendedClaimsText: amendedDoc.extractedText } : {})
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
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
        // Persist to IndexedDB
        saveOpinionAnalysis(analysis).catch((err) => {
          debugOpinionLog("Failed to save opinion analysis:", err);
        });
      }}
      onArgumentComplete={(result) => {
        const now = new Date().toISOString();
        const mappings: ArgumentMapping[] = (result?.mappings ?? []).map((mapping, index) => ({
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
        if (result?.unmappedGrounds) setUnmappedGrounds(result.unmappedGrounds);
        updateWorkflowState("argument-mapped");
        // Persist to IndexedDB
        saveArgumentMappings(mappings).catch((err) => {
          debugOpinionLog("Failed to save argument mappings:", err);
        });
      }}
    />
  );
}

export function ExportWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { currentCase } = useCaseStore();
  const { claimFeatures } = useClaimsStore();
  const { comparisons } = useNoveltyStore();
  const { analyses } = useInventiveStore();
  const { defects } = useDefectsStore();
  const { reexamDrafts, summaries } = useDraftStore();

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
  const summary = summaries[caseId ?? ""] ?? undefined;

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
      summary={summary}
    />
  );
}

export function DefectWrapper() {
  const { caseId } = useParams<{ caseId: string }>();
  const { claimNodes, claimFeatures } = useClaimsStore();
  const { documents } = useDocumentsStore();
  const { settings } = useSettingsStore();

  const appDoc = documents.find((d) => d.caseId === caseId && d.role === "application");
  const specificationText = appDoc?.extractedText ?? "";
  const caseNodes = claimNodes.filter((n) => n.caseId === caseId);
  const claimText = caseNodes.map((n) => n.rawText).join("\n");
  const features = claimFeatures
    .filter((f) => f.caseId === caseId)
    .map((f) => ({ featureCode: f.featureCode, description: f.description }));
  return (
    <DefectPanel
      key={`defect-${caseId}`}
      caseId={caseId ?? ""}
      claimText={claimText}
      specificationText={specificationText}
      claimFeatures={features}
      runDefectCheck={async (request, options) => {
        return agentRun<DefectResponse>("defects", request, settings, request.caseId, { signal: options?.signal ?? null });
      }}
    />
  );
}

export function DraftWrapper() {
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
      runReexamDraft={async (options) => {
        return agentRun<ReexamDraftResponse>("reexam-draft", {
          caseId: caseId ?? "",
          claimNumber,
          rejectionGrounds: officeActionAnalysis?.rejectionGrounds ?? [],
          argumentMappings,
          noveltyResults: JSON.stringify(comparisons.filter((c) => c.caseId === caseId)),
          inventiveResults: JSON.stringify(analyses.filter((a) => a.caseId === caseId)),
          defectResults: JSON.stringify(defects.filter((d) => d.caseId === caseId))
        }, settings, caseId ?? "", { signal: options?.signal ?? null });
      }}
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

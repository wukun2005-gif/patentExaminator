import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { detectLanguage, LANGUAGE_LABELS } from "../../lib/languageDetect";
import { LEGACY_INTERPRET_KEY, useInterpretStore } from "../../store";
import type { DocumentFigure, SourceDocument } from "@shared/types/domain";
import { FigureExtractPanel } from "./FigureExtractPanel";
import { renderMarkdown } from "../../lib/markdown";
import { AiGatewayError, type AiErrorType } from "../../agent/contracts";
import { formatAiErrorMessage } from "../../lib/errorDisplay";

export type InterpretDocumentType = "application" | "office-action" | "office-action-response";

export const DOCUMENT_TYPE_LABELS: Record<InterpretDocumentType, string> = {
  application: "专利申请文件",
  "office-action": "审查意见通知书",
  "office-action-response": "意见陈述书"
};

type InterpretDocumentRole = SourceDocument["role"];

const ROLE_ORDER: InterpretDocumentRole[] = [
  "application",
  "office-action",
  "office-action-response",
  "reference"
];

const ROLE_SECTION_LABELS: Record<InterpretDocumentRole, string> = {
  application: "申请文件",
  "office-action": "审查意见通知书",
  "office-action-response": "意见陈述书",
  reference: "对比文件"
};

const INTERPRET_COLLAPSE_KEY = "pex-interpret-expanded";

export interface InterpretableDocument {
  id: string;
  fileName: string;
  role: InterpretDocumentRole;
  documentType: InterpretDocumentType;
  text: string;
  figures?: DocumentFigure[];
}

interface InterpretPanelProps {
  caseId: string;
  documents: InterpretableDocument[];
  runInterpret: (
    document: InterpretableDocument,
    relatedDocuments: InterpretableDocument[],
    options?: { signal?: AbortSignal }
  ) => Promise<string>;
  runTranslate?: (text: string) => Promise<string>;
}

interface DocumentCardState {
  summary: string;
  error: string | null;
  isLoading: boolean;
  sourceLanguage: "zh" | "en" | "other";
  translatedText: string;
  isTranslating: boolean;
  translateError: string | null;
  showOriginal: boolean;
  previewMode: boolean;
}

type ExpandedStateMap = Record<string, boolean>;

const EMPTY_CARD_STATE: DocumentCardState = {
  summary: "",
  error: null,
  isLoading: false,
  sourceLanguage: "zh",
  translatedText: "",
  isTranslating: false,
  translateError: null,
  showOriginal: false,
  previewMode: false
};

export function buildExpandedStateStorageKey(caseId: string) {
  return `${INTERPRET_COLLAPSE_KEY}:${caseId}`;
}

export function readExpandedState(caseId: string): ExpandedStateMap {
  try {
    const raw = localStorage.getItem(buildExpandedStateStorageKey(caseId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed ? parsed as ExpandedStateMap : {};
  } catch {
    return {};
  }
}

export function writeExpandedState(caseId: string, state: ExpandedStateMap) {
  try {
    localStorage.setItem(buildExpandedStateStorageKey(caseId), JSON.stringify(state));
  } catch {
    // Ignore localStorage write failures and fall back to in-memory state.
  }
}

export { formatAiErrorMessage } from "../../lib/errorDisplay";

export function buildCombinedSummarySections(
  groupedDocuments: Array<{ role: InterpretDocumentRole; title: string; documents: InterpretableDocument[] }>,
  cardStates: Record<string, DocumentCardState>
) {
  return groupedDocuments
    .map((group) => {
      const groupSections = group.documents
        .map((doc) => {
          const summary = cardStates[doc.id]?.summary?.trim();
          if (!summary) return null;
          return `### ${doc.fileName}\n${summary}`;
        })
        .filter(Boolean);
      if (groupSections.length === 0) return null;
      return `## ${group.title}\n\n${groupSections.join("\n\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function InterpretPanel({
  caseId,
  documents,
  runInterpret,
  runTranslate
}: InterpretPanelProps) {
  const { interpretSummaries, setInterpretSummary } = useInterpretStore();
  const persistedSummaries = interpretSummaries[caseId] ?? {};
  const [cardStates, setCardStates] = useState<Record<string, DocumentCardState>>({});
  const [expandedDocuments, setExpandedDocuments] = useState<ExpandedStateMap>({});
  const [isCombinedReinterpreting, setIsCombinedReinterpreting] = useState(false);
  const [systemicError, setSystemicError] = useState<{ message: string; guidance: string } | null>(null);
  const autoTriggered = useRef<Record<string, boolean>>({});
  const translateTriggered = useRef<Record<string, boolean>>({});
  // Track in-flight requests for cancellation on unmount
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  const groupedDocuments = useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        role,
        title: ROLE_SECTION_LABELS[role],
        documents: documents.filter((doc) => doc.role === role)
      })).filter((group) => group.documents.length > 0),
    [documents]
  );

  useEffect(() => {
    const persistedExpanded = readExpandedState(caseId);
    const nextStates: Record<string, DocumentCardState> = {};
    const nextExpanded: ExpandedStateMap = {};
    for (const doc of documents) {
      const persistedSummary = persistedSummaries[doc.id];
      const legacySummary = doc.role === "application" ? persistedSummaries[LEGACY_INTERPRET_KEY] : undefined;
      nextStates[doc.id] = {
        ...EMPTY_CARD_STATE,
        summary: persistedSummary ?? legacySummary ?? cardStates[doc.id]?.summary ?? ""
      };
      nextExpanded[doc.id] = persistedExpanded[doc.id] ?? false;
      autoTriggered.current[doc.id] = Boolean(persistedSummary ?? legacySummary);
      translateTriggered.current[doc.id] = false;
    }
    setCardStates(nextStates);
    setExpandedDocuments(nextExpanded);
  }, [caseId, documents, persistedSummaries]);

  useEffect(() => {
    writeExpandedState(caseId, expandedDocuments);
  }, [caseId, expandedDocuments]);

  // Detect systemic errors: when all documents fail with the same error type
  useEffect(() => {
    const docIds = documents.map((d) => d.id);
    if (docIds.length === 0) {
      setSystemicError(null);
      return;
    }
    const errors = docIds
      .map((id) => cardStates[id]?.error)
      .filter(Boolean);
    if (errors.length !== docIds.length) {
      setSystemicError(null);
      return;
    }
    const errorTypes = errors
      .map((e) => formatAiErrorMessage(e ?? "").type);
    const nonOtherTypes = errorTypes
      .filter((t): t is Exclude<AiErrorType, "other"> => t !== "other");
    if (nonOtherTypes.length === docIds.length) {
      const dominantType = nonOtherTypes[0] as AiErrorType;
      const allSame = nonOtherTypes.every((t) => t === dominantType);
      if (allSame) {
        const formatted = formatAiErrorMessage(new AiGatewayError(dominantType, ""));
        setSystemicError({ message: formatted.message, guidance: formatted.guidance });
        return;
      }
    }
    setSystemicError(null);
  }, [cardStates, documents]);

  // Cleanup: cancel all in-flight requests on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Abort all in-flight requests
      abortControllersRef.current.forEach((controller, docId) => {
        controller.abort();
        console.log(`[InterpretPanel] Aborted request for document ${docId} on unmount`);
      });
      abortControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    documents.forEach((doc) => {
      const lang = detectLanguage(doc.text);
      setCardStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] ?? EMPTY_CARD_STATE),
          sourceLanguage: lang
        }
      }));

      if (lang !== "zh" && runTranslate && !translateTriggered.current[doc.id]) {
        translateTriggered.current[doc.id] = true;
        void doTranslate(doc);
      }

      if (
        doc.text &&
        !persistedSummaries[doc.id] &&
        !(doc.role === "application" && persistedSummaries[LEGACY_INTERPRET_KEY]) &&
        !autoTriggered.current[doc.id]
      ) {
        autoTriggered.current[doc.id] = true;
        void doInterpret(doc);
      }
    });
  }, [documents, persistedSummaries, runTranslate]);

  const doTranslate = async (doc: InterpretableDocument) => {
    if (!runTranslate) return;
    setCardStates((prev) => ({
      ...prev,
      [doc.id]: {
        ...(prev[doc.id] ?? EMPTY_CARD_STATE),
        isTranslating: true,
        translateError: null
      }
    }));

    try {
      const translatedText = await runTranslate(doc.text);
      setCardStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] ?? EMPTY_CARD_STATE),
          translatedText,
          isTranslating: false
        }
      }));
    } catch (err) {
      setCardStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] ?? EMPTY_CARD_STATE),
          isTranslating: false,
          translateError: `翻译失败: ${err instanceof Error ? err.message : String(err)}`
        }
      }));
    }
  };

  const doInterpret = useCallback(async (doc: InterpretableDocument) => {
    // Cancel any existing request for this document
    const existingController = abortControllersRef.current.get(doc.id);
    if (existingController) {
      existingController.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllersRef.current.set(doc.id, controller);

    setCardStates((prev) => ({
      ...prev,
      [doc.id]: {
        ...(prev[doc.id] ?? EMPTY_CARD_STATE),
        isLoading: true,
        error: null
      }
    }));

    try {
      const response = await runInterpret(
        doc,
        documents.filter((item) => item.id !== doc.id),
        { signal: controller.signal }
      );

      // Check if component is still mounted and request wasn't aborted
      if (!isMountedRef.current || controller.signal.aborted) {
        return;
      }

      // Clear the AbortController since request completed
      abortControllersRef.current.delete(doc.id);

      setCardStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] ?? EMPTY_CARD_STATE),
          summary: response,
          isLoading: false
        }
      }));
      setInterpretSummary(caseId, doc.id, response);
    } catch (err) {
      // Don't show error if request was aborted (user navigated away)
      if (controller.signal.aborted) {
        return;
      }

      // Clear the AbortController
      abortControllersRef.current.delete(doc.id);

      // Only update state if component is still mounted
      if (!isMountedRef.current) {
        return;
      }

      setCardStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...(prev[doc.id] ?? EMPTY_CARD_STATE),
          isLoading: false,
          error: `解读失败: ${err instanceof Error ? err.message : String(err)}`
        }
      }));
    }
  }, [caseId, documents, runInterpret, setInterpretSummary]);

  const updateSummary = (documentId: string, summary: string) => {
    setCardStates((prev) => ({
      ...prev,
      [documentId]: {
        ...(prev[documentId] ?? EMPTY_CARD_STATE),
        summary
      }
    }));
    setInterpretSummary(caseId, documentId, summary);
  };

  const toggleOriginal = (documentId: string) => {
    setCardStates((prev) => ({
      ...prev,
      [documentId]: {
        ...(prev[documentId] ?? EMPTY_CARD_STATE),
        showOriginal: !prev[documentId]?.showOriginal
      }
    }));
  };

  const updateTranslatedText = (documentId: string, translatedText: string) => {
    setCardStates((prev) => ({
      ...prev,
      [documentId]: {
        ...(prev[documentId] ?? EMPTY_CARD_STATE),
        translatedText
      }
    }));
  };

  const toggleDocumentExpanded = (documentId: string) => {
    setExpandedDocuments((prev) => ({
      ...prev,
      [documentId]: !prev[documentId]
    }));
  };

  const togglePreviewMode = (documentId: string) => {
    setCardStates((prev) => ({
      ...prev,
      [documentId]: {
        ...(prev[documentId] ?? EMPTY_CARD_STATE),
        previewMode: !prev[documentId]?.previewMode
      }
    }));
  };

  const summarySections = buildCombinedSummarySections(groupedDocuments, cardStates);

  return (
    <div className="interpret-panel" data-testid="interpret-panel">
      <h2>文档解读</h2>

      {documents.length === 0 ? (
        <p data-testid="no-document">请先上传需要解读的案件文件。</p>
      ) : (
        <>
          <section className="interpret-overview" data-testid="interpret-overview">
            <h3>案件文件总览</h3>
          {systemicError && (
            <div className="interpret-systemic-error" style={{
              background: "#fff3f3",
              border: "1px solid #e00",
              borderRadius: 6,
              padding: "12px 16px",
              marginBottom: 16,
              color: "#c00"
            }} data-testid="interpret-systemic-error">
              <strong style={{ fontSize: "1.1em" }}>{systemicError.message}</strong>
              <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.9em" }}>{systemicError.guidance}</p>
            </div>
          )}

          {groupedDocuments.map((group) => (
              <div key={group.role} className="interpret-overview__group">
                <strong>{group.title}</strong>
                <ul>
                  {group.documents.map((doc) => (
                    <li key={doc.id}>{doc.fileName}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {summarySections && (
            <section className="interpret-overview" data-testid="interpret-combined-summary">
              <h3>综合解读汇总</h3>
              <div
                className="interpret-summary interpret-summary--combined interpret-summary--rendered"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(summarySections) }}
              />
              <div className="interpret-main__actions">
                <button
                  type="button"
                  onClick={async () => {
                    setIsCombinedReinterpreting(true);
                    try {
                      // Re-run interpretation for each document sequentially
                      // to avoid overwhelming the API
                      for (const doc of documents) {
                        if (isMountedRef.current) {
                          await doInterpret(doc);
                        }
                      }
                    } finally {
                      if (isMountedRef.current) {
                        setIsCombinedReinterpreting(false);
                      }
                    }
                  }}
                  disabled={isCombinedReinterpreting}
                  data-testid="btn-reinterpret-combined"
                >
                  {isCombinedReinterpreting ? "重新解读中…" : "重新解读"}
                </button>
              </div>
            </section>
          )}

          {groupedDocuments.map((group) => (
            <section key={group.role} className="interpret-group" data-testid={`interpret-group-${group.role}`}>
              <h3>{group.title}</h3>
              {group.documents.map((doc) => {
                const state = cardStates[doc.id] ?? EMPTY_CARD_STATE;
                const needsTranslation = state.sourceLanguage !== "zh";
                const isExpanded = expandedDocuments[doc.id] ?? false;

                return (
                  <article key={doc.id} className="interpret-main" data-testid={`interpret-doc-${doc.id}`}>
                    <div className="interpret-main__header">
                      <div>
                        <h4>{doc.fileName}</h4>
                        <span className="interpret-main__hint">{DOCUMENT_TYPE_LABELS[doc.documentType]}</span>
                      </div>
                      <div className="interpret-main__header-actions">
                        <span className="interpret-main__hint">可直接编辑内容 · 自动保存</span>
                        <button
                          type="button"
                          className="interpret-main__toggle"
                          onClick={() => toggleDocumentExpanded(doc.id)}
                          aria-expanded={isExpanded}
                          data-testid={`toggle-interpret-doc-${doc.id}`}
                        >
                          {isExpanded ? "收起" : "展开"}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <>
                        {needsTranslation && (
                          <div className="interpret-translation" data-testid={`interpret-translation-${doc.id}`}>
                            <div className="interpret-translation__header">
                              <h4>中文翻译</h4>
                              <span className="interpret-translation__lang" data-testid={`source-language-${doc.id}`}>
                                源语言: {LANGUAGE_LABELS[state.sourceLanguage] ?? state.sourceLanguage}
                              </span>
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => toggleOriginal(doc.id)}
                                data-testid={`btn-toggle-original-${doc.id}`}
                              >
                                {state.showOriginal ? "收起原文" : "查看原文"}
                              </button>
                            </div>

                            {state.showOriginal && (
                              <div className="interpret-translation__original" data-testid={`original-text-${doc.id}`}>
                                <pre>{doc.text.slice(0, 5000)}{doc.text.length > 5000 ? "\n…（原文过长，已截断）" : ""}</pre>
                              </div>
                            )}

                            <textarea
                              className="interpret-translation__textarea"
                              value={state.translatedText}
                              onChange={(e) => updateTranslatedText(doc.id, e.target.value)}
                              placeholder={state.isTranslating ? "翻译中…" : "中文翻译结果将显示在此处。"}
                              data-testid={`translated-text-${doc.id}`}
                              readOnly={state.isTranslating}
                            />

                            {state.translateError && (
                              <p className="extract-error" data-testid={`translate-error-${doc.id}`} style={{ color: "#c00", fontSize: "0.9em", margin: "4px 0" }}>
                                {state.translateError}
                              </p>
                            )}

                            <button
                              type="button"
                              onClick={() => void doTranslate(doc)}
                              disabled={!runTranslate || state.isTranslating}
                              data-testid={`btn-retranslate-${doc.id}`}
                            >
                              {state.isTranslating ? "翻译中…" : "重新翻译"}
                            </button>
                          </div>
                        )}

                        {doc.figures && doc.figures.length > 0 && (
                          <FigureExtractPanel figures={doc.figures} />
                        )}

                        {state.previewMode ? (
                          <div
                            className="interpret-summary interpret-summary--rendered"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(state.summary) }}
                          />
                        ) : (
                          <textarea
                            className="interpret-summary"
                            value={state.summary}
                            onChange={(e) => updateSummary(doc.id, e.target.value)}
                            placeholder={state.isLoading ? "AI 解读中…" : "AI 解读结果将显示在此处。"}
                            data-testid={`interpret-summary-${doc.id}`}
                            readOnly={state.isLoading}
                          />
                        )}
                        {state.error && (() => {
                          const formatted = formatAiErrorMessage(
                            state.error.startsWith("解读失败: ") && state.error.includes("AI")
                              ? new Error(state.error.replace("解读失败: ", ""))
                              : state.error
                          );
                          const colorMap: Record<string, string> = {
                            quota: "#e65100",
                            auth: "#c00",
                            timeout: "#c00",
                            network: "#c00",
                            structure: "#c00",
                            other: "#c00"
                          };
                          return (
                            <div style={{
                              background: "#fff3f3",
                              border: `1px solid ${colorMap[formatted.type] ?? "#c00"}`,
                              borderRadius: 4,
                              padding: "8px 12px",
                              margin: "4px 0"
                            }} data-testid={`interpret-error-${doc.id}`}>
                              <strong style={{ color: colorMap[formatted.type] ?? "#c00" }}>
                                {formatted.message}
                              </strong>
                              <p style={{ margin: "4px 0 0", color: "#555", fontSize: "0.85em" }}>
                                {formatted.guidance}
                              </p>
                            </div>
                          );
                        })()}
                        <div className="interpret-main__actions">
                          <span className="interpret-main__hint">内容自动保存</span>
                          {state.summary && (
                            <button
                              type="button"
                              onClick={() => togglePreviewMode(doc.id)}
                              data-testid={`interpret-preview-btn-${doc.id}`}
                            >
                              {state.previewMode ? "编辑" : "预览"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void doInterpret(doc)}
                            disabled={!doc.text || state.isLoading}
                            data-testid={`btn-reinterpret-${doc.id}`}
                          >
                            {state.isLoading ? "解读中…" : "重新解读"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="interpret-main__collapsed" data-testid={`interpret-collapsed-${doc.id}`}>
                        <span className="interpret-main__hint">
                          {state.summary.trim()
                            ? "已生成解读，点击展开查看和编辑。"
                            : state.isLoading
                              ? "AI 解读中，完成后可展开查看。"
                              : state.error
                                ? "解读失败，点击展开查看详情。"
                                : "尚未开始解读。"}
                        </span>
                        {!state.isLoading && (
                          <button
                            type="button"
                            onClick={() => void doInterpret(doc)}
                            disabled={!doc.text}
                            data-testid={`btn-reinterpret-collapsed-${doc.id}`}
                          >
                            重新解读
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

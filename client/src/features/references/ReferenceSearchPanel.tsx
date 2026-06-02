import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import type { ReferenceDocument, SourceDocument } from "@shared/types/domain";
import type { SearchReferencesCandidate, SearchReferencesResponse } from "@shared/types/api";
import { classifyReferenceDate } from "../../lib/dateRules";
import { TimelineStatusBadge } from "../../components/TimelineStatusBadge";
import { useReferencesStore, useCaseStore, useSettingsStore } from "../../store";
import { createDocument } from "../../lib/repos";
import { getLatestSearchSession, createSearchSession, updateSearchSession } from "../../lib/repos";
import { searchReferences as _searchReferences, extractSearchTerms, searchWithTerms } from "../../lib/repos";
import { ErrorBanner } from "../../lib/errorDisplay";

interface ReferenceSearchPanelProps {
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
}

export function ReferenceSearchPanel({ claimText, features }: ReferenceSearchPanelProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const {
    candidates, setCandidates, acceptCandidate, rejectCandidate,
    isSearching, setIsSearching,
    searchTerms, setSearchTerms,
    searchStep, setSearchStep,
    searchSessionId, setSearchSessionId,
    providerResults, setProviderResults,
    addSearchTerm, updateSearchTerm, removeSearchTerm
  } = useReferencesStore();
  const { references } = useReferencesStore();
  const { currentCase } = useCaseStore();
  const { settings } = useSettingsStore();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Stable keys for search terms (survives deletions from middle)
  const termKeysRef = useRef<string[]>([]);
  if (termKeysRef.current.length !== searchTerms.length) {
    const prev = termKeysRef.current;
    termKeysRef.current = searchTerms.map((_, i) => prev[i] ?? crypto.randomUUID());
  }
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach((controller) => {
        controller.abort();
      });
      controllers.clear();
    };
  }, []);

  const baselineDate = currentCase?.priorityDate ?? currentCase?.applicationDate;
  const MAX_REFERENCES = 10;
  const remaining = MAX_REFERENCES - references.length;

  // 恢复历史检索会话
  useEffect(() => {
    if (!caseId) return;
    (async () => {
      try {
        const session = await getLatestSearchSession(caseId);
        if (session && session.searchTerms.length > 0) {
          setSearchTerms(session.searchTerms);
          setProviderResults(session.providerResults);
          setSearchSessionId(session.id);
          setSearchStep("done");
        }
      } catch (e) {
        console.warn("Failed to restore search session:", e);
      }
    })();
  }, [caseId, setSearchTerms, setProviderResults, setSearchSessionId, setSearchStep]);

  // Step 1: 提取检索词
  const handleExtractTerms = useCallback(async () => {
    if (!claimText.trim()) {
      setError("请先上传申请文件并提取权利要求。");
      return;
    }
    const controller = new AbortController();
    abortControllersRef.current.set("extractTerms", controller);
    setError("");
    setSearchStep("extracting");

    try {
      const res = await extractSearchTerms({
        caseId: caseId ?? "",
        claimText,
        features
      }, settings);
      if (!isMountedRef.current) return;
      if (!res.ok || res.queries.length === 0) {
        setError(res.error || "AI 提取检索词失败。");
        setSearchStep("idle");
        return;
      }
      setSearchTerms(res.queries);
      setSearchStep("editing");
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(String(err));
      setSearchStep("idle");
    } finally {
      abortControllersRef.current.delete("extractTerms");
    }
  }, [claimText, features, caseId, settings, setSearchTerms, setSearchStep]);

  // Step 2: 用编辑后的检索词执行搜索
  const handleSearchWithTerms = useCallback(async () => {
    if (searchTerms.length === 0) {
      setError("请至少保留一条检索词。");
      return;
    }

    const enabledSearchProviders = (settings.searchProviders ?? []).filter((p) => p.enabled && p.apiKeyRef);
    if (enabledSearchProviders.length === 0) {
      setError("未配置搜索 API。请在设置→专利搜索中配置搜索服务的 API Key。");
      return;
    }

    setError("");
    setIsSearching(true);
    setSearchStep("searching");
    setCandidates([]);
    setProviderResults([]);

    const controller = new AbortController();
    abortControllersRef.current.set("searchWithTerms", controller);
    try {
      const maxResults = MAX_REFERENCES - references.length;
      const perProvider = Math.max(3, Math.ceil(maxResults / enabledSearchProviders.length));

      const responses = await Promise.all(
        enabledSearchProviders.map((sp) =>
          searchWithTerms({
            caseId: caseId ?? "",
            claimText,
            features,
            searchQueries: searchTerms,
            maxResults: perProvider,
            searchProviderId: sp.providerId,
            searchApiKey: sp.apiKeyRef,
            ...(sp.baseUrl ? { searchBaseUrl: sp.baseUrl } : {})
          }, settings).catch((err): SearchReferencesResponse => ({
            ok: false,
            candidates: [],
            error: String(err)
          }))
        )
      );

      if (!isMountedRef.current) return;
      // 收集每个 provider 的结果
      const allProviderResults: typeof providerResults = [];
      const okResponses: SearchReferencesResponse[] = [];

      for (let i = 0; i < responses.length; i++) {
        const r = responses[i]!;
        const sp = enabledSearchProviders[i]!;
        if (r.ok) {
          okResponses.push(r);
          // 从 searchSummary.providerResults 取，或自行构建
          const pr = r.searchSummary?.providerResults?.[0];
          allProviderResults.push({
            providerId: sp.providerId,
            providerName: pr?.providerName ?? sp.name ?? sp.providerId,
            resultCount: pr?.resultCount ?? r.candidates.length,
            candidateCount: r.candidates.length
          });
        } else {
          allProviderResults.push({
            providerId: sp.providerId,
            providerName: sp.name ?? sp.providerId,
            resultCount: 0,
            candidateCount: 0
          });
        }
      }

      setProviderResults(allProviderResults);

      if (okResponses.length === 0) {
        setError(responses.map((r) => r.error).filter(Boolean).join("; ") || "检索失败，请稍后重试。");
        setSearchStep("editing");
        return;
      }

      // 合并去重
      const seen = new Set<string>();
      const merged: ReferenceDocument[] = [];
      for (const res of okResponses) {
        for (const c of res.candidates) {
          if (seen.has(c.publicationNumber)) continue;
          seen.add(c.publicationNumber);
          merged.push(candidateToReference(c, caseId ?? ""));
          if (merged.length >= maxResults) break;
        }
        if (merged.length >= maxResults) break;
      }
      setCandidates(merged);
      setSearchStep("done");

      // 持久化到 IndexedDB
      const sessionData = {
        id: searchSessionId ?? `search-${caseId}-${Date.now()}`,
        caseId: caseId ?? "",
        searchTerms,
        providerResults: allProviderResults,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (searchSessionId) {
        await updateSearchSession(sessionData);
      } else {
        await createSearchSession(sessionData);
        if (!isMountedRef.current) return;
        setSearchSessionId(sessionData.id);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(String(err));
      setSearchStep("editing");
    } finally {
      if (isMountedRef.current) setIsSearching(false);
      abortControllersRef.current.delete("searchWithTerms");
    }
  }, [searchTerms, caseId, claimText, features, settings, searchSessionId, references.length,
      setIsSearching, setSearchStep, setCandidates, setProviderResults, setSearchSessionId]);

  // 回到编辑模式
  const handleBackToEdit = useCallback(() => {
    setSearchStep("editing");
    setError("");
  }, [setSearchStep]);

  const handleAccept = async (candidateId: string) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;
    const controller = new AbortController();
    abortControllersRef.current.set(`accept-${candidateId}`, controller);
    const timelineStatus = classifyReferenceDate(baselineDate, candidate.publicationDate, candidate.publicationDateConfidence);
    try {
      await createDocument({ ...candidate, timelineStatus } as SourceDocument);
      if (!isMountedRef.current) return;
      acceptCandidate(candidateId);
    } finally {
      abortControllersRef.current.delete(`accept-${candidateId}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = candidates.slice(0, remaining);
    if (selected.size === selectable.length) setSelected(new Set());
    else setSelected(new Set(selectable.map((c) => c.id)));
  };

  const handleBatchAccept = async () => {
    const controller = new AbortController();
    abortControllersRef.current.set("batchAccept", controller);
    try {
      const ids = candidates.filter((c) => selected.has(c.id)).slice(0, remaining).map((c) => c.id);
      for (const id of ids) await handleAccept(id);
      if (!isMountedRef.current) return;
      setSelected(new Set());
    } finally {
      abortControllersRef.current.delete("batchAccept");
    }
  };

  return (
    <div className="reference-search-panel" data-testid="reference-search-panel">
      <div className="search-header">
        <h3>AI 辅助检索</h3>
      </div>

      {remaining <= 0 && (
        <p className="search-hint">已达到文献数量上限（{MAX_REFERENCES}篇），无法继续检索。</p>
      )}

      {error && <ErrorBanner error={error} data-testid="search-error" />}

      {/* ─── Step 1: 提取检索词按钮 ─── */}
      {searchStep === "idle" && (
        <div className="search-step-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleExtractTerms}
            disabled={remaining <= 0}
            data-testid="btn-ai-search"
          >
            AI 检索候选文献
          </button>
        </div>
      )}

      {searchStep === "extracting" && (
        <p className="search-hint">正在提取检索词...</p>
      )}

      {/* ─── Step 1.5: 编辑检索词 ─── */}
      {searchStep === "editing" && (
        <div className="search-terms-editor" data-testid="search-terms-editor">
          <p style={{ fontSize: "var(--pex-font-size-body-sm)", color: "var(--pex-color-text-secondary)", margin: "0 0 8px" }}>
            AI 生成了 {searchTerms.length} 条检索词，您可以编辑后确认检索：
          </p>
          {searchTerms.map((term, idx) => (
            <div key={termKeysRef.current[idx]} className="search-term-row">
              <span className="query-index" style={{ minWidth: 20, textAlign: "right", color: "var(--pex-color-text-muted)", fontSize: "var(--pex-font-size-caption)" }}>
                {idx + 1}.
              </span>
              <input
                type="text"
                value={term}
                onChange={(e) => updateSearchTerm(idx, e.target.value)}
                data-testid={`search-term-input-${idx}`}
              />
              <button
                type="button"
                className="search-term-delete"
                onClick={() => removeSearchTerm(idx)}
                title="删除此检索词"
                data-testid={`search-term-delete-${idx}`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="search-terms-actions">
            <button
              type="button"
              className="btn-add-term"
              onClick={() => addSearchTerm("")}
              data-testid="btn-add-term"
            >
              + 添加检索词
            </button>
          </div>
          <div className="search-step-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSearchWithTerms}
              disabled={searchTerms.filter((t) => t.trim()).length === 0}
              data-testid="btn-confirm-search"
            >
              确认检索
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (searchSessionId) {
                  setSearchStep("done");
                } else {
                  setSearchStep("idle");
                  setSearchTerms([]);
                }
                setError("");
              }}
              data-testid="btn-cancel-search"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {searchStep === "searching" && (
        <p className="search-hint">正在检索中...</p>
      )}

      {/* ─── Step 2.5: 搜索完成 — 显示结果和操作按钮 ─── */}
      {searchStep === "done" && searchTerms.length > 0 && (
        <>
          {/* 检索词摘要 */}
          <div className="search-summary" data-testid="search-summary">
            <p className="search-summary-text">
              使用 {searchTerms.length} 条检索词完成检索
            </p>
            <div className="query-details" data-testid="query-details" style={{ borderTop: "none", marginTop: 4 }}>
              {searchTerms.map((query, idx) => (
                <div key={termKeysRef.current[idx] ?? idx} className="query-item">
                  <span className="query-index">{idx + 1}.</span>
                  <span className="query-text">{query}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 逐 Provider 结果计数 */}
          {providerResults.length > 0 && (
            <div className="provider-results-summary" data-testid="provider-results-summary">
              {providerResults.map((pr) => (
                <span
                  key={pr.providerId}
                  className={`provider-result-badge${pr.resultCount === 0 ? " provider-result-badge--zero" : ""}`}
                  data-testid={`provider-result-${pr.providerId}`}
                >
                  {pr.providerName}: <span className="count">{pr.resultCount}</span> 条
                </span>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="search-step-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBackToEdit}
              data-testid="btn-edit-terms"
            >
              修改检索词
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSearchWithTerms}
              disabled={isSearching || remaining <= 0}
              data-testid="btn-re-search"
            >
              {isSearching ? "检索中..." : "重新检索"}
            </button>
          </div>
        </>
      )}

      {/* ─── 候选文献列表 ─── */}
      {candidates.length > 0 && (
        <div className="candidates-list" data-testid="candidates-list">
          <div className="candidates-toolbar">
            <h4>候选文献 ({candidates.length} 篇)</h4>
            <div className="candidates-toolbar-actions">
              <button type="button" className="btn-text" onClick={toggleSelectAll} data-testid="btn-select-all">
                {selected.size === candidates.slice(0, remaining).length ? "取消全选" : "全选"}
              </button>
              {selected.size > 0 && (
                <button type="button" className="btn-primary-sm" onClick={handleBatchAccept} data-testid="btn-batch-accept">
                  批量接受 ({selected.size})
                </button>
              )}
            </div>
          </div>
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              className={`candidate-item${selected.has(candidate.id) ? " candidate-item--selected" : ""}`}
              data-testid={`candidate-${candidate.id}`}
            >
              <label className="candidate-checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.has(candidate.id)}
                  onChange={() => toggleSelect(candidate.id)}
                  data-testid={`checkbox-${candidate.id}`}
                />
              </label>
              <div className="candidate-body">
                <div className="candidate-header">
                  <span className="candidate-title">{candidate.title}</span>
                  <span className="relevance-score" data-testid={`score-${candidate.id}`}>
                    {candidate.aiRelevanceScore}分
                  </span>
                </div>
                <div className="candidate-meta">
                  <span>{candidate.publicationNumber}</span>
                  {candidate.publicationDate && <span>公开日: {candidate.publicationDate}</span>}
                  {candidate.sourceUrl && (
                    <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="candidate-source-link" data-testid={`source-link-${candidate.id}`}>
                      来源
                    </a>
                  )}
                  <TimelineStatusBadge
                    status={classifyReferenceDate(baselineDate, candidate.publicationDate, candidate.publicationDateConfidence)}
                    dataTestId={`badge-timeline-candidate-${candidate.id}`}
                  />
                </div>
                {candidate.summary && <p className="candidate-summary">{candidate.summary}</p>}
                {candidate.aiRecommendationReason && (
                  <p className="candidate-reason">推荐理由: {candidate.aiRecommendationReason}</p>
                )}
                <div className="candidate-actions">
                  <button type="button" onClick={() => handleAccept(candidate.id)} data-testid={`btn-accept-${candidate.id}`}>
                    接受
                  </button>
                  <button type="button" onClick={() => rejectCandidate(candidate.id)} data-testid={`btn-reject-${candidate.id}`}>
                    拒绝
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function candidateToReference(candidate: SearchReferencesCandidate, caseId: string): ReferenceDocument {
  const ref: ReferenceDocument = {
    id: `candidate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    caseId,
    role: "reference",
    fileName: `${candidate.publicationNumber}.pdf`,
    fileType: "manual",
    textStatus: "empty",
    extractedText: "",
    textIndex: { pages: [], paragraphs: [], lineMap: [] },
    title: candidate.title,
    publicationNumber: candidate.publicationNumber,
    publicationDateConfidence: "low",
    timelineStatus: "needs-publication-date",
    summary: candidate.summary,
    source: "ai-search",
    candidateStatus: "pending",
    aiRelevanceScore: candidate.relevanceScore,
    aiRecommendationReason: candidate.recommendationReason,
    createdAt: new Date().toISOString()
  };
  if (candidate.publicationDate) ref.publicationDate = candidate.publicationDate;
  if (candidate.sourceUrl) ref.sourceUrl = candidate.sourceUrl;
  return ref;
}

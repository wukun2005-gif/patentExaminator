import { useState } from "react";
import { useParams } from "react-router-dom";
import type { ReferenceDocument } from "@shared/types/domain";
import type { SearchReferencesCandidate } from "../../agent/contracts";
import { classifyReferenceDate } from "../../lib/dateRules";
import { TimelineStatusBadge } from "../../components/TimelineStatusBadge";
import { useReferencesStore, useCaseStore, useSettingsStore } from "../../store";
import { createDocument } from "../../lib/repositories/documentRepo";
import { AgentClient } from "../../agent/AgentClient";

interface ReferenceSearchPanelProps {
  claimText: string;
  features: Array<{ featureCode: string; description: string }>;
}

export function ReferenceSearchPanel({ claimText, features }: ReferenceSearchPanelProps) {
  const { caseId } = useParams<{ caseId: string }>();
  const { candidates, setCandidates, acceptCandidate, rejectCandidate, isSearching, setIsSearching } =
    useReferencesStore();
  const { references } = useReferencesStore();
  const { currentCase } = useCaseStore();
  const { settings } = useSettingsStore();
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const baselineDate = currentCase?.priorityDate ?? currentCase?.applicationDate;
  const MAX_REFERENCES = 10;

  const handleSearch = async () => {
    if (!claimText.trim()) {
      setError("请先上传申请文件并提取权利要求。");
      return;
    }

    setError("");
    setIsSearching(true);
    setCandidates([]);

    try {
      const agentClient = new AgentClient(settings.mode, "/api", settings);
      const enabledSearchProviders = (settings.searchProviders ?? []).filter((p) => p.enabled && p.apiKeyRef);
      if (enabledSearchProviders.length === 0) {
        setError("未配置搜索 API。请在设置→专利搜索中配置搜索服务的 API Key。");
        setIsSearching(false);
        return;
      }

      // 并行请求所有搜索 API
      const maxResults = MAX_REFERENCES - references.length;
      const perProvider = Math.max(3, Math.ceil(maxResults / enabledSearchProviders.length));
      const responses = await Promise.all(
        enabledSearchProviders.map((sp) =>
          agentClient.runSearchReferences({
            caseId: caseId ?? "",
            claimText,
            features,
            maxResults: perProvider,
            searchProviderId: sp.providerId,
            searchApiKey: sp.apiKeyRef,
            ...(sp.baseUrl ? { searchBaseUrl: sp.baseUrl } : {})
          }).catch((err): { ok: false; candidates: []; error: string } => ({
            ok: false,
            candidates: [],
            error: String(err)
          }))
        )
      );

      // 合并结果，去重，取 top N
      const allOk = responses.some((r) => r.ok);
      if (!allOk) {
        setError(responses.map((r) => r.error).filter(Boolean).join("; ") || "检索失败，请稍后重试。");
        return;
      }

      const firstQuery = responses.find((r) => r.searchQuery)?.searchQuery;
      if (firstQuery) setSearchQuery(firstQuery);

      const seen = new Set<string>();
      const merged: ReferenceDocument[] = [];
      for (const res of responses) {
        for (const c of res.candidates) {
          if (seen.has(c.publicationNumber)) continue;
          seen.add(c.publicationNumber);
          merged.push(candidateToReference(c, caseId ?? ""));
          if (merged.length >= maxResults) break;
        }
        if (merged.length >= maxResults) break;
      }
      setCandidates(merged);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleAccept = async (candidateId: string) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    // Compute timeline status
    const timelineStatus = classifyReferenceDate(
      baselineDate,
      candidate.publicationDate,
      candidate.publicationDateConfidence
    );
    const withTimeline = { ...candidate, timelineStatus };

    await createDocument(withTimeline);
    acceptCandidate(candidateId);
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
    if (selected.size === selectable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((c) => c.id)));
    }
  };

  const handleBatchAccept = async () => {
    const ids = candidates.filter((c) => selected.has(c.id)).slice(0, remaining).map((c) => c.id);
    for (const id of ids) {
      await handleAccept(id);
    }
    setSelected(new Set());
  };

  const handleReject = (candidateId: string) => {
    rejectCandidate(candidateId);
  };

  const remaining = MAX_REFERENCES - references.length;

  return (
    <div className="reference-search-panel" data-testid="reference-search-panel">
      <div className="search-header">
        <h3>AI 辅助检索</h3>
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching || remaining <= 0}
          data-testid="btn-ai-search"
        >
          {isSearching ? "检索中..." : "AI 检索候选文献"}
        </button>
      </div>

      {remaining <= 0 && (
        <p className="search-hint">已达到文献数量上限（{MAX_REFERENCES}篇），无法继续检索。</p>
      )}

      {error && (
        <p className="search-error" data-testid="search-error">
          {error}
        </p>
      )}

      {searchQuery && (
        <p className="search-query" data-testid="search-query">
          检索式: {searchQuery}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="candidates-list" data-testid="candidates-list">
          <div className="candidates-toolbar">
            <h4>候选文献 ({candidates.length} 篇)</h4>
            <div className="candidates-toolbar-actions">
              <button
                type="button"
                className="btn-text"
                onClick={toggleSelectAll}
                data-testid="btn-select-all"
              >
                {selected.size === candidates.slice(0, remaining).length ? "取消全选" : "全选"}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="btn-primary-sm"
                  onClick={handleBatchAccept}
                  data-testid="btn-batch-accept"
                >
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
                  <button
                    type="button"
                    onClick={() => handleAccept(candidate.id)}
                    data-testid={`btn-accept-${candidate.id}`}
                  >
                    接受
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(candidate.id)}
                    data-testid={`btn-reject-${candidate.id}`}
                  >
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
  if (candidate.publicationDate) {
    ref.publicationDate = candidate.publicationDate;
  }
  return ref;
}

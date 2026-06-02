/**
 * Data repositories — B-038: 合并所有 repository 函数
 * 所有函数直接调用 dataClient（fetch 工具层）
 */
import { create, getAll, getById, query, update, remove, clearStore } from "./dataClient";
import type {
  PatentCase, SourceDocument, ClaimNode, ClaimFeature,
  FormalDefect, NoveltyComparison, InventiveStepAnalysis,
  ChatSession, ChatMessage, SearchSession,
  OfficeActionAnalysis, ArgumentMapping
} from "@shared/types/domain";
import type { ReexamDraftResponse, SummaryResponse } from "@shared/types/api";
import type { FeedbackItem } from "@shared/types/feedback";
import { createLogger } from "./logger";

// ── caseRepo ─────────────────────────────────────────

export async function createCase(item: PatentCase): Promise<void> {
  await create("cases", item);
}

export async function readAllCases(): Promise<PatentCase[]> {
  const cases = await getAll<PatentCase>("cases");
  return cases.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function readCaseById(id: string): Promise<PatentCase | undefined> {
  const result = await getById<PatentCase>("cases", id);
  return result ?? undefined;
}

export async function updateCase(item: PatentCase): Promise<void> {
  await update("cases", item.id, { ...item, updatedAt: new Date().toISOString() });
}

export async function deleteCase(id: string): Promise<void> {
  await remove("cases", id);
}

// ── documentRepo ─────────────────────────────────────

export async function createDocument(item: SourceDocument): Promise<void> {
  await create("documents", item);
}

export async function readAllDocuments(): Promise<SourceDocument[]> {
  return getAll<SourceDocument>("documents");
}

export async function readDocumentsByCaseId(caseId: string): Promise<SourceDocument[]> {
  const docs = await getAll<SourceDocument>("documents");
  return docs.filter((d) => d.caseId === caseId);
}

export async function readDocumentById(id: string): Promise<SourceDocument | undefined> {
  const result = await getById<SourceDocument>("documents", id);
  return result ?? undefined;
}

export async function updateDocument(item: SourceDocument): Promise<void> {
  await update("documents", item.id, item);
}

export async function deleteDocument(id: string): Promise<void> {
  await remove("documents", id);
}

// ── referenceRepo ────────────────────────────────────

export async function readReferencesByCaseId(caseId: string): Promise<SourceDocument[]> {
  const all = await query<SourceDocument>("documents", "caseId", caseId);
  return all.filter((doc) => doc.role === "reference");
}

// ── claimRepo ────────────────────────────────────────

export async function createClaimNode(item: ClaimNode): Promise<void> {
  await create("claimNodes", item as ClaimNode & { id: string });
}

export async function readClaimNodesByCaseId(caseId: string): Promise<ClaimNode[]> {
  return query<ClaimNode>("claimNodes", "caseId", caseId);
}

export async function deleteClaimNode(id: string): Promise<void> {
  await remove("claimNodes", id);
}

export async function createClaimFeature(item: ClaimFeature): Promise<void> {
  await create("claimCharts", item as ClaimFeature & { id: string });
}

export async function readClaimFeaturesByCaseId(caseId: string): Promise<ClaimFeature[]> {
  return query<ClaimFeature>("claimCharts", "caseId", caseId);
}

export async function readClaimFeaturesByClaimNumber(
  caseId: string,
  claimNumber: number
): Promise<ClaimFeature[]> {
  const all = await query<ClaimFeature>("claimCharts", "claimNumber", claimNumber);
  return all.filter((f) => f.claimNumber === claimNumber && f.id.startsWith(caseId));
}

export async function updateClaimFeature(item: ClaimFeature): Promise<void> {
  await update("claimCharts", item.id, item);
}

export async function deleteClaimFeature(id: string): Promise<void> {
  await remove("claimCharts", id);
}

export async function deleteClaimFeaturesByCaseId(caseId: string): Promise<void> {
  const features = await query<ClaimFeature>("claimCharts", "caseId", caseId);
  for (const feature of features) {
    await remove("claimCharts", feature.id);
  }
}

// ── noveltyRepo ──────────────────────────────────────

export async function createNovelty(item: NoveltyComparison): Promise<void> {
  await create("novelty", item as NoveltyComparison & { id: string });
}

export async function readAllNovelty(): Promise<NoveltyComparison[]> {
  return getAll<NoveltyComparison>("novelty");
}

export async function readNoveltyByCaseId(caseId: string): Promise<NoveltyComparison[]> {
  return query<NoveltyComparison>("novelty", "caseId", caseId);
}

export async function readNoveltyById(id: string): Promise<NoveltyComparison | undefined> {
  const result = await getById<NoveltyComparison>("novelty", id);
  return result ?? undefined;
}

export async function updateNovelty(item: NoveltyComparison): Promise<void> {
  await update("novelty", item.id, item);
}

export async function deleteNovelty(id: string): Promise<void> {
  await remove("novelty", id);
}

export async function deleteNoveltyByCaseId(caseId: string): Promise<void> {
  const items = await query<NoveltyComparison>("novelty", "caseId", caseId);
  for (const item of items) {
    await remove("novelty", item.id);
  }
}

// ── inventiveRepo ────────────────────────────────────

export async function createInventive(item: InventiveStepAnalysis): Promise<void> {
  await create("inventive", item as InventiveStepAnalysis & { id: string });
}

export async function readAllInventive(): Promise<InventiveStepAnalysis[]> {
  return getAll<InventiveStepAnalysis>("inventive");
}

export async function readInventiveByCaseId(caseId: string): Promise<InventiveStepAnalysis[]> {
  return query<InventiveStepAnalysis>("inventive", "caseId", caseId);
}

export async function readInventiveById(id: string): Promise<InventiveStepAnalysis | undefined> {
  const result = await getById<InventiveStepAnalysis>("inventive", id);
  return result ?? undefined;
}

export async function updateInventive(item: InventiveStepAnalysis): Promise<void> {
  await update("inventive", item.id, item);
}

export async function deleteInventive(id: string): Promise<void> {
  await remove("inventive", id);
}

export async function deleteInventiveByCaseId(caseId: string): Promise<void> {
  const items = await query<InventiveStepAnalysis>("inventive", "caseId", caseId);
  for (const item of items) {
    await remove("inventive", item.id);
  }
}

// ── defectRepo ───────────────────────────────────────

export async function createDefect(defect: FormalDefect): Promise<void> {
  await create("defects", defect as FormalDefect & { id: string });
}

export async function getDefectsByCaseId(caseId: string): Promise<FormalDefect[]> {
  return query<FormalDefect>("defects", "caseId", caseId);
}

export async function updateDefect(defect: FormalDefect): Promise<void> {
  await update("defects", defect.id, defect);
}

export async function deleteDefect(id: string): Promise<void> {
  await remove("defects", id);
}

export async function deleteDefectsByCaseId(caseId: string): Promise<void> {
  const items = await query<FormalDefect>("defects", "caseId", caseId);
  for (const item of items) {
    await remove("defects", item.id);
  }
}

// ── draftRepo ────────────────────────────────────────

export async function saveReexamDraft(caseId: string, draft: ReexamDraftResponse): Promise<void> {
  await create("reexamDrafts", { id: caseId, ...draft });
}

export async function readReexamDraft(caseId: string): Promise<ReexamDraftResponse | undefined> {
  const record = await getById<Record<string, unknown>>("reexamDrafts", caseId);
  if (!record) return undefined;
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as ReexamDraftResponse;
}

export async function deleteReexamDraft(caseId: string): Promise<void> {
  await remove("reexamDrafts", caseId);
}

export async function saveSummary(caseId: string, summary: SummaryResponse): Promise<void> {
  await create("summaries", { id: caseId, ...summary });
}

export async function readSummary(caseId: string): Promise<SummaryResponse | undefined> {
  const record = await getById<Record<string, unknown>>("summaries", caseId);
  if (!record) return undefined;
  const { id: _id, ...rest } = record as { id: string; [key: string]: unknown };
  return rest as unknown as SummaryResponse;
}

export async function deleteSummary(caseId: string): Promise<void> {
  await remove("summaries", caseId);
}

export async function clearDraftData(caseId: string): Promise<void> {
  await deleteReexamDraft(caseId);
  await deleteSummary(caseId);
}

// ── chatRepo ─────────────────────────────────────────

const chatLog = createLogger("chatRepo");

export async function createSession(session: ChatSession): Promise<void> {
  chatLog("createSession:", session.id);
  await create("chatSessions", session as ChatSession & { id: string });
}

export async function getSessionsByCaseId(caseId: string): Promise<ChatSession[]> {
  return query<ChatSession>("chatSessions", "caseId", caseId);
}

export async function deleteSession(id: string): Promise<void> {
  await remove("chatSessions", id);
}

export async function updateSession(session: ChatSession): Promise<void> {
  await update("chatSessions", session.id, session);
}

export async function deleteMessagesBySessionId(sessionId: string): Promise<void> {
  const messages = await query<ChatMessage>("chatMessages", "sessionId", sessionId);
  for (const msg of messages) {
    await remove("chatMessages", msg.id);
  }
}

export async function createMessage(message: ChatMessage): Promise<void> {
  await create("chatMessages", message as ChatMessage & { id: string });
}

export async function getMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
  return query<ChatMessage>("chatMessages", "sessionId", sessionId);
}

// ── opinionRepo ──────────────────────────────────────

export async function saveOpinionAnalysis(analysis: OfficeActionAnalysis): Promise<void> {
  await create("opinionAnalyses", analysis as OfficeActionAnalysis & { id: string });
}

export async function readOpinionAnalysis(caseId: string): Promise<OfficeActionAnalysis | null> {
  const analyses = await query<OfficeActionAnalysis>("opinionAnalyses", "caseId", caseId);
  if (analyses.length === 0) return null;
  analyses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return analyses[0] ?? null;
}

export async function deleteOpinionAnalysis(caseId: string): Promise<void> {
  const analyses = await query<OfficeActionAnalysis>("opinionAnalyses", "caseId", caseId);
  for (const analysis of analyses) {
    await remove("opinionAnalyses", analysis.id);
  }
}

export async function saveArgumentMappings(mappings: ArgumentMapping[]): Promise<void> {
  for (const mapping of mappings) {
    await create("argumentMappings", mapping as ArgumentMapping & { id: string });
  }
}

export async function readArgumentMappings(caseId: string): Promise<ArgumentMapping[]> {
  return query<ArgumentMapping>("argumentMappings", "caseId", caseId);
}

export async function deleteArgumentMappings(caseId: string): Promise<void> {
  const mappings = await query<ArgumentMapping>("argumentMappings", "caseId", caseId);
  for (const mapping of mappings) {
    await remove("argumentMappings", mapping.id);
  }
}

export async function clearOpinionData(caseId: string): Promise<void> {
  await deleteOpinionAnalysis(caseId);
  await deleteArgumentMappings(caseId);
}

// ── feedbackRepo ─────────────────────────────────────

export async function createFeedback(item: FeedbackItem): Promise<void> {
  await create("feedback", item as FeedbackItem & { id: string });
}

export async function readAllFeedback(): Promise<FeedbackItem[]> {
  return getAll<FeedbackItem>("feedback");
}

export async function readFeedbackByCaseId(caseId: string): Promise<FeedbackItem[]> {
  return query<FeedbackItem>("feedback", "caseId", caseId);
}

export async function updateFeedback(item: FeedbackItem): Promise<void> {
  await update("feedback", item.id, item);
}

export async function deleteFeedback(id: string): Promise<void> {
  await remove("feedback", id);
}

// ── interpretRepo ────────────────────────────────────

export async function saveInterpretSummaries(
  caseId: string,
  summaries: Record<string, string>
): Promise<void> {
  await create("interpretSummaries", {
    id: caseId,
    caseId,
    summaries,
    updatedAt: new Date().toISOString()
  });
}

export async function readInterpretSummaries(caseId: string): Promise<Record<string, string>> {
  const record = await getById<Record<string, unknown>>("interpretSummaries", caseId);
  if (!record) return {};
  if ("summaries" in record) return record.summaries as Record<string, string>;
  if ("summary" in record && record.summary) return { __legacy__: record.summary as string };
  return {};
}

export async function deleteInterpretSummaries(caseId: string): Promise<void> {
  await remove("interpretSummaries", caseId);
}

// ── runMarkerRepo ────────────────────────────────────

export async function saveRunMarker(caseId: string, module: string): Promise<void> {
  await create("runMarkers", {
    id: `${caseId}::${module}`,
    caseId,
    module,
    timestamp: new Date().toISOString()
  });
}

export async function getRunMarkersByCaseId(caseId: string): Promise<string[]> {
  const markers = await query<Record<string, unknown>>("runMarkers", "caseId", caseId);
  return markers.map((m) => m.module as string);
}

export async function deleteRunMarker(caseId: string, module: string): Promise<void> {
  await remove("runMarkers", `${caseId}::${module}`);
}

// ── searchSessionRepo ────────────────────────────────

export async function createSearchSession(session: SearchSession): Promise<void> {
  await create("searchSessions", session as SearchSession & { id: string });
}

export async function getSearchSessionsByCaseId(caseId: string): Promise<SearchSession[]> {
  return query<SearchSession>("searchSessions", "caseId", caseId);
}

export async function updateSearchSession(session: SearchSession): Promise<void> {
  await update("searchSessions", session.id, { ...session, updatedAt: new Date().toISOString() });
}

export async function deleteSearchSession(id: string): Promise<void> {
  await remove("searchSessions", id);
}

export async function getLatestSearchSession(caseId: string): Promise<SearchSession | undefined> {
  const sessions = await getSearchSessionsByCaseId(caseId);
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

// ── ocrCacheRepo ─────────────────────────────────────

const OCR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function writeOcrCache(cacheKey: string, text: string): Promise<void> {
  await create("ocrCache", { id: cacheKey, cacheKey, text, createdAt: Date.now() });
}

export async function readOcrCache(cacheKey: string): Promise<string | null> {
  const entry = await getById<{ cacheKey: string; text: string; createdAt: number }>("ocrCache", cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > OCR_CACHE_TTL_MS) {
    await remove("ocrCache", cacheKey);
    return null;
  }
  return entry.text;
}

export async function deleteOcrCache(cacheKey: string): Promise<void> {
  await remove("ocrCache", cacheKey);
}

export async function clearExpiredOcrCache(): Promise<number> {
  const all = await getAll<{ cacheKey: string; createdAt: number }>("ocrCache");
  let cleared = 0;
  const now = Date.now();
  for (const entry of all) {
    if (now - entry.createdAt > OCR_CACHE_TTL_MS) {
      await remove("ocrCache", entry.cacheKey);
      cleared++;
    }
  }
  return cleared;
}

// ── settings helpers (clearAllLocalData) ──────────────

const ALL_STORES = [
  "cases", "documents", "textIndex", "claimNodes", "claimCharts",
  "novelty", "inventive", "defects", "ocrCache",
  "chatMessages", "chatSessions", "feedback", "settings",
  "interpretSummaries", "opinionAnalyses", "argumentMappings",
  "reexamDrafts", "summaries", "runMarkers", "searchSessions",
  "knowledgeSources", "knowledgeChunks", "knowledgeVectors"
] as const;

export async function clearAllLocalData(): Promise<void> {
  await Promise.all(ALL_STORES.map((store) => clearStore(store)));
}

// ── IndexedDB stubs (B-038: IndexedDB 已删除，以下为测试兼容 stub) ──

export async function openPatentDB(): Promise<unknown> {
  throw new Error("IndexedDB deleted in B-038 — tests need rewriting for server-side storage");
}

export function setDBInstance(_db: unknown): void {
  // no-op stub
}

export function getDB(): unknown {
  return null;
}

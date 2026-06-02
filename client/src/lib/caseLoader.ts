import type { ReferenceDocument, ChatMessage } from "@shared/types/domain";
import { readCaseById } from "./repos";
import { readDocumentsByCaseId } from "./repos";
import { readReferencesByCaseId } from "./repos";
import { readClaimNodesByCaseId, readClaimFeaturesByCaseId } from "./repos";
import { readNoveltyByCaseId } from "./repos";
import { readInventiveByCaseId } from "./repos";
import { getDefectsByCaseId } from "./repos";
import { getSessionsByCaseId, getMessagesBySessionId } from "./repos";
import { readInterpretSummaries } from "./repos";
import { readOpinionAnalysis, readArgumentMappings } from "./repos";
import { readReexamDraft, readSummary } from "./repos";
import { getRunMarkersByCaseId } from "./repos";

import { createLogger } from "./logger";
const log = createLogger("caseLoader");

import {
  useCaseStore,
  useDocumentsStore,
  useReferencesStore,
  useClaimsStore,
  useNoveltyStore,
  useInventiveStore,
  useDefectsStore,
  useChatStore,
  useInterpretStore,
  useOpinionStore,
  useDraftStore
} from "../store";

/**
 * Load a case and all its associated data from IndexedDB into Zustand stores.
 * Returns the PatentCase if found, or null if the caseId doesn't exist.
 */
export async function loadCaseById(caseId: string) {
  log("loadCaseById called with caseId:", caseId);
  
  const theCase = await readCaseById(caseId);
  if (!theCase) {
    log("Case not found in IndexedDB:", caseId);
    return null;
  }
  log("Case found:", theCase.id, theCase.title);

  // Load all domain data in parallel
  log("Loading all domain data in parallel...");
  const [docs, refs, nodes, features, novelty, inventive, defects, sessions, interpretSummaries, opinionAnalysis, argumentMappings, reexamDraft, summary, runMarkers] = await Promise.all([
    readDocumentsByCaseId(caseId),
    readReferencesByCaseId(caseId),
    readClaimNodesByCaseId(caseId),
    readClaimFeaturesByCaseId(caseId),
    readNoveltyByCaseId(caseId),
    readInventiveByCaseId(caseId),
    getDefectsByCaseId(caseId),
    getSessionsByCaseId(caseId),
    readInterpretSummaries(caseId),
    readOpinionAnalysis(caseId),
    readArgumentMappings(caseId),
    readReexamDraft(caseId),
    readSummary(caseId),
    getRunMarkersByCaseId(caseId)
  ]);

  log("Loaded data counts:", {
    docs: docs.length,
    refs: refs.length,
    nodes: nodes.length,
    features: features.length,
    novelty: novelty.length,
    inventive: inventive.length,
    defects: defects.length,
    sessions: sessions.length,
    interpretSummaries: Object.keys(interpretSummaries).length,
    opinionAnalysis: !!opinionAnalysis,
    argumentMappings: argumentMappings.length,
    reexamDraft: !!reexamDraft,
    summary: !!summary,
    runMarkers
  });

  // Load chat messages for all sessions
  log("Loading chat messages for", sessions.length, "sessions...");
  const allMessages: ChatMessage[] = [];
  for (const s of sessions) {
    try {
      const msgs = await getMessagesBySessionId(s.id);
      log("Session", s.id, "has", msgs.length, "messages");
      allMessages.push(...msgs);
    } catch (err) {
      log(`Failed to load messages for session ${s.id}:`, err);
    }
  }
  log("Total chat messages loaded:", allMessages.length);

  // Hydrate Zustand stores using load* methods to avoid re-saving to IndexedDB
  log("Hydrating Zustand stores...");
  useCaseStore.getState().setCurrentCase(theCase);
  useDocumentsStore.getState().setDocuments(docs);
  useReferencesStore.getState().setReferences(refs as unknown as ReferenceDocument[]);
  useClaimsStore.getState().setClaimNodes(nodes);
  useClaimsStore.getState().loadClaimFeatures(features);
  
  // Use load* methods to avoid re-saving to IndexedDB
  useNoveltyStore.getState().loadComparisons(novelty);
  useInventiveStore.getState().loadAnalyses(inventive);
  useDefectsStore.getState().loadDefects(defects);
  
  log("Loading chat sessions into store:", sessions.length, "sessions");
  useChatStore.getState().loadSessions(sessions);
  log("Loading chat messages into store:", allMessages.length, "messages");
  useChatStore.getState().loadMessages(allMessages);
  useChatStore.getState().setActiveSessionId(sessions[0]?.id ?? null);
  log("Set activeSessionId to:", sessions[0]?.id ?? null);
  
  // Load interpret summaries
  if (Object.keys(interpretSummaries).length > 0) {
    useInterpretStore.getState().loadInterpretSummaries(caseId, interpretSummaries);
  }
  
  // Load opinion data
  if (opinionAnalysis) {
    useOpinionStore.getState().loadOfficeActionAnalysis(opinionAnalysis);
  }
  if (argumentMappings.length > 0) {
    useOpinionStore.getState().loadArgumentMappings(argumentMappings);
  }
  
  // Load draft/summary data
  if (reexamDraft) {
    useDraftStore.getState().loadReexamDraft(caseId, reexamDraft);
  }
  if (summary) {
    useDraftStore.getState().loadSummary(caseId, summary);
  }

  // Distribute run markers to each module's slice
  if (runMarkers.length > 0) {
    const moduleMap: Record<string, string[]> = {};
    for (const m of runMarkers) {
      (moduleMap[m] ??= []).push(caseId);
    }
    if (moduleMap.defects) {
      useDefectsStore.getState().setRanCases(moduleMap.defects);
    }
    if (moduleMap.claimChart) {
      useClaimsStore.getState().setRanCases(moduleMap.claimChart);
    }
    if (moduleMap.argumentMapping) {
      useOpinionStore.getState().setArgumentRanCases(moduleMap.argumentMapping);
    }
  }

  log("loadCaseById completed successfully for caseId:", caseId);
  return theCase;
}
import type { ReferenceDocument, ChatMessage } from "@shared/types/domain";
import { readCaseById } from "./repositories/caseRepo";
import { readDocumentsByCaseId } from "./repositories/documentRepo";
import { readReferencesByCaseId } from "./repositories/referenceRepo";
import { readClaimNodesByCaseId, readClaimFeaturesByCaseId } from "./repositories/claimRepo";
import { readNoveltyByCaseId } from "./repositories/noveltyRepo";
import { readInventiveByCaseId } from "./repositories/inventiveRepo";
import { getDefectsByCaseId } from "./repositories/defectRepo";
import { getSessionsByCaseId, getMessagesBySessionId } from "./repositories/chatRepo";
import {
  useCaseStore,
  useDocumentsStore,
  useReferencesStore,
  useClaimsStore,
  useNoveltyStore,
  useInventiveStore,
  useDefectsStore,
  useChatStore
} from "../store";

/**
 * Load a case and all its associated data from IndexedDB into Zustand stores.
 * Returns the PatentCase if found, or null if the caseId doesn't exist.
 */
export async function loadCaseById(caseId: string) {
  const theCase = await readCaseById(caseId);
  if (!theCase) return null;

  // Load all domain data in parallel
  const [docs, refs, nodes, features, novelty, inventive, defects, sessions] = await Promise.all([
    readDocumentsByCaseId(caseId),
    readReferencesByCaseId(caseId),
    readClaimNodesByCaseId(caseId),
    readClaimFeaturesByCaseId(caseId),
    readNoveltyByCaseId(caseId),
    readInventiveByCaseId(caseId),
    getDefectsByCaseId(caseId),
    getSessionsByCaseId(caseId)
  ]);

  // Load chat messages for all sessions
  const allMessages: ChatMessage[] = [];
  for (const s of sessions) {
    try {
      const msgs = await getMessagesBySessionId(s.id);
      allMessages.push(...msgs);
    } catch (err) {
      console.warn(`Failed to load messages for session ${s.id}:`, err);
    }
  }

  // Hydrate Zustand stores
  useCaseStore.getState().setCurrentCase(theCase);
  useDocumentsStore.getState().setDocuments(docs.filter((d) => d.role === "application"));
  useReferencesStore.getState().setReferences(refs as unknown as ReferenceDocument[]);
  useClaimsStore.getState().setClaimNodes(nodes);
  useClaimsStore.getState().setClaimFeatures(features);
  useNoveltyStore.getState().setComparisons(novelty);
  useInventiveStore.getState().setAnalyses(inventive);
  useDefectsStore.getState().setDefects(defects);
  useChatStore.getState().setSessions(sessions);
  useChatStore.getState().setMessages(allMessages);
  useChatStore.getState().setActiveSessionId(sessions[0]?.id ?? null);

  return theCase;
}

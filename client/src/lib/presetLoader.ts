import type {
  PatentCase,
  SourceDocument,
  ClaimNode,
  ClaimFeature,
  NoveltyComparison,
  InventiveStepAnalysis,
  FormalDefect,
  ChatSession,
  ChatMessage,
  ReferenceDocument
} from "@shared/types/domain";
import { createCase, readCaseById } from "./repos";
import { createDocument, readDocumentsByCaseId } from "./repos";
import { createClaimNode, createClaimFeature } from "./repos";
import { createNovelty } from "./repos";
import { createInventive } from "./repos";
import { createDefect } from "./repos";
import { createSession, createMessage, getSessionsByCaseId, getMessagesBySessionId } from "./repos";
import { useCaseStore, useDocumentsStore, useReferencesStore, useClaimsStore, useNoveltyStore, useInventiveStore, useDefectsStore, useChatStore } from "../store";

import presetData from "@shared/fixtures/preset-demo.json";

export async function loadPresetCase(): Promise<string> {
  const data = presetData as unknown as {
    case: PatentCase;
    applicationDoc: SourceDocument;
    officeActionDoc?: SourceDocument;
    officeActionResponseDoc?: SourceDocument;
    referenceDocs: SourceDocument[];
    claimNodes: ClaimNode[];
    claimFeatures: ClaimFeature[];
    noveltyComparisons: NoveltyComparison[];
    inventiveAnalysis: InventiveStepAnalysis;
    defectCheck: FormalDefect[];
    chatSessions: ChatSession[];
    chatMessages: ChatMessage[];
  };

  const theCase = data.case;

  // Check if this case was already loaded (preserves user deletions)
  let isFirstLoad = false;
  try {
    const existing = await readCaseById(theCase.id);
    isFirstLoad = !existing;
  } catch {
    isFirstLoad = true;
  }

  // 1. Write to IndexedDB
  await createCase(theCase);
  await createDocument(data.applicationDoc);
  if (data.officeActionDoc) {
    await createDocument(data.officeActionDoc);
  }
  if (data.officeActionResponseDoc) {
    await createDocument(data.officeActionResponseDoc);
  }
  for (const ref of data.referenceDocs) {
    await createDocument(ref);
  }
  for (const node of data.claimNodes) {
    await createClaimNode(node);
  }
  for (const feat of data.claimFeatures) {
    await createClaimFeature(feat);
  }
  for (const comp of data.noveltyComparisons) {
    await createNovelty(comp);
  }
  await createInventive(data.inventiveAnalysis);
  for (const defect of data.defectCheck) {
    await createDefect(defect);
  }
  // Chat sessions: only write preset data on first load; subsequent loads read from DB
  if (isFirstLoad) {
    for (const session of data.chatSessions) {
      await createSession(session);
    }
    for (const msg of data.chatMessages) {
      await createMessage(msg);
    }
    // Use load* methods since data was already written to IndexedDB above
    useChatStore.getState().loadSessions(data.chatSessions);
    useChatStore.getState().loadMessages(data.chatMessages);
    useChatStore.getState().setActiveSessionId(data.chatSessions[0]?.id ?? null);
  } else {
    let existingSessions: ChatSession[];
    try {
      existingSessions = await getSessionsByCaseId(theCase.id);
    } catch {
      existingSessions = [];
    }
    const allMessages: ChatMessage[] = [];
    for (const s of existingSessions) {
      try {
        const msgs = await getMessagesBySessionId(s.id);
        allMessages.push(...msgs);
      } catch { /* skip */ }
    }
    // Use load* methods since data was already written to IndexedDB above
    useChatStore.getState().loadSessions(existingSessions);
    useChatStore.getState().loadMessages(allMessages);
    useChatStore.getState().setActiveSessionId(existingSessions[0]?.id ?? null);
  }

  // 2. Hydrate Zustand stores
  useCaseStore.getState().setCurrentCase(theCase);
  useCaseStore.getState().setCases([theCase]);
  useDocumentsStore.getState().setDocuments([
    data.applicationDoc,
    ...(data.officeActionDoc ? [data.officeActionDoc] : []),
    ...(data.officeActionResponseDoc ? [data.officeActionResponseDoc] : [])
  ]);
  
  // References: preserve user-uploaded references on subsequent loads
  if (isFirstLoad) {
    useReferencesStore.getState().setReferences(
      data.referenceDocs as unknown as ReferenceDocument[]
    );
  } else {
    // Load existing references from IndexedDB to preserve user uploads
    let existingRefs: ReferenceDocument[] = [];
    try {
      const allDocs = await readDocumentsByCaseId(theCase.id);
      existingRefs = allDocs.filter((d): d is ReferenceDocument => 
        d.role === "reference"
      ) as ReferenceDocument[];
    } catch {
      existingRefs = data.referenceDocs as unknown as ReferenceDocument[];
    }
    useReferencesStore.getState().setReferences(existingRefs);
  }
  useClaimsStore.getState().setClaimNodes(data.claimNodes);
  useClaimsStore.getState().setClaimFeatures(data.claimFeatures);
  // Use load* methods since data was already written to IndexedDB above
  useNoveltyStore.getState().loadComparisons(data.noveltyComparisons);
  useInventiveStore.getState().loadAnalyses([data.inventiveAnalysis]);
  useDefectsStore.getState().loadDefects(data.defectCheck);

  return theCase.id;
}

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
import { createCase } from "./repositories/caseRepo";
import { createDocument } from "./repositories/documentRepo";
import { createClaimNode, createClaimFeature } from "./repositories/claimRepo";
import { createNovelty } from "./repositories/noveltyRepo";
import { createInventive } from "./repositories/inventiveRepo";
import { createDefect } from "./repositories/defectRepo";
import { createSession, createMessage, getSessionsByCaseId, getMessagesBySessionId } from "./repositories/chatRepo";
import { useCaseStore, useDocumentsStore, useReferencesStore, useClaimsStore, useNoveltyStore, useInventiveStore, useDefectsStore, useChatStore } from "../store";

import presetData from "@shared/fixtures/preset-demo.json";

export async function loadPresetCase(): Promise<string> {
  const data = presetData as {
    case: PatentCase;
    applicationDoc: SourceDocument;
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

  // 1. Write to IndexedDB
  await createCase(theCase);
  await createDocument(data.applicationDoc);
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
  // Check if sessions already exist in IndexedDB (user may have deleted some)
  let existingSessions: ChatSession[];
  try {
    existingSessions = await getSessionsByCaseId(theCase.id);
  } catch {
    existingSessions = [];
  }

  if (existingSessions.length > 0) {
    // User has existing sessions — load from DB instead of overwriting
    const allMessages: ChatMessage[] = [];
    for (const s of existingSessions) {
      try {
        const msgs = await getMessagesBySessionId(s.id);
        allMessages.push(...msgs);
      } catch { /* skip */ }
    }
    useChatStore.getState().setSessions(existingSessions);
    useChatStore.getState().setMessages(allMessages);
    useChatStore.getState().setActiveSessionId(existingSessions[0]?.id ?? null);
  } else {
    // First load — write preset sessions to DB
    for (const session of data.chatSessions) {
      await createSession(session);
    }
    for (const msg of data.chatMessages) {
      await createMessage(msg);
    }
    useChatStore.getState().setSessions(data.chatSessions);
    useChatStore.getState().setMessages(data.chatMessages);
    useChatStore.getState().setActiveSessionId(data.chatSessions[0]?.id ?? null);
  }

  // 2. Hydrate Zustand stores
  useCaseStore.getState().setCurrentCase(theCase);
  useCaseStore.getState().setCases([theCase]);
  useDocumentsStore.getState().setDocuments([data.applicationDoc]);
  useReferencesStore.getState().setReferences(
    data.referenceDocs as unknown as ReferenceDocument[]
  );
  useClaimsStore.getState().setClaimNodes(data.claimNodes);
  useClaimsStore.getState().setClaimFeatures(data.claimFeatures);
  useNoveltyStore.getState().setComparisons(data.noveltyComparisons);
  useInventiveStore.getState().setAnalyses([data.inventiveAnalysis]);
  useDefectsStore.getState().setDefects(data.defectCheck);

  return theCase.id;
}

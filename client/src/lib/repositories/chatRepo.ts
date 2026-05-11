import { getDB } from "../indexedDb";
import type { ChatSession, ChatMessage } from "@shared/types/domain";

export async function createSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  await db.put("chatSessions", session);
}

export async function getSessionsByCaseId(caseId: string): Promise<ChatSession[]> {
  const db = await getDB();
  return db.getAllFromIndex("chatSessions", "by-caseId", caseId);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("chatSessions", id);
}

export async function updateSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  await db.put("chatSessions", session);
}

export async function deleteMessagesBySessionId(sessionId: string): Promise<void> {
  const db = await getDB();
  const messages = await db.getAllFromIndex("chatMessages", "by-sessionId", sessionId);
  const tx = db.transaction("chatMessages", "readwrite");
  for (const msg of messages) {
    await tx.store.delete(msg.id);
  }
  await tx.done;
}

export async function createMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put("chatMessages", message);
}

export async function getMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  return db.getAllFromIndex("chatMessages", "by-sessionId", sessionId);
}

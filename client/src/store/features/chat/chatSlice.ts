import { create } from "zustand";
import type { ChatMessage, ChatSession } from "@shared/types/domain";
import {
  createSession,
  updateSession,
  deleteSession,
  createMessage,
  deleteMessagesBySessionId
} from "../../../lib/repos.js";

import { createLogger } from "../../../lib/logger";
const log = createLogger("chatSlice");

export interface ChatSlice {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  isPanelOpen: boolean;
  isLoading: boolean;

  setSessions: (sessions: ChatSession[]) => void;
  loadSessions: (sessions: ChatSession[]) => void; // Load from DB without re-saving
  addSession: (session: ChatSession) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  setMessages: (messages: ChatMessage[]) => void;
  loadMessages: (messages: ChatMessage[]) => void; // Load from DB without re-saving
  addMessage: (message: ChatMessage) => void;

  setActiveSessionId: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  setLoading: (v: boolean) => void;
}

export const createChatSlice = (
  set: (fn: (prev: ChatSlice) => Partial<ChatSlice>) => void,
  _get: () => ChatSlice
): ChatSlice => ({
  sessions: [],
  messages: [],
  activeSessionId: null,
  isPanelOpen: false,
  isLoading: false,

  setSessions: (sessions) => {
    log("setSessions called with", sessions.length, "sessions");
    for (const session of sessions) {
      createSession(session).catch((e) => log("[ChatSlice] createSession error:", e));
    }
    set(() => ({ sessions }));
  },
  loadSessions: (sessions) => {
    // Load from DB without re-saving to IndexedDB
    log("loadSessions called with", sessions.length, "sessions");
    set(() => ({ sessions }));
  },
  addSession: (session) => {
    log("addSession called:", session.id);
    createSession(session).catch((e) => log("[ChatSlice] createSession error:", e));
    set((prev) => ({ sessions: [...prev.sessions, session] }));
  },
  removeSession: (id) => {
    log("removeSession called:", id);
    deleteSession(id).catch((e) => log("[ChatSlice] deleteSession error:", e));
    deleteMessagesBySessionId(id).catch((e) => log("[ChatSlice] deleteMessagesBySessionId error:", e));
    set((prev) => ({
      sessions: prev.sessions.filter((s) => s.id !== id),
      messages: prev.messages.filter((m) => m.sessionId !== id),
      activeSessionId: prev.activeSessionId === id ? null : prev.activeSessionId
    }));
  },
  renameSession: (id, title) =>
    set((prev) => {
      const session = prev.sessions.find((s) => s.id === id);
      if (session) {
        const updatedSession = { ...session, title, updatedAt: new Date().toISOString() };
        updateSession(updatedSession).catch((e) => log("[ChatSlice] updateSession error:", e));
      }
      return {
        sessions: prev.sessions.map((s) => (s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s))
      };
    }),

  setMessages: (messages) => {
    log("setMessages called with", messages.length, "messages");
    for (const msg of messages) {
      createMessage(msg).catch((e) => log("[ChatSlice] createMessage error:", e));
    }
    set(() => ({ messages }));
  },
  loadMessages: (messages) => {
    // Load from DB without re-saving to IndexedDB
    log("loadMessages called with", messages.length, "messages");
    set(() => ({ messages }));
  },
  addMessage: (message) => {
    log("addMessage called:", message.id);
    createMessage(message).catch((e) => log("[ChatSlice] createMessage error:", e));
    set((prev) => ({ messages: [...prev.messages, message] }));
  },

  setActiveSessionId: (id) => {
    log("setActiveSessionId called:", id);
    set(() => ({ activeSessionId: id }));
  },
  setPanelOpen: (open) => set(() => ({ isPanelOpen: open })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useChatStore = create<ChatSlice>()((set, get) => createChatSlice(set, get));
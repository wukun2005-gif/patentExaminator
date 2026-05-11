import { create } from "zustand";
import type { ChatMessage, ChatSession } from "@shared/types/domain";

export interface ChatSlice {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  isPanelOpen: boolean;
  isLoading: boolean;

  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  setMessages: (messages: ChatMessage[]) => void;
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
  isPanelOpen: true,
  isLoading: false,

  setSessions: (sessions) => set(() => ({ sessions })),
  addSession: (session) => set((prev) => ({ sessions: [...prev.sessions, session] })),
  removeSession: (id) =>
    set((prev) => ({
      sessions: prev.sessions.filter((s) => s.id !== id),
      messages: prev.messages.filter((m) => m.sessionId !== id),
      activeSessionId: prev.activeSessionId === id ? null : prev.activeSessionId
    })),
  renameSession: (id, title) =>
    set((prev) => ({
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s))
    })),

  setMessages: (messages) => set(() => ({ messages })),
  addMessage: (message) => set((prev) => ({ messages: [...prev.messages, message] })),

  setActiveSessionId: (id) => set(() => ({ activeSessionId: id })),
  setPanelOpen: (open) => set(() => ({ isPanelOpen: open })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useChatStore = create<ChatSlice>()((set, get) => createChatSlice(set, get));

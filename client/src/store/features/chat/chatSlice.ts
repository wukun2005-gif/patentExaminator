import { create } from "zustand";
import type { ChatMessage } from "@shared/types/domain";

export interface ChatSlice {
  messages: ChatMessage[];
  isLoading: boolean;

  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  setLoading: (v: boolean) => void;
}

export const createChatSlice = (
  set: (fn: (prev: ChatSlice) => Partial<ChatSlice>) => void,
  _get: () => ChatSlice
): ChatSlice => ({
  messages: [],
  isLoading: false,

  setMessages: (messages) => set(() => ({ messages })),
  addMessage: (message) => set((prev) => ({ messages: [...prev.messages, message] })),
  clearMessages: () => set(() => ({ messages: [] })),
  setLoading: (v) => set(() => ({ isLoading: v }))
});

export const useChatStore = create<ChatSlice>()((set, get) => createChatSlice(set, get));

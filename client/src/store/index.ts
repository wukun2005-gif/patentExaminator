import { create } from "zustand";
import { type CaseSlice, createCaseSlice } from "./features/case/caseSlice";
import {
  type DocumentsSlice,
  createDocumentsSlice
} from "./features/documents/documentsSlice";
import {
  type ReferencesSlice,
  createReferencesSlice
} from "./features/references/referencesSlice";
import { type ClaimsSlice, createClaimsSlice } from "./features/claims/claimsSlice";
import { type NoveltySlice, createNoveltySlice } from "./features/novelty/noveltySlice";
import { type InventiveSlice, createInventiveSlice } from "./features/inventive/inventiveSlice";
import { type ChatSlice, createChatSlice } from "./features/chat/chatSlice";
import { type SettingsSlice, createSettingsSlice } from "./features/settings/settingsSlice";

export type AppStore = CaseSlice &
  DocumentsSlice &
  ReferencesSlice &
  ClaimsSlice &
  NoveltySlice &
  InventiveSlice &
  ChatSlice &
  SettingsSlice;

export const useStore = create<AppStore>()((set, get) => ({
  ...createCaseSlice(set, get),
  ...createDocumentsSlice(set, get),
  ...createReferencesSlice(set, get),
  ...createClaimsSlice(set, get),
  ...createNoveltySlice(set, get),
  ...createInventiveSlice(set, get),
  ...createChatSlice(set, get),
  ...createSettingsSlice(set, get)
}));

export {
  useCaseStore,
  createCaseSlice
} from "./features/case/caseSlice";
export {
  useDocumentsStore,
  createDocumentsSlice
} from "./features/documents/documentsSlice";
export {
  useReferencesStore,
  createReferencesSlice
} from "./features/references/referencesSlice";
export {
  useClaimsStore,
  createClaimsSlice
} from "./features/claims/claimsSlice";
export {
  useNoveltyStore,
  createNoveltySlice
} from "./features/novelty/noveltySlice";
export {
  useInventiveStore,
  createInventiveSlice
} from "./features/inventive/inventiveSlice";
export {
  useChatStore,
  createChatSlice
} from "./features/chat/chatSlice";
export {
  useSettingsStore,
  createSettingsSlice
} from "./features/settings/settingsSlice";

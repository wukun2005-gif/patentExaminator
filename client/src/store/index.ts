import type { CaseSlice } from "./features/case/caseSlice";
import type { DocumentsSlice } from "./features/documents/documentsSlice";
import type { ReferencesSlice } from "./features/references/referencesSlice";
import type { ClaimsSlice } from "./features/claims/claimsSlice";
import type { NoveltySlice } from "./features/novelty/noveltySlice";
import type { InventiveSlice } from "./features/inventive/inventiveSlice";
import type { DefectsSlice } from "./features/defects/defectsSlice";
import type { ChatSlice } from "./features/chat/chatSlice";
import type { SettingsSlice } from "./features/settings/settingsSlice";
import type { OpinionSlice } from "./features/opinion/opinionSlice";
import type { InterpretSlice } from "./features/interpret/interpretSlice";
import type { DraftSlice } from "./features/draft/draftSlice";

/** @internal — 仅用于类型推导，外部消费者应使用独立 slice store */
export type AppStore = CaseSlice &
  DocumentsSlice &
  ReferencesSlice &
  ClaimsSlice &
  NoveltySlice &
  InventiveSlice &
  DefectsSlice &
  ChatSlice &
  SettingsSlice &
  OpinionSlice &
  InterpretSlice &
  DraftSlice;

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
  useDefectsStore,
  createDefectsSlice
} from "./features/defects/defectsSlice";
export {
  useChatStore,
  createChatSlice
} from "./features/chat/chatSlice";
export {
  useSettingsStore,
  createSettingsSlice
} from "./features/settings/settingsSlice";
export {
  useOpinionStore,
  createOpinionSlice
} from "./features/opinion/opinionSlice";
export {
  LEGACY_INTERPRET_KEY,
  useInterpretStore,
  createInterpretSlice
} from "./features/interpret/interpretSlice";
export {
  useDraftStore,
  createDraftSlice
} from "./features/draft/draftSlice";

import { create } from "zustand";
import { requestDesktopSettings } from "../middleware/desktop-message-gateway";
import { requestDesktopLlm } from "../middleware/llm-gateway";
import { emptyAskContext } from "./ask-context";
import { EMPTY_META_DRAFT } from "./ask-normalization";
import type { AskState } from "./ask-types";
import { STREAM_RESET } from "./ask-session-helpers";
import { DEFAULT_MODEL_CATALOGS, DEFAULT_SELECTED_MODELS, DEFAULT_WORKER_MODELS } from "./ask-defaults";
import { createAskHistoryActions } from "./ask-history-actions";
import { createAskMemoryActions } from "./ask-memory-actions";
import { createAskRetrievalActions } from "./ask-retrieval-actions";
import { createAskHandoffActions } from "./ask-handoff-actions";
import { createAskSessionActions } from "./ask-session-actions";

export const useAskStore = create<AskState>((set, get) => ({
  historyRequests: {},
  readingFiles: false,
  failedSubmission: null,
  conversations: [],
  memoryNotes: [],
  selectedMemoryNotes: [],
  memoryPreview: null,
  messages: [],
  conversationContext: emptyAskContext(),
  activeConversation: null,
  metaDraft: { ...EMPTY_META_DRAFT },
  chatMode: "single",
  provider: "groq",
  summaryProvider: "gemini",
  modelCatalogs: { ...DEFAULT_MODEL_CATALOGS },
  selectedModels: { ...DEFAULT_SELECTED_MODELS },
  workerModels: { ...DEFAULT_WORKER_MODELS },
  thinkPlus: false,
  webSearchEnabled: true,
  multiResult: null,
  autoSpeakCandidate: null,
  ragPreflight: null,
  ragExecution: null,
  ragMemoryPreview: null,
  attachments: [],
  attachmentPanelOpen: false,
  visionFiles: [],
  visionPreflight: null,
  sidePanel: null,
  conversationSelectionMode: false,
  selectedConversationIds: [],
  activeConversationId: null,
  searchInput: "",
  searchQuery: "",
  searchResults: [],
  input: "",
  pending: false,
  streamingText: "",
  streamingActive: false,
  streamingRequestId: "",
  ragPending: false,
  visionPending: false,
  loadingConversations: false,
  loadingMemoryNotes: false,
  searching: false,
  lastError: null,
  setInput: (value) => set({ input: value }),
  setChatMode: (mode) => {
    if (get().pending || mode === get().chatMode) return;
    const currentProvider = get().provider;
    set({
      chatMode: mode,
      provider: mode === "single" && currentProvider === "auto" ? "groq" : currentProvider,
      activeConversationId: null,
      activeConversation: null,
      conversationSelectionMode: false,
      selectedConversationIds: [],
      messages: [],
      conversationContext: emptyAskContext(),
      metaDraft: { ...EMPTY_META_DRAFT },
      multiResult: null,
      failedSubmission: null,
      autoSpeakCandidate: null,
      ...STREAM_RESET
    });
    get().loadConversations();
  },
  setProvider: (provider) => set({ provider }),
  setSummaryProvider: (provider) => set({ summaryProvider: provider }),
  setSelectedModel: (provider, model) => set({ selectedModels: { ...get().selectedModels, [provider]: model } }),
  setWorkerModel: (provider, model) => set({ workerModels: { ...get().workerModels, [provider]: model } }),
  setThinkPlus: (enabled) => set({ thinkPlus: enabled }),
  setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
  setSidePanel: (panel) => set({ sidePanel: panel }),
  loadModelCatalogs: () => {
    requestDesktopLlm.groqModels();
    requestDesktopLlm.copilotModels();
    requestDesktopSettings.cerebrasModels();
    requestDesktopLlm.geminiModels();
    requestDesktopLlm.nvidiaModels();
    requestDesktopLlm.codexModels();
    requestDesktopLlm.grokModels();
  },
  ...createAskHistoryActions(set, get),
  ...createAskMemoryActions(set, get),
  ...createAskRetrievalActions(set, get),
  ...createAskHandoffActions(set, get),
  ...createAskSessionActions(set, get),
}));

export { ASK_PROVIDER_OPTIONS } from "./ask-defaults";
export type { AskChatMode, AskProvider, AskModelProvider, AskConversationItem, AskConversationMetaDraft, AskMemoryNoteItem, AskInputAttachment, AskMultiResult } from "./ask-types";
export { useAskPageBridge } from "./ask-bridge";

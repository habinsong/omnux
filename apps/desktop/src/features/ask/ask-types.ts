import { type AskActionSuggestion, type AskConversationContext, type AskMessage } from "./ask-context";
import { type AskRagCandidate, type AskRagExecution, type AskRagItem, type AskRagPreflight } from "./ask-rag";
import { type AskVisionAttachment, type AskVisionPreflight } from "./ask-vision";

export type AskConversationItem = {
  id: string;
  scope: string;
  mode: AskChatMode;
  title: string;
  preview: string;
  messageCount: number;
  updatedUtc: string;
  project: string;
  category: string;
  tags: string[];
  linkedMemoryNotes: string[];
};

export type AskChatMode = "single" | "orchestration" | "multi";

export type AskProvider = "auto" | "groq" | "gemini" | "cerebras" | "nvidia" | "deepseek" | "copilot" | "codex" | "grok";
export type AskModelProvider = Exclude<AskProvider, "auto">;

export type AskConversationMetaDraft = {
  title: string;
  project: string;
  category: string;
  tags: string;
};

export type AskMemoryNoteItem = {
  name: string;
  fullPath: string;
  excerpt: string;
  sizeBytes: number;
  lastWriteUtc: string;
};

export type AskInputAttachment = {
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  isImage: boolean;
};

export type AskMultiResult = {
  summary: string;
  providers: Array<{ key: string; label: string; model: string; text: string }>;
};

export type AskAutoSpeakCandidate = {
  key: string;
  text: string;
};

type AskRagMemoryPreview = {
  path: string;
  text: string;
  error: string;
  loading: boolean;
};

export type AskState = {
  historyRequests: Record<string, import("./ask-history-requests").AskHistoryRequest>;
  readingFiles: boolean;
  failedSubmission: { text: string; attachments: AskInputAttachment[] } | null;
  conversations: AskConversationItem[];
  memoryNotes: AskMemoryNoteItem[];
  selectedMemoryNotes: string[];
  memoryPreview: { name: string; content: string } | null;
  messages: AskMessage[];
  conversationContext: AskConversationContext;
  activeConversation: AskConversationItem | null;
  metaDraft: AskConversationMetaDraft;
  chatMode: AskChatMode;
  provider: AskProvider;
  summaryProvider: AskProvider;
  modelCatalogs: Record<AskModelProvider, string[]>;
  selectedModels: Partial<Record<AskModelProvider, string>>;
  workerModels: Partial<Record<AskModelProvider, string>>;
  thinkPlus: boolean;
  /** 웹 자동검색 on/off. 끄면 강제컨텍스트 웹검색까지 차단(메모리 검색은 유지). */
  webSearchEnabled: boolean;
  multiResult: AskMultiResult | null;
  autoSpeakCandidate: AskAutoSpeakCandidate | null;
  ragPreflight: AskRagPreflight | null;
  ragExecution: AskRagExecution | null;
  ragMemoryPreview: AskRagMemoryPreview | null;
  attachments: AskInputAttachment[];
  attachmentPanelOpen: boolean;
  visionFiles: AskVisionAttachment[];
  visionPreflight: AskVisionPreflight | null;
  sidePanel: "info" | "memory" | "models" | "context" | null;
  conversationSelectionMode: boolean;
  selectedConversationIds: string[];
  activeConversationId: string | null;
  searchInput: string;
  searchQuery: string;
  searchResults: Array<{ conversationId: string; title: string; snippet: string; mode?: AskChatMode }>;
  input: string;
  pending: boolean;
  /** llm_chat_stream 델타를 실시간으로 누적한 진행 중 답변 본문. */
  streamingText: string;
  /** 전송 직후~최종 결과 수신 전까지 true. 스트리밍/타이핑 버블 노출 기준. */
  streamingActive: boolean;
  /** 현재 진행 중인 전송의 requestId. 스트림 청크 매칭에 사용. */
  streamingRequestId: string;
  ragPending: boolean;
  visionPending: boolean;
  loadingConversations: boolean;
  loadingMemoryNotes: boolean;
  searching: boolean;
  lastError: string | null;
  setInput: (value: string) => void;
  setChatMode: (mode: AskChatMode) => void;
  setProvider: (provider: AskProvider) => void;
  setSummaryProvider: (provider: AskProvider) => void;
  setSelectedModel: (provider: AskModelProvider, model: string) => void;
  setWorkerModel: (provider: AskModelProvider, model: string) => void;
  setThinkPlus: (enabled: boolean) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setSidePanel: (panel: "info" | "memory" | "models" | "context" | null) => void;
  setConversationSelectionMode: (enabled: boolean) => void;
  toggleConversationSelection: (id: string) => void;
  deleteSelectedConversations: () => void;
  patchMetaDraft: (patch: Partial<AskConversationMetaDraft>) => void;
  saveConversationMeta: () => void;
  loadModelCatalogs: () => void;
  loadConversations: () => void;
  loadMemoryNotes: () => void;
  openConversation: (item: AskConversationItem) => void;
  createConversation: () => void;
  renameConversation: (item: AskConversationItem) => void;
  deleteConversation: (item: AskConversationItem) => void;
  saveConversationToMemory: (item: AskConversationItem) => void;
  createActiveConversationMemoryNote: (compactConversation?: boolean) => void;
  toggleMemoryNote: (name: string) => void;
  readMemoryNote: (name: string) => void;
  renameMemoryNote: (name: string) => void;
  deleteSelectedMemoryNotes: () => void;
  clearScopeMemory: () => void;
  addAttachments: (items: AskInputAttachment[]) => void;
  setAttachmentPanelOpen: (open: boolean) => void;
  saveInputAsRoutine: () => void;
  createPlanFromInput: () => void;
  runActionSuggestion: (suggestion: AskActionSuggestion) => void;
  saveMessageToNotebook: (messageIndex: number, text: string, meta?: string) => void;
  createPlanFromMessage: (messageIndex: number, text: string, meta?: string) => void;
  setSearchInput: (query: string) => void;
  searchConversations: (query: string) => void;
  clearSearch: () => void;
  runRagPreflight: () => void;
  runRagCandidate: (candidate: AskRagCandidate) => void;
  openRagMemoryItem: (item: AskRagItem) => void;
  clearRagMemoryPreview: () => void;
  clearRagPreflight: () => void;
  runVisionPreflight: () => void;
  clearVisionPreflight: () => void;
  sendMessage: () => void;
};

export type AskSet = (patch: Partial<AskState> | ((state: AskState) => Partial<AskState>)) => void;

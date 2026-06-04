import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopAsk,
  requestDesktopExplore,
  requestDesktopRoutine,
  requestDesktopSettings,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";
import { requestDesktopLlm } from "../middleware/llm-gateway";
import { requestDesktopMemory } from "../middleware/memory-gateway";
import { requestDesktopNotebook } from "../middleware/notebook-gateway";
import { requestDesktopPlan } from "../middleware/planning-gateway";
import { requestDesktopRag } from "../middleware/rag-gateway";
import { requestDesktopVision } from "../middleware/vision-gateway";
import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { emptyAskContext, normalizeAskMessage, normalizeConversationContext, type AskConversationContext, type AskMessage } from "./ask-context";
import { normalizeVisionPreflight, type AskVisionAttachment, type AskVisionPreflight } from "./ask-vision";
import {
  buildRagExecution,
  memoryGetWindowFromRagItem,
  normalizeMemoryRagExecution,
  normalizeRagPreflight,
  normalizeRepomapRagExecution,
  normalizeSessionReplayRagExecution,
  normalizeSessionReplayResultExecution,
  normalizeWebRagExecution,
  type AskRagCandidate,
  type AskRagExecution,
  type AskRagItem,
  type AskRagPreflight
} from "./ask-rag";
import {
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_CODEX_MODEL,
  DEFAULT_COPILOT_MODEL,
  DEFAULT_GEMINI_WORKER_MODEL,
  DEFAULT_GROQ_SINGLE_MODEL,
  DEFAULT_GROQ_WORKER_MODEL,
  DEFAULT_NVIDIA_MODEL,
  NONE_MODEL,
  STATIC_MODEL_OPTIONS
} from "./ask-models";

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

export type AskProvider = "auto" | "groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex";
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

export const ASK_PROVIDER_OPTIONS: Array<{ value: AskProvider; label: string }> = [
  { value: "auto", label: "자동" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
  { value: "cerebras", label: "Cerebras" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "copilot", label: "Copilot" },
  { value: "codex", label: "Codex" }
];

const EMPTY_META_DRAFT: AskConversationMetaDraft = {
  title: "",
  project: "기본",
  category: "일반",
  tags: ""
};

const DEFAULT_MODEL_CATALOGS: Record<AskModelProvider, string[]> = {
  groq: STATIC_MODEL_OPTIONS.groq ?? [],
  gemini: STATIC_MODEL_OPTIONS.gemini ?? [],
  cerebras: STATIC_MODEL_OPTIONS.cerebras ?? [],
  nvidia: STATIC_MODEL_OPTIONS.nvidia ?? [],
  copilot: STATIC_MODEL_OPTIONS.copilot ?? [],
  codex: STATIC_MODEL_OPTIONS.codex ?? []
};

const DEFAULT_SELECTED_MODELS: Partial<Record<AskModelProvider, string>> = {
  groq: DEFAULT_GROQ_SINGLE_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: DEFAULT_COPILOT_MODEL,
  codex: DEFAULT_CODEX_MODEL
};

const DEFAULT_WORKER_MODELS: Partial<Record<AskModelProvider, string>> = {
  groq: DEFAULT_GROQ_WORKER_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: NONE_MODEL,
  codex: NONE_MODEL
};

export type AskMultiResult = {
  summary: string;
  providers: Array<{ key: string; label: string; model: string; text: string }>;
};

type AskAutoSpeakCandidate = {
  key: string;
  text: string;
};

type AskRagMemoryPreview = {
  path: string;
  text: string;
  error: string;
  loading: boolean;
};

type AskState = {
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
  multiResult: AskMultiResult | null;
  autoSpeakCandidate: AskAutoSpeakCandidate | null;
  ragPreflight: AskRagPreflight | null;
  ragExecution: AskRagExecution | null;
  ragMemoryPreview: AskRagMemoryPreview | null;
  attachments: AskInputAttachment[];
  attachmentPanelOpen: boolean;
  attachmentDragActive: boolean;
  visionFiles: AskVisionAttachment[];
  visionPreflight: AskVisionPreflight | null;
  sidePanel: "info" | "memory" | "models" | "context" | null;
  mobilePane: "list" | "thread";
  folderOpenByName: Record<string, boolean>;
  conversationSelectionMode: boolean;
  selectedConversationIds: string[];
  activeConversationId: string | null;
  searchInput: string;
  searchQuery: string;
  searchResults: Array<{ conversationId: string; title: string; snippet: string }>;
  input: string;
  pending: boolean;
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
  setSidePanel: (panel: "info" | "memory" | "models" | "context" | null) => void;
  setMobilePane: (pane: "list" | "thread") => void;
  toggleFolder: (folder: string) => void;
  setConversationSelectionMode: (enabled: boolean) => void;
  toggleConversationSelection: (id: string) => void;
  toggleConversationFolderSelection: (items: AskConversationItem[]) => void;
  clearConversationSelection: () => void;
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
  removeAttachment: (name: string) => void;
  clearAttachments: () => void;
  setAttachmentPanelOpen: (open: boolean) => void;
  setAttachmentDragActive: (active: boolean) => void;
  saveInputAsRoutine: () => void;
  createPlanFromInput: () => void;
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

function readField(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}

function normalizeConversation(item: unknown): AskConversationItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    id: String(readField(payload, "id", "Id") || ""),
    scope: String(readField(payload, "scope", "Scope") || "chat"),
    mode: normalizeChatMode(readField(payload, "mode", "Mode")),
    title: String(readField(payload, "title", "Title") || "제목 없음"),
    preview: String(readField(payload, "preview", "Preview") || ""),
    messageCount: Number(readField(payload, "messageCount", "MessageCount") || 0),
    updatedUtc: String(readField(payload, "updatedUtc", "UpdatedUtc") || ""),
    project: String(readField(payload, "project", "Project") || "기본"),
    category: String(readField(payload, "category", "Category") || "일반"),
    tags: normalizeStrings(readField(payload, "tags", "Tags")),
    linkedMemoryNotes: normalizeStrings(readField(payload, "linkedMemoryNotes", "LinkedMemoryNotes"))
  };
}

function normalizeChatMode(value: unknown): AskChatMode {
  return value === "orchestration" || value === "multi" ? value : "single";
}

function normalizeStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return String(record.id || record.model || record.name || "");
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMemoryNote(item: unknown): AskMemoryNoteItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    name: String(payload.name || ""),
    fullPath: String(payload.fullPath || ""),
    excerpt: String(payload.excerpt || ""),
    sizeBytes: Number(payload.sizeBytes || 0),
    lastWriteUtc: String(payload.lastWriteUtc || "")
  };
}

function tagsToText(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMetaDraft(item: AskConversationItem | null): AskConversationMetaDraft {
  if (!item) return { ...EMPTY_META_DRAFT };
  return {
    title: item.title || "",
    project: item.project || "기본",
    category: item.category || "일반",
    tags: tagsToText(item.tags)
  };
}

function parseWebUrls(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 3);
}

function normalizeConversationMessages(conversation: Record<string, unknown>): AskMessage[] {
  const rawMessages = readField(conversation, "messages", "Messages");
  return Array.isArray(rawMessages) ? rawMessages.map(normalizeAskMessage) : [];
}

function trimNotebookEntry(value: string, maxChars: number) {
  const text = value.trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...(truncated)` : text;
}

function buildNotebookEntryFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "대화 답변에서 저장한 내용",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    trimNotebookEntry(text, 2200)
  ].filter(Boolean).join("\n");
}

function buildPlanObjectiveFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "아래 답변을 실제 작업계획으로 정리",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    text.trim()
  ].filter(Boolean).join("\n");
}

function buildAutoSpeakCandidate(conversationId: string | null, messages: AskMessage[]): AskAutoSpeakCandidate | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "ai" || !message.text.trim()) continue;
    return {
      key: `${conversationId || "new"}-${message.createdUtc || index}-${message.text.slice(0, 48)}`,
      text: message.text
    };
  }
  return null;
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function enrichLatestAssistantMessage(messages: AskMessage[], message: DesktopServerMessage): AskMessage[] {
  if (messages.length === 0) return messages;
  const provider = String(readField(message, "provider", "Provider") || "");
  const model = String(readField(message, "model", "Model") || "");
  const route = String(readField(message, "route", "Route") || "");
  const citationCount = countArray(readField(message, "citations", "Citations"));
  const grounded = citationCount > 0 || /web|url|ground|citation|검색|근거/i.test(route);
  if (!provider && !model && !route && !grounded) return messages;
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const current = next[index];
    if (current.role !== "ai") continue;
    next[index] = {
      ...current,
      provider: provider || current.provider,
      model: model || current.model,
      route: route || current.route,
      grounded: grounded || current.grounded,
      citationCount: citationCount || current.citationCount
    };
    break;
  }
  return next;
}

function normalizeMultiResult(message: DesktopServerMessage): AskMultiResult {
  const definitions = [
    { key: "groq", label: "Groq", modelKey: "groqModel" },
    { key: "gemini", label: "Gemini", modelKey: "geminiModel" },
    { key: "cerebras", label: "Cerebras", modelKey: "cerebrasModel" },
    { key: "nvidia", label: "NVIDIA NIM", modelKey: "nvidiaModel" },
    { key: "copilot", label: "Copilot", modelKey: "copilotModel" },
    { key: "codex", label: "Codex", modelKey: "codexModel" }
  ];
  return {
    summary: String(message.summary || message.commonSummary || ""),
    providers: definitions
      .map((definition) => ({
        key: definition.key,
        label: definition.label,
        model: String(message[definition.modelKey] || ""),
        text: String(message[definition.key] || "")
      }))
      .filter((item) => item.model || item.text)
  };
}

export const useAskStore = create<AskState>((set, get) => ({
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
  multiResult: null,
  autoSpeakCandidate: null,
  ragPreflight: null,
  ragExecution: null,
  ragMemoryPreview: null,
  attachments: [],
  attachmentPanelOpen: false,
  attachmentDragActive: false,
  visionFiles: [],
  visionPreflight: null,
  sidePanel: null,
  mobilePane: "thread",
  folderOpenByName: {},
  conversationSelectionMode: false,
  selectedConversationIds: [],
  activeConversationId: null,
  searchInput: "",
  searchQuery: "",
  searchResults: [],
  input: "",
  pending: false,
  ragPending: false,
  visionPending: false,
  loadingConversations: false,
  loadingMemoryNotes: false,
  searching: false,
  lastError: null,
  setInput: (value) => set({ input: value }),
  setChatMode: (mode) => {
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
      autoSpeakCandidate: null
    });
    get().loadConversations();
  },
  setProvider: (provider) => set({ provider }),
  setSummaryProvider: (provider) => set({ summaryProvider: provider }),
  setSelectedModel: (provider, model) => set({ selectedModels: { ...get().selectedModels, [provider]: model } }),
  setWorkerModel: (provider, model) => set({ workerModels: { ...get().workerModels, [provider]: model } }),
  setThinkPlus: (enabled) => set({ thinkPlus: enabled }),
  setSidePanel: (panel) => set({ sidePanel: panel }),
  setMobilePane: (pane) => set({ mobilePane: pane }),
  toggleFolder: (folder) => {
    const key = folder.trim() || "기본";
    const current = get().folderOpenByName[key];
    set({ folderOpenByName: { ...get().folderOpenByName, [key]: current === false } });
  },
  setConversationSelectionMode: (enabled) => set({
    conversationSelectionMode: enabled,
    selectedConversationIds: enabled ? get().selectedConversationIds : []
  }),
  toggleConversationSelection: (id) => {
    const normalized = String(id || "").trim();
    if (!normalized) return;
    const current = get().selectedConversationIds;
    const next = current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized];
    set({ selectedConversationIds: next });
  },
  toggleConversationFolderSelection: (items) => {
    const ids = items.map((item) => item.id).filter(Boolean);
    if (ids.length === 0) return;
    const selected = new Set(get().selectedConversationIds);
    const allSelected = ids.every((id) => selected.has(id));
    for (const id of ids) {
      if (allSelected) selected.delete(id);
      else selected.add(id);
    }
    set({ selectedConversationIds: Array.from(selected) });
  },
  clearConversationSelection: () => set({ selectedConversationIds: [] }),
  patchMetaDraft: (patch) => set({ metaDraft: { ...get().metaDraft, ...patch } }),
  saveConversationMeta: () => {
    const conversationId = get().activeConversationId;
    if (!conversationId) {
      set({ lastError: "먼저 대화를 선택하세요." });
      return;
    }
    const draft = get().metaDraft;
    const next = {
      title: draft.title.trim() || "제목 없음",
      project: draft.project.trim() || "기본",
      category: draft.category.trim() || "일반",
      tags: tagsToText(parseTags(draft.tags))
    };
    set({ metaDraft: next });
    if (!requestDesktopAsk.updateConversationMeta(conversationId, {
      title: next.title,
      project: next.project,
      category: next.category,
      tags: next.tags
    })) {
      set({ lastError: "대화 메타 저장 요청을 전송하지 못했다." });
    }
  },
  loadModelCatalogs: () => {
    requestDesktopLlm.groqModels();
    requestDesktopLlm.copilotModels();
    requestDesktopSettings.cerebrasModels();
  },
  loadConversations: () => {
    set({ loadingConversations: true, lastError: null });
    if (!requestDesktopAsk.listConversations("chat", get().chatMode)) {
      set({ loadingConversations: false, lastError: "대화 목록 요청을 전송하지 못했다." });
    }
  },
  loadMemoryNotes: () => {
    set({ loadingMemoryNotes: true });
    if (!requestDesktopSettings.listMemoryNotes()) {
      set({ loadingMemoryNotes: false, lastError: "메모리 노트 요청을 전송하지 못했다." });
    }
  },
  openConversation: (item) => {
    if (!item.id) {
      return;
    }
    set({
      activeConversationId: item.id,
      activeConversation: item,
      metaDraft: buildMetaDraft(item),
      selectedMemoryNotes: item.linkedMemoryNotes,
      messages: [],
      conversationContext: emptyAskContext(),
      pending: true,
      autoSpeakCandidate: null,
      mobilePane: "thread",
      lastError: null
    });
    if (!requestDesktopAsk.getConversation(item.id)) {
      set({ pending: false, lastError: "대화 조회 요청을 전송하지 못했다." });
    }
  },
  createConversation: () => {
    const mode = get().chatMode;
    const draft = get().metaDraft;
    set({
      messages: [],
      activeConversation: null,
      conversationContext: emptyAskContext(),
      pending: true,
      multiResult: null,
      autoSpeakCandidate: null,
      mobilePane: "thread"
    });
    if (!requestDesktopAsk.createConversation("chat", mode, {
      title: draft.title,
      project: draft.project,
      category: draft.category,
      tags: draft.tags
    })) {
      set({ pending: false, lastError: "새 대화 요청을 전송하지 못했다." });
    }
  },
  renameConversation: async (item) => {
    const next = await requestPromptDialog({
      title: "대화 이름 변경",
      message: "새 대화 제목을 입력하세요.",
      defaultValue: item.title || "",
      placeholder: "대화 제목"
    });
    const title = String(next || "").trim();
    if (!title || title === item.title) {
      return;
    }
    if (!requestDesktopAsk.updateConversationMeta(item.id, {
      title,
      project: item.project,
      category: item.category,
      tags: tagsToText(item.tags)
    })) {
      set({ lastError: "대화 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteConversation: async (item) => {
    const confirmed = await requestConfirmDialog({
      title: "대화 삭제",
      message: `대화 "${item.title || item.id}"를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }
    if (!requestDesktopAsk.deleteConversation(item.id, "chat", item.mode || get().chatMode)) {
      set({ lastError: "대화 삭제 요청을 전송하지 못했다." });
    }
    if (get().activeConversationId === item.id) {
      set({ activeConversationId: null, activeConversation: null, messages: [], metaDraft: { ...EMPTY_META_DRAFT }, autoSpeakCandidate: null });
    }
  },
  deleteSelectedConversations: async () => {
    const ids = get().selectedConversationIds;
    if (ids.length === 0) {
      set({ lastError: "삭제할 대화를 선택하세요." });
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "대화 일괄 삭제",
      message: `선택한 대화 ${ids.length}개를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    const mode = get().chatMode;
    const activeDeleted = ids.includes(get().activeConversationId || "");
    let sent = 0;
    for (const id of ids) {
      if (requestDesktopAsk.deleteConversation(id, "chat", mode)) {
        sent += 1;
      }
    }
    if (sent === 0) {
      set({ lastError: "대화 일괄 삭제 요청을 전송하지 못했다." });
      return;
    }
    set({
      conversationSelectionMode: false,
      selectedConversationIds: [],
      loadingConversations: true,
      ...(activeDeleted
        ? {
            activeConversationId: null,
            activeConversation: null,
            messages: [],
            conversationContext: emptyAskContext(),
            metaDraft: { ...EMPTY_META_DRAFT },
            multiResult: null,
            autoSpeakCandidate: null
          }
        : {}),
      lastError: sent === ids.length ? null : `일부 대화 삭제 요청만 전송했습니다. (${sent}/${ids.length})`
    });
  },
  saveConversationToMemory: (item) => {
    if (!requestDesktopAsk.createMemoryNote(item.id, false)) {
      set({ lastError: "메모리 저장 요청을 전송하지 못했다." });
    }
  },
  createActiveConversationMemoryNote: (compactConversation = false) => {
    const conversationId = get().activeConversationId;
    if (!conversationId) {
      set({ lastError: "메모리를 만들 대화를 먼저 선택하세요." });
      return;
    }
    if (!requestDesktopAsk.createMemoryNote(conversationId, compactConversation)) {
      set({ lastError: "메모리 저장 요청을 전송하지 못했다." });
    }
  },
  toggleMemoryNote: (name) => {
    const normalized = String(name || "").trim();
    if (!normalized) return;
    const current = get().selectedMemoryNotes;
    const next = current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized];
    set({ selectedMemoryNotes: next });
  },
  readMemoryNote: (name) => {
    const normalized = String(name || "").trim();
    if (!normalized) return;
    set({ memoryPreview: { name: normalized, content: "불러오는 중..." }, loadingMemoryNotes: true });
    if (!requestDesktopSettings.readMemoryNote(normalized)) {
      set({ loadingMemoryNotes: false, lastError: "메모리 노트 읽기 요청을 전송하지 못했다." });
    }
  },
  renameMemoryNote: async (name) => {
    const current = String(name || "").trim();
    if (!current) return;
    const next = await requestPromptDialog({
      title: "메모리 노트 이름 변경",
      message: "새 메모리 노트 이름을 입력하세요.",
      defaultValue: current,
      placeholder: "메모리 노트 이름"
    });
    const newName = String(next || "").trim();
    if (!newName || newName === current) return;
    if (!requestDesktopSettings.renameMemoryNote(current, newName)) {
      set({ lastError: "메모리 노트 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteSelectedMemoryNotes: async () => {
    const selected = get().selectedMemoryNotes;
    if (selected.length === 0) {
      set({ lastError: "삭제할 메모리 노트를 선택하세요." });
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "메모리 노트 삭제",
      message: `선택한 메모리 노트 ${selected.length}개를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSettings.deleteMemoryNotes(selected)) {
      set({ lastError: "메모리 노트 삭제 요청을 전송하지 못했다." });
    }
  },
  clearScopeMemory: async () => {
    const confirmed = await requestConfirmDialog({
      title: "대화 메모리 초기화",
      message: "현재 대화 범위(chat)의 대화 기록과 메모리 노트를 모두 삭제할까요?",
      confirmLabel: "초기화",
      tone: "danger"
    });
    if (!confirmed) return;
    set({
      loadingConversations: true,
      loadingMemoryNotes: true,
      selectedMemoryNotes: [],
      memoryPreview: null,
      lastError: null
    });
    if (!requestDesktopSettings.clearMemory("chat")) {
      set({
        loadingConversations: false,
        loadingMemoryNotes: false,
        lastError: "대화 메모리 초기화 요청을 전송하지 못했다."
      });
    }
  },
  addAttachments: (items) => {
    if (items.length === 0) return;
    const existing = get().attachments;
    const next = [...existing];
    for (const item of items) {
      if (next.length >= 6) break;
      next.push(item);
    }
    set({
      attachments: next,
      attachmentPanelOpen: true,
      lastError: next.length >= 6 && items.length + existing.length > 6 ? "첨부는 최대 6개까지 가능합니다." : null
    });
  },
  removeAttachment: (name) => set({ attachments: get().attachments.filter((item) => item.name !== name) }),
  clearAttachments: () => set({ attachments: [] }),
  setAttachmentPanelOpen: (open) => set({ attachmentPanelOpen: open }),
  setAttachmentDragActive: (active) => set({ attachmentDragActive: active }),
  saveInputAsRoutine: () => {
    const text = get().input.trim();
    if (text.length < 5) {
      set({ lastError: "루틴으로 저장할 입력은 최소 5자 이상이어야 합니다." });
      return;
    }
    if (!requestDesktopRoutine.createRoutine({
      title: text.slice(0, 40),
      request: text,
      scheduleKind: "manual",
      scheduleTime: "08:00",
      weekdays: [],
      dayOfMonth: 1,
      runImmediately: false,
      notifyTelegram: false
    })) {
      set({ lastError: "루틴 생성 요청을 전송하지 못했다." });
    }
  },
  createPlanFromInput: () => {
    const text = get().input.trim();
    if (text.length < 5) {
      set({ lastError: "작업계획으로 만들 입력은 최소 5자 이상이어야 합니다." });
      return;
    }
    if (!requestDesktopPlan.create(text)) {
      set({ lastError: "작업계획 생성 요청을 전송하지 못했다." });
    }
  },
  saveMessageToNotebook: (messageIndex, text, meta = "") => {
    const body = String(text || "").trim();
    if (!body) {
      set({ lastError: "노트북에 저장할 답변 내용이 없습니다." });
      return;
    }
    const ok = requestDesktopNotebook.append(
      "learning",
      buildNotebookEntryFromMessage(messageIndex, body, meta),
      undefined,
      {
        source: "chat",
        conversationId: get().activeConversationId,
        tags: ["chat", "assistant-response"]
      }
    );
    if (!ok) {
      set({ lastError: "노트북 저장 요청을 전송하지 못했다." });
    } else {
      set({ lastError: null });
    }
  },
  createPlanFromMessage: (messageIndex, text, meta = "") => {
    const body = String(text || "").trim();
    if (!body) {
      set({ lastError: "작업계획으로 만들 답변 내용이 없습니다." });
      return;
    }
    const ok = requestDesktopPlan.create(
      buildPlanObjectiveFromMessage(messageIndex, body, meta),
      "fast",
      [
        "답변의 의도와 범위를 유지하기",
        "실행 가능한 단계와 검증 기준을 분리하기",
        "추가 확인이 필요한 부분은 첫 단계에 배치하기"
      ],
      get().activeConversationId
    );
    if (!ok) {
      set({ lastError: "작업계획 생성 요청을 전송하지 못했다." });
    } else {
      set({ lastError: null });
    }
  },
  setSearchInput: (query) => set({ searchInput: query }),
  searchConversations: (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      set({ searchInput: "", searchQuery: "", searchResults: [], searching: false });
      return;
    }
    set({ searchInput: trimmed, searchQuery: trimmed, searchResults: [], searching: true });
    if (!requestDesktopAsk.searchConversation(trimmed, 20)) {
      set({ searching: false, lastError: "대화 검색 요청을 전송하지 못했다." });
    }
  },
  clearSearch: () => set({ searchInput: "", searchQuery: "", searchResults: [], searching: false }),
  runRagPreflight: () => {
    const query = String(get().input || "").trim();
    if (!query) return;
    set({ ragPending: true, ragPreflight: null, ragExecution: null, ragMemoryPreview: null, lastError: null });
    if (!requestDesktopRag.preflight(query)) {
      set({ ragPending: false, lastError: "RAG preflight 요청을 전송하지 못했다." });
    }
  },
  runRagCandidate: (candidate) => {
    const requestType = String(candidate.suggestedRequestType || "").trim();
    const query = String(get().ragPreflight?.queryPreview || get().input || "").trim();
    if (!requestType || candidate.kind === "none") return;
    set({ ragExecution: buildRagExecution(candidate.kind, requestType, true), ragMemoryPreview: null, lastError: null });
    let ok = false;
    if (requestType === "memory_search") ok = requestDesktopSettings.memorySearch(query, 8, 0);
    else if (requestType === "web_search") ok = requestDesktopExplore.webSearch(query, 8);
    else if (requestType === "code_repomap_snapshot_get") ok = requestDesktopInsights.codeRepomap(30);
    else if (requestType === "session_replay_get") {
      const conversationId = String(get().activeConversationId || "").trim();
      ok = conversationId ? requestDesktopRag.sessionReplay(conversationId, 80) : false;
    }
    if (!ok) {
      set({ ragExecution: { ...buildRagExecution(candidate.kind, requestType), status: "blocked", error: "후보 조회 요청을 전송하지 못했다." } });
    }
  },
  openRagMemoryItem: (item) => {
    const request = memoryGetWindowFromRagItem(item);
    if (!request.path) return;
    set({
      ragMemoryPreview: { path: request.path, text: "", error: "", loading: true },
      lastError: null
    });
    if (!requestDesktopMemory.get(request.path, request.fromLine, request.lines)) {
      set({
        ragMemoryPreview: {
          path: request.path,
          text: "",
          error: "메모리 상세 읽기 요청을 전송하지 못했다.",
          loading: false
        }
      });
    }
  },
  clearRagMemoryPreview: () => set({ ragMemoryPreview: null }),
  clearRagPreflight: () => set({ ragPreflight: null, ragExecution: null, ragMemoryPreview: null, ragPending: false }),
  runVisionPreflight: () => {
    const attachments = get().visionFiles;
    if (attachments.length === 0) return;
    const text = String(get().input || "첨부 이미지를 UI 구현자가 바로 사용할 수 있게 분석해줘").trim();
    set({ visionPending: true, visionPreflight: null, lastError: null });
    if (!requestDesktopVision.preflight({ provider: "gemini", model: "gemini-2.5-pro", text, attachments })) {
      set({ visionPending: false, lastError: "Vision preflight 요청을 전송하지 못했다." });
    }
  },
  clearVisionPreflight: () => set({ visionFiles: [], visionPreflight: null, visionPending: false }),
  sendMessage: () => {
    if (get().pending) return;
    const text = String(get().input || "").trim();
    const attachments = get().attachments;
    const effectiveText = text || (attachments.length > 0 ? "첨부 파일을 분석해줘" : "");
    if (!effectiveText) {
      return;
    }
    const attachmentLabel = attachments.length > 0
      ? `\n\n[첨부 ${attachments.length}개] ${attachments.map((item) => item.name).join(", ")}`
      : "";
    const nextMessages: AskMessage[] = [
      ...get().messages,
      {
        role: "user",
        text: `${text || effectiveText}${attachmentLabel}`,
        meta: "",
        createdUtc: "",
        tokenUsage: null,
        provider: "",
        model: "",
        route: "",
        source: "dashboard",
        grounded: false,
        citationCount: 0
      }
    ];
    const mode = get().chatMode;
    const meta = get().metaDraft;
    const ok = requestDesktopAsk.chat(mode, effectiveText, get().activeConversationId, {
      provider: get().provider,
      summaryProvider: get().summaryProvider,
      thinkPlus: get().thinkPlus,
      models: get().selectedModels,
      workerModels: get().workerModels,
      project: meta.project,
      category: meta.category,
      tags: meta.tags,
      memoryNotes: get().selectedMemoryNotes,
      attachments,
      webUrls: parseWebUrls(effectiveText),
      webSearchEnabled: true
    });
    set({
      messages: nextMessages,
      input: ok ? "" : get().input,
      attachments: ok ? [] : attachments,
      attachmentPanelOpen: ok ? false : get().attachmentPanelOpen,
      pending: ok,
      multiResult: mode === "multi" ? null : get().multiResult,
      autoSpeakCandidate: null
    });
    if (!ok) {
      set({ pending: false, lastError: "대화 전송 요청을 전송하지 못했다." });
    }
  }
}));

export function useAskPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    const store = useAskStore.getState();
    if (message.type === "conversations") {
      const responseMode = normalizeChatMode(readField(message, "mode", "Mode"));
      if (responseMode !== store.chatMode) {
        return;
      }
      const conversations = Array.isArray(message.items)
        ? message.items.map(normalizeConversation).filter((item) => item.id)
        : [];
      useAskStore.setState({
        conversations,
        loadingConversations: false,
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_detail" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      const messages = normalizeConversationMessages(conversation);
      useAskStore.setState({
        activeConversationId: activeConversation.id || store.activeConversationId,
        activeConversation: activeConversation.id ? activeConversation : store.activeConversation,
        metaDraft: activeConversation.id ? buildMetaDraft(activeConversation) : store.metaDraft,
        selectedMemoryNotes: activeConversation.linkedMemoryNotes.length > 0 ? activeConversation.linkedMemoryNotes : store.selectedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        autoSpeakCandidate: null,
        pending: false,
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_search_result") {
      const error = readField(message, "error", "Error");
      useAskStore.setState({
        searching: false,
        searchResults: Array.isArray(message.results)
          ? message.results.map((item) => {
              const payload = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return {
                conversationId: String(readField(payload, "conversationId", "ConversationId", "id", "Id") || ""),
                title: String(readField(payload, "title", "Title") || "제목 없음"),
                snippet: String(readField(payload, "snippet", "Snippet") || "")
              };
            })
            .filter((item) => item.conversationId)
          : [],
        lastError: error ? String(error) : null
      });
      return;
    }

    if (message.type === "rag_retrieval_preflight_snapshot") {
      useAskStore.setState({
        ragPending: false,
        ragPreflight: normalizeRagPreflight((message.payload || {}) as Record<string, unknown>),
        ragExecution: null,
        lastError: null
      });
      return;
    }

    if (message.type === "clipboard_vision_preflight_result") {
      useAskStore.setState({
        visionPending: false,
        visionPreflight: normalizeVisionPreflight((message.payload || {}) as Record<string, unknown>),
        lastError: null
      });
      return;
    }

    if (message.type === "memory_search_result" && store.ragExecution?.requestType === "memory_search") {
      useAskStore.setState({ ragExecution: normalizeMemoryRagExecution(store.ragExecution, message) });
      return;
    }

    if (message.type === "memory_get_result" && store.ragMemoryPreview?.loading) {
      const requestedPath = String(readField(message, "requestedPath", "path") || "");
      if (!requestedPath || requestedPath === store.ragMemoryPreview.path) {
        useAskStore.setState({
          ragMemoryPreview: {
            path: requestedPath || store.ragMemoryPreview.path,
            text: String(readField(message, "text", "Text") || ""),
            error: String(readField(message, "error", "Error") || ""),
            loading: false
          }
        });
        return;
      }
    }

    if (message.type === "web_search_result" && store.ragExecution?.requestType === "web_search") {
      useAskStore.setState({ ragExecution: normalizeWebRagExecution(store.ragExecution, message) });
      return;
    }

    if (message.type === "code_repomap_snapshot" && store.ragExecution?.requestType === "code_repomap_snapshot_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeRepomapRagExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "session_replay_snapshot" && store.ragExecution?.requestType === "session_replay_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeSessionReplayRagExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "session_replay_result" && store.ragExecution?.requestType === "session_replay_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeSessionReplayResultExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "conversation_created" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      const messages = normalizeConversationMessages(conversation);
      useAskStore.setState({
        activeConversationId: activeConversation.id || null,
        activeConversation: activeConversation.id ? activeConversation : null,
        metaDraft: buildMetaDraft(activeConversation.id ? activeConversation : null),
        selectedMemoryNotes: activeConversation.linkedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        autoSpeakCandidate: null,
        pending: false,
        lastError: null
      });
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "conversation_deleted") {
      const deletedId = String(readField(message, "conversationId", "ConversationId") || "");
      if (deletedId) {
        const current = useAskStore.getState();
        useAskStore.setState({
          selectedConversationIds: current.selectedConversationIds.filter((id) => id !== deletedId),
          ...(current.activeConversationId === deletedId
            ? {
                activeConversationId: null,
                activeConversation: null,
                messages: [],
                conversationContext: emptyAskContext(),
                metaDraft: { ...EMPTY_META_DRAFT },
                multiResult: null,
                autoSpeakCandidate: null
              }
            : {})
        });
      }
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "memory_notes") {
      useAskStore.setState({
        memoryNotes: Array.isArray(message.items) ? message.items.map(normalizeMemoryNote).filter((item) => item.name) : [],
        loadingMemoryNotes: false
      });
      return;
    }

    if (message.type === "memory_note_content") {
      useAskStore.setState({
        memoryPreview: {
          name: String(message.name || ""),
          content: String(message.content || "")
        },
        loadingMemoryNotes: false
      });
      return;
    }

    if (message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || message.type), { source: "auth" });
      if (message.type === "memory_note_deleted") {
        const deleted = normalizeStrings((message as { memoryNotes?: unknown }).memoryNotes);
        if (deleted.length > 0) {
          useAskStore.setState({
            selectedMemoryNotes: useAskStore.getState().selectedMemoryNotes.filter((name) => !deleted.includes(name))
          });
        }
      }
      useAskStore.getState().loadMemoryNotes();
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "memory_cleared") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || "대화 메모리를 초기화했습니다."), { source: "auth" });
      useAskStore.setState({
        activeConversationId: null,
        activeConversation: null,
        messages: [],
        conversationContext: emptyAskContext(),
        metaDraft: { ...EMPTY_META_DRAFT },
        selectedMemoryNotes: [],
        memoryPreview: null,
        multiResult: null,
        autoSpeakCandidate: null,
        loadingConversations: false,
        loadingMemoryNotes: false,
        lastError: null
      });
      useAskStore.getState().loadConversations();
      useAskStore.getState().loadMemoryNotes();
      return;
    }

    if (message.type === "groq_models") {
      useAskStore.setState((prev) => ({
        modelCatalogs: { ...prev.modelCatalogs, groq: normalizeModelIds(message.items) },
        selectedModels: { ...prev.selectedModels, ...(message.selected ? { groq: String(message.selected) } : {}) }
      }));
      return;
    }

    if (message.type === "copilot_models") {
      useAskStore.setState((prev) => ({
        modelCatalogs: { ...prev.modelCatalogs, copilot: normalizeModelIds(message.items) },
        selectedModels: { ...prev.selectedModels, ...(message.selected ? { copilot: String(message.selected) } : {}) }
      }));
      return;
    }

    if (message.type === "cerebras_models") {
      useAskStore.setState((prev) => ({
        modelCatalogs: { ...prev.modelCatalogs, cerebras: normalizeModelIds(message.items) },
        selectedModels: { ...prev.selectedModels, ...(message.selected ? { cerebras: String(message.selected) } : {}) }
      }));
      return;
    }

    if (message.type === "notebook_result" || message.type === "routine_result" || message.type === "plan_result") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || `${message.type} 수신`), { source: "operations" });
      return;
    }

    if ((message.type === "llm_chat_result" || message.type === "llm_chat_multi_result") && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      const messages = enrichLatestAssistantMessage(normalizeConversationMessages(conversation), message);
      const activeConversationId = activeConversation.id || store.activeConversationId;
      useAskStore.setState({
        activeConversationId,
        activeConversation: activeConversation.id ? activeConversation : store.activeConversation,
        metaDraft: activeConversation.id ? buildMetaDraft(activeConversation) : store.metaDraft,
        selectedMemoryNotes: activeConversation.linkedMemoryNotes.length > 0 ? activeConversation.linkedMemoryNotes : store.selectedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        multiResult: message.type === "llm_chat_multi_result" ? normalizeMultiResult(message) : store.multiResult,
        autoSpeakCandidate: buildAutoSpeakCandidate(activeConversationId, messages),
        pending: false,
        lastError: null
      });
      return;
    }

    if (message.type === "error") {
      useAskStore.setState({ pending: false, ragPending: false, visionPending: false, searching: false, loadingConversations: false, loadingMemoryNotes: false, lastError: String(message.message || "오류") });
    }
    });
  }, []);
}

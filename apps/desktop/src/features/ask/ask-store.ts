import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopAsk, requestDesktopSettings, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRag } from "../middleware/rag-gateway";
import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { useUiLogStore } from "../ui-log/ui-log-store";

export type AskConversationItem = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  updatedUtc: string;
  project: string;
  category: string;
};

export type AskMessage = {
  role: "user" | "ai";
  text: string;
};

export type AskChatMode = "single" | "orchestration" | "multi";

export type AskMultiResult = {
  summary: string;
  providers: Array<{ key: string; label: string; model: string; text: string }>;
};

export type AskRagPreflight = {
  status: string;
  queryPreview: string;
  retrievalRecommended: boolean;
  primaryStrategy: string;
  signals: string[];
  candidates: Array<{ kind: string; priority: string; recommended: boolean; reason: string; suggestedRequestType: string }>;
  skipped: string[];
};

type AskState = {
  conversations: AskConversationItem[];
  memoryNotes: Array<{ name: string; excerpt: string }>;
  messages: AskMessage[];
  chatMode: AskChatMode;
  multiResult: AskMultiResult | null;
  ragPreflight: AskRagPreflight | null;
  activeConversationId: string | null;
  searchQuery: string;
  searchResults: Array<{ conversationId: string; title: string; snippet: string }>;
  input: string;
  pending: boolean;
  ragPending: boolean;
  loadingConversations: boolean;
  loadingMemoryNotes: boolean;
  searching: boolean;
  lastError: string | null;
  setInput: (value: string) => void;
  setChatMode: (mode: AskChatMode) => void;
  loadConversations: () => void;
  loadMemoryNotes: () => void;
  openConversation: (item: AskConversationItem) => void;
  createConversation: () => void;
  renameConversation: (item: AskConversationItem) => void;
  deleteConversation: (item: AskConversationItem) => void;
  saveConversationToMemory: (item: AskConversationItem) => void;
  searchConversations: (query: string) => void;
  clearSearch: () => void;
  runRagPreflight: () => void;
  clearRagPreflight: () => void;
  sendMessage: () => void;
};

function normalizeMessage(message: unknown): AskMessage {
  const payload = message && typeof message === "object" ? (message as { role?: string; text?: string }) : {};
  return {
    role: payload.role === "user" ? "user" : "ai",
    text: typeof payload.text === "string" ? payload.text : ""
  };
}

function normalizeConversation(item: unknown): AskConversationItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    id: typeof payload.id === "string" ? payload.id : "",
    title: typeof payload.title === "string" ? payload.title : "제목 없음",
    preview: typeof payload.preview === "string" ? payload.preview : "",
    messageCount: typeof payload.messageCount === "number" ? payload.messageCount : 0,
    updatedUtc: typeof payload.updatedUtc === "string" ? payload.updatedUtc : "",
    project: typeof payload.project === "string" ? payload.project : "기본",
    category: typeof payload.category === "string" ? payload.category : "일반"
  };
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

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeRagPreflight(payload: Record<string, unknown>): AskRagPreflight {
  return {
    status: str(payload.status),
    queryPreview: str(payload.queryPreview),
    retrievalRecommended: !!payload.retrievalRecommended,
    primaryStrategy: str(payload.primaryStrategy),
    signals: Array.isArray(payload.signals) ? payload.signals.map(str) : [],
    candidates: records(payload.candidates).map((candidate) => ({
      kind: str(candidate.kind),
      priority: str(candidate.priority),
      recommended: !!candidate.recommended,
      reason: str(candidate.reason),
      suggestedRequestType: str(candidate.suggestedRequestType)
    })),
    skipped: Array.isArray(payload.skipped) ? payload.skipped.map(str) : []
  };
}

export const useAskStore = create<AskState>((set, get) => ({
  conversations: [],
  memoryNotes: [],
  messages: [],
  chatMode: "single",
  multiResult: null,
  ragPreflight: null,
  activeConversationId: null,
  searchQuery: "",
  searchResults: [],
  input: "",
  pending: false,
  ragPending: false,
  loadingConversations: false,
  loadingMemoryNotes: false,
  searching: false,
  lastError: null,
  setInput: (value) => set({ input: value }),
  setChatMode: (mode) => set({ chatMode: mode, multiResult: null }),
  loadConversations: () => {
    set({ loadingConversations: true, lastError: null });
    if (!requestDesktopAsk.listConversations("chat", "single")) {
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
      messages: item.preview ? [{ role: "ai", text: item.preview }] : [],
      pending: true
    });
    if (!requestDesktopAsk.getConversation(item.id)) {
      set({ pending: false, lastError: "대화 조회 요청을 전송하지 못했다." });
    }
  },
  createConversation: () => {
    set({ messages: [], pending: true });
    if (!requestDesktopAsk.createConversation("chat", "single")) {
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
    if (!requestDesktopAsk.updateConversationMeta(item.id, title)) {
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
    if (!requestDesktopAsk.deleteConversation(item.id, "chat", "single")) {
      set({ lastError: "대화 삭제 요청을 전송하지 못했다." });
    }
    if (get().activeConversationId === item.id) {
      set({ activeConversationId: null, messages: [] });
    }
  },
  saveConversationToMemory: (item) => {
    if (!requestDesktopAsk.createMemoryNote(item.id, false)) {
      set({ lastError: "메모리 저장 요청을 전송하지 못했다." });
    }
  },
  searchConversations: (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      set({ searchQuery: "", searchResults: [], searching: false });
      return;
    }
    set({ searchQuery: trimmed, searchResults: [], searching: true });
    if (!requestDesktopAsk.searchConversation(trimmed, 20)) {
      set({ searching: false, lastError: "대화 검색 요청을 전송하지 못했다." });
    }
  },
  clearSearch: () => set({ searchQuery: "", searchResults: [], searching: false }),
  runRagPreflight: () => {
    const query = String(get().input || "").trim();
    if (!query) return;
    set({ ragPending: true, ragPreflight: null, lastError: null });
    if (!requestDesktopRag.preflight(query)) {
      set({ ragPending: false, lastError: "RAG preflight 요청을 전송하지 못했다." });
    }
  },
  clearRagPreflight: () => set({ ragPreflight: null, ragPending: false }),
  sendMessage: () => {
    const text = String(get().input || "").trim();
    if (!text) {
      return;
    }
    const nextMessages: AskMessage[] = [...get().messages, { role: "user", text }];
    const mode = get().chatMode;
    set({ messages: nextMessages, input: "", pending: true, multiResult: mode === "multi" ? null : get().multiResult });
    if (!requestDesktopAsk.chat(mode, text, get().activeConversationId)) {
      set({ pending: false, lastError: "대화 전송 요청을 전송하지 못했다." });
    }
  }
}));

export function useAskPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    const store = useAskStore.getState();
    if (message.type === "conversations") {
      useAskStore.setState({
        conversations: Array.isArray(message.items) ? message.items.map(normalizeConversation).filter((item) => item.id) : [],
        loadingConversations: false,
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_detail" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      useAskStore.setState({
        activeConversationId: typeof conversation.id === "string" ? conversation.id : store.activeConversationId,
        messages: Array.isArray(conversation.messages) ? (conversation.messages.map((item) => normalizeMessage(item)) as AskMessage[]) : store.messages,
        pending: false,
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_search_result") {
      useAskStore.setState({
        searching: false,
        searchResults: Array.isArray(message.results)
          ? message.results.map((item) => ({
              conversationId: String((item as { conversationId?: string }).conversationId || ""),
              title: String((item as { title?: string }).title || "제목 없음"),
              snippet: String((item as { snippet?: string }).snippet || "")
            }))
          : [],
        lastError: message.error ? String(message.error) : null
      });
      return;
    }

    if (message.type === "rag_retrieval_preflight_snapshot") {
      useAskStore.setState({
        ragPending: false,
        ragPreflight: normalizeRagPreflight((message.payload || {}) as Record<string, unknown>),
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_created" || message.type === "conversation_deleted") {
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "memory_notes") {
      useAskStore.setState({
        memoryNotes: Array.isArray(message.items)
          ? message.items.map((item) => ({
              name: String((item as { name?: string }).name || ""),
              excerpt: String((item as { excerpt?: string }).excerpt || "")
            }))
          : [],
        loadingMemoryNotes: false
      });
      return;
    }

    if (message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || message.type), { source: "auth" });
      useAskStore.getState().loadMemoryNotes();
      useAskStore.getState().loadConversations();
      return;
    }

    if ((message.type === "llm_chat_result" || message.type === "llm_chat_multi_result") && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      useAskStore.setState({
        activeConversationId: typeof conversation.id === "string" ? conversation.id : store.activeConversationId,
        messages: Array.isArray(conversation.messages) ? (conversation.messages.map((item) => normalizeMessage(item)) as AskMessage[]) : store.messages,
        multiResult: message.type === "llm_chat_multi_result" ? normalizeMultiResult(message) : store.multiResult,
        pending: false,
        lastError: null
      });
      return;
    }

    if (message.type === "error") {
      useAskStore.setState({ pending: false, ragPending: false, searching: false, loadingConversations: false, loadingMemoryNotes: false, lastError: String(message.message || "오류") });
    }
    });
  }, []);
}

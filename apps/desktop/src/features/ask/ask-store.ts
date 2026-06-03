import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopAsk, requestDesktopSettings, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
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

type AskState = {
  conversations: AskConversationItem[];
  memoryNotes: Array<{ name: string; excerpt: string }>;
  messages: AskMessage[];
  activeConversationId: string | null;
  searchQuery: string;
  searchResults: Array<{ conversationId: string; title: string; snippet: string }>;
  input: string;
  pending: boolean;
  loadingConversations: boolean;
  loadingMemoryNotes: boolean;
  searching: boolean;
  lastError: string | null;
  setInput: (value: string) => void;
  loadConversations: () => void;
  loadMemoryNotes: () => void;
  openConversation: (item: AskConversationItem) => void;
  createConversation: () => void;
  renameConversation: (item: AskConversationItem) => void;
  deleteConversation: (item: AskConversationItem) => void;
  saveConversationToMemory: (item: AskConversationItem) => void;
  searchConversations: (query: string) => void;
  clearSearch: () => void;
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

export const useAskStore = create<AskState>((set, get) => ({
  conversations: [],
  memoryNotes: [],
  messages: [],
  activeConversationId: null,
  searchQuery: "",
  searchResults: [],
  input: "",
  pending: false,
  loadingConversations: false,
  loadingMemoryNotes: false,
  searching: false,
  lastError: null,
  setInput: (value) => set({ input: value }),
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
  renameConversation: (item) => {
    const next = window.prompt("새 대화 제목을 입력하세요.", item.title || "");
    const title = String(next || "").trim();
    if (!title || title === item.title) {
      return;
    }
    if (!requestDesktopAsk.updateConversationMeta(item.id, title)) {
      set({ lastError: "대화 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteConversation: (item) => {
    if (!window.confirm(`대화 "${item.title || item.id}"를 삭제할까요?`)) {
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
  sendMessage: () => {
    const text = String(get().input || "").trim();
    if (!text) {
      return;
    }
    const nextMessages: AskMessage[] = [...get().messages, { role: "user", text }];
    set({ messages: nextMessages, input: "", pending: true });
    if (!requestDesktopAsk.chatSingle(text, get().activeConversationId)) {
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

    if (message.type === "llm_chat_result" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      useAskStore.setState({
        activeConversationId: typeof conversation.id === "string" ? conversation.id : store.activeConversationId,
        messages: Array.isArray(conversation.messages) ? (conversation.messages.map((item) => normalizeMessage(item)) as AskMessage[]) : store.messages,
        pending: false,
        lastError: null
      });
      return;
    }

    if (message.type === "error") {
      useAskStore.setState({ pending: false, searching: false, loadingConversations: false, loadingMemoryNotes: false, lastError: String(message.message || "오류") });
    }
    });
  }, []);
}

import { requestAskHistory } from "./ask-history-requests";
import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { requestDesktopAsk } from "../middleware/desktop-message-gateway";
import { parseTags, tagsToText } from "./ask-normalization";
import type { AskState } from "./ask-types";
import type { AskSet } from "./ask-types";

export function createAskHistoryActions(set: AskSet, get: () => AskState): Pick<AskState, "setConversationSelectionMode" | "toggleConversationSelection" | "patchMetaDraft" | "saveConversationMeta" | "loadConversations" | "openConversation" | "createConversation" | "renameConversation" | "deleteConversation" | "deleteSelectedConversations" | "setSearchInput" | "searchConversations" | "clearSearch"> {
  return {
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
    if (!requestAskHistory("meta", "update_conversation_meta", id => requestDesktopAsk.updateConversationMeta(conversationId, next, id), { conversationId, meta: next })) {
      set({ lastError: "대화 메타 저장 요청을 전송하지 못했다." });
    }
  },
  loadConversations: () => {
    set({ loadingConversations: true });
    if (!requestAskHistory("list", "list_conversations", id => requestDesktopAsk.listConversations("chat", get().chatMode, id))) {
      set({ loadingConversations: false, lastError: "대화 목록 요청을 전송하지 못했다." });
    }
  },
  openConversation: (item) => {
    if (get().pending) return;
    if (!item.id) {
      return;
    }
    set({ pending: true, lastError: null });
    if (!requestAskHistory("detail", "get_conversation", id => requestDesktopAsk.getConversation(item.id, id), { conversationId: item.id })) {
      set({ pending: false, lastError: "대화를 불러오지 못했습니다. 이전 대화는 유지됩니다." });
    }
  },
  createConversation: () => {
    if (get().pending) return;
    set({ pending: true, lastError: null });
    if (!requestAskHistory("create", "create_conversation", id => requestDesktopAsk.createConversation("chat", get().chatMode, {}, id))) {
      set({ pending: false, lastError: "새 대화를 만들지 못했습니다. 이전 대화는 유지됩니다." });
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
    if (!requestAskHistory(`rename-${item.id}`, "update_conversation_meta", id => requestDesktopAsk.updateConversationMeta(item.id, {
      title,
      project: item.project,
      category: item.category,
      tags: tagsToText(item.tags)
    }, id), { conversationId: item.id })) {
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
    if (!requestAskHistory(`delete-${item.id}`, "delete_conversation", id => requestDesktopAsk.deleteConversation(item.id, "chat", item.mode || get().chatMode, id), { conversationId: item.id })) {
      set({ lastError: "대화 삭제 요청을 전송하지 못했다." });
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
    let sent = 0;
    for (const id of ids) {
      if (requestAskHistory(`delete-${id}`, "delete_conversation", requestId => requestDesktopAsk.deleteConversation(id, "chat", mode, requestId), { conversationId: id })) {
        sent += 1;
      }
    }
    if (sent === 0) {
      set({ lastError: "대화 일괄 삭제 요청을 전송하지 못했다." });
      return;
    }
    set({
      conversationSelectionMode: false,
      lastError: sent === ids.length ? null : `일부 대화 삭제 요청만 전송했습니다. (${sent}/${ids.length})`
    });
  },
  setSearchInput: (query) => set({ searchInput: query }),
  searchConversations: (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      set({ searchInput: "", searchQuery: "", searchResults: [], searching: false });
      return;
    }
    set({ searchInput: trimmed, searchQuery: trimmed, searchResults: [], searching: true });
    if (!requestAskHistory("search", "conversation_search", id => requestDesktopAsk.searchConversation(trimmed, 20, id))) {
      set({ searching: false, lastError: "대화 검색 요청을 전송하지 못했다." });
    }
  },
  clearSearch: () => set({ searchInput: "", searchQuery: "", searchResults: [], searching: false })
  };
}

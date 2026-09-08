import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { requestDesktopAsk, requestDesktopSettings } from "../middleware/desktop-message-gateway";
import type { AskState } from "./ask-types";
import type { AskSet } from "./ask-types";

export function createAskMemoryActions(set: AskSet, get: () => AskState): Pick<AskState, "loadMemoryNotes" | "saveConversationToMemory" | "createActiveConversationMemoryNote" | "toggleMemoryNote" | "readMemoryNote" | "renameMemoryNote" | "deleteSelectedMemoryNotes" | "clearScopeMemory"> {
  return {
  loadMemoryNotes: () => {
    set({ loadingMemoryNotes: true });
    if (!requestDesktopSettings.listMemoryNotes()) {
      set({ loadingMemoryNotes: false, lastError: "메모리 노트 요청을 전송하지 못했다." });
    }
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
  }
  };
}

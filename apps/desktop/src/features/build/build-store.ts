import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopCoding,
  requestDesktopRefactor,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";

export type BuildMessage = { role: string; text: string };

export type RollbackStatus = {
  pending: boolean;
  ok: boolean | null;
  message: string;
  changedPaths: string[];
};

type ConversationRecord = { id?: string; messages?: unknown[] };

type BuildState = {
  codingInput: string;
  running: boolean;
  progress: string;
  messages: BuildMessage[];
  conversationId: string;
  lastError: string;
  rollbackId: string;
  rollbackStatus: RollbackStatus;
  setCodingInput: (value: string) => void;
  setRollbackId: (value: string) => void;
  runCoding: () => void;
  clearResult: () => void;
  restoreRollback: () => void;
};

function normalizeMessage(item: unknown): BuildMessage {
  const record = item as Record<string, unknown>;
  return {
    role: record && record.role === "user" ? "user" : "ai",
    text: String((record && record.text) || "")
  };
}

const IDLE_ROLLBACK: RollbackStatus = { pending: false, ok: null, message: "", changedPaths: [] };

export const useBuildStore = create<BuildState>((set, get) => ({
  codingInput: "",
  running: false,
  progress: "",
  messages: [],
  conversationId: "",
  lastError: "",
  rollbackId: "",
  rollbackStatus: { ...IDLE_ROLLBACK },
  setCodingInput: (value) => set({ codingInput: value }),
  setRollbackId: (value) => set({ rollbackId: value }),
  runCoding: () => {
    const input = get().codingInput.trim();
    if (!input) {
      return;
    }
    set({
      running: true,
      progress: "코딩 실행 요청 전송…",
      lastError: "",
      messages: [...get().messages, { role: "user", text: input }]
    });
    if (!requestDesktopCoding.runSingle(input, get().conversationId || undefined)) {
      set({ running: false, progress: "", lastError: "코딩 실행 요청을 전송하지 못했다." });
    } else {
      set({ codingInput: "" });
    }
  },
  clearResult: () => set({ messages: [], progress: "", conversationId: "" }),
  restoreRollback: () => {
    const rollbackId = get().rollbackId.trim();
    if (!rollbackId) {
      set({ rollbackStatus: { pending: false, ok: false, message: "rollbackId가 필요하다.", changedPaths: [] } });
      return;
    }
    set({ rollbackStatus: { pending: true, ok: null, message: "rollback 복원 요청 중…", changedPaths: [] } });
    if (!requestDesktopRefactor.restore(rollbackId)) {
      set({ rollbackStatus: { pending: false, ok: false, message: "미들웨어 연결이 필요하다.", changedPaths: [] } });
    }
  }
}));

export function useBuildPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "coding_progress") {
        const phase = String(message.phase || message.stageTitle || "");
        const text = String(message.message || "");
        useBuildStore.setState({
          progress: [phase, text].filter(Boolean).join(" · ") || "실행 중…",
          running: message.done === true ? useBuildStore.getState().running : true
        });
        return;
      }

      if (message.type === "coding_result" || message.type === "llm_chat_result") {
        const conversation = (message.conversation as ConversationRecord | undefined) || {};
        useBuildStore.setState({
          running: false,
          progress: "",
          conversationId: String(conversation.id || useBuildStore.getState().conversationId),
          messages: Array.isArray(conversation.messages)
            ? conversation.messages.map((item) => normalizeMessage(item))
            : useBuildStore.getState().messages
        });
        return;
      }

      if (message.type === "refactor_result" && message.action === "restore") {
        const payload = (message.payload as Record<string, unknown> | undefined) || {};
        const rollbackResult = (payload.rollbackResult as Record<string, unknown> | undefined) || {};
        const ok = payload.ok !== false;
        useBuildStore.setState({
          rollbackStatus: {
            pending: false,
            ok,
            message: String(payload.message || (ok ? "rollback 복원 완료." : "rollback 복원 실패.")),
            changedPaths: Array.isArray(rollbackResult.changedPaths)
              ? (rollbackResult.changedPaths as unknown[]).map(String)
              : []
          },
          rollbackId: String(rollbackResult.rollbackId || useBuildStore.getState().rollbackId)
        });
        return;
      }

      if (message.type === "error") {
        useBuildStore.setState({
          running: false,
          progress: "",
          lastError: String(message.message || "오류"),
          rollbackStatus: { ...useBuildStore.getState().rollbackStatus, pending: false }
        });
      }
    });
  }, []);
}

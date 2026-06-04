import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopTelegram } from "../middleware/telegram-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type PendingTelegramAction = "save" | "delete" | "test" | "load" | "";

type TelegramSettingsState = {
  botTokenInput: string;
  chatIdInput: string;
  persist: boolean;
  botTokenSet: boolean;
  chatIdSet: boolean;
  botTokenMasked: string;
  chatIdMasked: string;
  remoteDashboardClient: boolean;
  loading: boolean;
  pendingAction: PendingTelegramAction;
  message: string;
  setBotTokenInput: (value: string) => void;
  setChatIdInput: (value: string) => void;
  setPersist: (value: boolean) => void;
  loadSettings: () => void;
  saveCredentials: () => void;
  sendTest: () => void;
  deleteCredentials: () => void;
};

function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export const useTelegramSettingsStore = create<TelegramSettingsState>((set, get) => ({
  botTokenInput: "",
  chatIdInput: "",
  persist: true,
  botTokenSet: false,
  chatIdSet: false,
  botTokenMasked: "",
  chatIdMasked: "",
  remoteDashboardClient: false,
  loading: false,
  pendingAction: "",
  message: "",
  setBotTokenInput: (value) => set({ botTokenInput: value }),
  setChatIdInput: (value) => set({ chatIdInput: value }),
  setPersist: (value) => set({ persist: value }),
  loadSettings: () => {
    set({ loading: true, pendingAction: "load", message: "" });
    if (!requestDesktopTelegram.settings()) {
      set({ loading: false, pendingAction: "", message: "Telegram 설정 조회 요청을 전송하지 못했다." });
    }
  },
  saveCredentials: () => {
    const state = get();
    const hasToken = state.botTokenInput.trim() || state.botTokenSet;
    const hasChat = state.chatIdInput.trim() || state.chatIdSet;
    if (!hasToken || !hasChat) {
      set({ message: "Bot Token과 Chat ID가 모두 필요하다." });
      return;
    }
    set({ loading: true, pendingAction: "save", message: "" });
    if (!requestDesktopTelegram.save(state.botTokenInput, state.chatIdInput, state.persist)) {
      set({ loading: false, pendingAction: "", message: "Telegram 보안 저장 요청을 전송하지 못했다." });
    }
  },
  sendTest: () => {
    set({ loading: true, pendingAction: "test", message: "" });
    if (!requestDesktopTelegram.test()) {
      set({ loading: false, pendingAction: "", message: "Telegram 테스트 전송 요청을 전송하지 못했다." });
    }
  },
  deleteCredentials: async () => {
    const state = get();
    const confirmed = await requestConfirmDialog({
      title: "Telegram 연동 삭제",
      message: state.persist
        ? "Telegram Bot Token과 Chat ID를 현재 세션과 보안 저장소에서 삭제할까요?"
        : "Telegram Bot Token과 Chat ID를 현재 실행 중인 세션에서 삭제할까요?",
      confirmLabel: "연동 삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ loading: true, pendingAction: "delete", message: "" });
    if (!requestDesktopTelegram.deleteCredentials(state.persist)) {
      set({ loading: false, pendingAction: "", message: "Telegram 연동 삭제 요청을 전송하지 못했다." });
    }
  }
}));

export function useTelegramSettingsBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "settings_state") {
        useTelegramSettingsStore.setState({
          botTokenSet: !!message.telegramBotTokenSet,
          chatIdSet: !!message.telegramChatIdSet,
          botTokenMasked: s(message.telegramBotTokenMasked),
          chatIdMasked: s(message.telegramChatIdMasked),
          remoteDashboardClient: !!message.remoteDashboardClient,
          loading: false,
          pendingAction: ""
        });
        return;
      }

      if (message.type === "settings_result") {
        const pendingAction = useTelegramSettingsStore.getState().pendingAction;
        if (!pendingAction) return;
        const ok = message.ok !== false;
        useTelegramSettingsStore.setState({
          botTokenInput: pendingAction === "delete" && ok ? "" : useTelegramSettingsStore.getState().botTokenInput,
          chatIdInput: pendingAction === "delete" && ok ? "" : useTelegramSettingsStore.getState().chatIdInput,
          loading: false,
          pendingAction: "",
          message: s(message.message || "Telegram 설정 응답을 수신했다.")
        });
        return;
      }

      if (message.type === "error" && useTelegramSettingsStore.getState().pendingAction) {
        useTelegramSettingsStore.setState({ loading: false, pendingAction: "", message: s(message.message) || "Telegram 설정 오류" });
      }
    });
  }, []);
}

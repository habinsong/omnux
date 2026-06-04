import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopExternalAccess } from "../middleware/external-access-gateway";
import { requestDesktopTelegram } from "../middleware/telegram-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type PendingExternalAction = "toggle" | "";

type ExternalAccessState = {
  enabled: boolean;
  urls: string[];
  remoteDashboardClient: boolean;
  loading: boolean;
  pendingAction: PendingExternalAction;
  message: string;
  refresh: () => void;
  setEnabled: (next: boolean) => void;
};

function toUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export const useExternalAccessStore = create<ExternalAccessState>((set, get) => ({
  enabled: false,
  urls: [],
  remoteDashboardClient: false,
  loading: false,
  pendingAction: "",
  message: "",
  refresh: () => {
    set({ loading: true, message: "" });
    if (!requestDesktopTelegram.settings()) {
      set({ loading: false, message: "외부접속 상태 조회 요청을 전송하지 못했다." });
    }
  },
  setEnabled: async (next) => {
    if (get().remoteDashboardClient) {
      set({ message: "원격 대시보드에서는 외부접속 설정을 변경할 수 없다." });
      return;
    }
    if (next) {
      const confirmed = await requestConfirmDialog({
        title: "외부접속 허용",
        message: "같은 LAN의 다른 기기가 이 대시보드에 접속할 수 있게 됩니다. 신뢰할 수 있는 네트워크에서만 허용하세요.",
        confirmLabel: "외부접속 허용",
        tone: "danger"
      });
      if (!confirmed) return;
    }
    set({ loading: true, pendingAction: "toggle", message: "" });
    if (!requestDesktopExternalAccess.setEnabled(next)) {
      set({ loading: false, pendingAction: "", message: "외부접속 설정 변경 요청을 전송하지 못했다. 인증 상태를 확인하세요." });
    }
  }
}));

export function useExternalAccessBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "settings_state") {
        useExternalAccessStore.setState({
          enabled: !!message.externalDashboardEnabled,
          urls: toUrlList(message.dashboardExternalUrls),
          remoteDashboardClient: !!message.remoteDashboardClient,
          loading: false,
          pendingAction: ""
        });
        return;
      }

      if (message.type === "settings_result" && useExternalAccessStore.getState().pendingAction === "toggle") {
        useExternalAccessStore.setState({
          loading: false,
          pendingAction: "",
          message: String(message.message || "외부접속 설정 응답을 수신했다.")
        });
        return;
      }

      if (message.type === "error" && useExternalAccessStore.getState().pendingAction === "toggle") {
        useExternalAccessStore.setState({
          loading: false,
          pendingAction: "",
          message: String(message.message || "외부접속 설정 오류")
        });
      }
    });
  }, []);
}

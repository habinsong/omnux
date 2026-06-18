import { useEffect } from "react";
import { create } from "zustand";
import { toDataURL } from "qrcode";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopTotp } from "../middleware/totp-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type TotpPendingAction = "begin" | "confirm" | "disable" | "";

type TotpSettingsState = {
  enrolled: boolean;
  secret: string; // 등록 진행 중인 시크릿(인증 앱 수동 입력용)
  otpauthUri: string;
  qrDataUrl: string; // otpauth URI를 렌더링한 QR 이미지 data URL
  codeInput: string;
  loading: boolean;
  pendingAction: TotpPendingAction;
  message: string;
  setCodeInput: (value: string) => void;
  beginEnroll: () => void;
  confirmEnroll: () => void;
  cancelEnroll: () => void;
  disable: () => void;
};

function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export const useTotpSettingsStore = create<TotpSettingsState>((set, get) => ({
  enrolled: false,
  secret: "",
  otpauthUri: "",
  qrDataUrl: "",
  codeInput: "",
  loading: false,
  pendingAction: "",
  message: "",
  setCodeInput: (value) => set({ codeInput: value.replace(/\D/g, "").slice(0, 6) }),
  beginEnroll: () => {
    set({ loading: true, pendingAction: "begin", message: "", secret: "", otpauthUri: "", qrDataUrl: "", codeInput: "" });
    if (!requestDesktopTotp.beginEnroll()) {
      set({ loading: false, pendingAction: "", message: "등록 요청을 전송하지 못했다." });
    }
  },
  confirmEnroll: () => {
    const code = get().codeInput.trim();
    if (code.length !== 6) {
      set({ message: "인증 앱의 6자리 코드를 입력하세요." });
      return;
    }
    set({ loading: true, pendingAction: "confirm", message: "" });
    if (!requestDesktopTotp.confirmEnroll(code)) {
      set({ loading: false, pendingAction: "", message: "확인 요청을 전송하지 못했다." });
    }
  },
  cancelEnroll: () => set({ secret: "", otpauthUri: "", qrDataUrl: "", codeInput: "", message: "", pendingAction: "" }),
  disable: async () => {
    const confirmed = await requestConfirmDialog({
      title: "인증 앱 해제",
      message: "등록된 인증 앱(TOTP)을 해제할까요? 해제 후에는 이 인증 앱 코드로 로그인할 수 없습니다.",
      confirmLabel: "해제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ loading: true, pendingAction: "disable", message: "" });
    if (!requestDesktopTotp.disable()) {
      set({ loading: false, pendingAction: "", message: "해제 요청을 전송하지 못했다." });
    }
  }
}));

export function useTotpSettingsBridge() {
  useEffect(() => {
    requestDesktopTotp.loadStatus();
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      // 등록 여부는 연결 시(auth_required)와 설정 스냅샷(settings_state) 양쪽에서 반영된다.
      if (message.type === "auth_required" || message.type === "settings_state") {
        if (typeof message.totpEnrolled === "boolean") {
          useTotpSettingsStore.setState({ enrolled: message.totpEnrolled });
        }
        return;
      }

      if (message.type === "totp_enroll_result") {
        const secret = s(message.secret);
        const otpauthUri = s(message.otpauthUri);
        useTotpSettingsStore.setState({
          loading: false,
          pendingAction: "",
          secret,
          otpauthUri,
          qrDataUrl: "",
          codeInput: "",
          message: "인증 앱으로 아래 QR을 스캔한 뒤, 앱에 표시된 6자리 코드를 입력해 등록을 완료하세요."
        });
        if (otpauthUri) {
          toDataURL(otpauthUri, { margin: 1, width: 220 })
            .then((url) => {
              // 그 사이 취소/재발급되지 않았을 때만 반영한다.
              if (useTotpSettingsStore.getState().otpauthUri === otpauthUri) {
                useTotpSettingsStore.setState({ qrDataUrl: url });
              }
            })
            .catch(() => {
              /* QR 렌더 실패 시 수동 시크릿 입력으로 대체 */
            });
        }
        return;
      }

      if (message.type === "totp_confirm_result") {
        const ok = message.ok === true;
        const prev = useTotpSettingsStore.getState();
        useTotpSettingsStore.setState({
          loading: false,
          pendingAction: "",
          enrolled: ok ? true : prev.enrolled,
          secret: ok ? "" : prev.secret,
          otpauthUri: ok ? "" : prev.otpauthUri,
          qrDataUrl: ok ? "" : prev.qrDataUrl,
          codeInput: "",
          message: s(message.message) || (ok ? "인증 앱이 등록되었습니다." : "코드가 올바르지 않습니다.")
        });
        return;
      }

      if (message.type === "totp_disable_result") {
        const ok = message.ok === true;
        useTotpSettingsStore.setState({
          loading: false,
          pendingAction: "",
          enrolled: ok ? false : useTotpSettingsStore.getState().enrolled,
          message: s(message.message) || (ok ? "인증 앱 등록을 해제했습니다." : "해제에 실패했습니다.")
        });
        return;
      }
    });
  }, []);
}

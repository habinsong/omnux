import { registerDesktopPublicRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 인증 앱(TOTP) 등록/해제는 로컬 부트스트랩 단계(인증 전)에서도 동작해야 하므로 public 요청으로 등록한다.
// 서버도 로컬 연결에 한해 인증 전 totp_* 명령을 허용한다(분실 복구·최초 설정 경로).
registerDesktopPublicRequestTypes(
  "get_settings",
  "totp_enroll_begin",
  "totp_enroll_confirm",
  "totp_disable"
);

export const requestDesktopTotp = {
  loadStatus() {
    return sendDesktopRequest({ type: "get_settings" });
  },
  beginEnroll() {
    return sendDesktopRequest({ type: "totp_enroll_begin" });
  },
  confirmEnroll(code: string) {
    return sendDesktopRequest({ type: "totp_enroll_confirm", totpCode: code.trim() });
  },
  disable() {
    return sendDesktopRequest({ type: "totp_disable" });
  }
};

import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 같은 LAN의 다른 기기에서 대시보드에 접속하도록 허용/차단한다.
// 서버 쪽에서 인증을 요구하는 secret 영역이므로 public 이 아닌 일반 요청으로 등록한다.
registerDesktopRequestTypes("set_external_dashboard_access");

export const requestDesktopExternalAccess = {
  setEnabled(enabled: boolean) {
    return sendDesktopRequest({ type: "set_external_dashboard_access", enabled });
  }
};

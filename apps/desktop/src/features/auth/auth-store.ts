import { create } from "zustand";
import { useUiLogStore } from "../ui-log/ui-log-store";

export type DesktopAuthStatus = "unknown" | "required" | "authenticated" | "failed";
export type DesktopOtpRequestStatus = "idle" | "pending" | "sent" | "failed";

export type DesktopAuthContract = {
  status: DesktopAuthStatus;
  sessionId: string | null;
  expiresAtUtc: string | null;
  expiresAtLocal: string | null;
  ttlHours: number | null;
  telegramConfigured: boolean;
  remoteDashboardClient: boolean;
  otpRequestStatus: DesktopOtpRequestStatus;
  lastMessage: string | null;
};

type AuthResultPayload = {
  ok: boolean;
  resumed?: boolean;
  expiresAtUtc?: string;
  expiresAtLocal?: string;
  ttlHours?: number;
  remoteDashboardClient?: boolean;
};

type DesktopAuthState = {
  auth: DesktopAuthContract;
  markSessionPending: () => void;
  markAuthRequired: (sessionId: string, telegramConfigured: boolean, remoteDashboardClient: boolean) => void;
  markOtpRequestPending: () => void;
  markOtpRequestResult: (ok: boolean, message: string) => void;
  markAuthResult: (payload: AuthResultPayload) => void;
  markUnauthorized: (message?: string) => void;
};

const AUTH_TOKEN_KEY = "omnux_auth_token";
const AUTH_EXPIRES_KEY = "omnux_auth_expires_utc";

function clearLegacyAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_EXPIRES_KEY);
  } catch (_error) {
    // 저장소 접근 실패는 무시한다.
  }
}

clearLegacyAuthSession();

export const useDesktopAuthStore = create<DesktopAuthState>((set) => ({
  auth: {
    status: "unknown",
    sessionId: null,
    expiresAtUtc: null,
    expiresAtLocal: null,
    ttlHours: null,
    telegramConfigured: false,
    remoteDashboardClient: false,
    otpRequestStatus: "idle",
    lastMessage: null
  },
  markSessionPending: () =>
    set((state) => ({
      auth: {
        ...state.auth,
        status: "unknown",
        sessionId: null,
        otpRequestStatus: "idle",
        lastMessage: "세션 인증 확인 중"
      }
    })),
  markAuthRequired: (sessionId, telegramConfigured, remoteDashboardClient) =>
    set((state) => {
      useUiLogStore.getState().recordLog("info", "미들웨어가 OTP 인증을 요구했다.", { source: "auth" });
      return {
        auth: {
          ...state.auth,
          status: "required",
          sessionId,
          telegramConfigured,
          remoteDashboardClient,
          otpRequestStatus: "idle",
          lastMessage: "OTP 인증 필요"
        }
      };
    }),
  markOtpRequestPending: () =>
    set((state) => ({
      auth: {
        ...state.auth,
        otpRequestStatus: "pending",
        lastMessage: "OTP 요청 중"
      }
    })),
  markOtpRequestResult: (ok, message) =>
    set((state) => {
      useUiLogStore.getState().recordLog(ok ? "info" : "error", message, { source: "auth" });
      return {
        auth: {
          ...state.auth,
          otpRequestStatus: ok ? "sent" : "failed",
          lastMessage: message
        }
      };
    }),
  markAuthResult: (payload) =>
    set((state) => {
      clearLegacyAuthSession();

      const message = payload.ok
        ? payload.resumed
          ? "서버 인증 세션으로 연결을 복구했다."
          : "OTP 인증을 완료했다."
        : "OTP 인증에 실패했다.";
      if (payload.ok) {
        useUiLogStore.getState().clearAuthFailureLogs();
      }
      useUiLogStore.getState().recordLog(payload.ok ? "info" : "error", message, { source: "auth" });

      return {
        auth: {
          ...state.auth,
          status: payload.ok ? "authenticated" : "failed",
          expiresAtUtc: payload.ok ? payload.expiresAtUtc || state.auth.expiresAtUtc : null,
          expiresAtLocal: payload.ok ? payload.expiresAtLocal || state.auth.expiresAtLocal : null,
          ttlHours: payload.ok ? payload.ttlHours || state.auth.ttlHours : null,
          remoteDashboardClient: payload.remoteDashboardClient ?? state.auth.remoteDashboardClient,
          otpRequestStatus: payload.ok ? "idle" : state.auth.otpRequestStatus,
          lastMessage: message
        }
      };
    }),
  markUnauthorized: (message = "인증 세션이 만료되었다.") =>
    set((state) => {
      clearLegacyAuthSession();
      useUiLogStore.getState().recordLog("warn", message, { source: "auth" });
      return {
        auth: {
          ...state.auth,
          status: "required",
          expiresAtUtc: null,
          expiresAtLocal: null,
          ttlHours: null,
          otpRequestStatus: "idle",
          lastMessage: message
        }
      };
    })
}));

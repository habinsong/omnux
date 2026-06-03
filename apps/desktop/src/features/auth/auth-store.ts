import { create } from "zustand";
import { useUiLogStore } from "../ui-log/ui-log-store";

export type DesktopAuthStatus = "unknown" | "required" | "authenticated" | "failed";
export type DesktopOtpRequestStatus = "idle" | "pending" | "sent" | "failed";

export type DesktopAuthContract = {
  status: DesktopAuthStatus;
  sessionId: string | null;
  authToken: string | null;
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
  authToken?: string;
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

function readSavedAuthToken(): { token: string; expiresAtUtc: string | null } {
  if (typeof window === "undefined") {
    return { token: "", expiresAtUtc: null };
  }

  try {
    return {
      token: window.localStorage.getItem(AUTH_TOKEN_KEY) || "",
      expiresAtUtc: window.localStorage.getItem(AUTH_EXPIRES_KEY) || null
    };
  } catch (_error) {
    return { token: "", expiresAtUtc: null };
  }
}

function saveAuthSession(token: string, expiresAtUtc?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    if (expiresAtUtc) {
      window.localStorage.setItem(AUTH_EXPIRES_KEY, expiresAtUtc);
    }
  } catch (_error) {
    // 인증 토큰 저장 실패는 현재 세션 진행을 막지 않는다.
  }
}

function clearAuthSession() {
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

const savedAuth = readSavedAuthToken();

export const useDesktopAuthStore = create<DesktopAuthState>((set) => ({
  auth: {
    status: savedAuth.token ? "required" : "unknown",
    sessionId: null,
    authToken: savedAuth.token || null,
    expiresAtUtc: savedAuth.expiresAtUtc,
    expiresAtLocal: null,
    ttlHours: null,
    telegramConfigured: false,
    remoteDashboardClient: false,
    otpRequestStatus: "idle",
    lastMessage: savedAuth.token ? "저장된 인증 토큰 resume 대기" : null
  },
  markSessionPending: () =>
    set((state) => ({
      auth: {
        ...state.auth,
        status: "required",
        sessionId: null,
        otpRequestStatus: "idle",
        lastMessage: state.auth.authToken ? "저장된 인증 토큰 resume 대기" : "세션 인증 확인 중"
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
      if (payload.ok && payload.authToken) {
        saveAuthSession(payload.authToken, payload.expiresAtUtc);
      }
      if (!payload.ok) {
        clearAuthSession();
      }

      const message = payload.ok
        ? payload.resumed
          ? "저장된 인증 토큰으로 세션을 복구했다."
          : "OTP 인증을 완료했다."
        : "OTP 인증에 실패했다.";
      useUiLogStore.getState().recordLog(payload.ok ? "info" : "error", message, { source: "auth" });

      return {
        auth: {
          ...state.auth,
          status: payload.ok ? "authenticated" : "failed",
          authToken: payload.ok ? payload.authToken || state.auth.authToken : null,
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
      clearAuthSession();
      useUiLogStore.getState().recordLog("warn", message, { source: "auth" });
      return {
        auth: {
          ...state.auth,
          status: "required",
          authToken: null,
          expiresAtUtc: null,
          expiresAtLocal: null,
          ttlHours: null,
          otpRequestStatus: "idle",
          lastMessage: message
        }
      };
    })
}));

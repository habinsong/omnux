import { useEffect } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { bindDesktopSessionSocket, publishDesktopMessage, requestDesktopAuth } from "./features/middleware/desktop-message-gateway";
import { requestDesktopOps } from "./features/middleware/ops-gateway";
import { useOpsPageStore } from "./features/ops/ops-store";
import { useUiLogStore } from "./features/ui-log/ui-log-store";
import { DESKTOP_MIDDLEWARE_WS_URL, DESKTOP_RECONNECT_POLICY } from "./middleware-contract";
import { useDesktopShellStore } from "./shell-store";

type ServerMessage = Record<string, unknown> & {
  type?: string;
};

let sessionSocket: WebSocket | null = null;
let sessionSocketUrl = "";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectPayload(value: unknown): { items?: Array<Record<string, unknown>> } {
  return value && typeof value === "object" ? (value as { items?: Array<Record<string, unknown>> }) : {};
}

function isRateLimitedMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "rate_limited" || normalized.includes("rate limit");
}

function formatServerErrorMessage(message: ServerMessage, fallback: string): string {
  if (!isRateLimitedMessage(fallback)) return fallback;
  const requestType = stringValue(message.requestType) || "unknown";
  const requestAction = stringValue(message.requestAction);
  const limitPerMinute = numberValue(message.limitPerMinute);
  const windowSeconds = numberValue(message.windowSeconds);
  const target = requestAction ? `${requestType}/${requestAction}` : requestType;
  const limit = limitPerMinute ? `${limitPerMinute}/min` : "limit unknown";
  const window = windowSeconds ? `, window=${windowSeconds}s` : "";
  return `rate_limited: ${target} (${limit}${window})`;
}

function handleAuthRequired(message: ServerMessage) {
  const authStore = useDesktopAuthStore.getState();
  authStore.markAuthRequired(
    stringValue(message.sessionId),
    booleanValue(message.telegramConfigured),
    booleanValue(message.remoteDashboardClient)
  );
  const token = useDesktopAuthStore.getState().auth.authToken;
  if (token) {
    requestDesktopAuth.resume(stringValue(message.sessionId), token);
  }
}

function handleServerMessage(message: ServerMessage) {
  publishDesktopMessage(message);
  const shellStore = useDesktopShellStore.getState();
  const authStore = useDesktopAuthStore.getState();
  const opsStore = useOpsPageStore.getState();
  shellStore.markBridgeStatus("connected");

  if (message.type === "auth_required") {
    handleAuthRequired(message);
    return;
  }

  if (message.type === "auth_result") {
    authStore.markAuthResult({
      ok: booleanValue(message.ok),
      resumed: booleanValue(message.resumed),
      authToken: stringValue(message.authToken),
      expiresAtUtc: stringValue(message.expiresAtUtc),
      expiresAtLocal: stringValue(message.expiresAtLocal),
      ttlHours: numberValue(message.ttlHours),
      remoteDashboardClient: booleanValue(message.remoteDashboardClient)
    });
    return;
  }

  if (message.type === "otp_request_result") {
    authStore.markOtpRequestResult(booleanValue(message.ok), stringValue(message.message) || "OTP 요청 결과를 받았다.");
    return;
  }

  if (message.type === "doctor_result") {
    opsStore.markDoctorResult({
      found: booleanValue(message.found),
      report: message.report && typeof message.report === "object"
        ? (message.report as {
            reportId?: string;
            createdAtUtc?: string;
            checks?: Array<Record<string, unknown>>;
            okCount?: number;
            warnCount?: number;
            failCount?: number;
            skipCount?: number;
          })
        : null
    });
    return;
  }

  if (message.type === "plan_list_result") {
    opsStore.markPlanListResult(objectPayload(message.payload));
    return;
  }

  if (message.type === "task_graph_list_result") {
    opsStore.markTaskGraphListResult(objectPayload(message.payload));
    return;
  }

  if (message.type === "error") {
    const rawText = stringValue(message.message) || "미들웨어 WS 오류";
    if (rawText.toLowerCase().includes("unauthorized")) {
      authStore.markUnauthorized("세션 인증이 만료되었다. OTP 인증 후 다시 시도할 수 있다.");
      return;
    }
    const text = formatServerErrorMessage(message, rawText);
    useUiLogStore.getState().recordLog("error", text, { source: "middleware" });
    const doctor = opsStore.doctor;
    if (doctor.loading || doctor.running || doctor.fixPreviewing || doctor.fixApplying) {
      opsStore.markDoctorError(text);
    }
  }
}

export function requestDesktopOtp() {
  useDesktopAuthStore.getState().markOtpRequestPending();
  requestDesktopAuth.otp();
}

export function submitDesktopOtp(otp: string, authTtlHours = 24) {
  const code = otp.trim();
  if (!code) {
    useDesktopShellStore.getState().markBridgeStatus("error", "OTP 6자리를 입력해야 한다.");
    return;
  }

  requestDesktopAuth.submit(code, authTtlHours);
}

export function requestDesktopDoctorLast() {
  const auth = useDesktopAuthStore.getState().auth;
  const opsStore = useOpsPageStore.getState();
  if (auth.status !== "authenticated") {
    opsStore.markDoctorError("인증 후 Doctor 보고서를 조회할 수 있다.");
    return;
  }

  opsStore.markDoctorLoading();
  if (!requestDesktopOps.doctorLast()) {
    opsStore.markDoctorError("Doctor 조회 요청을 전송하지 못했다.");
  }
}

export function requestDesktopOpsSnapshot() {
  const auth = useDesktopAuthStore.getState().auth;
  const opsStore = useOpsPageStore.getState();
  if (auth.status !== "authenticated") {
    opsStore.markOpsError("인증 후 운영 목록을 조회할 수 있다.");
    return;
  }

  opsStore.markOpsLoading();
  const planSent = requestDesktopOps.planList();
  const taskSent = requestDesktopOps.taskGraphList();
  if (!planSent || !taskSent) {
    opsStore.markOpsError("운영 목록 조회 요청을 전송하지 못했다.");
  }
}

export function useMiddlewareSessionBridge() {
  useEffect(() => {
    let disposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = (wsUrl: string) => {
      if (disposed || !wsUrl) {
        return;
      }
      if (reconnectAttempts >= DESKTOP_RECONNECT_POLICY.maxAttempts) {
        useDesktopShellStore.getState().markBridgeStatus(
          "error",
          `데스크톱 WS 세션 브릿지 재연결 한도를 초과했다 (${wsUrl})`
        );
        return;
      }
      reconnectAttempts += 1;
      const delayMs = Math.min(
        DESKTOP_RECONNECT_POLICY.initialDelayMs * reconnectAttempts,
        DESKTOP_RECONNECT_POLICY.maxDelayMs
      );
      useDesktopShellStore.getState().markBridgeStatus("connecting");
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect(wsUrl);
      }, delayMs);
    };

    const connect = (wsUrl: string) => {
      clearReconnectTimer();
      if (!wsUrl || (sessionSocket && sessionSocketUrl === wsUrl && sessionSocket.readyState <= WebSocket.OPEN)) {
        return;
      }

      if (sessionSocket) {
        try {
          sessionSocket.close();
        } catch (_err) {
          // 이미 종료 중인 소켓은 무시한다.
        }
      }

      const socket = new WebSocket(wsUrl);
      sessionSocket = socket;
      sessionSocketUrl = wsUrl;
      bindDesktopSessionSocket(socket);
      // 연결 시도 자체는 노이즈가 되므로 메시지 없이 상태만 갱신한다(부팅/재연결 스팸 방지).
      useDesktopShellStore.getState().markBridgeStatus("connecting");

      socket.addEventListener("open", () => {
        if (!disposed && sessionSocket === socket) {
          reconnectAttempts = 0;
          useDesktopAuthStore.getState().markSessionPending();
          useDesktopShellStore.getState().markBridgeStatus("connected", `데스크톱 WS 세션 브릿지 연결됨 (${wsUrl})`);
        }
      });

      socket.addEventListener("message", (event) => {
        if (disposed || sessionSocket !== socket) {
          return;
        }

        try {
          handleServerMessage(JSON.parse(String(event.data || "{}")) as ServerMessage);
        } catch (error) {
          useDesktopShellStore.getState().markBridgeStatus(
            "error",
            error instanceof Error ? error.message : "미들웨어 WS 메시지 파싱 실패"
          );
        }
      });

      socket.addEventListener("error", () => {
        if (!disposed && sessionSocket === socket) {
          // attempt별 연결 실패는 기록하지 않는다(부팅 레이스/일시 단절은 정상).
          // 실제 실패는 재연결 한도 초과 시 scheduleReconnect가 error로 보고한다.
          useDesktopShellStore.getState().markBridgeStatus("error");
        }
      });

      socket.addEventListener("close", () => {
        if (!disposed && sessionSocket === socket) {
          bindDesktopSessionSocket(null);
          sessionSocket = null;
          sessionSocketUrl = "";
          // 소켓 종료 후 곧바로 재연결하므로 종료 자체는 기록하지 않는다(warn 스팸 방지).
          useDesktopShellStore.getState().markBridgeStatus("closed");
          scheduleReconnect(wsUrl);
        }
      });
    };

    const initialWsUrl = useDesktopShellStore.getState().runtime.wsUrl || DESKTOP_MIDDLEWARE_WS_URL;
    connect(initialWsUrl);
    const unsubscribe = useDesktopShellStore.subscribe((state, previous) => {
      if (state.runtime.wsUrl !== previous.runtime.wsUrl) {
        connect(state.runtime.wsUrl);
      }
    });

    return () => {
      disposed = true;
      clearReconnectTimer();
      unsubscribe();
      const socket = sessionSocket;
      sessionSocket = null;
      sessionSocketUrl = "";
      bindDesktopSessionSocket(null);
      try {
        socket?.close();
      } catch (_err) {
        // unmount 중 close 실패는 무시한다.
      }
    };
  }, []);
}

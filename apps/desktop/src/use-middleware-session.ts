import { useEffect } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { bindDesktopSessionSocket, publishDesktopMessage, requestDesktopAuth, shouldToastDesktopError } from "./features/middleware/desktop-message-gateway";
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
// 재연결 시도 횟수는 백오프 계산에만 쓰이므로 무한히 키우지 않고 상한을 둔다.
const RECONNECT_ATTEMPT_CEILING = 1000;

function closeSessionSocket(socket: WebSocket | null) {
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    return;
  }
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.addEventListener("open", () => socket.close(), { once: true });
    return;
  }
  socket.close();
}

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
}

function handleServerMessage(message: ServerMessage) {
  const toastError = shouldToastDesktopError(message);
  publishDesktopMessage(message);
  const shellStore = useDesktopShellStore.getState();
  const authStore = useDesktopAuthStore.getState();
  const opsStore = useOpsPageStore.getState();
  shellStore.markBridgeStatus("connected");

  if (message.type === "notebook_result" || message.type === "routine_result" || message.type === "plan_result") {
    const payload = message.payload && typeof message.payload === "object" ? message.payload as Record<string, unknown> : {};
    const label = {notebook_result: "노트 처리 결과", routine_result: "자동화 처리 결과", plan_result: "작업 계획 처리 결과"}[message.type];
    useUiLogStore.getState().recordLog("info", String(payload.message || message.message || label), {source:"operations"});
    return;
  }

  if (message.type === "auth_required") {
    handleAuthRequired(message);
    return;
  }

  if (message.type === "auth_result") {
    authStore.markAuthResult({
      ok: booleanValue(message.ok),
      resumed: booleanValue(message.resumed),
      expiresAtUtc: stringValue(message.expiresAtUtc),
      expiresAtLocal: stringValue(message.expiresAtLocal),
      ttlHours: numberValue(message.ttlHours),
      remoteDashboardClient: booleanValue(message.remoteDashboardClient)
    });
    return;
  }

  if (message.type === "otp_request_result") {
    authStore.markOtpRequestResult(booleanValue(message.ok), stringValue(message.message) || "로그인 코드를 보냈습니다");
    return;
  }

  if (message.type === "settings_state") {
    // settings_state 는 연결/설정 변경 시마다 브로드캐스트된다. 텔레그램 연결 여부를
    // 최초 auth_required 핸드셰이크가 아니라 실시간 설정 상태에서 갱신해, 나중에
    // 설정탭에서 연결해도 자동화탭 등에서 "미설정"으로 굳지 않게 한다.
    authStore.setTelegramConfigured(
      booleanValue(message.telegramBotTokenSet) && booleanValue(message.telegramChatIdSet)
    );
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
    const rawText = stringValue(message.message) || "서버 오류";
    if (rawText.toLowerCase().includes("unauthorized")) {
      authStore.markUnauthorized("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }
    const text = formatServerErrorMessage(message, rawText);
    useUiLogStore.getState().recordLog("error", text, { source: "middleware", toast: toastError });
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
    useDesktopShellStore.getState().markBridgeStatus("error", "OTP 6자리를 입력해 주세요.");
    return;
  }

  requestDesktopAuth.submit(code, authTtlHours);
}

export function requestDesktopDoctorLast() {
  const auth = useDesktopAuthStore.getState().auth;
  const opsStore = useOpsPageStore.getState();
  if (auth.status !== "authenticated") {
    opsStore.markDoctorError("로그인한 뒤에 진단 결과를 볼 수 있습니다.");
    return;
  }

  opsStore.markDoctorLoading();
  if (!requestDesktopOps.doctorLast()) {
    opsStore.markDoctorError("진단 결과를 불러오지 못했습니다.");
  }
}

export function requestDesktopOpsSnapshot() {
  const auth = useDesktopAuthStore.getState().auth;
  const opsStore = useOpsPageStore.getState();
  if (auth.status !== "authenticated") {
    opsStore.markOpsError("로그인한 뒤에 운영 목록을 볼 수 있습니다.");
    return;
  }

  opsStore.markOpsLoading();
  const planSent = requestDesktopOps.planList();
  const taskSent = requestDesktopOps.taskGraphList();
  if (!planSent || !taskSent) {
    opsStore.markOpsError("운영 목록을 불러오지 못했습니다.");
  }
}

export function useMiddlewareSessionBridge() {
  useEffect(() => {
    let disposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: number | null = null;
    let initialConnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearInitialConnectTimer = () => {
      if (initialConnectTimer === null) return;
      window.clearTimeout(initialConnectTimer);
      initialConnectTimer = null;
    };

    // 재연결은 포기하지 않는다. maxAttempts 는 백오프 상한을 정할 뿐 시도 횟수 제한이 아니다.
    // 예전에는 5회(약 22초) 실패 후 영구 포기해서, 미들웨어를 재시작하거나 잠깐 끊기기만 해도
    // 앱을 껐다 켜기 전까지 bridge 가 error 로 고착됐다. 그 상태에서 설정 화면은
    // "연결되지 않았습니다. 값은 보이지만 저장은 되지 않습니다."를 계속 띄웠다.
    const scheduleReconnect = (wsUrl: string) => {
      if (disposed || !wsUrl) {
        return;
      }
      reconnectAttempts = Math.min(reconnectAttempts + 1, RECONNECT_ATTEMPT_CEILING);
      const delayMs = Math.min(
        DESKTOP_RECONNECT_POLICY.initialDelayMs * reconnectAttempts,
        DESKTOP_RECONNECT_POLICY.maxDelayMs
      );
      // 백오프가 상한에 처음 닿은 순간에만 한 번 알린다(재시도 자체는 계속한다).
      if (reconnectAttempts === DESKTOP_RECONNECT_POLICY.maxAttempts) {
        useDesktopShellStore.getState().markBridgeStatus(
          "connecting",
          `서버 연결을 계속 시도합니다 (${wsUrl})`
        );
      } else {
        useDesktopShellStore.getState().markBridgeStatus("connecting");
      }
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect(wsUrl);
      }, delayMs);
    };

    // 네트워크 복귀나 창 포커스처럼 "지금 살아났을 가능성이 큰" 순간에는 백오프를 기다리지 않고
    // 즉시 다시 붙는다.
    const reconnectNow = () => {
      if (disposed) return;
      if (sessionSocket && sessionSocket.readyState <= WebSocket.OPEN) return;
      clearReconnectTimer();
      reconnectAttempts = 0;
      connect(useDesktopShellStore.getState().runtime.wsUrl || DESKTOP_MIDDLEWARE_WS_URL);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };

    const connect = (wsUrl: string) => {
      clearReconnectTimer();
      if (!wsUrl || (sessionSocket && sessionSocketUrl === wsUrl && sessionSocket.readyState <= WebSocket.OPEN)) {
        return;
      }

      closeSessionSocket(sessionSocket);

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
          useDesktopShellStore.getState().markBridgeStatus("connected", `서버에 연결됨 (${wsUrl})`);
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
            error instanceof Error ? error.message : "서버 응답을 읽지 못했습니다"
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
    initialConnectTimer = window.setTimeout(() => {
      initialConnectTimer = null;
      connect(initialWsUrl);
    }, 0);
    const unsubscribe = useDesktopShellStore.subscribe((state, previous) => {
      if (state.runtime.wsUrl !== previous.runtime.wsUrl) {
        clearInitialConnectTimer();
        connect(state.runtime.wsUrl);
      }
    });
    window.addEventListener("online", reconnectNow);
    window.addEventListener("focus", reconnectNow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      clearInitialConnectTimer();
      clearReconnectTimer();
      window.removeEventListener("online", reconnectNow);
      window.removeEventListener("focus", reconnectNow);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
      const socket = sessionSocket;
      sessionSocket = null;
      sessionSocketUrl = "";
      bindDesktopSessionSocket(null);
      closeSessionSocket(socket);
    };
  }, []);
}

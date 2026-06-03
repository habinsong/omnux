import { useEffect } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { bindDesktopSessionSocket, publishDesktopMessage, requestDesktopAuth, requestDesktopOps } from "./features/middleware/desktop-message-gateway";
import { useOpsPageStore } from "./features/ops/ops-store";
import { DESKTOP_MIDDLEWARE_WS_URL } from "./middleware-contract";
import { useDesktopShellStore } from "./shell-store";

type ServerMessage = Record<string, unknown> & {
  type?: string;
};

let sessionSocket: WebSocket | null = null;

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
            status?: string;
            summary?: string;
            failCount?: number;
            warnCount?: number;
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
    const text = stringValue(message.message) || "미들웨어 WS 오류";
    shellStore.markBridgeStatus("error", text);
    opsStore.markDoctorError(text);
  }
}

export function requestDesktopOtp() {
  useDesktopAuthStore.getState().markOtpRequestPending();
  requestDesktopAuth.otp();
}

export function submitDesktopOtp(otp: string) {
  const code = otp.trim();
  if (!code) {
    useDesktopShellStore.getState().markBridgeStatus("error", "OTP 6자리를 입력해야 한다.");
    return;
  }

  requestDesktopAuth.submit(code);
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
    const socket = new WebSocket(DESKTOP_MIDDLEWARE_WS_URL);
    sessionSocket = socket;
    bindDesktopSessionSocket(socket);
    useDesktopShellStore.getState().markBridgeStatus("connecting", "데스크톱 WS 세션 브릿지 연결 중");

    socket.addEventListener("open", () => {
      if (!disposed) {
        useDesktopShellStore.getState().markBridgeStatus("connected", "데스크톱 WS 세션 브릿지 연결됨");
      }
    });

    socket.addEventListener("message", (event) => {
      if (disposed) {
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
      if (!disposed) {
        useDesktopShellStore.getState().markBridgeStatus("error", "데스크톱 WS 세션 브릿지 연결 실패");
      }
    });

    socket.addEventListener("close", () => {
      if (!disposed) {
        useDesktopShellStore.getState().markBridgeStatus("closed", "데스크톱 WS 세션 브릿지 종료");
      }
    });

    return () => {
      disposed = true;
      if (sessionSocket === socket) {
        sessionSocket = null;
      }
      bindDesktopSessionSocket(null);
      socket.close();
    };
  }, []);
}

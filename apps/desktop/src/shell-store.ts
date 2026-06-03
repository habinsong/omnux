import { create } from "zustand";
import {
  DESKTOP_MIDDLEWARE_HEALTH_URL,
  DESKTOP_MIDDLEWARE_READY_URL,
  DESKTOP_MIDDLEWARE_WS_URL,
  DESKTOP_RECONNECT_POLICY
} from "./middleware-contract";
import { useUiLogStore } from "./features/ui-log/ui-log-store";
export { serializeUiLogs, useUiLogStore } from "./features/ui-log/ui-log-store";
export type { ShellCard, ShellLogEntry, ShellLogSource } from "./features/ui-log/ui-log-store";
export type {
  DesktopAuthContract,
  DesktopAuthStatus,
  DesktopOtpRequestStatus
} from "./features/auth/auth-store";
export type {
  DesktopDoctorSnapshot,
  DesktopOpsSnapshot
} from "./features/ops/ops-store";

type MiddlewareConnectionStatus = "idle" | "waiting" | "connected" | "error";
type DesktopRuntimePhase = "shell-only" | "waiting" | "connected" | "error";
type ProbeEndpointStatus = "unknown" | "ok" | "not_ready" | "error";
type MiddlewareBootstrapPhase = "idle" | "starting" | "started" | "stderr" | "error" | "terminated" | "stopping";
type DesktopWsBridgeStatus = "idle" | "connecting" | "connected" | "closed" | "error";

type MiddlewareWsContract = {
  endpoint: string;
  status: MiddlewareConnectionStatus;
  lastError: string | null;
  sidecarBootstrap:
    | "reserved-for-tauri-shell"
    | "dev-dotnet-run-bootstrap"
    | "bundle-external-bin";
};

type DesktopRuntimeContract = {
  phase: DesktopRuntimePhase;
  bootstrapPhase: MiddlewareBootstrapPhase;
  bootstrapPid: number | null;
  wsUrl: string;
  healthUrl: string;
  healthStatus: ProbeEndpointStatus;
  healthDetail: string | null;
  readyUrl: string;
  readyStatus: ProbeEndpointStatus;
  readyDetail: string | null;
  reconnectPolicy: typeof DESKTOP_RECONNECT_POLICY;
  reconnectAttempts: number;
  lastProbeAt: string | null;
  lastError: string | null;
};

type DesktopWsBridgeContract = {
  status: DesktopWsBridgeStatus;
  lastMessageAt: string | null;
  lastError: string | null;
};

type DesktopShellState = {
  middleware: MiddlewareWsContract;
  runtime: DesktopRuntimeContract;
  bridge: DesktopWsBridgeContract;
  markWaiting: () => void;
  markConnected: () => void;
  markError: (message: string) => void;
  markReconnectPlanned: () => void;
  markHttpProbe: (
    endpoint: "healthz" | "readyz",
    status: ProbeEndpointStatus,
    detail?: string
  ) => void;
  markHealthProbe: (status: "ok" | "not_ready" | "error", detail?: string) => void;
  scheduleNextReconnect: () => void;
  markBootstrapEvent: (phase: MiddlewareBootstrapPhase, pid: number | null, message: string) => void;
  markBridgeStatus: (status: DesktopWsBridgeStatus, message?: string | null) => void;
};

const DEFAULT_MIDDLEWARE_ENDPOINT = "ws://127.0.0.1:41880/ws/";

function recordShellLog(
  level: "info" | "warn" | "error",
  message: string,
  source: "middleware" | "runtime" = "middleware"
) {
  useUiLogStore.getState().recordLog(level, message, { source });
}

export const useDesktopShellStore = create<DesktopShellState>((set) => ({
  middleware: {
    endpoint: DEFAULT_MIDDLEWARE_ENDPOINT,
    status: "idle",
    lastError: null,
    sidecarBootstrap: import.meta.env.DEV ? "dev-dotnet-run-bootstrap" : "bundle-external-bin"
  },
  runtime: {
    phase: "shell-only",
    bootstrapPhase: "idle",
    bootstrapPid: null,
    wsUrl: DESKTOP_MIDDLEWARE_WS_URL,
    healthUrl: DESKTOP_MIDDLEWARE_HEALTH_URL,
    healthStatus: "unknown",
    healthDetail: null,
    readyUrl: DESKTOP_MIDDLEWARE_READY_URL,
    readyStatus: "unknown",
    readyDetail: null,
    reconnectPolicy: DESKTOP_RECONNECT_POLICY,
    reconnectAttempts: 0,
    lastProbeAt: null,
    lastError: null
  },
  bridge: {
    status: "idle",
    lastMessageAt: null,
    lastError: null
  },
  markWaiting: () =>
    set((state) => {
      recordShellLog("info", ".NET 미들웨어 연결 대기 상태로 전환했다.");
      return {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(
          state.runtime,
          "waiting",
          state.runtime.reconnectAttempts,
          state.runtime.lastProbeAt,
          null
        )
      };
    }),
  markConnected: () =>
    set((state) => {
      recordShellLog("info", ".NET 미들웨어 WebSocket 연결 상태를 확인했다.");
      return {
        middleware: syncMiddlewareStatus(state.middleware, "connected", null),
        runtime: syncRuntimeContract(state.runtime, "connected", 0, new Date().toISOString(), null)
      };
    }),
  markError: (message) =>
    set((state) => {
      recordShellLog("error", message);
      return {
        middleware: syncMiddlewareStatus(state.middleware, "error", message),
        runtime: syncRuntimeContract(
          state.runtime,
          "error",
          state.runtime.reconnectAttempts,
          new Date().toISOString(),
          message
        )
      };
    }),
  markReconnectPlanned: () =>
    set((state) => {
      const nextAttempts = Math.min(
        state.runtime.reconnectAttempts + 1,
        state.runtime.reconnectPolicy.maxAttempts
      );
      const delay = Math.min(
        state.runtime.reconnectPolicy.initialDelayMs * Math.max(nextAttempts, 1),
        state.runtime.reconnectPolicy.maxDelayMs
      );
      recordShellLog("info", `다음 재연결을 ${Math.round(delay / 1000)}초 후로 예약했다.`, "runtime");
      return {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(state.runtime, "waiting", nextAttempts, state.runtime.lastProbeAt, null)
      };
    }),
  markHttpProbe: (endpoint, status, detail) =>
    set((state) => {
      const label = endpoint === "healthz" ? "healthz" : "readyz";
      recordShellLog(
        status === "error" ? "error" : "info",
        `${label} probe=${status}${detail ? ` (${detail})` : ""}`,
        "runtime"
      );
      return {
        runtime: {
          ...state.runtime,
          ...(endpoint === "healthz"
            ? {
                healthStatus: status,
                healthDetail: detail || null
              }
            : {
                readyStatus: status,
                readyDetail: detail || null
              }),
          lastProbeAt: new Date().toISOString()
        }
      };
    }),
  markHealthProbe: (status, detail) =>
    set((state) => {
      const message =
        status === "ok"
          ? "WebSocket ping/pong probe를 통과했다."
          : status === "not_ready"
            ? `미들웨어가 아직 준비되지 않았다.${detail ? ` (${detail})` : ""}`
            : `runtime probe에 실패했다.${detail ? ` (${detail})` : ""}`;
      const runtimePhase: DesktopRuntimePhase =
        status === "ok" ? "connected" : status === "not_ready" ? "waiting" : "error";
      const runtimeError = status === "ok" ? null : (detail || "runtime probe failed");
      recordShellLog(status === "error" ? "error" : "info", message, "runtime");
      return {
        middleware: syncMiddlewareStatus(
          state.middleware,
          runtimePhase === "connected" ? "connected" : runtimePhase === "waiting" ? "waiting" : "error",
          runtimeError
        ),
        runtime: syncRuntimeContract(
          state.runtime,
          runtimePhase,
          status === "ok" ? 0 : state.runtime.reconnectAttempts,
          new Date().toISOString(),
          runtimeError
        )
      };
    }),
  scheduleNextReconnect: () =>
    set((state) => {
      const nextAttempts = Math.min(
        state.runtime.reconnectAttempts + 1,
        state.runtime.reconnectPolicy.maxAttempts
      );
      const delay = Math.min(
        state.runtime.reconnectPolicy.initialDelayMs * Math.max(nextAttempts, 1),
        state.runtime.reconnectPolicy.maxDelayMs
      );
      recordShellLog("info", `다음 재연결을 ${Math.round(delay / 1000)}초 후로 예약했다.`, "runtime");
      return {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(
          state.runtime,
          "waiting",
          nextAttempts,
          state.runtime.lastProbeAt,
          state.runtime.lastError
        )
      };
    }),
  markBootstrapEvent: (phase, pid, message) =>
    set((state) => {
      const level = phase === "stderr" || phase === "error" || phase === "terminated" ? "warn" : "info";
      const runtimePhase: DesktopRuntimePhase =
        phase === "error" || phase === "terminated" ? "error" : state.runtime.phase;
      const middlewareStatus: MiddlewareConnectionStatus =
        phase === "started" || phase === "starting" ? "waiting" : phase === "error" || phase === "terminated" ? "error" : state.middleware.status;
      recordShellLog(level, message, "runtime");
      return {
        middleware: syncMiddlewareStatus(
          state.middleware,
          middlewareStatus,
          phase === "error" || phase === "terminated" ? message : state.middleware.lastError
        ),
        runtime: {
          ...syncRuntimeContract(
            state.runtime,
            runtimePhase,
            state.runtime.reconnectAttempts,
            state.runtime.lastProbeAt,
            phase === "error" || phase === "terminated" ? message : state.runtime.lastError
          ),
          bootstrapPhase: phase,
          bootstrapPid: pid
        }
      };
    }),
  markBridgeStatus: (status, message) =>
    set(() => {
      if (message) {
        const level = status === "error" ? "error" : status === "closed" ? "warn" : "info";
        recordShellLog(level, message);
      }
      return {
        bridge: {
          status,
          lastMessageAt: new Date().toISOString(),
          lastError: status === "error" ? message || "desktop websocket bridge error" : null
        }
      };
    })
}));

function syncMiddlewareStatus(
  middleware: MiddlewareWsContract,
  status: MiddlewareConnectionStatus,
  lastError: string | null
): MiddlewareWsContract {
  return {
    ...middleware,
    status,
    lastError
  };
}

function syncRuntimeContract(
  runtime: DesktopRuntimeContract,
  phase: DesktopRuntimePhase,
  reconnectAttempts: number,
  lastProbeAt: string | null,
  lastError: string | null
): DesktopRuntimeContract {
  return {
    ...runtime,
    phase,
    reconnectAttempts,
    lastProbeAt,
    lastError
  };
}

export type {
  DesktopShellState,
  DesktopRuntimeContract,
  DesktopRuntimePhase,
  DesktopWsBridgeContract,
  DesktopWsBridgeStatus,
  MiddlewareBootstrapPhase,
  MiddlewareConnectionStatus
};

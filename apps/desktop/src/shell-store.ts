import { create } from "zustand";
import {
  DESKTOP_MIDDLEWARE_HEALTH_URL,
  DESKTOP_MIDDLEWARE_READY_URL,
  DESKTOP_MIDDLEWARE_WS_URL,
  DESKTOP_RECONNECT_POLICY
} from "./middleware-contract";

type MiddlewareConnectionStatus = "idle" | "waiting" | "connected" | "error";
type DesktopRuntimePhase = "shell-only" | "waiting" | "connected" | "error";
type ProbeEndpointStatus = "unknown" | "ok" | "not_ready" | "error";
type ShellLogLevel = "info" | "warn" | "error";
type ShellCard = "middleware" | "runtime" | "logs";
type MiddlewareBootstrapPhase = "idle" | "starting" | "started" | "stderr" | "error" | "terminated" | "stopping";

type ShellLogEntry = {
  id: string;
  level: ShellLogLevel;
  message: string;
  createdAt: string;
};

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

type DesktopShellState = {
  middleware: MiddlewareWsContract;
  runtime: DesktopRuntimeContract;
  logs: ShellLogEntry[];
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
  recordCardError: (card: ShellCard, message: string) => void;
  markBootstrapEvent: (phase: MiddlewareBootstrapPhase, pid: number | null, message: string) => void;
};

const DEFAULT_MIDDLEWARE_ENDPOINT = "ws://127.0.0.1:41880/ws/";
const MAX_LOGS = 6;
const LOG_STORAGE_KEY = "omnux-desktop-ui-logs";

function createLog(level: ShellLogLevel, message: string): ShellLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    level,
    message,
    createdAt: new Date().toISOString()
  };
}

function pushLog(logs: ShellLogEntry[], entry: ShellLogEntry): ShellLogEntry[] {
  return [entry, ...logs].slice(0, MAX_LOGS);
}

function readSavedLogs(): ShellLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ShellLogEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.level === "string" &&
        typeof item.message === "string" &&
        typeof item.createdAt === "string"
    ).slice(0, MAX_LOGS);
  } catch (_error) {
    return [];
  }
}

function saveLogs(logs: ShellLogEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch (_error) {
    // 저장 실패는 셸 진행을 막지 않는다.
  }
}

function readInitialLogs(): ShellLogEntry[] {
  const restored = readSavedLogs();
  if (restored.length > 0) {
    return restored;
  }

  return [
    createLog("info", ".NET 미들웨어 WebSocket 연결은 React store 경계를 통해서만 상태화한다."),
    createLog("info", "Tauri Rust 셸은 dev bootstrap 또는 bundle externalBin으로 .NET 미들웨어를 시작한다."),
    createLog("info", "런타임 부트 계약은 healthz/readyz 표시와 WebSocket ping/pong probe로 상태화한다.")
  ];
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
  logs: readInitialLogs(),
  markWaiting: () =>
    set((state) => {
      const logs = pushLog(state.logs, createLog("info", ".NET 미들웨어 연결 대기 상태로 전환했다."));
      saveLogs(logs);
      return {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(
          state.runtime,
          "waiting",
          state.runtime.reconnectAttempts,
          state.runtime.lastProbeAt,
          null
        ),
        logs
      };
    }),
  markConnected: () =>
    set((state) => {
      const logs = pushLog(state.logs, createLog("info", ".NET 미들웨어 WebSocket 연결 상태를 확인했다."));
      const next = {
        middleware: syncMiddlewareStatus(state.middleware, "connected", null),
        runtime: syncRuntimeContract(state.runtime, "connected", 0, new Date().toISOString(), null),
        logs
      };
      saveLogs(logs);
      return next;
    }),
  markError: (message) =>
    set((state) => {
      const logs = pushLog(state.logs, createLog("error", message));
      const next = {
        middleware: syncMiddlewareStatus(state.middleware, "error", message),
        runtime: syncRuntimeContract(
          state.runtime,
          "error",
          state.runtime.reconnectAttempts,
          new Date().toISOString(),
          message
        ),
        logs
      };
      saveLogs(logs);
      return next;
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
      const logs = pushLog(
        state.logs,
        createLog("info", `다음 재연결을 ${Math.round(delay / 1000)}초 후로 예약했다.`)
      );
      const next = {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(state.runtime, "waiting", nextAttempts, state.runtime.lastProbeAt, null),
        logs
      };
      saveLogs(logs);
      return next;
    }),
  markHttpProbe: (endpoint, status, detail) =>
    set((state) => {
      const label = endpoint === "healthz" ? "healthz" : "readyz";
      const logs = pushLog(
        state.logs,
        createLog(
          status === "error" ? "error" : "info",
          `${label} probe=${status}${detail ? ` (${detail})` : ""}`
        )
      );
      const runtime = {
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
      };
      saveLogs(logs);
      return {
        runtime,
        logs
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
      const logs = pushLog(state.logs, createLog(status === "error" ? "error" : "info", message));
      const next = {
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
        ),
        logs
      };
      saveLogs(logs);
      return next;
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
      const logs = pushLog(
        state.logs,
        createLog("info", `다음 재연결을 ${Math.round(delay / 1000)}초 후로 예약했다.`)
      );
      const next = {
        middleware: syncMiddlewareStatus(state.middleware, "waiting", null),
        runtime: syncRuntimeContract(
          state.runtime,
          "waiting",
          nextAttempts,
          state.runtime.lastProbeAt,
          state.runtime.lastError
        ),
        logs
      };
      saveLogs(logs);
      return next;
    }),
  recordCardError: (card, message) =>
    set((state) => {
      const logs = pushLog(state.logs, createLog("error", `[${card}] ${message}`));
      saveLogs(logs);
      return { logs };
    }),
  markBootstrapEvent: (phase, pid, message) =>
    set((state) => {
      const level: ShellLogLevel = phase === "stderr" || phase === "error" || phase === "terminated" ? "warn" : "info";
      const runtimePhase: DesktopRuntimePhase =
        phase === "error" || phase === "terminated" ? "error" : state.runtime.phase;
      const middlewareStatus: MiddlewareConnectionStatus =
        phase === "started" || phase === "starting" ? "waiting" : phase === "error" || phase === "terminated" ? "error" : state.middleware.status;
      const logs = pushLog(state.logs, createLog(level, message));
      saveLogs(logs);
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
        },
        logs
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
  MiddlewareBootstrapPhase,
  MiddlewareConnectionStatus,
  ShellLogEntry,
  ShellCard
};

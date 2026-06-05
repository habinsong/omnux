import { create } from "zustand";
import { pushDesktopToast } from "../toast/toast-store";

export type ShellLogLevel = "info" | "warn" | "error";
export type ShellCard = "middleware" | "runtime" | "logs" | "navigation" | "operations";
export type ShellLogSource = ShellCard | "shell" | "auth" | "doctor" | "ops";

export type ShellLogEntry = {
  id: string;
  level: ShellLogLevel;
  message: string;
  createdAt: string;
  source: ShellLogSource;
  componentStack: string | null;
};

type RecordLogOptions = {
  source?: ShellLogSource;
  componentStack?: string | null;
};

type UiLogState = {
  logs: ShellLogEntry[];
  recordLog: (level: ShellLogLevel, message: string, options?: RecordLogOptions) => void;
  recordCardError: (card: ShellCard, message: string, componentStack?: string | null) => void;
  recordShellError: (message: string, componentStack?: string | null) => void;
  clearLogs: () => void;
};

const UI_LOG_SCHEMA_VERSION = 1;
const MAX_LOGS = 25;
// v2: 부팅 race/secrets 폴백 등 이전 버전의 stale warn/error 잔재를 1회 폐기하기 위해 키를 올린다.
const LOG_STORAGE_KEY = "omnux-desktop-ui-logs-v2";

function createLog(
  level: ShellLogLevel,
  message: string,
  options: RecordLogOptions = {}
): ShellLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    level,
    message,
    createdAt: new Date().toISOString(),
    source: options.source || "shell",
    componentStack: options.componentStack || null
  };
}

function pushLog(logs: ShellLogEntry[], entry: ShellLogEntry): ShellLogEntry[] {
  return [entry, ...logs].slice(0, MAX_LOGS);
}

function normalizeSavedLog(item: ShellLogEntry): ShellLogEntry | null {
  if (
    !item ||
    typeof item.id !== "string" ||
    typeof item.level !== "string" ||
    typeof item.message !== "string" ||
    typeof item.createdAt !== "string"
  ) {
    return null;
  }

  const source: ShellLogSource =
    item.source === "middleware" ||
    item.source === "runtime" ||
    item.source === "logs" ||
    item.source === "navigation" ||
    item.source === "operations" ||
    item.source === "shell" ||
    item.source === "auth" ||
    item.source === "doctor" ||
    item.source === "ops"
      ? item.source
      : "shell";

  return {
    id: item.id,
    level: item.level === "warn" || item.level === "error" ? item.level : "info",
    message: item.message,
    createdAt: item.createdAt,
    source,
    componentStack: typeof item.componentStack === "string" ? item.componentStack : null
  };
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

    const parsed = JSON.parse(raw) as ShellLogEntry[] | { entries?: ShellLogEntry[] };
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map(normalizeSavedLog)
      .filter((item): item is ShellLogEntry => Boolean(item))
      .slice(0, MAX_LOGS);
  } catch (_error) {
    return [];
  }
}

function saveLogs(logs: ShellLogEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LOG_STORAGE_KEY, serializeUiLogs(logs.slice(0, MAX_LOGS)));
  } catch (_error) {
    // 저장 실패는 셸 진행을 막지 않는다.
  }
}

function pushLogToast(entry: ShellLogEntry) {
  if (entry.level === "info") return;
  pushDesktopToast({
    tone: entry.level === "error" ? "error" : "warning",
    title: entry.level === "error" ? "오류" : "주의",
    message: entry.message
  });
}

function readInitialLogs(): ShellLogEntry[] {
  const restored = readSavedLogs();
  if (restored.length > 0) {
    return restored;
  }

  return [
    createLog("info", ".NET 미들웨어 WebSocket 연결은 React store 경계를 통해서만 상태화한다.", { source: "middleware" }),
    createLog("info", "Tauri Rust 셸은 dev bootstrap 또는 bundle externalBin으로 .NET 미들웨어를 시작한다.", { source: "runtime" }),
    createLog("info", "런타임 부트 계약은 healthz/readyz 표시와 WebSocket ping/pong probe로 상태화한다.", { source: "runtime" })
  ];
}

export function serializeUiLogs(logs: ShellLogEntry[]): string {
  return JSON.stringify(
    {
      schemaVersion: UI_LOG_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      entries: logs.slice(0, MAX_LOGS)
    },
    null,
    2
  );
}

export const useUiLogStore = create<UiLogState>((set) => ({
  logs: readInitialLogs(),
  recordLog: (level, message, options = {}) => {
    const entry = createLog(level, message, options);
    set((state) => {
      const logs = pushLog(state.logs, entry);
      saveLogs(logs);
      return { logs };
    });
    pushLogToast(entry);
  },
  recordCardError: (card, message, componentStack) => {
    const entry = createLog("error", `[${card}] ${message}`, { source: card, componentStack });
    set((state) => {
      const logs = pushLog(state.logs, entry);
      saveLogs(logs);
      return { logs };
    });
    pushLogToast(entry);
  },
  recordShellError: (message, componentStack) => {
    const entry = createLog("error", `[shell] ${message}`, { source: "shell", componentStack });
    set((state) => {
      const logs = pushLog(state.logs, entry);
      saveLogs(logs);
      return { logs };
    });
    pushLogToast(entry);
  },
  clearLogs: () =>
    set(() => {
      saveLogs([]);
      return { logs: [] };
    })
}));

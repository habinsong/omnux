import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopExplore, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import type { SessionsHistoryResult, SessionsSendResult, SessionsSpawnResult, WebFetchResult, WebSearchResult } from "./explore-types";

type ExploreState = {
  selectedTab: "search" | "fetch" | "sessions" | "browser" | "canvas";
  webQuery: string;
  webSearching: boolean;
  webResult: { provider: string; results: WebSearchResult[]; error: string } | null;
  fetchUrl: string;
  fetchLoading: boolean;
  fetchResult: WebFetchResult | null;
  sessions: Array<{ key: string; displayName: string; label: string; preview: string; messageCount: number; kind: string; scope: string }>;
  sessionsLoading: boolean;
  selectedSessionKey: string;
  historyLoading: boolean;
  history: SessionsHistoryResult | null;
  sessionMessage: string;
  sessionSending: boolean;
  sessionSendResult: SessionsSendResult | null;
  spawnTask: string;
  spawnRuntime: string;
  spawnMode: string;
  spawnLabel: string;
  spawnTimeoutSeconds: number;
  spawnThread: boolean;
  spawnLoading: boolean;
  spawnStatusLoading: boolean;
  spawnResult: SessionsSpawnResult | null;
  browserUrl: string;
  browserLoading: boolean;
  browserResult: { ok: boolean; action: string; disabled: boolean; running: boolean; adapter: string; activeUrl: string; tabs: Array<{ targetId: string; url: string; title: string; active: boolean }>; error: string } | null;
  canvasUrl: string;
  canvasLoading: boolean;
  canvasResult: { ok: boolean; action: string; disabled: boolean; visible: boolean; adapter: string; url: string; snapshot: { format: string; width: number; height: number } | null; evalResult: string; error: string } | null;
  lastError: string | null;
  setSelectedTab: (tab: "search" | "fetch" | "sessions" | "browser" | "canvas") => void;
  setWebQuery: (value: string) => void;
  runWebSearch: () => void;
  setFetchUrl: (value: string) => void;
  runWebFetch: () => void;
  loadSessions: () => void;
  openSession: (key: string) => void;
  setSessionMessage: (value: string) => void;
  sendSessionMessage: () => void;
  setSpawnTask: (value: string) => void;
  setSpawnRuntime: (value: string) => void;
  setSpawnMode: (value: string) => void;
  setSpawnLabel: (value: string) => void;
  setSpawnTimeoutSeconds: (value: number) => void;
  setSpawnThread: (value: boolean) => void;
  spawnSession: () => void;
  loadSpawnStatus: () => void;
  setBrowserUrl: (value: string) => void;
  runBrowser: (action: string, extra?: Record<string, unknown>) => void;
  setCanvasUrl: (value: string) => void;
  runCanvas: (action: string, extra?: Record<string, unknown>) => void;
};

export const useExploreStore = create<ExploreState>((set, get) => ({
  selectedTab: "search",
  webQuery: "",
  webSearching: false,
  webResult: null,
  fetchUrl: "",
  fetchLoading: false,
  fetchResult: null,
  sessions: [],
  sessionsLoading: false,
  selectedSessionKey: "",
  historyLoading: false,
  history: null,
  sessionMessage: "",
  sessionSending: false,
  sessionSendResult: null,
  spawnTask: "",
  spawnRuntime: "acp",
  spawnMode: "run",
  spawnLabel: "",
  spawnTimeoutSeconds: 900,
  spawnThread: true,
  spawnLoading: false,
  spawnStatusLoading: false,
  spawnResult: null,
  browserUrl: "",
  browserLoading: false,
  browserResult: null,
  canvasUrl: "",
  canvasLoading: false,
  canvasResult: null,
  lastError: null,
  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setWebQuery: (value) => set({ webQuery: value }),
  runWebSearch: () => {
    const query = String(get().webQuery || "").trim();
    if (!query) return;
    set({ webSearching: true, webResult: null });
    if (!requestDesktopExplore.webSearch(query, 8)) {
      set({ webSearching: false, lastError: "웹 검색 요청을 전송하지 못했다." });
    }
  },
  setFetchUrl: (value) => set({ fetchUrl: value }),
  runWebFetch: () => {
    const url = String(get().fetchUrl || "").trim();
    if (!url) return;
    set({ fetchLoading: true, fetchResult: null });
    if (!requestDesktopExplore.webFetch(url, "text", 8000)) {
      set({ fetchLoading: false, lastError: "URL fetch 요청을 전송하지 못했다." });
    }
  },
  loadSessions: () => {
    set({ sessionsLoading: true });
    if (!requestDesktopExplore.sessionsList(30)) {
      set({ sessionsLoading: false, lastError: "세션 목록 요청을 전송하지 못했다." });
    }
  },
  openSession: (key) => {
    const sessionKey = String(key || "").trim();
    if (!sessionKey) return;
    set({ selectedSessionKey: sessionKey, historyLoading: true, history: null });
    if (!requestDesktopExplore.sessionsHistory(sessionKey, 50)) {
      set({ historyLoading: false, lastError: "세션 이력 요청을 전송하지 못했다." });
    }
  },
  setSessionMessage: (value) => set({ sessionMessage: value }),
  sendSessionMessage: () => {
    const sessionKey = String(get().selectedSessionKey || "").trim();
    const message = String(get().sessionMessage || "").trim();
    if (!sessionKey || !message) return;
    set({ sessionSending: true, sessionSendResult: null });
    if (!requestDesktopExplore.sessionsSend(sessionKey, message, 60)) {
      set({ sessionSending: false, lastError: "세션 메시지 전송 요청을 전송하지 못했다." });
    }
  },
  setSpawnTask: (value) => set({ spawnTask: value }),
  setSpawnRuntime: (value) => set({ spawnRuntime: value }),
  setSpawnMode: (value) => set({ spawnMode: value }),
  setSpawnLabel: (value) => set({ spawnLabel: value }),
  setSpawnTimeoutSeconds: (value) => {
    const safeValue = Number.isFinite(value) ? Math.max(30, Math.min(3600, Math.round(value))) : 900;
    set({ spawnTimeoutSeconds: safeValue });
  },
  setSpawnThread: (value) => set({ spawnThread: value }),
  spawnSession: () => {
    const task = String(get().spawnTask || "").trim();
    if (!task) return;
    set({ spawnLoading: true, spawnResult: null });
    if (!requestDesktopExplore.sessionsSpawn(
      task,
      get().spawnRuntime,
      get().spawnMode,
      get().spawnLabel,
      get().spawnTimeoutSeconds,
      get().spawnThread
    )) {
      set({ spawnLoading: false, lastError: "세션 생성 요청을 전송하지 못했다." });
    }
  },
  loadSpawnStatus: () => {
    set({ spawnStatusLoading: true });
    if (!requestDesktopExplore.sessionsSpawnStatus()) {
      set({ spawnStatusLoading: false, lastError: "세션 생성 상태 요청을 전송하지 못했다." });
    }
  },
  setBrowserUrl: (value) => set({ browserUrl: value }),
  runBrowser: (action, extra = {}) => {
    const normalized = String(action || "").trim();
    if (!normalized) return;
    set({ browserLoading: true });
    if (!requestDesktopExplore.browser(normalized, extra)) {
      set({ browserLoading: false, lastError: "브라우저 요청을 전송하지 못했다." });
    }
  },
  setCanvasUrl: (value) => set({ canvasUrl: value }),
  runCanvas: (action, extra = {}) => {
    const normalized = String(action || "").trim();
    if (!normalized) return;
    set({ canvasLoading: true });
    if (!requestDesktopExplore.canvas(normalized, extra)) {
      set({ canvasLoading: false, lastError: "캔버스 요청을 전송하지 못했다." });
    }
  }
}));

function normalizeServerList<T>(value: unknown, mapper: (item: Record<string, unknown>) => T): T[] {
  return Array.isArray(value) ? value.map((item) => mapper(item as Record<string, unknown>)) : [];
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function useExplorePageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    if (message.type === "web_search_result") {
      useExploreStore.setState({
        webSearching: false,
        webResult: {
          provider: String(message.provider || ""),
          results: normalizeServerList(message.results, (item) => ({
            url: String(item.url || ""),
            title: String(item.title || ""),
            description: String(item.description || ""),
            published: String(item.published || "")
          })),
          error: String(message.error || "")
        }
      });
      return;
    }

    if (message.type === "web_fetch_result") {
      useExploreStore.setState({
        fetchLoading: false,
        fetchResult: {
          url: String(message.url || ""),
          finalUrl: String(message.finalUrl || ""),
          status: typeof message.status === "number" ? message.status : String(message.status || ""),
          contentType: String(message.contentType || ""),
          length: Number(message.length || 0),
          truncated: !!message.truncated,
          text: String(message.text || ""),
          error: String(message.error || "")
        }
      });
      return;
    }

    if (message.type === "sessions_list_result") {
      useExploreStore.setState({
        sessionsLoading: false,
        sessions: normalizeServerList(message.sessions, (item) => ({
          key: String(item.key || ""),
          displayName: String(item.displayName || ""),
          label: String(item.label || ""),
          preview: String(item.preview || ""),
          messageCount: Number(item.messageCount || 0),
          kind: String(item.kind || ""),
          scope: String(item.scope || "")
        }))
      });
      return;
    }

    if (message.type === "sessions_history_result") {
      useExploreStore.setState({
        historyLoading: false,
        history: {
          sessionKey: String(message.sessionKey || ""),
          status: String(message.status || ""),
          count: Number(message.count || 0),
          truncated: !!message.truncated,
          messages: normalizeServerList(message.messages, (item) => ({
            role: String(item.role || ""),
            text: String(item.text || "")
          })),
          error: String(message.error || "")
        }
      });
      return;
    }

    if (message.type === "sessions_send_result") {
      const delivery = normalizeRecord(message.delivery);
      const sessionKey = String(message.sessionKey || message.requestedSessionKey || "");
      useExploreStore.setState((state) => ({
        sessionSending: false,
        sessionMessage: "",
        sessionSendResult: {
          sessionKey,
          requestedSessionKey: String(message.requestedSessionKey || ""),
          timeoutSeconds: normalizeNumber(message.timeoutSeconds),
          requestedTimeoutSeconds: normalizeNullableNumber(message.requestedTimeoutSeconds),
          status: String(message.status || ""),
          runId: String(message.runId || ""),
          messageTruncated: !!message.messageTruncated,
          reply: String(message.reply || ""),
          error: String(message.error || ""),
          delivery: delivery
            ? {
                status: String(delivery.status || ""),
                mode: String(delivery.mode || "")
              }
            : null
        },
        historyLoading: sessionKey && sessionKey === state.selectedSessionKey ? true : state.historyLoading
      }));
      if (sessionKey && sessionKey === useExploreStore.getState().selectedSessionKey) {
        if (!requestDesktopExplore.sessionsHistory(sessionKey, 50)) {
          useExploreStore.setState({ historyLoading: false });
        }
      }
      return;
    }

    if (message.type === "sessions_spawn_result") {
      const queue = normalizeRecord(message.queue);
      const active = normalizeRecord(message.active);
      const action = String(message.action || "");
      useExploreStore.setState({
        spawnLoading: action === "status" ? useExploreStore.getState().spawnLoading : false,
        spawnStatusLoading: false,
        spawnResult: {
          action,
          task: String(message.task || ""),
          label: String(message.label || ""),
          requestedRuntime: String(message.requestedRuntime || ""),
          requestedMode: String(message.requestedMode || ""),
          requestedRunTimeoutSeconds: normalizeNullableNumber(message.requestedRunTimeoutSeconds),
          requestedTimeoutSeconds: normalizeNullableNumber(message.requestedTimeoutSeconds),
          requestedThread: normalizeNullableBoolean(message.requestedThread),
          status: String(message.status || ""),
          runId: String(message.runId || ""),
          childSessionKey: String(message.childSessionKey || ""),
          mode: String(message.mode || ""),
          runtime: String(message.runtime || ""),
          runTimeoutSeconds: normalizeNumber(message.runTimeoutSeconds),
          thread: !!message.thread,
          taskTruncated: !!message.taskTruncated,
          followUpStatus: String(message.followUpStatus || ""),
          followUpAction: String(message.followUpAction || ""),
          backendSessionId: String(message.backendSessionId || ""),
          threadBindingKey: String(message.threadBindingKey || ""),
          commandPriority: String(message.commandPriority || ""),
          note: String(message.note || ""),
          error: String(message.error || ""),
          breakerBlocked: !!message.breakerBlocked,
          breakerReason: String(message.breakerReason || ""),
          breakerMessage: String(message.breakerMessage || ""),
          queue: queue
            ? {
                total: normalizeNumber(queue.total),
                ready: normalizeNumber(queue.ready),
                nextAttemptUtc: String(queue.nextAttemptUtc || ""),
                nextEntryId: String(queue.nextEntryId || ""),
                nextReason: String(queue.nextReason || ""),
                nextError: String(queue.nextError || ""),
                nextAttemptCount: normalizeNumber(queue.nextAttemptCount),
                nearDeadLetterCount: normalizeNumber(queue.nearDeadLetterCount)
              }
            : null,
          active: active
            ? {
                activeCount: normalizeNumber(active.activeCount),
                oldestRunId: String(active.oldestRunId || ""),
                oldestRuntime: String(active.oldestRuntime || ""),
                oldestMode: String(active.oldestMode || ""),
                oldestBackend: String(active.oldestBackend || ""),
                oldestStartedUtc: String(active.oldestStartedUtc || ""),
                oldestAgeSeconds: normalizeNullableNumber(active.oldestAgeSeconds),
                completedHistoryCount: normalizeNumber(active.completedHistoryCount)
              }
            : null
        }
      });
      if (String(message.childSessionKey || "")) {
        useExploreStore.setState({ sessionsLoading: true });
        if (!requestDesktopExplore.sessionsList(30)) {
          useExploreStore.setState({ sessionsLoading: false });
        }
      }
      return;
    }

    if (message.type === "browser_result") {
      useExploreStore.setState({
        browserLoading: false,
        browserResult: {
          ok: !!message.ok,
          action: String(message.action || ""),
          disabled: !!message.disabled,
          running: !!message.running,
          adapter: String(message.adapter || ""),
          activeUrl: String(message.activeUrl || ""),
          tabs: normalizeServerList(message.tabs, (item) => ({
            targetId: String(item.targetId || ""),
            url: String(item.url || ""),
            title: String(item.title || ""),
            active: !!item.active
          })),
          error: String(message.error || "")
        }
      });
      return;
    }

    if (message.type === "canvas_result") {
      useExploreStore.setState({
        canvasLoading: false,
        canvasResult: {
          ok: !!message.ok,
          action: String(message.action || ""),
          disabled: !!message.disabled,
          visible: !!message.visible,
          adapter: String(message.adapter || ""),
          url: String(message.url || ""),
          snapshot: message.snapshot && typeof message.snapshot === "object"
            ? {
                format: String((message.snapshot as { format?: string }).format || ""),
                width: Number((message.snapshot as { width?: number }).width || 0),
                height: Number((message.snapshot as { height?: number }).height || 0)
              }
            : null,
          evalResult: String(message.evalResult || ""),
          error: String(message.error || "")
        }
      });
      return;
    }

    if (message.type === "error") {
      useExploreStore.setState({
        webSearching: false,
        fetchLoading: false,
        sessionsLoading: false,
        historyLoading: false,
        sessionSending: false,
        spawnLoading: false,
        spawnStatusLoading: false,
        browserLoading: false,
        canvasLoading: false,
        lastError: String(message.message || "오류")
      });
    }
    });
  }, []);
}

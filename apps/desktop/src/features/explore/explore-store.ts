import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopExplore, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";

type WebSearchResult = {
  url: string;
  title: string;
  description: string;
  published: string;
};

type WebFetchResult = {
  url: string;
  finalUrl: string;
  status: number | string;
  contentType: string;
  length: number;
  truncated: boolean;
  text: string;
  error: string;
};

type SessionsHistoryResult = {
  sessionKey: string;
  status: string;
  count: number;
  truncated: boolean;
  messages: Array<{ role: string; text: string }>;
  error: string;
};

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
        browserLoading: false,
        canvasLoading: false,
        lastError: String(message.message || "오류")
      });
    }
    });
  }, []);
}

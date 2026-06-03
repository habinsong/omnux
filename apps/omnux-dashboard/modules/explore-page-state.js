/* omnux — explore page state (Phase 3: web search / url fetch / sessions) */
(function () {
  const { useState, useEffect, useCallback } = React;

  function useExplorePageState(ctx, payload) {
    const sendMessage = typeof ctx.send === "function" ? ctx.send : () => false;
    const toast = typeof ctx.toast === "function" ? ctx.toast : () => {};

    const [tab, setTab] = useState((payload && payload.tab) || "search");

    // web search
    const [webQuery, setWebQuery] = useState("");
    const [webSearching, setWebSearching] = useState(false);
    const [webResult, setWebResult] = useState(null);

    // url fetch
    const [fetchUrl, setFetchUrl] = useState("");
    const [fetchLoading, setFetchLoading] = useState(false);
    const [fetchResult, setFetchResult] = useState(null);

    // sessions
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [selectedSessionKey, setSelectedSessionKey] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState(null);

    // browser / canvas (optional tools)
    const [browserUrl, setBrowserUrl] = useState("");
    const [browserLoading, setBrowserLoading] = useState(false);
    const [browserResult, setBrowserResult] = useState(null);
    const [canvasUrl, setCanvasUrl] = useState("");
    const [canvasLoading, setCanvasLoading] = useState(false);
    const [canvasResult, setCanvasResult] = useState(null);

    const runWebSearch = useCallback((query) => {
      const trimmed = String(query || "").trim();
      if (!trimmed) return;
      setWebSearching(true);
      setWebResult(null);
      const sent = sendMessage({ type: "web_search", query: trimmed, count: 8 }, { queueIfClosed: true });
      if (!sent) {
        setWebSearching(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const runWebFetch = useCallback((url) => {
      const trimmed = String(url || "").trim();
      if (!trimmed) return;
      setFetchLoading(true);
      setFetchResult(null);
      const sent = sendMessage({ type: "web_fetch", webFetchUrl: trimmed, extractMode: "text", maxChars: 8000 }, { queueIfClosed: true });
      if (!sent) {
        setFetchLoading(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const loadSessions = useCallback(() => {
      setSessionsLoading(true);
      const sent = sendMessage({ type: "sessions_list", limit: 30 }, { queueIfClosed: true });
      if (!sent) {
        setSessionsLoading(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const openSession = useCallback((key) => {
      const sessionKey = String(key || "").trim();
      if (!sessionKey) return;
      setSelectedSessionKey(sessionKey);
      setHistory(null);
      setHistoryLoading(true);
      const sent = sendMessage({ type: "sessions_history", sessionKey, limit: 50 }, { queueIfClosed: true });
      if (!sent) {
        setHistoryLoading(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const runBrowser = useCallback((action, extra = {}) => {
      const normalized = String(action || "").trim();
      if (!normalized) return;
      setBrowserLoading(true);
      const payload = { type: "browser", action: normalized };
      if (extra.url) payload.webFetchUrl = String(extra.url).trim();
      if (extra.targetId) payload.targetId = String(extra.targetId).trim();
      const sent = sendMessage(payload, { queueIfClosed: true });
      if (!sent) {
        setBrowserLoading(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const runCanvas = useCallback((action, extra = {}) => {
      const normalized = String(action || "").trim();
      if (!normalized) return;
      setCanvasLoading(true);
      const payload = { type: "canvas", action: normalized };
      if (extra.url) payload.webFetchUrl = String(extra.url).trim();
      const sent = sendMessage(payload, { queueIfClosed: true });
      if (!sent) {
        setCanvasLoading(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === "web_search_result") {
          setWebSearching(false);
          setWebResult({
            query: msg.query || "",
            provider: msg.provider || "",
            disabled: !!msg.disabled,
            results: Array.isArray(msg.results) ? msg.results : [],
            error: msg.error || ""
          });
          if (msg.disabled) toast("웹 검색이 비활성화되어 있습니다.");
        }
        if (msg.type === "web_fetch_result") {
          setFetchLoading(false);
          setFetchResult({
            url: msg.url || "",
            finalUrl: msg.finalUrl || "",
            status: msg.status,
            contentType: msg.contentType || "",
            length: Number(msg.length) || 0,
            truncated: !!msg.truncated,
            disabled: !!msg.disabled,
            text: msg.text || "",
            error: msg.error || ""
          });
          if (msg.disabled) toast("URL 가져오기가 비활성화되어 있습니다.");
        }
        if (msg.type === "sessions_list_result") {
          setSessionsLoading(false);
          setSessions(Array.isArray(msg.sessions) ? msg.sessions : []);
        }
        if (msg.type === "sessions_history_result") {
          setHistoryLoading(false);
          setSelectedSessionKey((current) => msg.sessionKey || current);
          setHistory({
            sessionKey: msg.sessionKey || "",
            status: msg.status || "",
            count: Number(msg.count) || 0,
            truncated: !!msg.truncated,
            messages: Array.isArray(msg.messages) ? msg.messages : [],
            error: msg.error || ""
          });
        }
        if (msg.type === "browser_result") {
          setBrowserLoading(false);
          setBrowserResult({
            ok: !!msg.ok,
            action: msg.action || "",
            disabled: !!msg.disabled,
            adapter: msg.adapter || "",
            running: !!msg.running,
            activeUrl: msg.activeUrl || "",
            tabs: Array.isArray(msg.tabs) ? msg.tabs : [],
            error: msg.error || ""
          });
        }
        if (msg.type === "canvas_result") {
          setCanvasLoading(false);
          setCanvasResult({
            ok: !!msg.ok,
            action: msg.action || "",
            disabled: !!msg.disabled,
            adapter: msg.adapter || "",
            visible: !!msg.visible,
            url: msg.url || "",
            evalResult: msg.evalResult || "",
            snapshot: msg.snapshot || null,
            error: msg.error || ""
          });
        }
        if (msg.type === "error") {
          setWebSearching(false);
          setFetchLoading(false);
          setSessionsLoading(false);
          setHistoryLoading(false);
          setBrowserLoading(false);
          setCanvasLoading(false);
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [toast]);

    // auto-load sessions when entering the sessions tab the first time
    useEffect(() => {
      if (tab === "sessions" && sessions.length === 0 && !sessionsLoading) {
        loadSessions();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    return {
      tab, setTab,
      webQuery, setWebQuery, webSearching, webResult, runWebSearch,
      fetchUrl, setFetchUrl, fetchLoading, fetchResult, runWebFetch,
      sessions, sessionsLoading, loadSessions,
      selectedSessionKey, history, historyLoading, openSession,
      browserUrl, setBrowserUrl, browserLoading, browserResult, runBrowser,
      canvasUrl, setCanvasUrl, canvasLoading, canvasResult, runCanvas
    };
  }

  Object.assign(window, { useExplorePageState });
})();

import { useEffect } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useExplorePageBridge, useExploreStore } from "./explore-store";

const TABS = [
  { id: "search", label: "웹 검색" },
  { id: "fetch", label: "URL fetch" },
  { id: "sessions", label: "세션" },
  { id: "browser", label: "브라우저" },
  { id: "canvas", label: "캔버스" }
] as const;

function EmptyState({ label }: { label: string }) {
  return <div className="empty">{label}</div>;
}

export function ExplorePage() {
  useExplorePageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useExploreStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest && store.sessions.length === 0) {
      store.loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <section className="grid single-column">
      <CardBoundary title="탐색 탭" card="navigation" onError={recordCardError}>
        <div className="desktop-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={store.selectedTab === tab.id ? "desktop-tab active" : "desktop-tab"}
              type="button"
              onClick={() => store.setSelectedTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.id}</small>
            </button>
          ))}
        </div>
        {store.lastError ? <div className="section-error">{store.lastError}</div> : null}
      </CardBoundary>

      {store.selectedTab === "search" ? (
        <CardBoundary title="웹 검색" card="operations" onError={recordCardError}>
          <div className="field-row">
            <input
              className="field"
              value={store.webQuery}
              placeholder="검색어"
              onChange={(event) => store.setWebQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canRequest) {
                    store.runWebSearch();
                  }
                }
              }}
            />
            <button className="secondary-button" type="button" onClick={store.runWebSearch} disabled={!canRequest || store.webSearching}>
              {store.webSearching ? "검색 중" : "검색"}
            </button>
          </div>
          <dl className="status-list compact-list">
            <div><dt>provider</dt><dd>{store.webResult?.provider || "-"}</dd></div>
            <div><dt>results</dt><dd>{store.webResult?.results.length ?? 0}</dd></div>
          </dl>
          {store.webResult?.error ? <div className="section-error">{store.webResult.error}</div> : null}
          <div className="event-log">
            {(store.webResult?.results || []).map((item) => (
              <a key={item.url} className="desktop-tab link-tab" href={item.url} target="_blank" rel="noreferrer">
                <span>{item.title || item.url}</span>
                <small>{item.description || item.published || item.url}</small>
              </a>
            ))}
            {store.webResult && store.webResult.results.length === 0 ? <EmptyState label="검색 결과 없음" /> : null}
          </div>
        </CardBoundary>
      ) : null}

      {store.selectedTab === "fetch" ? (
        <CardBoundary title="URL fetch" card="operations" onError={recordCardError}>
          <div className="field-row">
            <input
              className="field"
              value={store.fetchUrl}
              placeholder="URL"
              onChange={(event) => store.setFetchUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canRequest) {
                    store.runWebFetch();
                  }
                }
              }}
            />
            <button className="secondary-button" type="button" onClick={store.runWebFetch} disabled={!canRequest || store.fetchLoading}>
              {store.fetchLoading ? "가져오는 중" : "가져오기"}
            </button>
          </div>
          {store.fetchResult ? (
            <>
              <dl className="status-list compact-list">
                <div><dt>status</dt><dd>{store.fetchResult.status || "-"}</dd></div>
                <div><dt>type</dt><dd>{store.fetchResult.contentType || "-"}</dd></div>
                <div><dt>chars</dt><dd>{store.fetchResult.length}</dd></div>
                <div><dt>final</dt><dd>{store.fetchResult.finalUrl || store.fetchResult.url || "-"}</dd></div>
              </dl>
              {store.fetchResult.error ? <div className="section-error">{store.fetchResult.error}</div> : null}
              <pre className="result-pre">{store.fetchResult.text || "본문 없음"}</pre>
            </>
          ) : (
            <EmptyState label="URL fetch 결과 없음" />
          )}
        </CardBoundary>
      ) : null}

      {store.selectedTab === "sessions" ? (
        <CardBoundary title="세션 이력" card="operations" onError={recordCardError}>
          <div className="log-toolbar">
            <button className="secondary-button" type="button" onClick={store.loadSessions} disabled={!canRequest || store.sessionsLoading}>
              {store.sessionsLoading ? "조회 중" : "새로고침"}
            </button>
          </div>
          <div className="split-panel">
            <div className="event-log">
              {store.sessions.map((item) => (
                <button
                  key={item.key}
                  className={item.key === store.selectedSessionKey ? "desktop-tab active" : "desktop-tab"}
                  type="button"
                  onClick={() => store.openSession(item.key)}
                  disabled={!canRequest}
                >
                  <span>{item.displayName || item.label || item.key}</span>
                  <small>{item.preview || `${item.messageCount}개 메시지`}</small>
                  <small>{item.kind || item.scope || "session"}</small>
                </button>
              ))}
              {store.sessions.length === 0 ? <EmptyState label="세션 없음" /> : null}
            </div>
            <div>
              <dl className="status-list compact-list">
                <div><dt>selected</dt><dd>{store.selectedSessionKey || "-"}</dd></div>
                <div><dt>status</dt><dd>{store.historyLoading ? "조회 중" : store.history?.status || "-"}</dd></div>
                <div><dt>messages</dt><dd>{store.history?.count ?? 0}</dd></div>
              </dl>
              {store.history?.error ? <div className="section-error">{store.history.error}</div> : null}
              <div className="event-log scroll-panel">
                {(store.history?.messages || []).map((message, index) => (
                  <article key={`${index}-${message.role}`} className="desktop-tab">
                    <span>{message.role || "message"}</span>
                    <small>{message.text}</small>
                  </article>
                ))}
                {store.history && store.history.messages.length === 0 ? <EmptyState label="이력 없음" /> : null}
              </div>
            </div>
          </div>
        </CardBoundary>
      ) : null}

      {store.selectedTab === "browser" ? (
        <CardBoundary title="브라우저" card="operations" onError={recordCardError}>
          <div className="field-row">
            <input
              className="field"
              value={store.browserUrl}
              placeholder="URL"
              onChange={(event) => store.setBrowserUrl(event.target.value)}
            />
            <button className="secondary-button" type="button" onClick={() => store.runBrowser("open", { url: store.browserUrl })} disabled={!canRequest || !store.browserUrl.trim() || store.browserLoading}>
              열기
            </button>
          </div>
          <div className="log-toolbar">
            <button className="secondary-button" type="button" onClick={() => store.runBrowser("status")} disabled={!canRequest || store.browserLoading}>상태</button>
            <button className="secondary-button" type="button" onClick={() => store.runBrowser("start")} disabled={!canRequest || store.browserLoading}>시작</button>
            <button className="secondary-button" type="button" onClick={() => store.runBrowser("focus")} disabled={!canRequest || store.browserLoading}>포커스</button>
            <button className="danger-button" type="button" onClick={() => store.runBrowser("stop")} disabled={!canRequest || store.browserLoading}>중지</button>
          </div>
          <dl className="status-list compact-list">
            <div><dt>action</dt><dd>{store.browserResult?.action || "-"}</dd></div>
            <div><dt>running</dt><dd>{store.browserResult ? String(store.browserResult.running) : "-"}</dd></div>
            <div><dt>adapter</dt><dd>{store.browserResult?.adapter || "-"}</dd></div>
            <div><dt>active</dt><dd>{store.browserResult?.activeUrl || "-"}</dd></div>
          </dl>
          {store.browserResult?.error ? <div className="section-error">{store.browserResult.error}</div> : null}
          <div className="event-log">
            {(store.browserResult?.tabs || []).map((tab) => (
              <article key={tab.targetId || tab.url} className={tab.active ? "desktop-tab active" : "desktop-tab"}>
                <span>{tab.title || tab.url || tab.targetId}</span>
                <small>{tab.url || tab.targetId}</small>
              </article>
            ))}
          </div>
        </CardBoundary>
      ) : null}

      {store.selectedTab === "canvas" ? (
        <CardBoundary title="캔버스" card="operations" onError={recordCardError}>
          <div className="field-row">
            <input
              className="field"
              value={store.canvasUrl}
              placeholder="URL"
              onChange={(event) => store.setCanvasUrl(event.target.value)}
            />
            <button className="secondary-button" type="button" onClick={() => store.runCanvas("navigate", { url: store.canvasUrl })} disabled={!canRequest || !store.canvasUrl.trim() || store.canvasLoading}>
              이동
            </button>
          </div>
          <div className="log-toolbar">
            <button className="secondary-button" type="button" onClick={() => store.runCanvas("status")} disabled={!canRequest || store.canvasLoading}>상태</button>
            <button className="secondary-button" type="button" onClick={() => store.runCanvas("present", { url: store.canvasUrl })} disabled={!canRequest || store.canvasLoading}>표시</button>
            <button className="secondary-button" type="button" onClick={() => store.runCanvas("snapshot")} disabled={!canRequest || store.canvasLoading}>스냅샷</button>
            <button className="danger-button" type="button" onClick={() => store.runCanvas("hide")} disabled={!canRequest || store.canvasLoading}>숨김</button>
          </div>
          <dl className="status-list compact-list">
            <div><dt>action</dt><dd>{store.canvasResult?.action || "-"}</dd></div>
            <div><dt>visible</dt><dd>{store.canvasResult ? String(store.canvasResult.visible) : "-"}</dd></div>
            <div><dt>adapter</dt><dd>{store.canvasResult?.adapter || "-"}</dd></div>
            <div><dt>url</dt><dd>{store.canvasResult?.url || "-"}</dd></div>
            <div><dt>snapshot</dt><dd>{store.canvasResult?.snapshot ? `${store.canvasResult.snapshot.width}x${store.canvasResult.snapshot.height} ${store.canvasResult.snapshot.format}` : "-"}</dd></div>
          </dl>
          {store.canvasResult?.error ? <div className="section-error">{store.canvasResult.error}</div> : null}
          {store.canvasResult?.evalResult ? <pre className="result-pre">{store.canvasResult.evalResult}</pre> : null}
        </CardBoundary>
      ) : null}
    </section>
  );
}

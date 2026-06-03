import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Code2, Globe2, MessageSquare, Monitor, PanelTop, RefreshCcw, Search } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useExplorePageBridge, useExploreStore } from "./explore-store";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";

const TABS = [
  { id: "search", label: "웹 검색", icon: Search },
  { id: "fetch", label: "URL 가져오기", icon: Code2 },
  { id: "sessions", label: "세션", icon: MessageSquare },
  { id: "browser", label: "브라우저", icon: Monitor },
  { id: "canvas", label: "캔버스", icon: PanelTop }
] as const;

const SELECT_CLASS = "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const PRE_CLASS = "max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]";

type ExploreStoreSnapshot = ReturnType<typeof useExploreStore.getState>;
type CardErrorHandler = ComponentProps<typeof CardBoundary>["onError"];
type PanelProps = { store: ExploreStoreSnapshot; canRequest: boolean; onError: CardErrorHandler };

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{label}</p>;
}
function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono text-foreground">{v}</dd>
    </div>
  );
}
function Err({ text }: { text: string }) {
  return <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{text}</p>;
}

function SearchPanel({ store, canRequest, onError }: PanelProps) {
  const result = store.webResult;
  return (
    <CardBoundary title="웹 검색" card="operations" onError={onError}>
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={store.webQuery}
          placeholder="웹 검색어 입력 후 Enter"
          onChange={(event) => store.setWebQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) store.runWebSearch();
            }
          }}
        />
        <Button variant="primary" size="sm" onClick={store.runWebSearch} disabled={!canRequest || store.webSearching}>
          {store.webSearching ? "검색 중..." : "검색"}
        </Button>
      </div>
      {!store.webSearching && !result ? <Empty label="검색어를 입력하면 결과가 표시됩니다." /> : null}
      {result ? (
        <>
          <div className="flex items-center gap-2">
            <Badge tone="primary">{result.provider || "web"}</Badge>
            <span className="text-xs text-muted-foreground">결과 {result.results.length}</span>
          </div>
          {result.error ? <Err text={result.error} /> : null}
          <div className="space-y-1.5">
            {result.results.map((item, index) => (
              <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border bg-card/60 p-2.5 transition-colors hover:bg-accent">
                <span className="block truncate text-sm font-medium text-foreground">{item.title || item.url || "제목 없음"}</span>
                <small className="block truncate text-[11px] text-primary">{item.url}</small>
                <small className="block truncate text-[11px] text-muted-foreground">{item.description || item.published || item.url}</small>
              </a>
            ))}
            {result.results.length === 0 && !result.error ? <Empty label="검색 결과가 없습니다." /> : null}
          </div>
        </>
      ) : null}
    </CardBoundary>
  );
}

function FetchPanel({ store, canRequest, onError }: PanelProps) {
  const result = store.fetchResult;
  return (
    <CardBoundary title="URL 가져오기" card="operations" onError={onError}>
      <div className="flex items-center gap-2">
        <Code2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={store.fetchUrl}
          placeholder="https://example.com 입력 후 Enter"
          onChange={(event) => store.setFetchUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) store.runWebFetch();
            }
          }}
        />
        <Button variant="primary" size="sm" onClick={store.runWebFetch} disabled={!canRequest || store.fetchLoading}>
          {store.fetchLoading ? "가져오는 중..." : "가져오기"}
        </Button>
      </div>
      {!store.fetchLoading && !result ? <Empty label="URL을 입력하면 본문이 표시됩니다." /> : null}
      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.error ? "destructive" : "success"}>{result.error ? "error" : result.status ? `HTTP ${result.status}` : "ok"}</Badge>
            {result.contentType ? <Badge tone="outline">{result.contentType}</Badge> : null}
            <Badge tone="outline">{result.length} chars</Badge>
            {result.truncated ? <Badge tone="warning">truncated</Badge> : null}
          </div>
          <a className="block truncate font-mono text-[11px] text-primary" href={result.finalUrl || result.url} target="_blank" rel="noreferrer">
            {result.finalUrl || result.url || "-"}
          </a>
          {result.error ? <Err text={result.error} /> : null}
          {result.text ? <pre className={PRE_CLASS}>{result.text}</pre> : <Empty label="본문 없음" />}
        </>
      ) : null}
    </CardBoundary>
  );
}

function SessionsPanel({ store, canRequest, onError }: PanelProps) {
  return (
    <CardBoundary title="세션 이력" card="operations" onError={onError}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">세션 목록·메시지 이력·후속 메시지·새 세션 생성 상태.</span>
        <Button variant="outline" size="sm" onClick={store.loadSessions} disabled={!canRequest || store.sessionsLoading}>
          <RefreshCcw size={14} aria-hidden="true" /> {store.sessionsLoading ? "불러오는 중..." : "새로고침"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          {store.sessions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => store.openSession(item.key)}
              disabled={!canRequest}
              className={cn("flex w-full flex-col rounded-md border px-2.5 py-2 text-left transition-colors", item.key === store.selectedSessionKey ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}
            >
              <span className="truncate text-sm font-medium">{item.displayName || item.label || item.key}</span>
              <small className="truncate text-[11px] text-muted-foreground">{item.preview || `${item.messageCount}개 메시지`}</small>
            </button>
          ))}
          {store.sessions.length === 0 ? <Empty label="세션이 없습니다." /> : null}
        </div>
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-sm font-semibold">{store.history?.sessionKey || "세션 메시지"}</div>
          <dl className="space-y-1">
            <KV k="selected" v={store.selectedSessionKey || "-"} />
            <KV k="status" v={store.historyLoading ? "조회 중" : store.history?.status || "-"} />
            <KV k="messages" v={store.history?.count ?? 0} />
          </dl>
          {store.history?.error ? <Err text={store.history.error} /> : null}
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {(store.history?.messages || []).map((message, index) => (
              <article key={`${index}-${message.role}`} className="rounded bg-card/60 px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">{message.role || "message"}</span>
                <small className="block text-xs">{message.text}</small>
              </article>
            ))}
            {!store.history ? <Empty label="세션을 선택하면 메시지가 표시됩니다." /> : null}
            {store.history && store.history.messages.length === 0 ? <Empty label="메시지가 없습니다." /> : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="space-y-2 rounded-md border border-border bg-muted/30 p-3" aria-label="선택 세션 메시지 전송">
          <h3 className="font-mono text-xs font-semibold text-primary">sessions_send</h3>
          <Textarea
            rows={3}
            value={store.sessionMessage}
            placeholder={store.selectedSessionKey ? "선택한 세션에 보낼 메시지" : "먼저 세션을 선택하세요"}
            onChange={(event) => store.setSessionMessage(event.target.value)}
          />
          <Button variant="primary" size="sm" onClick={store.sendSessionMessage} disabled={!canRequest || !store.selectedSessionKey || !store.sessionMessage.trim() || store.sessionSending}>
            {store.sessionSending ? "전송 중" : "전송"}
          </Button>
          <dl className="space-y-1">
            <KV k="session" v={store.sessionSendResult?.sessionKey || store.selectedSessionKey || "-"} />
            <KV k="status" v={store.sessionSendResult?.status || "-"} />
            <KV k="runId" v={store.sessionSendResult?.runId || "-"} />
          </dl>
          {store.sessionSendResult?.error ? <Err text={store.sessionSendResult.error} /> : null}
          {store.sessionSendResult?.reply ? <pre className={PRE_CLASS}>{store.sessionSendResult.reply}</pre> : null}
        </section>
        <section className="space-y-2 rounded-md border border-border bg-muted/30 p-3" aria-label="새 세션 생성">
          <h3 className="font-mono text-xs font-semibold text-primary">sessions_spawn</h3>
          <div className="grid grid-cols-2 gap-2">
            <select className={SELECT_CLASS} value={store.spawnRuntime} onChange={(event) => store.setSpawnRuntime(event.target.value)}>
              <option value="acp">acp</option>
              <option value="codex">codex</option>
            </select>
            <select className={SELECT_CLASS} value={store.spawnMode} onChange={(event) => store.setSpawnMode(event.target.value)}>
              <option value="run">run</option>
              <option value="session">session</option>
              <option value="command">command</option>
            </select>
            <Input type="number" min={30} max={3600} step={30} value={store.spawnTimeoutSeconds} onChange={(event) => store.setSpawnTimeoutSeconds(Number(event.target.value))} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={store.spawnThread} onChange={(event) => store.setSpawnThread(event.target.checked)} /> thread
            </label>
          </div>
          <Input value={store.spawnLabel} placeholder="label" onChange={(event) => store.setSpawnLabel(event.target.value)} />
          <Textarea rows={3} value={store.spawnTask} placeholder="새 세션에 맡길 작업" onChange={(event) => store.setSpawnTask(event.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={store.spawnSession} disabled={!canRequest || !store.spawnTask.trim() || store.spawnLoading}>
              {store.spawnLoading ? "생성 중" : "생성"}
            </Button>
            <Button variant="outline" size="sm" onClick={store.loadSpawnStatus} disabled={!canRequest || store.spawnStatusLoading}>
              {store.spawnStatusLoading ? "상태 조회 중" : "상태 조회"}
            </Button>
          </div>
          <dl className="space-y-1">
            <KV k="status" v={store.spawnResult?.status || (store.spawnResult?.breakerBlocked ? "blocked" : "-")} />
            <KV k="child" v={store.spawnResult?.childSessionKey || "-"} />
            <KV k="queue" v={store.spawnResult?.queue ? `${store.spawnResult.queue.ready}/${store.spawnResult.queue.total} ready` : "-"} />
            <KV k="breaker" v={store.spawnResult ? `${store.spawnResult.breakerBlocked ? "blocked" : "open"}` : "-"} />
          </dl>
          {store.spawnResult?.error ? <Err text={store.spawnResult.error} /> : null}
          {store.spawnResult?.note ? <pre className={PRE_CLASS}>{store.spawnResult.note}</pre> : null}
        </section>
      </div>
    </CardBoundary>
  );
}

function BrowserPanel({ store, canRequest, onError }: PanelProps) {
  const result = store.browserResult;
  return (
    <CardBoundary title="브라우저" card="operations" onError={onError}>
      <div className="flex items-center gap-2">
        <Globe2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input value={store.browserUrl} placeholder="https://... 열기" onChange={(event) => store.setBrowserUrl(event.target.value)} />
        <Button variant="primary" size="sm" onClick={() => store.runBrowser("open", { url: store.browserUrl })} disabled={!canRequest || !store.browserUrl.trim() || store.browserLoading}>
          열기
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => store.runBrowser("status")} disabled={!canRequest || store.browserLoading}>상태</Button>
        <Button variant="ghost" size="sm" onClick={() => store.runBrowser("start")} disabled={!canRequest || store.browserLoading}>시작</Button>
        <Button variant="ghost" size="sm" onClick={() => store.runBrowser("focus")} disabled={!canRequest || store.browserLoading}>포커스</Button>
        <Button variant="destructive" size="sm" onClick={() => store.runBrowser("stop")} disabled={!canRequest || store.browserLoading}>중지</Button>
      </div>
      {!result ? <Empty label="상태를 눌러 브라우저 세션 정보를 확인하세요." /> : null}
      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.running ? "success" : "default"}>{result.running ? "running" : "stopped"}</Badge>
            {result.disabled ? <Badge tone="warning">disabled</Badge> : null}
            {result.adapter ? <Badge tone="outline">{result.adapter}</Badge> : null}
          </div>
          {result.activeUrl ? <div className="truncate font-mono text-[11px] text-muted-foreground">{result.activeUrl}</div> : null}
          {result.error ? <Err text={result.error} /> : null}
          <div className="space-y-1">
            {result.tabs.map((item, index) => (
              <article key={item.targetId || item.url || index} className={cn("rounded-md border px-2.5 py-2", item.active ? "border-primary/50 bg-accent" : "border-border")}>
                <span className="block truncate text-sm">{item.title || item.url || item.targetId || "탭"}</span>
                <small className="block truncate text-[11px] text-muted-foreground">{item.url || item.targetId}</small>
              </article>
            ))}
            {result.tabs.length === 0 ? <Empty label="열린 탭이 없습니다." /> : null}
          </div>
        </>
      ) : null}
    </CardBoundary>
  );
}

function CanvasPanel({ store, canRequest, onError }: PanelProps) {
  const result = store.canvasResult;
  const snapshot = result?.snapshot;
  return (
    <CardBoundary title="캔버스" card="operations" onError={onError}>
      <div className="flex items-center gap-2">
        <PanelTop size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input value={store.canvasUrl} placeholder="https://... 이동" onChange={(event) => store.setCanvasUrl(event.target.value)} />
        <Button variant="primary" size="sm" onClick={() => store.runCanvas("navigate", { url: store.canvasUrl })} disabled={!canRequest || !store.canvasUrl.trim() || store.canvasLoading}>
          이동
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => store.runCanvas("status")} disabled={!canRequest || store.canvasLoading}>상태</Button>
        <Button variant="ghost" size="sm" onClick={() => store.runCanvas("present", { url: store.canvasUrl })} disabled={!canRequest || store.canvasLoading}>표시</Button>
        <Button variant="ghost" size="sm" onClick={() => store.runCanvas("snapshot")} disabled={!canRequest || store.canvasLoading}>스냅샷</Button>
        <Button variant="destructive" size="sm" onClick={() => store.runCanvas("hide")} disabled={!canRequest || store.canvasLoading}>숨김</Button>
      </div>
      {!result ? <Empty label="상태를 눌러 캔버스 정보를 확인하세요." /> : null}
      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.visible ? "success" : "default"}>{result.visible ? "visible" : "hidden"}</Badge>
            {result.disabled ? <Badge tone="warning">disabled</Badge> : null}
            {result.adapter ? <Badge tone="outline">{result.adapter}</Badge> : null}
            {snapshot ? <Badge tone="outline">{snapshot.format || "snapshot"} {snapshot.width || 0}x{snapshot.height || 0}</Badge> : null}
          </div>
          {result.url ? <div className="truncate font-mono text-[11px] text-muted-foreground">{result.url}</div> : null}
          {result.error ? <Err text={result.error} /> : null}
          {result.evalResult ? <pre className={PRE_CLASS}>{result.evalResult}</pre> : null}
        </>
      ) : null}
    </CardBoundary>
  );
}

export function ExplorePage() {
  useExplorePageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useExploreStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest && store.sessions.length === 0) store.loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const panelProps: PanelProps = { store, canRequest, onError: recordCardError };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">탐색</h1>
        <p className="text-sm text-muted-foreground">웹 검색, URL fetch, 세션 이력, 브라우저와 캔버스 상태를 한 화면에서 확인합니다.</p>
      </div>
      <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="Explore">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = store.selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => store.setSelectedTab(tab.id)}
              className={cn("flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-200", on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon size={14} aria-hidden="true" /> {tab.label}
            </button>
          );
        })}
      </div>
      {store.lastError ? <Err text={store.lastError} /> : null}
      <section>
        {store.selectedTab === "search" ? <SearchPanel {...panelProps} /> : null}
        {store.selectedTab === "fetch" ? <FetchPanel {...panelProps} /> : null}
        {store.selectedTab === "sessions" ? <SessionsPanel {...panelProps} /> : null}
        {store.selectedTab === "browser" ? <BrowserPanel {...panelProps} /> : null}
        {store.selectedTab === "canvas" ? <CanvasPanel {...panelProps} /> : null}
      </section>
    </div>
  );
}

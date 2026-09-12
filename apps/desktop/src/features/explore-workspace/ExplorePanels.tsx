import { useEffect, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { Button, Input, Textarea, cn } from "../../components/ui/primitives";
import {
  CAPSULE_FIELD,
  CapsuleBar,
  ExpandChoice,
  ExtrasRow,
  Fold,
  RoundIcon
} from "../../components/capsule/capsule";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { externalUrl, number, record, rows, statusLabel, text, type Frame } from "./explore-model";
import { useWebExplore } from "./web-explore-state";
import { useRuntimeExplore } from "./runtime-explore-state";
import { useSessionExplore } from "./session-explore-state";

/* ============================================================================
   탐색 화면의 네 칸.
   예전 화면은 <details> 를 세 겹까지 겹쳐 무엇이 어디 있는지 알 수 없었다.
   여기서는 칸마다 한 겹만 접고, 나머지는 캡슐 탭이 가른다.
   ============================================================================ */

export function Panel({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 space-y-3 p-3">{children}</div>
      </div>
      {footer ? <div className="min-w-0 shrink-0 p-2">{footer}</div> : null}
    </div>
  );
}

function Note({ tone = "muted", children }: { tone?: "muted" | "error" | "info"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "min-w-0 break-words rounded-md px-2.5 py-1.5 text-[11px]",
        tone === "error" ? "bg-destructive/10 text-destructive" : tone === "info" ? "bg-primary/10 text-primary" : "text-muted-foreground"
      )}
    >
      {children}
    </p>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

const SELECT = "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

const LENGTH_CHOICES = [
  { value: "8000", label: "짧게" },
  { value: "20000", label: "보통" },
  { value: "50000", label: "길게" }
] as const;

function lengthLabel(value: number) {
  const short = LENGTH_CHOICES.find((entry) => Number(entry.value) === value)?.label ?? "보통";
  return `본문 ${short}`;
}

function Capture({ frame }: { frame: Frame | null }) {
  if (!frame) return null;
  return (
    <figure className="min-w-0 space-y-1">
      <img
        src={frame.url}
        alt="브라우저에서 실제로 캡처한 화면"
        className="min-w-0 max-w-full rounded-md border border-border"
        width={frame.width}
        height={frame.height}
      />
      <figcaption className="text-[10px] text-muted-foreground">
        마지막 캡처 · {new Date(frame.capturedAt).toLocaleTimeString("ko-KR")}
      </figcaption>
    </figure>
  );
}

/* ---------- 웹 찾기 ---------- */

export function WebPanel({ connected }: { connected: boolean }) {
  const state = useWebExplore();
  const navigate = useDesktopNavigationStore((s) => s.setActivePage);
  const [notice, setNotice] = useState("");
  const [lengthOpen, setLengthOpen] = useState(false);
  const queryRef = useRef<HTMLInputElement>(null);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사하지 못했습니다.");
    }
  };

  return (
    <Panel
      footer={
        <div className="min-w-0 w-full space-y-1">
          <ExtrasRow className="px-1">
            <ExpandChoice
              label={lengthLabel(state.maxChars)}
              title="가져올 본문 길이"
              open={lengthOpen}
              options={LENGTH_CHOICES.filter((entry) => Number(entry.value) !== state.maxChars)}
              onToggle={() => setLengthOpen((current) => !current)}
              onSelect={(value) => {
                useWebExplore.setState({ maxChars: Number(value) });
                setLengthOpen(false);
              }}
            />
          </ExtrasRow>
          <CapsuleBar
            leading={<RoundIcon icon={Search} label="검색어로 이동" onClick={() => queryRef.current?.focus()} />}
            submitLabel={state.pending ? "찾는 중" : "찾기"}
            submitDisabled={!connected || !!state.pending || !state.input.trim()}
            onSubmit={() => state.search()}
          >
            <input
              ref={queryRef}
              className={CAPSULE_FIELD}
              type="search"
              aria-label="찾을 내용이나 웹 주소"
              placeholder="검색어 또는 https:// 주소"
              value={state.input}
              onChange={(event) => useWebExplore.setState({ input: event.target.value })}
            />
          </CapsuleBar>
        </div>
      }
    >
      {state.error ? <Note tone="error">{state.error}</Note> : null}
      {state.pending ? <Note>{state.pending.kind === "document" ? "페이지 본문을 가져오고 있습니다." : "검색 결과를 기다리고 있습니다."}</Note> : null}
      {notice ? <Note tone="info">{notice}</Note> : null}

      {state.document ? (
        <section className="min-w-0 space-y-2" aria-label="페이지 본문">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">페이지 본문</h2>
            <Button variant="outline" size="sm" onClick={() => void copy(state.document!.text)}>
              본문 복사
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("ask", { input: [state.document!.url, state.document!.text].join("\n\n") })}>
              질문에 쓰기
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("build", { input: [state.document!.url, state.document!.text].join("\n\n") })}>
              빌드에 쓰기
            </Button>
          </div>
          {state.document.url ? <p className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">{state.document.url}</p> : null}
          {state.document.truncated ? <Note tone="info">본문 일부만 가져왔습니다.</Note> : null}
          <div tabIndex={0} className="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
            {state.document.text || "가져올 본문이 없습니다."}
          </div>
          <p className="text-[10px] text-muted-foreground">
            HTTP {state.document.status} · {state.document.contentType}
          </p>
        </section>
      ) : null}

      {state.results ? (
        <section className="min-w-0 space-y-2" aria-label="검색 결과">
          <h2 className="min-w-0 truncate text-xs font-semibold">{state.query ? `‘${state.query}’ 검색 결과` : "검색 결과"}</h2>
          {state.results.length === 0 ? <Note>검색 결과가 없습니다.</Note> : null}
          <ol className="min-w-0 divide-y divide-border rounded-md border border-border">
            {state.results.map((item, index) => (
              <li key={`${item.url}-${index}`} className="min-w-0 space-y-1 p-2.5">
                <h3 className="min-w-0 break-words text-xs font-medium">
                  {item.url ? (
                    <a className="text-primary underline-offset-2 hover:underline" href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title || item.url}
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>
                {item.description ? <p className="min-w-0 break-words text-[11px] text-muted-foreground">{item.description}</p> : null}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                    {item.url ? safeHost(item.url) : ""}
                    {item.published ? ` · ${item.published}` : ""}
                  </span>
                  {item.url ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!connected || !!state.pending}
                      onClick={() => {
                        useWebExplore.setState({ input: item.url });
                        useWebExplore.getState().search();
                      }}
                    >
                      본문 읽기
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("ask", { input: [item.title, item.url, item.description].filter(Boolean).join("\n") })}
                  >
                    질문에 쓰기
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* 빈 칸을 위쪽 한 줄로 두지 않는다. 안내를 칸 가운데에 둔다. */}
      {!state.results && !state.document && !state.pending ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Note>찾을 내용을 아래에 넣고 「찾기」를 누르세요.</Note>
        </div>
      ) : null}
    </Panel>
  );
}

function safeHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

/* ---------- 브라우저 ---------- */

export function BrowserPanel({ connected }: { connected: boolean }) {
  const state = useRuntimeExplore();
  const pane = state.browser;
  const busy = !!pane.pending;
  const result = pane.result;
  const tabs = rows(result?.tabs);

  return (
    <Panel
      footer={
        <CapsuleBar
          leading={<RoundIcon icon={Globe} label="주소 입력" onClick={() => document.getElementById("explore-browser-url")?.focus()} />}
          submitLabel="열기"
          submitDisabled={!connected || busy || !pane.url.trim()}
          onSubmit={() => state.run("browser", "open", { url: pane.url.trim() })}
        >
          <input
            id="explore-browser-url"
            className={CAPSULE_FIELD}
            type="url"
            aria-label="열 웹 주소"
            placeholder="https://"
            value={pane.url}
            onChange={(event) => state.patch("browser", { url: event.target.value })}
          />
        </CapsuleBar>
      }
    >
      {pane.error ? <Note tone="error">{pane.error}</Note> : null}
      {busy ? <Note>{pane.pending?.action === "snapshot" ? "화면을 캡처하고 있습니다." : "브라우저 동작을 기다리고 있습니다."}</Note> : null}

      {tabs.length > 0 ? (
        <div className="min-w-0 space-y-2">
          <label className="block min-w-0 space-y-1">
            <Label>열린 페이지</Label>
            <select
              className={SELECT}
              value={text(result?.activeTargetId)}
              disabled={!connected || busy}
              onChange={(event) => state.run("browser", "focus", { targetId: event.target.value })}
            >
              {tabs.map((tab) => (
                <option value={text(tab.targetId)} key={text(tab.targetId)}>
                  {text(tab.title) || text(tab.url) || "빈 페이지"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.run("browser", "snapshot")}>
              화면 캡처
            </Button>
            <Button variant="ghost" size="sm" disabled={!connected || busy} onClick={() => state.run("browser", "close", { targetId: result?.activeTargetId })}>
              선택한 페이지 닫기
            </Button>
          </div>
        </div>
      ) : null}

      <Capture frame={pane.frame} />

      <Fold title="브라우저 관리">
        <Note>{result ? (result.running ? "브라우저가 실행 중입니다." : "브라우저가 실행 중이지 않습니다.") : "상태를 확인하면 열린 페이지를 불러옵니다."}</Note>
        <label className="block min-w-0 space-y-1">
          <Label>브라우저 프로필</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={pane.profile}
            disabled={busy}
            onChange={(event) => state.patch("browser", { profile: event.target.value, frame: null, result: null })}
          />
        </label>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.run("browser", "status")}>
            상태 확인
          </Button>
          <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.run("browser", "start")}>
            빈 페이지 시작
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!connected || busy || !result?.running}
            onClick={() => state.run("browser", "stop")}
          >
            종료
          </Button>
        </div>
      </Fold>
    </Panel>
  );
}

/* ---------- 캔버스 ---------- */

export function CanvasPanel({ connected }: { connected: boolean }) {
  const state = useRuntimeExplore();
  const pane = state.canvas;
  const busy = !!pane.pending;
  const visible = pane.result?.visible === true;

  const reset = async () => {
    const ok = await requestConfirmDialog({
      title: "캔버스 초기화",
      message: "지금 화면과 입력한 내용을 비웁니다.",
      confirmLabel: "초기화"
    });
    if (ok) state.run("canvas", "a2ui_reset");
  };

  return (
    <Panel
      footer={
        <CapsuleBar
          leading={<RoundIcon icon={Globe} label="캔버스 주소" onClick={() => document.getElementById("explore-canvas-url")?.focus()} />}
          submitLabel="보기"
          submitDisabled={!connected || busy || !externalUrl(pane.url)}
          onSubmit={() => state.run("canvas", "navigate", { url: pane.url.trim() })}
        >
          <input
            id="explore-canvas-url"
            className={CAPSULE_FIELD}
            type="url"
            aria-label="캔버스에서 볼 주소"
            placeholder="https://"
            value={pane.url}
            onChange={(event) => state.patch("canvas", { url: event.target.value })}
          />
        </CapsuleBar>
      }
    >
      {pane.error ? <Note tone="error">{pane.error}</Note> : null}
      {busy ? <Note>{pane.pending?.action === "snapshot" ? "화면을 캡처하고 있습니다." : "캔버스 동작을 기다리고 있습니다."}</Note> : null}

      <div className="flex min-w-0 flex-wrap gap-1.5">
        <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.run("canvas", visible ? "hide" : "present")}>
          {visible ? "화면 숨기기" : "캔버스 열기"}
        </Button>
        <Button variant="outline" size="sm" disabled={!connected || busy || !visible} onClick={() => state.run("canvas", "snapshot", { maxWidth: state.width })}>
          화면 새로 캡처
        </Button>
        <Button variant="ghost" size="sm" disabled={!connected || busy} onClick={() => state.run("canvas", "status")}>
          상태 확인
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={!connected || busy || !visible}
          onClick={() => void reset()}
        >
          캔버스 초기화
        </Button>
      </div>

      {visible ? <Capture frame={pane.frame} /> : null}

      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1">
          <Label>캔버스 프로필</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={pane.profile}
            disabled={busy}
            onChange={(event) => state.patch("canvas", { profile: event.target.value, frame: null, result: null })}
          />
        </label>
        <label className="block min-w-0 space-y-1">
          <Label>캡처 너비</Label>
          <select className={SELECT} value={state.width} onChange={(event) => useRuntimeExplore.setState({ width: Number(event.target.value) })}>
            <option value={390}>390px · 모바일</option>
            <option value={768}>768px · 태블릿</option>
            <option value={1280}>1,280px · PC</option>
            <option value={1920}>1,920px · 넓게</option>
          </select>
        </label>
      </div>

      <Fold title="화면 만들기와 점검">
      <Fold title="JavaScript 실행">
        <Textarea
          rows={4}
          spellCheck={false}
          className="font-mono text-[11px]"
          aria-label="캔버스에서 실행할 JavaScript"
          value={state.script}
          onChange={(event) => useRuntimeExplore.setState({ script: event.target.value })}
        />
        <Button variant="outline" size="sm" disabled={!connected || busy || !visible || !state.script.trim()} onClick={() => state.run("canvas", "eval", { text: state.script })}>
          실행
        </Button>
        {state.evaluation !== null ? (
          <section className="min-w-0" aria-label="JavaScript 실행 결과">
            <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">
              {state.evaluation || "빈 문자열"}
            </pre>
          </section>
        ) : null}
      </Fold>

      <Fold title="선언형 UI">
        <Textarea
          rows={5}
          spellCheck={false}
          className="font-mono text-[11px]"
          aria-label="A2UI JSONL"
          value={state.definition}
          onChange={(event) => useRuntimeExplore.setState({ definition: event.target.value })}
        />
        <Button variant="outline" size="sm" disabled={!connected || busy || !state.definition.trim()} onClick={() => state.run("canvas", "a2ui_push", { text: state.definition })}>
          화면에 적용
        </Button>
        {number(pane.result?.a2uiRevision) > 0 ? <Note>화면 갱신 {number(pane.result?.a2uiRevision)}회</Note> : null}
        {rows(pane.result?.actionEvents).length > 0 ? (
          <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">
            {JSON.stringify(pane.result?.actionEvents, null, 2)}
          </pre>
        ) : null}
      </Fold>
      </Fold>
    </Panel>
  );
}

/* ---------- 작업 기록 ---------- */

export function SessionPanel({ connected }: { connected: boolean }) {
  const state = useSessionExplore();
  const navigate = useDesktopNavigationStore((s) => s.setActivePage);
  const selected = state.items.find((item) => item.key === state.selected);
  const queue = record(state.status?.queue);
  const active = record(state.status?.active);

  useEffect(() => {
    if (connected && state.items.length === 0 && !state.pending.list) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <Panel
      footer={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!connected || !!state.pending.list} onClick={state.refresh}>
            다시 조회
          </Button>
        </div>
      }
    >
      {state.error ? <Note tone="error">{state.error}</Note> : null}
      {state.notice ? <Note tone="info">{state.notice}</Note> : null}

      <label className="block min-w-0 space-y-1">
        <Label>저장된 작업</Label>
        <select className={SELECT} value={state.selected} disabled={!connected || !!state.pending.history} onChange={(event) => state.open(event.target.value)}>
          <option value="">{state.pending.list ? "목록을 읽고 있습니다." : "작업을 고르세요"}</option>
          {state.items.map((item) => (
            <option value={text(item.key)} key={text(item.key)}>
              {text(item.displayName) || text(item.label) || text(item.key)}
            </option>
          ))}
        </select>
      </label>

      {state.items.length === 0 && !state.pending.list ? <Note>아직 저장된 작업이 없습니다.</Note> : null}
      {state.pending.history ? <Note>작업 내용을 읽고 있습니다.</Note> : null}

      {state.history ? (
        <section className="min-w-0 space-y-2" aria-label="선택한 작업">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
              {text(selected?.displayName) || text(selected?.label) || "작업 내용"}
            </h2>
            {selected && ["chat", "coding"].includes(text(selected.scope)) ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!!state.pending.message}
                onClick={() => navigate(text(selected.scope) === "coding" ? "build" : "ask", { conversationId: state.selected })}
              >
                이 작업에서 계속하기
              </Button>
            ) : null}
          </div>
          <ul className="max-h-72 min-w-0 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
            {rows(state.history.messages).map((message, index) => (
              <li key={index} className="min-w-0">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  {text(message.role) === "user" ? "나" : text(message.role) === "assistant" ? "답변" : "기록"}
                </span>
                <p className="min-w-0 whitespace-pre-wrap break-words text-[11px]">{text(message.text)}</p>
              </li>
            ))}
          </ul>
          {state.history.truncated === true ? <Note>최근 메시지만 보여 줍니다.</Note> : null}
          <Fold title="메시지 남기기">
            <Textarea
              rows={3}
              className="text-xs"
              aria-label="이 작업에 남길 메시지"
              value={state.message}
              onChange={(event) => useSessionExplore.setState({ message: event.target.value })}
            />
            <Button variant="primary" size="sm" disabled={!connected || !!state.pending.message || !state.message.trim()} onClick={state.append}>
              {state.pending.message ? "저장 중" : "메시지 남기기"}
            </Button>
          </Fold>
        </section>
      ) : null}

      <Fold title="새 에이전트 작업">
        <Textarea
          rows={4}
          className="text-xs"
          aria-label="에이전트에게 맡길 일"
          value={state.task}
          onChange={(event) => useSessionExplore.setState({ task: event.target.value })}
        />
        <Fold title="이름과 실행 설정">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <Label>작업 이름</Label>
            <Input className="h-8 text-xs" value={state.label} onChange={(event) => useSessionExplore.setState({ label: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>실행 환경</Label>
            <select className={SELECT} value={state.runtime} onChange={(event) => useSessionExplore.setState({ runtime: event.target.value as "acp" | "codex" })}>
              <option value="acp">연결한 에이전트</option>
              <option value="codex">Codex CLI</option>
            </select>
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>작업 방식</Label>
            <select className={SELECT} value={state.mode} onChange={(event) => useSessionExplore.setState({ mode: event.target.value as "run" | "session" | "command" })}>
              <option value="run">한 번 실행</option>
              <option value="session">연속 작업</option>
              <option value="command">세션 명령</option>
            </select>
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>최대 실행 시간(초)</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              min={30}
              max={3600}
              value={state.timeout}
              onChange={(event) => useSessionExplore.setState({ timeout: Math.max(30, Math.min(3600, Number(event.target.value) || 900)) })}
            />
          </label>
        </div>
        </Fold>
        <label className="flex min-w-0 items-center gap-2 text-[11px]">
          <input type="checkbox" checked={state.thread} onChange={(event) => useSessionExplore.setState({ thread: event.target.checked })} />
          작업 문맥 이어 쓰기
        </label>
        <Button variant="primary" size="sm" disabled={!connected || !!state.pending.spawn || !state.task.trim()} onClick={state.create}>
          {state.pending.spawn ? "시작하는 중" : "작업 시작"}
        </Button>
        {state.spawn ? (
          <div className="min-w-0 space-y-1.5 rounded-md bg-muted/40 p-2">
            <p className="text-[11px] font-semibold">{statusLabel(text(state.spawn.status))}</p>
            {text(state.spawn.note) ? <p className="min-w-0 break-words text-[11px] text-muted-foreground">{text(state.spawn.note)}</p> : null}
            {text(state.spawn.childSessionKey) ? (
              <Button variant="outline" size="sm" disabled={!connected || !!state.pending.history} onClick={() => state.open(text(state.spawn!.childSessionKey))}>
                작업 기록 열기
              </Button>
            ) : null}
          </div>
        ) : null}
      </Fold>

      <Fold title="실행 대기 상태">
        <Button variant="outline" size="sm" disabled={!connected || !!state.pending.status} onClick={() => state.request("status", "sessions_spawn", { action: "status" })}>
          상태 확인
        </Button>
        {state.status ? (
          <Note>
            대기 {number(queue.total)}개 · 실행 중 {number(active.activeCount)}개
          </Note>
        ) : null}
      </Fold>
    </Panel>
  );
}

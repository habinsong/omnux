import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { STATIC_MODEL_OPTIONS } from "../ask/model-registry";
import { statusLabel, type Automation, type AutomationForm } from "./automation-model";
import { useAutomationWorkspace } from "./automation-state";

/* ============================================================================
   자동화 화면의 칸들.
   목록 · 작성 · 결과. 겹쳐 접지 않고, 한 겹만 접는다.
   ============================================================================ */

const SELECT =
  "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

export function Panel({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      {footer ? <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

function Note({ tone = "muted", children }: { tone?: "muted" | "warn"; children: React.ReactNode }) {
  return (
    <p className={cn("min-w-0 break-words text-[11px]", tone === "warn" ? "text-warning" : "text-muted-foreground")}>{children}</p>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="min-w-0 truncate">{title}</span>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="min-w-0 space-y-2 border-t border-border p-2.5">{children}</div> : null}
    </div>
  );
}

/* ---------- 목록 ---------- */

export function AutomationListPanel({ connected }: { connected: boolean }) {
  const state = useAutomationWorkspace();
  const busy = Boolean(state.pending.change);

  return (
    <Panel
      footer={
        <Button variant="outline" size="sm" disabled={!connected || Boolean(state.pending.list)} onClick={state.refresh}>
          다시 조회
        </Button>
      }
    >
      {state.pending.list && state.items.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">자동화를 불러오고 있습니다.</p>
      ) : state.items.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">아직 자동화가 없습니다. 반복할 일을 하나 등록해 보세요.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-border">
          {state.items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => state.select(item.id)}
                className={cn(
                  "min-w-0 flex-1 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  item.id === state.selectedId && "bg-accent"
                )}
              >
                <span className="block truncate text-xs font-medium">{item.title || "이름 없는 자동화"}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {item.running ? "실행 중" : item.enabled ? `다음 ${item.next}` : "예약 꺼짐"} · {item.schedule}
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="mr-2 shrink-0"
                aria-label={`${item.title} ${item.enabled ? "예약 끄기" : "예약 켜기"}`}
                disabled={!connected || busy}
                onClick={() => state.toggle(item)}
              >
                {item.enabled ? "켜짐" : "꺼짐"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- 작성 ---------- */

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function AutomationFormPanel({ connected }: { connected: boolean }) {
  const state = useAutomationWorkspace();
  const form = state.form;
  const busy = Boolean(state.pending.change);
  const patch = state.patch;

  return (
    <Panel
      footer={
        <>
          <Button variant="primary" size="sm" disabled={!connected || busy} onClick={state.save}>
            {state.editId ? "변경 저장" : "자동화 저장"}
          </Button>
          <Button variant="outline" size="sm" disabled={!connected || Boolean(state.pending.preview)} onClick={state.inspect}>
            {state.pending.preview ? "확인 중…" : "시간 확인"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useAutomationWorkspace.setState({ editor: false, editId: null, error: "", preview: null })}
          >
            그만두기
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <label className="block min-w-0 space-y-1">
          <Label>자동으로 할 일</Label>
          <Textarea
            rows={4}
            className="text-xs"
            disabled={busy}
            value={form.request}
            placeholder="매일 확인할 내용이나 반복할 작업을 적어 주세요."
            onChange={(event) => patch({ request: event.target.value })}
          />
        </label>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <Label>반복</Label>
            <select className={SELECT} disabled={busy} value={form.kind} onChange={(event) => patch({ kind: event.target.value as AutomationForm["kind"] })}>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>실행 시간</Label>
            <Input className="h-8 text-xs" type="time" disabled={busy} value={form.time} onChange={(event) => patch({ time: event.target.value })} />
          </label>
          {form.kind === "monthly" ? (
            <label className="block min-w-0 space-y-1">
              <Label>매월 날짜</Label>
              <Input
                className="h-8 text-xs"
                type="number"
                min={1}
                max={31}
                disabled={busy}
                value={form.day || ""}
                onChange={(event) => patch({ day: Number(event.target.value) })}
              />
            </label>
          ) : null}
        </div>

        {form.kind === "weekly" ? (
          <fieldset className="min-w-0 space-y-1" disabled={busy}>
            <legend className="text-[11px] font-medium text-muted-foreground">실행 요일</legend>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {WEEKDAYS.map((name, index) => {
                const day = (index + 1) % 7;
                const on = form.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch({ weekdays: on ? form.weekdays.filter((value) => value !== day) : [...form.weekdays, day].sort() })
                    }
                    className={cn(
                      "h-7 w-7 rounded-full text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                      on ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <Note>{form.timezone} 기준 · 저장하면 다음 예약부터 실행합니다.</Note>

        {state.preview ? (
          <div className="min-w-0 space-y-1 rounded-md bg-primary/10 p-2">
            <p className="min-w-0 break-words text-[11px] text-primary">
              {state.preview.schedule} · {state.preview.timezone}
            </p>
            {state.preview.warnings.map((warning, index) => (
              <Note key={index} tone="warn">
                {warning}
              </Note>
            ))}
          </div>
        ) : null}

        <Fold title="이름과 추가 설정">
          <label className="block min-w-0 space-y-1">
            <Label>자동화 이름</Label>
            <Input className="h-8 text-xs" value={form.title} placeholder="비우면 할 일에서 정합니다." onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>시간대</Label>
            <Input className="h-8 font-mono text-xs" value={form.timezone} placeholder="Asia/Seoul" onChange={(event) => patch({ timezone: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>실행 방식</Label>
            <select className={SELECT} value={form.execution} onChange={(event) => patch({ execution: event.target.value })}>
              <option value="">요청에 맞게 선택</option>
              <option value="web">웹 검색</option>
              <option value="url">링크 읽기</option>
              <option value="script">코드 실행</option>
              <option value="browser_agent">브라우저 조작</option>
            </select>
          </label>
          <Note>웹 검색·링크 읽기는 Gemini, 코드 생성은 Groq, 브라우저 조작은 Codex 연결이 필요합니다.</Note>

          {form.execution === "browser_agent" ? (
            <div className="min-w-0 space-y-2">
              <label className="block min-w-0 space-y-1">
                <Label>브라우저 실행 모델</Label>
                <select className={SELECT} value={form.agentModel} onChange={(event) => patch({ agentModel: event.target.value })}>
                  <option value="">모델 선택</option>
                  {Array.from(new Set([...(STATIC_MODEL_OPTIONS.codex || []), form.agentModel]))
                    .filter(Boolean)
                    .map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block min-w-0 space-y-1">
                <Label>시작할 주소</Label>
                <Input className="h-8 text-xs" type="url" placeholder="https://" value={form.startUrl} onChange={(event) => patch({ startUrl: event.target.value })} />
              </label>
              <label className="block min-w-0 space-y-1">
                <Label>제한 시간(초)</Label>
                <Input className="h-8 text-xs" type="number" min={120} max={1800} value={form.timeout} onChange={(event) => patch({ timeout: Number(event.target.value) })} />
              </label>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <Label>실패 시 재시도</Label>
              <Input className="h-8 text-xs" type="number" min={0} max={5} value={form.retries} onChange={(event) => patch({ retries: Number(event.target.value) })} />
            </label>
            {form.retries > 0 ? (
              <label className="block min-w-0 space-y-1">
                <Label>재시도 간격(초)</Label>
                <Input className="h-8 text-xs" type="number" min={0} max={300} value={form.retryDelay} onChange={(event) => patch({ retryDelay: Number(event.target.value) })} />
              </label>
            ) : null}
          </div>

          <label className="flex min-w-0 items-center gap-2 text-[11px]">
            <input type="checkbox" checked={form.telegram} onChange={(event) => patch({ telegram: event.target.checked })} />
            Telegram으로 결과 받기
          </label>
          {form.telegram ? (
            <label className="block min-w-0 space-y-1">
              <Label>알림 조건</Label>
              <select className={SELECT} value={form.notify} onChange={(event) => patch({ notify: event.target.value })}>
                <option value="on_change">결과가 달라지면</option>
                <option value="always">실행할 때마다</option>
                <option value="error_only">오류가 생기면</option>
                <option value="never">알림 보내지 않기</option>
              </select>
            </label>
          ) : null}
        </Fold>
      </div>
    </Panel>
  );
}

/* ---------- 결과 ---------- */

export function AutomationResultPanel({ item, connected }: { item: Automation; connected: boolean }) {
  const state = useAutomationWorkspace();
  const latest = item.runs[0]?.timestamp;
  const selectedTime = state.selectedTime ?? latest;
  const record = item.runs.find((run) => run.timestamp === selectedTime);
  const detail = state.detail?.id === item.id && state.detail.timestamp === selectedTime ? state.detail : null;
  const changing = Boolean(state.pending.change);
  const running = item.running || (state.pending.change?.type === "run_routine" && state.pending.change.fields.routineId === item.id);

  useEffect(() => {
    const pending = useAutomationWorkspace.getState().pending.detail;
    if (connected && selectedTime !== undefined && !detail && (pending?.fields.routineId !== item.id || pending.fields.timestamp !== selectedTime)) {
      state.read(selectedTime, state.selectedTime !== null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, item.id, selectedTime, latest]);

  return (
    <Panel
      footer={
        <>
          <Button variant="primary" size="sm" disabled={!connected || changing || running} onClick={() => state.run(item)}>
            지금 실행
          </Button>
          <Button variant="outline" size="sm" disabled={!connected || changing} onClick={() => state.toggle(item)}>
            {item.enabled ? "예약 끄기" : "예약 켜기"}
          </Button>
          <Button variant="ghost" size="sm" disabled={!connected || changing || running} onClick={state.edit}>
            편집
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="min-w-0 truncate text-xs font-semibold">{item.title || "이름 없는 자동화"}</h2>
          <Note>
            {item.schedule} · {item.enabled ? `다음 ${item.next}` : "예약 꺼짐"}
          </Note>
        </div>

        <p className="min-w-0 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px]">{item.request}</p>

        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold">{state.selectedTime && state.selectedTime !== latest ? "이전 실행" : "최근 실행"}</h3>
          <Note>{running ? "실행 중" : record ? `${record.time} · ${statusLabel(record.status)}` : "아직 실행하지 않았습니다."}</Note>
        </div>

        {running ? <Note>작업을 실행하고 있습니다. 끝나면 여기에 결과가 나옵니다.</Note> : null}
        {state.pending.detail ? <Note>실행 결과를 불러오고 있습니다.</Note> : null}

        {detail ? (
          <div className="min-w-0 space-y-2" aria-label="실행 결과">
            {detail.error && detail.error.trim() !== detail.content.trim() ? <Note tone="warn">{detail.error}</Note> : null}
            <div className="markdown-body min-w-0 max-h-80 overflow-auto break-words rounded-md border border-border p-2 text-[11px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content || "저장된 결과가 없습니다."}</ReactMarkdown>
            </div>
          </div>
        ) : record && !state.pending.detail ? (
          <div className="min-w-0 space-y-2 rounded-md border border-border p-2">
            <p className="min-w-0 break-words text-[11px]">{record.summary || record.error || "저장된 실행 기록입니다."}</p>
            <Button variant="outline" size="sm" disabled={!connected} onClick={() => state.read(record.timestamp)}>
              결과 다시 읽기
            </Button>
          </div>
        ) : null}

        {running ? <Note>예약을 꺼도 지금 실행은 끝날 때까지 계속됩니다.</Note> : null}

        <Fold title={`이전 실행 기록${item.runs.length ? ` · ${item.runs.length}` : ""}`}>
          {item.runs.length > 0 ? (
            <label className="block min-w-0 space-y-1">
              <Label>실행 고르기</Label>
              <select className={SELECT} value={selectedTime ?? ""} disabled={!connected} onChange={(event) => state.read(Number(event.target.value))}>
                {item.runs.map((run) => (
                  <option key={run.timestamp} value={run.timestamp}>
                    {run.time} · {statusLabel(run.status)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Note>저장된 실행 기록이 없습니다.</Note>
          )}
          {record?.duration ? <Note>소요 시간 {record.duration}</Note> : null}
        </Fold>

        <Fold title="상세 정보와 관리">
          <dl className="min-w-0 space-y-1 text-[11px]">
            <div className="flex min-w-0 gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">시간대</dt>
              <dd className="min-w-0 flex-1 break-all">{item.form.timezone}</dd>
            </div>
            {detail?.artifact ? (
              <div className="flex min-w-0 gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">결과 파일</dt>
                <dd className="min-w-0 flex-1 break-all font-mono">{detail.artifact}</dd>
              </div>
            ) : null}
            {item.script ? (
              <div className="flex min-w-0 gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">실행 파일</dt>
                <dd className="min-w-0 flex-1 break-all font-mono">{item.script}</dd>
              </div>
            ) : null}
            {detail?.url ? (
              <div className="flex min-w-0 gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">마지막 주소</dt>
                <dd className="min-w-0 flex-1 break-all">
                  {/^https?:\/\//i.test(detail.url) ? (
                    <a className="text-primary underline-offset-2 hover:underline" href={detail.url} target="_blank" rel="noreferrer">
                      {detail.url}
                    </a>
                  ) : (
                    detail.url
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {detail?.downloads.map((file) => (
            <Note key={file}>다운로드: {file}</Note>
          ))}
          {item.qualityWarnings.map((warning, index) => (
            <Note key={index} tone="warn">
              {warning}
            </Note>
          ))}
          {detail?.raw ? (
            <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">{detail.raw}</pre>
          ) : null}
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {record ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!connected || changing}
                onClick={() =>
                  useAutomationWorkspace.setState({
                    confirmation: {
                      title: "결과 보내기",
                      message: "고른 실행 결과를 연결된 Telegram 대화로 보냅니다.",
                      action: "resend",
                      id: item.id,
                      timestamp: record.timestamp
                    }
                  })
                }
              >
                Telegram으로 보내기
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!connected || changing || running}
              onClick={() =>
                useAutomationWorkspace.setState({
                  confirmation: {
                    title: "자동화 삭제",
                    message: `‘${item.title}’의 예약과 실행 기록을 지웁니다.`,
                    action: "delete",
                    id: item.id
                  }
                })
              }
            >
              자동화 삭제
            </Button>
          </div>
        </Fold>
      </div>
    </Panel>
  );
}

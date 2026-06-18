import { History, RotateCcw, Search, ShieldCheck, Timer } from "lucide-react";
import { Badge, Button, EmptyState, Input, SectionLabel, cn } from "../../components/ui/primitives";
import { type SessionReplayEvent, useSessionReplayStore } from "./session-replay-store";

function severityTone(severity: string): "success" | "warning" | "destructive" | "primary" | "outline" {
  const value = severity.toLowerCase();
  if (/(error|failed|timeout|blocked)/.test(value)) return "destructive";
  if (/(warn|stale|breaker)/.test(value)) return "warning";
  if (/(telemetry|conversation_window|running)/.test(value)) return "primary";
  if (/(info|ok|exact)/.test(value)) return "success";
  return "outline";
}

function formatTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function ReplayToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      <input type="checkbox" className="h-3.5 w-3.5 shrink-0 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function ReplayEventRow({ event }: { event: SessionReplayEvent }) {
  const detail = [event.provider, event.model, event.status].filter(Boolean).join(" / ");
  return (
    <article className="rounded-md border border-border bg-card/60 p-2.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{event.title || event.kind || event.source}</span>
            <Badge tone={severityTone(event.severity)} className="shrink-0">{event.severity || "기록"}</Badge>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {event.source || "출처"} · {event.kind || "종류"} · {event.correlation || "연결"}
          </div>
        </div>
        <time dateTime={event.timestampUtc} className="shrink-0 text-[10px] text-muted-foreground">{formatTime(event.timestampUtc)}</time>
      </div>
      {event.summary ? <p className="mt-1.5 break-words text-xs leading-relaxed text-foreground">{event.summary}</p> : null}
      {event.bodyPreview ? <p className="mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">{event.bodyPreview}</p> : null}
      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
        {detail ? <Badge tone="outline" className="max-w-full truncate">{detail}</Badge> : null}
        {event.totalTokens > 0 ? <Badge tone="primary">사용량 {event.totalTokens.toLocaleString()}</Badge> : null}
        {event.durationMs > 0 ? <Badge tone="outline">{event.durationMs}ms</Badge> : null}
        {event.meta ? <Badge tone="outline" className="max-w-full truncate">{event.meta}</Badge> : null}
      </div>
    </article>
  );
}

export function SessionReplayPanel({ canRequest }: { canRequest: boolean }) {
  const store = useSessionReplayStore();
  const query = store.query;
  const snapshot = store.snapshot;
  const canRun = canRequest && !store.loading;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>세션 타임라인</SectionLabel>
          <p className="mt-1 text-sm text-muted-foreground">대화, 실행, 작업자 기록을 시간순으로 확인합니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={store.clear} disabled={store.loading}>
            <RotateCcw size={14} aria-hidden="true" /> 지우기
          </Button>
          <Button variant="primary" size="sm" onClick={store.run} disabled={!canRun}>
            <Search size={14} aria-hidden="true" /> {store.loading ? "조회 중" : "조회"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Input className="font-mono text-xs" placeholder="대화 ID" value={query.conversationId} onChange={(event) => store.setQuery({ conversationId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="실행 ID" value={query.runId} onChange={(event) => store.setQuery({ runId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="작업자 ID" value={query.agentId} onChange={(event) => store.setQuery({ agentId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="그룹 ID" value={query.groupId} onChange={(event) => store.setQuery({ groupId: event.target.value })} />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_repeat(3,minmax(0,1fr))]">
        <Input className="font-mono text-xs" inputMode="numeric" placeholder="표시 수" value={query.limit} onChange={(event) => store.setQuery({ limit: event.target.value })} />
        <ReplayToggle label="본문 미리보기" checked={query.includeText} onChange={(includeText) => store.setQuery({ includeText })} />
        <ReplayToggle label="호출 기록 포함" checked={query.includeTelemetry} onChange={(includeTelemetry) => store.setQuery({ includeTelemetry })} />
        <ReplayToggle label="작업자 기록 포함" checked={query.includeAgentEvents} onChange={(includeAgentEvents) => store.setQuery({ includeAgentEvents })} />
      </div>

      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      {snapshot ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <ReplayStat label="기록" value={`${snapshot.returnedEvents}/${snapshot.totalEvents || snapshot.returnedEvents}`} />
            <ReplayStat label="메시지" value={snapshot.summary.conversationMessageCount.toLocaleString()} />
            <ReplayStat label="호출" value={snapshot.summary.telemetryEventCount.toLocaleString()} />
            <ReplayStat label="작업자" value={snapshot.summary.agentEventCount.toLocaleString()} />
            <ReplayStat label="사용량" value={snapshot.summary.totalTokens.toLocaleString()} />
          </div>
          <div className="flex flex-wrap gap-1">
            {snapshot.conversationId ? <Badge tone="outline" className="max-w-full truncate">대화 {snapshot.conversationId}</Badge> : null}
            {snapshot.runId ? <Badge tone="outline" className="max-w-full truncate">실행 {snapshot.runId}</Badge> : null}
            {snapshot.agentId ? <Badge tone="outline" className="max-w-full truncate">작업자 {snapshot.agentId}</Badge> : null}
            {snapshot.groupId ? <Badge tone="outline" className="max-w-full truncate">그룹 {snapshot.groupId}</Badge> : null}
            <Badge tone={snapshot.summary.errorCount > 0 ? "destructive" : "success"}>오류 {snapshot.summary.errorCount}</Badge>
            <Badge tone={snapshot.summary.warningCount > 0 ? "warning" : "outline"}>주의 {snapshot.summary.warningCount}</Badge>
          </div>
          <div className="space-y-2">
            {snapshot.events.slice(0, 12).map((event) => <ReplayEventRow key={event.id || `${event.source}-${event.timestampUtc}`} event={event} />)}
            {snapshot.events.length === 0 ? <EmptyState icon={Timer} title="타임라인 기록 없음" description="조건에 맞는 대화, 호출, 작업자 기록이 없습니다." /> : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={History}
          title="세션 타임라인 조회 전"
          description="대화, 실행, 작업자, 그룹 ID 중 하나를 입력해 확인할 흐름을 조회하세요."
          action={<Badge tone="outline"><ShieldCheck size={12} aria-hidden="true" /> 읽기 전용</Badge>}
        />
      )}

      <p className={cn("rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground", query.includeText && "border-warning/30 bg-warning/10 text-warning")}>
        본문 미리보기는 기존 저장 내용을 새로 저장하지 않고 조회 결과에만 표시합니다. 호출 기록은 요청·응답 원문을 포함하지 않습니다.
      </p>
    </section>
  );
}

function ReplayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card/60 p-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

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
            <Badge tone={severityTone(event.severity)} className="shrink-0">{event.severity || "event"}</Badge>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {event.source || "source"} · {event.kind || "kind"} · {event.correlation || "correlation"}
          </div>
        </div>
        <time dateTime={event.timestampUtc} className="shrink-0 text-[10px] text-muted-foreground">{formatTime(event.timestampUtc)}</time>
      </div>
      {event.summary ? <p className="mt-1.5 break-words text-xs leading-relaxed text-foreground">{event.summary}</p> : null}
      {event.bodyPreview ? <p className="mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">{event.bodyPreview}</p> : null}
      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
        {detail ? <Badge tone="outline" className="max-w-full truncate">{detail}</Badge> : null}
        {event.totalTokens > 0 ? <Badge tone="primary">{event.totalTokens.toLocaleString()} tok</Badge> : null}
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
          <SectionLabel>Session replay</SectionLabel>
          <p className="mt-1 text-sm text-muted-foreground">대화·telemetry·agent event를 시간순 타임라인으로 조회합니다.</p>
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
        <Input className="font-mono text-xs" placeholder="conversationId" value={query.conversationId} onChange={(event) => store.setQuery({ conversationId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="runId" value={query.runId} onChange={(event) => store.setQuery({ runId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="agentId" value={query.agentId} onChange={(event) => store.setQuery({ agentId: event.target.value })} />
        <Input className="font-mono text-xs" placeholder="groupId" value={query.groupId} onChange={(event) => store.setQuery({ groupId: event.target.value })} />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_repeat(3,minmax(0,1fr))]">
        <Input className="font-mono text-xs" inputMode="numeric" placeholder="limit" value={query.limit} onChange={(event) => store.setQuery({ limit: event.target.value })} />
        <ReplayToggle label="본문 preview 포함" checked={query.includeText} onChange={(includeText) => store.setQuery({ includeText })} />
        <ReplayToggle label="LLM telemetry 포함" checked={query.includeTelemetry} onChange={(includeTelemetry) => store.setQuery({ includeTelemetry })} />
        <ReplayToggle label="Agent event 포함" checked={query.includeAgentEvents} onChange={(includeAgentEvents) => store.setQuery({ includeAgentEvents })} />
      </div>

      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      {snapshot ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <ReplayStat label="events" value={`${snapshot.returnedEvents}/${snapshot.totalEvents || snapshot.returnedEvents}`} />
            <ReplayStat label="messages" value={snapshot.summary.conversationMessageCount.toLocaleString()} />
            <ReplayStat label="telemetry" value={snapshot.summary.telemetryEventCount.toLocaleString()} />
            <ReplayStat label="agent" value={snapshot.summary.agentEventCount.toLocaleString()} />
            <ReplayStat label="tokens" value={snapshot.summary.totalTokens.toLocaleString()} />
          </div>
          <div className="flex flex-wrap gap-1">
            {snapshot.conversationId ? <Badge tone="outline" className="max-w-full truncate">conversation {snapshot.conversationId}</Badge> : null}
            {snapshot.runId ? <Badge tone="outline" className="max-w-full truncate">run {snapshot.runId}</Badge> : null}
            {snapshot.agentId ? <Badge tone="outline" className="max-w-full truncate">agent {snapshot.agentId}</Badge> : null}
            {snapshot.groupId ? <Badge tone="outline" className="max-w-full truncate">group {snapshot.groupId}</Badge> : null}
            <Badge tone={snapshot.summary.errorCount > 0 ? "destructive" : "success"}>{snapshot.summary.errorCount} errors</Badge>
            <Badge tone={snapshot.summary.warningCount > 0 ? "warning" : "outline"}>{snapshot.summary.warningCount} warnings</Badge>
          </div>
          <div className="space-y-2">
            {snapshot.events.slice(0, 12).map((event) => <ReplayEventRow key={event.id || `${event.source}-${event.timestampUtc}`} event={event} />)}
            {snapshot.events.length === 0 ? <EmptyState icon={Timer} title="리플레이 이벤트 없음" description="조건에 맞는 대화·telemetry·agent event가 없습니다." /> : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={History}
          title="세션 리플레이 조회 전"
          description="conversation, run, agent, group 중 하나를 입력해 디버깅 타임라인을 조회하세요."
          action={<Badge tone="outline"><ShieldCheck size={12} aria-hidden="true" /> read-only</Badge>}
        />
      )}

      <p className={cn("rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground", query.includeText && "border-warning/30 bg-warning/10 text-warning")}>
        includeText는 기존 저장 본문을 새로 저장하지 않고 응답 preview만 표시합니다. Telemetry 이벤트는 prompt/response 원문을 포함하지 않습니다.
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

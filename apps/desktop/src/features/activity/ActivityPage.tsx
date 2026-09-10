import { useMemo, useState } from "react";
import { Download, History, ListFilter, Trash2, Wrench } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, cn } from "../../components/ui/primitives";
import { MAX_UI_LOGS, serializeUiLogs, useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useSessionReplayBridge, useSessionReplayStore } from "./session-replay-store";
import {
  TIMELINE_KINDS,
  TIMELINE_PAGE_SIZE,
  buildHandoff,
  countLevels,
  entryTitle,
  filterByLevel,
  formatDateTime,
  formatTime,
  levelLabel,
  sourceLabel,
  timelineFields,
  timelineSeverityLabel,
  timelineSeverityTone,
  type Entry,
  type Level,
  type TimelineIdKind
} from "./activity-view";

/* ============================================================================
   활동 화면.
   캡슐 탭으로 "이 세션 기록" 과 "세션 타임라인" 을 고른다.
   목록은 남은 높이를 채우고 그 안에서만 스크롤한다.
   ============================================================================ */

type TabId = "session" | "timeline";

export function ActivityPage() {
  useSessionReplayBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);

  const [tab, setTab] = useState<TabId>("session");
  const [level, setLevel] = useState<Level | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const entries = logs as readonly Entry[];
  const counts = useMemo(() => countLevels(entries), [entries]);
  const shown = useMemo(() => filterByLevel(entries, level), [entries, level]);

  const exportLogs = () => {
    const blob = new Blob([serializeUiLogs(logs)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnux-activity-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const tabs: ScreenTab[] = [
    { id: "session", label: "이 세션 기록", icon: ListFilter, badge: String(entries.length) },
    { id: "timeline", label: "세션 타임라인", icon: History }
  ];

  return (
    <Screen
      title="활동"
      hint="지금 세션에서 일어난 일과, 저장해 둔 흐름입니다."
      actions={
        tab === "session" ? (
          <>
            <Button variant="ghost" size="sm" onClick={exportLogs} disabled={entries.length === 0}>
              <Download size={14} aria-hidden="true" /> 내보내기
            </Button>
            {confirmClear ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    clearLogs();
                    setConfirmClear(false);
                  }}
                >
                  정말 비우기
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} disabled={entries.length === 0}>
                <Trash2 size={14} aria-hidden="true" /> 비우기
              </Button>
            )}
          </>
        ) : null
      }
      notice={
        counts.error > 0 ? (
          <ScreenNotice tone="danger">오류 {counts.error}건. 아래에서 보세요.</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="활동 보기 종류" />

      {tab === "session" ? (
        <SessionLog entries={shown} total={entries.length} counts={counts} level={level} onLevel={setLevel} />
      ) : (
        <TimelinePanel connected={connected} />
      )}
    </Screen>
  );
}

function SessionLog({
  entries,
  total,
  counts,
  level,
  onLevel
}: {
  entries: Entry[];
  total: number;
  counts: Record<Level, number>;
  level: Level | "all";
  onLevel: (next: Level | "all") => void;
}) {
  const filters: { id: Level | "all"; label: string; count: number }[] = [
    { id: "all", label: "전체", count: total },
    { id: "error", label: "오류", count: counts.error },
    { id: "warn", label: "주의", count: counts.warn },
    { id: "info", label: "정보", count: counts.info }
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={level === filter.id}
            onClick={() => onLevel(filter.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              level === filter.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {filter.label} {filter.count}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {total === 0 ? "아직 기록이 없습니다." : "이 조건에 맞는 기록이 없습니다."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {total >= MAX_UI_LOGS ? (
        <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          최근 {MAX_UI_LOGS}건만 남겨 둡니다. 그 이전은 지워집니다.
        </p>
      ) : null}
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="w-[62px] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTime(entry.createdAt)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{entryTitle(entry.message)}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            entry.level === "error" && "bg-destructive/15 text-destructive",
            entry.level === "warn" && "bg-warning/15 text-warning",
            entry.level === "info" && "bg-muted text-muted-foreground"
          )}
        >
          {levelLabel(entry.level)}
        </span>
      </button>

      {open ? (
        <div className="min-w-0 space-y-2 border-t border-border bg-muted/20 px-3 py-2 text-[11px]">
          <p className="text-muted-foreground">
            {sourceLabel(entry.source)} · {formatDateTime(entry.createdAt)}
          </p>
          <p className="min-w-0 whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono">
            {entry.message}
          </p>
          {entry.componentStack ? (
            <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-muted-foreground">
              {entry.componentStack}
            </pre>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              useDesktopNavigationStore.getState().setActivePage("build", { input: buildHandoff(entry) })
            }
          >
            <Wrench size={12} aria-hidden="true" /> 빌드로 넘기기
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              useDesktopNavigationStore.getState().setActivePage("ask", { input: buildHandoff(entry) })
            }
          >
            질문으로 넘기기
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TimelinePanel({ connected }: { connected: boolean }) {
  const snapshot = useSessionReplayStore((state) => state.snapshot);
  const loading = useSessionReplayStore((state) => state.loading);
  const lastError = useSessionReplayStore((state) => state.lastError);
  const setQuery = useSessionReplayStore((state) => state.setQuery);
  const run = useSessionReplayStore((state) => state.run);

  const [kind, setKind] = useState<TimelineIdKind>("conversation");
  const [id, setId] = useState("");
  const [visible, setVisible] = useState(TIMELINE_PAGE_SIZE);

  const events = snapshot?.events ?? [];
  const shown = events.slice(0, visible);
  const canRun = connected && !loading && id.trim().length > 0;

  const submit = () => {
    if (!canRun) return;
    setQuery(timelineFields(kind, id));
    setVisible(TIMELINE_PAGE_SIZE);
    run();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TIMELINE_KINDS.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              aria-pressed={kind === entry.kind}
              onClick={() => setKind(entry.kind)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                kind === entry.kind
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <Input
          className="min-w-0 flex-1 font-mono text-xs"
          value={id}
          aria-label="조회할 ID"
          placeholder="ID 를 넣고 Enter"
          onChange={(event) => setId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <Button variant="primary" size="md" className="shrink-0" onClick={submit} disabled={!canRun}>
          {loading ? <Spinner size={14} /> : null} 조회
        </Button>
        {kind === "conversation" && id.trim() && snapshot ? (
          <Button
            variant="outline"
            size="md"
            className="shrink-0"
            onClick={() => useDesktopNavigationStore.getState().setActivePage("ask", { conversationId: id.trim() })}
          >
            이 대화 열기
          </Button>
        ) : null}
      </div>

      {!connected ? <ScreenNotice tone="warning">서버에 연결하면 조회할 수 있습니다.</ScreenNotice> : null}
      {lastError ? <ScreenNotice tone="danger">{lastError}</ScreenNotice> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {snapshot !== null ? (
          <p className="shrink-0 truncate border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            기록 {snapshot.returnedEvents}
            {snapshot.totalEvents > snapshot.returnedEvents ? ` / ${snapshot.totalEvents}` : ""} · 오류{" "}
            {snapshot.summary.errorCount} · 주의 {snapshot.summary.warningCount}
            {snapshot.summary.totalTokens > 0 ? ` · 토큰 ${snapshot.summary.totalTokens.toLocaleString()}` : ""}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {snapshot === null ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              대화·실행·작업자·그룹 중 하나의 ID를 넣으면 그 흐름을 시간순으로 봅니다.
            </p>
          ) : events.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">그 ID의 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((event, index) => (
                <li key={event.id || `${event.source}-${index}`}>
                  <TimelineRow event={event} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {events.length > shown.length ? (
          <div className="shrink-0 border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setVisible((value) => value + TIMELINE_PAGE_SIZE)}
            >
              더 보기 ({shown.length}/{events.length})
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelineRow({
  event
}: {
  event: {
    id: string;
    source: string;
    kind: string;
    severity: string;
    title: string;
    summary: string;
    bodyPreview: string;
    provider: string;
    model: string;
    status: string;
    totalTokens: number;
    durationMs: number;
    timestampUtc: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const tone = timelineSeverityTone(event.severity);

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="w-[62px] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTime(event.timestampUtc)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{event.title || event.kind || event.source || "기록"}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            tone === "destructive" && "bg-destructive/15 text-destructive",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "success" && "bg-success/15 text-success",
            tone === "default" && "bg-muted text-muted-foreground"
          )}
        >
          {timelineSeverityLabel(event.severity)}
        </span>
      </button>

      {open ? (
        <div className="min-w-0 space-y-1.5 border-t border-border bg-muted/20 px-3 py-2 text-[11px]">
          <p className="min-w-0 break-words text-muted-foreground">
            {[event.source, event.kind, event.provider, event.model, event.status].filter(Boolean).join(" · ") || "출처 없음"}
          </p>
          {event.summary ? <p className="min-w-0 whitespace-pre-wrap break-words">{event.summary}</p> : null}
          {event.bodyPreview ? (
            <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-muted-foreground">
              {event.bodyPreview}
            </pre>
          ) : null}
          <p className="text-muted-foreground">
            {event.totalTokens > 0 ? `토큰 ${event.totalTokens.toLocaleString()} · ` : ""}
            {event.durationMs > 0 ? `${event.durationMs}ms · ` : ""}
            {formatDateTime(event.timestampUtc)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

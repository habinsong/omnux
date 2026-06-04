import { useMemo, useState } from "react";
import { AlertTriangle, Download, Info, Route, Trash2 } from "lucide-react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { serializeUiLogs, useUiLogStore, type ShellLogLevel } from "../ui-log/ui-log-store";
import { Badge, Button, EmptyState, SectionLabel, cn } from "../../components/ui/primitives";
import { SessionReplayPanel } from "./SessionReplayPanel";
import { useSessionReplayBridge } from "./session-replay-store";

type LevelFilter = "all" | ShellLogLevel;

const FILTERS: { id: LevelFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "info", label: "info" },
  { id: "warn", label: "warn" },
  { id: "error", label: "error" }
];

function formatLogTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "날짜 없음";
  const today = new Date();
  const sameDay = parsed.getFullYear() === today.getFullYear() && parsed.getMonth() === today.getMonth() && parsed.getDate() === today.getDate();
  if (sameDay) return "오늘";
  return parsed.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" });
}

function levelTone(level: ShellLogLevel): "destructive" | "warning" | "success" {
  if (level === "error") return "destructive";
  if (level === "warn") return "warning";
  return "success";
}

const ICON_TINT: Record<ShellLogLevel, string> = {
  error: "bg-destructive/12 text-destructive",
  warn: "bg-warning/12 text-warning",
  info: "bg-primary/12 text-primary"
};

function ActivityIcon({ level }: { level: ShellLogLevel }) {
  if (level === "error") return <AlertTriangle size={16} aria-hidden="true" />;
  if (level === "warn") return <Info size={16} aria-hidden="true" />;
  return <Route size={16} aria-hidden="true" />;
}

function ActivityRow({ log, detailed }: { log: ReturnType<typeof useUiLogStore.getState>["logs"][number]; detailed?: boolean }) {
  return (
    <article className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", ICON_TINT[log.level])}>
        <ActivityIcon level={log.level} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{log.message || log.source}</span>
          <Badge tone={levelTone(log.level)} className="shrink-0">{log.level}</Badge>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{log.source}</div>
        {detailed && log.componentStack ? (
          <pre className="error-stack mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">{log.componentStack}</pre>
        ) : null}
      </div>
      <time dateTime={log.createdAt} className="shrink-0 text-[10px] text-muted-foreground">{formatLogTime(log.createdAt)}</time>
    </article>
  );
}

export function ActivityPage() {
  useSessionReplayBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);
  const [filter, setFilter] = useState<LevelFilter>("all");
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  const counts = useMemo(() => {
    const summary = { info: 0, warn: 0, error: 0 };
    logs.forEach((log) => {
      if (log.level === "info" || log.level === "warn" || log.level === "error") summary[log.level] += 1;
    });
    return summary;
  }, [logs]);

  const filtered = useMemo(() => (filter === "all" ? logs : logs.filter((log) => log.level === filter)), [logs, filter]);
  const liveEvents = useMemo(() => filtered.slice(0, 6), [filtered]);
  const days = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((log) => {
      const day = formatDay(log.createdAt);
      const entries = groups.get(day) || [];
      entries.push(log);
      groups.set(day, entries);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const exportLogs = () => {
    const blob = new Blob([serializeUiLogs(logs)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnux-desktop-activity-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">활동</h1>
          <p className="text-sm text-muted-foreground">현재 데스크톱 세션의 런타임, 인증, 오류 이벤트를 시간순으로 확인합니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportLogs}>
            <Download size={15} aria-hidden="true" /> 내보내기
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={clearLogs}>
            <Trash2 size={15} aria-hidden="true" /> 비우기
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((definition) => (
          <button
            key={definition.id}
            type="button"
            onClick={() => setFilter(definition.id)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", filter === definition.id ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
          >
            {definition.label}
          </button>
        ))}
        <Badge tone="default" className="ml-auto">info {counts.info}</Badge>
        <Badge tone="warning">warn {counts.warn}</Badge>
        <Badge tone="destructive">error {counts.error}</Badge>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <SessionReplayPanel canRequest={canRequest} />
      </div>

      {liveEvents.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel>Live middleware events</SectionLabel>
          <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] backdrop-blur-xl">
            {liveEvents.map((event) => (
              <ActivityRow key={event.id} log={event} />
            ))}
          </div>
        </section>
      ) : null}

      {days.length === 0 ? (
        <EmptyState icon={Route} title="아직 표시할 미들웨어 이벤트가 없습니다" description="질문·빌드·세션 실행 등 활동이 발생하면 여기에 시간순으로 쌓입니다." />
      ) : null}

      {days.map(([day, entries]) => (
        <section key={day} className="space-y-2">
          <SectionLabel>{day}</SectionLabel>
          <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] backdrop-blur-xl">
            {entries.map((log) => (
              <ActivityRow key={log.id} log={log} detailed />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

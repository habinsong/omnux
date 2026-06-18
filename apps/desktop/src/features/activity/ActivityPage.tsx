import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Code2, Download, Info, MessageSquare, Route, Scale, Shield, Trash2, Workflow, Wrench, X } from "lucide-react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { serializeUiLogs, useUiLogStore, type ShellLogEntry, type ShellLogLevel } from "../ui-log/ui-log-store";
import { Badge, Button, EmptyState, SectionLabel, cn } from "../../components/ui/primitives";
import { SessionReplayPanel } from "./SessionReplayPanel";
import { useSessionReplayBridge } from "./session-replay-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";

type LevelFilter = "all" | ShellLogLevel;
type ProductTypeFilter = "all" | "ask" | "build" | "automate" | "compare" | "planning" | "ops";

const LEVEL_FILTERS: { id: LevelFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "info", label: "정보" },
  { id: "warn", label: "주의" },
  { id: "error", label: "오류" }
];

const TYPE_FILTERS: { id: ProductTypeFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "ask", label: "질문" },
  { id: "build", label: "빌드" },
  { id: "automate", label: "자동화" },
  { id: "compare", label: "비교" },
  { id: "planning", label: "작업" },
  { id: "ops", label: "운영" }
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

function inferActivityType(log: ShellLogEntry): Exclude<ProductTypeFilter, "all"> {
  const haystack = `${log.source} ${log.message}`.toLowerCase();
  if (/compare|multi|비교/.test(haystack)) return "compare";
  if (/coding|build|빌드|코딩|refactor|safe refactor|execute|preview file|자동 컨텍스트/.test(haystack)) return "build";
  if (/routine|automate|automation|cron|telegram|nodes|자동화|루틴|텔레그램|스케줄/.test(haystack)) return "automate";
  if (/plan|task|planning|graph|작업계획|태스크|계획/.test(haystack)) return "planning";
  if (/llm_chat|conversation|ask|rag|vision|memory|대화|질문|메모리/.test(haystack)) return "ask";
  return "ops";
}

function productTypeLabel(type: Exclude<ProductTypeFilter, "all">) {
  if (type === "ask") return "질문";
  if (type === "build") return "빌드";
  if (type === "automate") return "자동화";
  if (type === "compare") return "비교";
  if (type === "planning") return "작업";
  return "운영";
}

function levelLabel(level: ShellLogLevel) {
  if (level === "error") return "오류";
  if (level === "warn") return "주의";
  return "정보";
}

function sourceLabel(source: ShellLogEntry["source"]) {
  if (source === "middleware") return "미들웨어";
  if (source === "runtime") return "런타임";
  if (source === "logs") return "로그";
  if (source === "navigation") return "이동";
  if (source === "operations") return "작업";
  if (source === "auth") return "인증";
  if (source === "doctor") return "진단";
  if (source === "ops") return "운영";
  return "셸";
}

function displayLogMessage(log: ShellLogEntry) {
  const message = log.message || "";
  const pathMatch = message.match(/^logic_path_list:\s*(\d+)건/);
  if (pathMatch) return `경로 목록 ${pathMatch[1]}건`;
  const taskGraphMatch = message.match(/^task_graph_list:\s*(\d+)건/);
  if (taskGraphMatch) return `작업 그래프 ${taskGraphMatch[1]}건`;
  const planMatch = message.match(/^plan_list:\s*(\d+)건/);
  if (planMatch) return `계획 목록 ${planMatch[1]}건`;
  if (message.startsWith("get_metrics:")) return "리소스 사용량 확인";
  if (message.startsWith("get_setup_state:")) return "설정 상태 수신";
  if (message.startsWith("readyz probe=ok")) return "준비 상태 확인 완료";
  if (message.startsWith("readyz probe=error")) return "준비 상태 확인 실패";
  if (message.startsWith("healthz probe=ok")) return "상태 확인 완료";
  if (message.startsWith("healthz probe=error")) return "상태 확인 실패";
  if (message.includes("runtime probe에 실패")) return "런타임 확인 실패";
  if (message.includes("재연결 한도를 초과")) return "실시간 연결 재시도 한도 초과";
  if (message.includes("아직 준비되지 않았다")) return "미들웨어 준비 대기";
  if (message.includes("다음 재연결")) return "다음 재연결 예약";
  if (message.includes("WebSocket ping/pong probe")) return "실시간 연결 확인 완료";
  if (message.includes(".NET 미들웨어 연결 대기")) return "미들웨어 연결 대기";
  return message || "활동 메시지 없음";
}

function productTypeTone(type: Exclude<ProductTypeFilter, "all">): "primary" | "success" | "warning" | "outline" {
  if (type === "ask") return "primary";
  if (type === "build") return "success";
  if (type === "automate") return "warning";
  return "outline";
}

function ProductTypeIcon({ type }: { type: Exclude<ProductTypeFilter, "all"> }) {
  if (type === "ask") return <MessageSquare size={15} aria-hidden="true" />;
  if (type === "build") return <Code2 size={15} aria-hidden="true" />;
  if (type === "automate") return <Workflow size={15} aria-hidden="true" />;
  if (type === "compare") return <Scale size={15} aria-hidden="true" />;
  if (type === "planning") return <ClipboardList size={15} aria-hidden="true" />;
  return <Shield size={15} aria-hidden="true" />;
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

function buildActivityHandoff(log: ShellLogEntry) {
  const stack = log.componentStack ? `\n\n컴포넌트 기록:\n${log.componentStack}` : "";
  return [
    "OMNUX 데스크톱 활동 기록을 기준으로 원인을 분석하고 필요한 프론트엔드 수정을 제안하거나 적용해줘.",
    "",
    `레벨: ${log.level}`,
    `출처: ${log.source}`,
    `시간: ${formatLogTime(log.createdAt)}`,
    `메시지: ${displayLogMessage(log)}`,
    stack
  ].join("\n");
}

function ActivityRow({ log, detailed, onSelect }: { log: ShellLogEntry; detailed?: boolean; onSelect: (log: ShellLogEntry) => void }) {
  const activityType = inferActivityType(log);
  const message = displayLogMessage(log);
  return (
    <button
      type="button"
      onClick={() => onSelect(log)}
      className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-200 ease-out last:border-0 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", ICON_TINT[log.level])}>
        <ActivityIcon level={log.level} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{message}</span>
          <Badge tone={productTypeTone(activityType)} className="shrink-0">{productTypeLabel(activityType)}</Badge>
          <Badge tone={levelTone(log.level)} className="shrink-0">{levelLabel(log.level)}</Badge>
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{sourceLabel(log.source)}</span>
        {detailed && log.componentStack ? (
          <span className="mt-1.5 block max-h-16 overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">{log.componentStack}</span>
        ) : null}
      </span>
      <time dateTime={log.createdAt} className="shrink-0 text-[10px] text-muted-foreground">{formatLogTime(log.createdAt)}</time>
    </button>
  );
}

function ProductHistoryRow({ log, onSelect }: { log: ShellLogEntry; onSelect: (log: ShellLogEntry) => void }) {
  const activityType = inferActivityType(log);
  const message = displayLogMessage(log);
  return (
    <button
      type="button"
      onClick={() => onSelect(log)}
      className="grid w-full gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-left transition-colors duration-200 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:grid-cols-[140px_minmax(0,1fr)_auto]"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ProductTypeIcon type={activityType} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">{productTypeLabel(activityType)}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{sourceLabel(log.source)}</span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{message}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{formatLogTime(log.createdAt)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Badge tone={levelTone(log.level)}>{levelLabel(log.level)}</Badge>
        <Badge tone={productTypeTone(activityType)}>{productTypeLabel(activityType)}</Badge>
      </span>
    </button>
  );
}

function ActivityDetailDialog({ log, onClose, onOpenBuild }: { log: ShellLogEntry; onClose: () => void; onOpenBuild: (log: ShellLogEntry) => void }) {
  const canFix = log.level === "error" || log.level === "warn";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="활동 상세 닫기" onClick={onClose} />
      <section className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", ICON_TINT[log.level])}>
                <ActivityIcon level={log.level} />
              </span>
              <h2 id="activity-detail-title" className="truncate text-base font-semibold">활동 상세</h2>
              <Badge tone={levelTone(log.level)} className="shrink-0">{levelLabel(log.level)}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{sourceLabel(log.source)} · {formatLogTime(log.createdAt)}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="닫기" title="닫기" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <div className="space-y-1">
            <SectionLabel>메시지</SectionLabel>
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground">{displayLogMessage(log)}</p>
          </div>

          <dl className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[11px] font-medium text-muted-foreground">레벨</dt>
              <dd className="mt-1 text-sm font-medium">{levelLabel(log.level)}</dd>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[11px] font-medium text-muted-foreground">출처</dt>
              <dd className="mt-1 truncate text-sm font-medium">{sourceLabel(log.source)}</dd>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[11px] font-medium text-muted-foreground">시간</dt>
              <dd className="mt-1 truncate text-sm font-medium">{formatLogTime(log.createdAt)}</dd>
            </div>
          </dl>

          {log.componentStack ? (
            <div className="space-y-1">
              <SectionLabel>컴포넌트 기록</SectionLabel>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-5 text-muted-foreground">{log.componentStack}</pre>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">{canFix ? "빌드로 넘기면 기록 맥락이 입력창에 들어갑니다." : "필요하면 빌드에서 이 활동을 이어서 확인할 수 있습니다."}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
            <Button variant={canFix ? "primary" : "outline"} size="sm" onClick={() => onOpenBuild(log)}>
              <Wrench size={14} aria-hidden="true" /> {canFix ? "빌드에서 수정" : "빌드로 열기"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function ActivityPage() {
  useSessionReplayBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>("all");
  const [selectedLog, setSelectedLog] = useState<ShellLogEntry | null>(null);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  const counts = useMemo(() => {
    const summary = { info: 0, warn: 0, error: 0 };
    logs.forEach((log) => {
      if (log.level === "info" || log.level === "warn" || log.level === "error") summary[log.level] += 1;
    });
    return summary;
  }, [logs]);

  const typeCounts = useMemo(() => {
    const summary: Record<Exclude<ProductTypeFilter, "all">, number> = { ask: 0, build: 0, automate: 0, compare: 0, planning: 0, ops: 0 };
    logs.forEach((log) => {
      summary[inferActivityType(log)] += 1;
    });
    return summary;
  }, [logs]);
  const filtered = useMemo(
    () => logs.filter((log) => (levelFilter === "all" || log.level === levelFilter) && (typeFilter === "all" || inferActivityType(log) === typeFilter)),
    [logs, levelFilter, typeFilter]
  );
  const liveEvents = useMemo(() => filtered.slice(0, 6), [filtered]);
  const productHistory = useMemo(() => filtered.slice(0, 12), [filtered]);
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

  const openBuildFromLog = (log: ShellLogEntry) => {
    useDesktopNavigationStore.getState().setActivePage("build", { input: buildActivityHandoff(log) });
    setSelectedLog(null);
  };

  return (
    <div className="dashboard-tab space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">활동</h1>
          <p className="text-sm text-muted-foreground">현재 데스크톱 세션의 실행, 인증, 오류 기록을 시간순으로 확인합니다.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={exportLogs}>
            <Download size={15} aria-hidden="true" /> 내보내기
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={clearLogs}>
            <Trash2 size={15} aria-hidden="true" /> 비우기
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_FILTERS.map((definition) => (
          <button
            key={definition.id}
            type="button"
            onClick={() => setLevelFilter(definition.id)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", levelFilter === definition.id ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
          >
            {definition.label}
          </button>
        ))}
        <Badge tone="default" className="ml-auto">정보 {counts.info}</Badge>
        <Badge tone="warning">주의 {counts.warn}</Badge>
        <Badge tone="destructive">오류 {counts.error}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((definition) => {
          const count = definition.id === "all" ? logs.length : typeCounts[definition.id as Exclude<ProductTypeFilter, "all">];
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => setTypeFilter(definition.id)}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors", typeFilter === definition.id ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
            >
              <span className="truncate">{definition.label}</span>
              <span className="shrink-0 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <SessionReplayPanel canRequest={canRequest} />
      </div>

      {liveEvents.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel>최근 실행 기록</SectionLabel>
          <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] backdrop-blur-xl">
            {liveEvents.map((event) => (
              <ActivityRow key={event.id} log={event} onSelect={setSelectedLog} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>작업 이력</SectionLabel>
          <Badge tone="outline">{productHistory.length}/{filtered.length}</Badge>
        </div>
        {productHistory.length > 0 ? (
          <div className="space-y-1.5">
            {productHistory.map((log) => (
              <ProductHistoryRow key={`history-${log.id}`} log={log} onSelect={setSelectedLog} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Route} title="선택한 작업 이력이 없습니다" description="필터를 바꾸거나 질문, 빌드, 자동화 작업을 실행하면 실제 기록이 여기에 표시됩니다." />
        )}
      </section>

      {days.length === 0 ? (
        <EmptyState icon={Route} title="아직 표시할 실행 기록이 없습니다" description="질문, 빌드, 세션 실행 등 활동이 발생하면 여기에 시간순으로 쌓입니다." />
      ) : null}

      {days.map(([day, entries]) => (
        <section key={day} className="space-y-2">
          <SectionLabel>{day}</SectionLabel>
          <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] backdrop-blur-xl">
            {entries.map((log) => (
              <ActivityRow key={log.id} log={log} detailed onSelect={setSelectedLog} />
            ))}
          </div>
        </section>
      ))}

      {selectedLog ? (
        <ActivityDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} onOpenBuild={openBuildFromLog} />
      ) : null}
    </div>
  );
}

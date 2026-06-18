import { useEffect, useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  FileText,
  History,
  ListChecks,
  MessageCircle,
  MousePointer2,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import {
  ROUTINE_AGENT_MODEL_OPTIONS,
  ROUTINE_AGENT_PROVIDER_OPTIONS,
  ROUTINE_WEEKDAY_OPTIONS,
  useAutomatePageBridge,
  useAutomateStore,
  type RoutineCreateForm,
  type RoutineItem,
  type RoutineListFilter,
  type RoutinePreview,
  type RoutineRunDetail,
  type RoutineRunSummary
} from "./automate-store";
import { RoutineCreateWizard } from "./RoutineCreateWizard";
import { Badge, Button, EmptyState, IconButton, SectionLabel, Spinner, cn } from "../../components/ui/primitives";

const FILTERS: Array<{ key: RoutineListFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "enabled", label: "활성" },
  { key: "disabled", label: "비활성" },
  { key: "failed", label: "오류" },
  { key: "quality", label: "품질" },
  { key: "browser", label: "브라우저" }
];

const DETAIL_TABS = [
  { key: "history", label: "실행 이력", icon: History },
  { key: "edit", label: "루틴 수정", icon: Settings },
  { key: "output", label: "최근 출력", icon: TerminalSquare }
] as const;

const EXECUTION_MODES = [
  { value: "", label: "자동" },
  { value: "web", label: "일반 답변" },
  { value: "url", label: "URL 참조" },
  { value: "script", label: "스크립트" },
  { value: "browser_agent", label: "브라우저 실행" }
];

const SCHEDULE_KINDS = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" }
];

const NOTIFY_POLICIES = [
  { value: "always", label: "항상 알림" },
  { value: "on_change", label: "변경 시" },
  { value: "error_only", label: "오류만" },
  { value: "never", label: "알리지 않음" }
];

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";

function messageLooksDangerous(message: string) {
  return /(오류|실패|unauthorized|error|failed|timeout|blocked)/i.test(message);
}

function modeLabel(value: string) {
  if (value === "browser_agent") return "브라우저 실행";
  if (value === "url") return "URL 참조";
  if (value === "web") return "일반 답변";
  return "스크립트";
}

function sourceModeLabel(value: string) {
  return value === "auto" ? "요청 원문" : "수동 스케줄";
}

function notifyPolicyLabel(value: string) {
  if (value === "on_change") return "변경 시";
  if (value === "error_only") return "오류만";
  if (value === "never") return "알리지 않음";
  return "항상";
}

function toolProfileLabel(value: string) {
  return value === "desktop_control" ? "데스크톱 제어" : "Playwright 전용";
}

function isFailureStatus(value: string) {
  return /error|fail|timeout|blocked|실패|오류/i.test(value || "");
}

function statusTone(status: string): "default" | "success" | "warning" | "destructive" | "outline" {
  if (isFailureStatus(status)) return "destructive";
  if (/success|ok|done|완료|enabled/i.test(status || "")) return "success";
  if (/running|pending|retry|진행/i.test(status || "")) return "warning";
  return status ? "outline" : "default";
}

function routineVisibleMode(routine: RoutineItem) {
  return routine.resolvedExecutionMode || routine.executionMode || "script";
}

function routineWhen(routine: RoutineItem) {
  if (routine.scheduleSummary) return routine.scheduleSummary;
  if (routine.scheduleKind === "weekly" && routine.weekdays.length > 0) return `매주 ${routine.scheduleTime}`;
  if (routine.scheduleKind === "monthly" && routine.dayOfMonth) return `매월 ${routine.dayOfMonth}일 ${routine.scheduleTime}`;
  return `매일 ${routine.scheduleTime || "08:00"}`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98]",
        active ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 active:scale-[0.98] disabled:opacity-50",
        on ? "bg-primary" : "bg-border-strong"
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

function StatCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="truncate text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums">{value}</div>
      <div className="truncate text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function ProgressStrip() {
  const progress = useAutomateStore((state) => state.progress);
  const schedulerStatus = useAutomateStore((state) => state.schedulerStatus);
  const activeSegments = Math.max(0, Math.min(10, Math.ceil((progress.percent || 0) / 10)));

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", progress.active ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
            {progress.active && !progress.done ? <Spinner size={16} /> : <CalendarClock size={16} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{progress.active ? progress.stageTitle || progress.operation || "루틴 처리" : "루틴 스케줄러"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {progress.active
                ? progress.stageDetail || progress.message || "진행 상태 수신 중"
                : schedulerStatus
                  ? `실행 중 ${schedulerStatus.runningRoutines} · 대기 ${schedulerStatus.dueRoutines} · 전체 ${schedulerStatus.totalRoutines}`
                  : "상태 확인 전"}
            </div>
          </div>
        </div>
        <Badge tone={schedulerStatus?.enabled === false || progress.ok === false ? "destructive" : "outline"} className="shrink-0">
          {progress.active ? `${Math.max(0, Math.min(100, progress.percent || 0))}%` : schedulerStatus?.enabled === false ? "중지" : "동작"}
        </Badge>
      </div>
      {progress.active ? (
        <div className="mt-3 grid h-1.5 grid-cols-10 gap-0.5">
          {Array.from({ length: 10 }, (_, index) => (
            <span key={index} className={cn("rounded-full", index < activeSegments ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      ) : null}
      {schedulerStatus?.lastError ? (
        <div className="mt-2 truncate rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {schedulerStatus.lastError}
        </div>
      ) : null}
    </div>
  );
}

function PreviewPanel({ preview }: { preview: RoutinePreview | null }) {
  if (!preview) return null;
  return (
    <div className={cn("space-y-2 rounded-lg border p-3 text-sm", preview.warnings.length > 0 ? "border-warning/40 bg-warning/10" : "border-border bg-muted/30")}>
      <div className="flex min-w-0 items-center gap-2">
        <Clock size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-xs text-muted-foreground">스케줄</span>
        <strong className="truncate">{preview.scheduleText || "-"}</strong>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-xs text-muted-foreground">실행</span>
        <strong className="truncate">{`${modeLabel(preview.resolvedExecutionMode)} / ${preview.executionRoute || "-"}`}</strong>
      </div>
      {preview.warnings.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
          {preview.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-success">사전 확인에서 즉시 막을 항목은 없습니다.</p>
      )}
    </div>
  );
}

function RoutineListItem({ routine, selected, canRequest, onSelect }: { routine: RoutineItem; selected: boolean; canRequest: boolean; onSelect: () => void }) {
  const store = useAutomateStore();
  const mode = routineVisibleMode(routine);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-lg border p-3 text-left outline-none transition-all duration-200 ease-out active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring/60",
        selected ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30" : "border-border bg-card hover:border-border-strong hover:bg-accent/40"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{routine.title || routine.id}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={routine.enabled ? "success" : "default"} className="shrink-0">{routine.enabled ? "ON" : "OFF"}</Badge>
            <Badge tone="outline" className="shrink-0">{modeLabel(mode)}</Badge>
            {mode === "browser_agent" ? <Badge tone="outline" className="shrink-0">{toolProfileLabel(routine.agentToolProfile)}</Badge> : null}
            <Badge tone="outline" className="max-w-full truncate">{sourceModeLabel(routine.scheduleSourceMode)}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          <IconButton icon={Play} label="지금 실행" onClick={() => store.runRoutine(routine.id)} disabled={!canRequest || store.pending} />
          <Toggle on={routine.enabled} disabled={!canRequest || store.pending} label={routine.enabled ? "비활성화" : "활성화"} onClick={() => store.toggleRoutine(routine.id, !routine.enabled)} />
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{routineWhen(routine)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{routine.request || routine.preview || "요청 원문 없음"}</p>
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <Badge tone={statusTone(routine.lastStatus)} className="max-w-[160px] truncate">{routine.lastStatus || "실행 전"}</Badge>
        {routine.qualityStatus === "quality_failed" ? <Badge tone="destructive" className="shrink-0">품질</Badge> : null}
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">{routine.lastRunLocal ? `최근 ${routine.lastRunLocal}` : "최근 실행 없음"}</span>
      </div>
    </article>
  );
}

function RoutineLibrary({ routines, canRequest }: { routines: RoutineItem[]; canRequest: boolean }) {
  const store = useAutomateStore();
  const visibleRoutines = useMemo(() => {
    const query = store.listQuery.trim().toLowerCase();
    return routines.filter((routine) => {
      const mode = routineVisibleMode(routine);
      const matchesFilter = store.listFilter === "all"
        || (store.listFilter === "enabled" && routine.enabled)
        || (store.listFilter === "disabled" && !routine.enabled)
        || (store.listFilter === "failed" && isFailureStatus(routine.lastStatus))
        || (store.listFilter === "quality" && routine.qualityStatus === "quality_failed")
        || (store.listFilter === "browser" && mode === "browser_agent");
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        routine.id,
        routine.title,
        routine.request,
        routine.scheduleSummary,
        routine.lastStatus,
        routine.executionMode,
        routine.resolvedExecutionMode,
        routine.agentModel,
        routine.runCommand
      ].some((value) => `${value || ""}`.toLowerCase().includes(query));
    });
  }, [routines, store.listFilter, store.listQuery]);

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <SectionLabel>목록</SectionLabel>
          <div className="truncate text-sm font-semibold">{routines.length}개 루틴</div>
        </div>
        <Badge tone="outline" className="shrink-0">{routines.filter((routine) => routine.enabled).length}개 활성</Badge>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 focus-within:ring-2 focus-within:ring-ring/60">
        <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          value={store.listQuery}
          onChange={(event) => store.setListQuery(event.target.value)}
          placeholder="루틴 검색"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Chip key={filter.key} active={store.listFilter === filter.key} onClick={() => store.setListFilter(filter.key)}>
            {filter.label}
          </Chip>
        ))}
      </div>
      <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
        {routines.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="등록된 루틴이 없습니다"
            description="반복 작업을 등록하면 이곳에서 실행과 기록을 관리합니다."
            action={
              <Button variant="primary" size="sm" onClick={() => store.setCreatePanelOpen(true)}>
                <Plus size={15} aria-hidden="true" /> 새 루틴
              </Button>
            }
          />
        ) : visibleRoutines.length === 0 ? (
          <EmptyState
            icon={Search}
            title="조건에 맞는 루틴이 없습니다"
            description="검색어를 줄이거나 필터를 전체로 바꾸세요."
            action={
              <Button variant="outline" size="sm" onClick={() => {
                store.setListQuery("");
                store.setListFilter("all");
              }}>
                <RotateCcw size={14} aria-hidden="true" /> 필터 초기화
              </Button>
            }
          />
        ) : (
          visibleRoutines.map((routine) => (
            <RoutineListItem
              key={routine.id}
              routine={routine}
              selected={routine.id === store.selectedRoutineId}
              canRequest={canRequest}
              onSelect={() => store.selectRoutine(routine.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ModeSelector({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  const visibleMode = form.executionMode || "script";
  const browser = visibleMode === "browser_agent";
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">실행 모드</div>
        <Badge tone="outline" className="max-w-[220px] truncate">{form.executionMode ? "명시 선택" : "요청 기반 자동 감지"}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXECUTION_MODES.map((mode) => (
          <Chip
            key={mode.value || "auto"}
            active={(form.executionMode || "") === mode.value}
            onClick={() => patch({
              executionMode: mode.value,
              ...(mode.value === "browser_agent" ? {
                agentProvider: form.agentProvider || "codex",
                agentModel: form.agentModel || "gpt-5.4",
                agentToolProfile: form.agentToolProfile || "playwright_only",
                agentUsePlaywright: true
              } : {})
            })}
          >
            {mode.label}
          </Chip>
        ))}
      </div>
      {!form.executionMode ? (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          자동 선택 시 URL, 최신 정보 질의, 로컬 작업 키워드를 기준으로 실행 경로를 정합니다.
        </div>
      ) : null}
      {browser ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>에이전트 제공자</span>
            <select className={SELECT_CLASS} value={form.agentProvider || "codex"} onChange={(event) => patch({ agentProvider: event.target.value })}>
              {ROUTINE_AGENT_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>에이전트 모델</span>
            <select className={SELECT_CLASS} value={form.agentModel || "gpt-5.4"} onChange={(event) => patch({ agentModel: event.target.value })}>
              {ROUTINE_AGENT_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1 md:col-span-2">
            <span className={FIELD_LABEL}>시작 URL</span>
            <input className={SELECT_CLASS} value={form.agentStartUrl || ""} placeholder="비워두면 요청 원문의 첫 URL 사용" onChange={(event) => patch({ agentStartUrl: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>타임아웃(초)</span>
            <input className={SELECT_CLASS} type="number" min={120} max={1800} value={form.agentTimeoutSeconds || 120} onChange={(event) => patch({ agentTimeoutSeconds: Math.min(1800, Math.max(120, Number(event.target.value) || 120)) })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>도구 프로필</span>
            <select className={SELECT_CLASS} value={form.agentToolProfile || "playwright_only"} onChange={(event) => patch({ agentToolProfile: event.target.value, agentUsePlaywright: true })}>
              <option value="playwright_only">Playwright 전용</option>
              <option value="desktop_control">데스크톱 제어</option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleSelector({ form, patch, toggleWeekday }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void; toggleWeekday: (day: number) => void }) {
  const manual = form.scheduleSourceMode === "manual";
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">스케줄</div>
        <Badge tone="outline">{manual ? "수동" : "자동"}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active={!manual} onClick={() => patch({ scheduleSourceMode: "auto" })}>자동(요청 원문)</Chip>
        <Chip active={manual} onClick={() => patch({ scheduleSourceMode: "manual" })}>수동</Chip>
      </div>
      {!manual ? (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          요청 원문에 적은 시간 표현을 우선합니다. 스케줄 표현이 없으면 매일 08:00으로 미리보기됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_KINDS.map((kind) => (
              <Chip key={kind.value} active={form.scheduleKind === kind.value} onClick={() => patch({ scheduleKind: kind.value })}>
                {kind.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <span className={FIELD_LABEL}>실행 시간</span>
              <input className={SELECT_CLASS} type="time" value={form.scheduleTime || "08:00"} onChange={(event) => patch({ scheduleTime: event.target.value })} />
            </label>
            <label className="block min-w-0 space-y-1">
              <span className={FIELD_LABEL}>시간대</span>
              <input className={SELECT_CLASS} value={form.timezoneId || "Asia/Seoul"} onChange={(event) => patch({ timezoneId: event.target.value })} />
            </label>
          </div>
          {form.scheduleKind === "weekly" ? (
            <div className="space-y-1">
              <span className={FIELD_LABEL}>요일</span>
              <div className="flex flex-wrap gap-2">
                {ROUTINE_WEEKDAY_OPTIONS.map((day) => (
                  <Chip key={day.value} active={form.weekdays.includes(day.value)} onClick={() => toggleWeekday(day.value)}>
                    {day.label}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {form.scheduleKind === "monthly" ? (
            <label className="block max-w-[160px] space-y-1">
              <span className={FIELD_LABEL}>실행 날짜</span>
              <input className={SELECT_CLASS} type="number" min={1} max={31} value={form.dayOfMonth || 1} onChange={(event) => patch({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)) })} />
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AdvancedSelector({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-sm font-semibold">재시도 및 알림</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block min-w-0 space-y-1">
          <span className={FIELD_LABEL}>최대 재시도</span>
          <input className={SELECT_CLASS} type="number" min={0} max={5} value={form.maxRetries ?? 1} onChange={(event) => patch({ maxRetries: Math.max(0, Math.min(5, Number(event.target.value) || 0)) })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className={FIELD_LABEL}>재시도 간격(초)</span>
          <input className={SELECT_CLASS} type="number" min={0} max={300} value={form.retryDelaySeconds ?? 15} onChange={(event) => patch({ retryDelaySeconds: Math.max(0, Math.min(300, Number(event.target.value) || 0)) })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className={FIELD_LABEL}>알림 정책</span>
          <select className={SELECT_CLASS} value={form.notifyPolicy || "always"} onChange={(event) => patch({ notifyPolicy: event.target.value })}>
            {NOTIFY_POLICIES.map((policy) => (
              <option key={policy.value} value={policy.value}>{policy.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <span className="min-w-0 truncate text-sm">실행 결과 텔레그램 응답</span>
        <Toggle on={!!form.notifyTelegram} label="텔레그램 응답" onClick={() => patch({ notifyTelegram: !form.notifyTelegram })} />
      </div>
    </div>
  );
}

function EditPanel({ selected, canRequest }: { selected: RoutineItem; canRequest: boolean }) {
  const store = useAutomateStore();
  const form = store.editForm;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">루틴 수정</div>
            <div className="truncate text-xs text-muted-foreground">{selected.id}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => store.previewRoutine("edit")} disabled={!canRequest || store.updating}>
              <FileText size={14} aria-hidden="true" /> 미리보기
            </Button>
            <Button variant="primary" size="sm" onClick={store.updateRoutine} disabled={!canRequest || store.updating}>
              <Save size={14} aria-hidden="true" /> {store.updating ? "저장 중" : "수정 저장"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>루틴 이름</span>
            <input className={SELECT_CLASS} value={form.title} onChange={(event) => store.patchEditForm({ title: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>실행 명령</span>
            <input className={SELECT_CLASS} value={selected.runCommand || "-"} readOnly />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className={FIELD_LABEL}>요청 원문</span>
            <textarea
              className="min-h-[112px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60"
              value={form.request}
              onChange={(event) => store.patchEditForm({ request: event.target.value })}
            />
          </label>
        </div>
      </div>
      <ModeSelector form={form} patch={store.patchEditForm} />
      <AdvancedSelector form={form} patch={store.patchEditForm} />
      <ScheduleSelector form={form} patch={store.patchEditForm} toggleWeekday={store.toggleEditWeekday} />
      <PreviewPanel preview={store.editPreview} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={store.resetEditForm} disabled={store.updating}>
          <RotateCcw size={14} aria-hidden="true" /> 되돌리기
        </Button>
      </div>
    </div>
  );
}

function RunHistoryPanel({ selected, canRequest }: { selected: RoutineItem; canRequest: boolean }) {
  const store = useAutomateStore();
  if (selected.runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="실행 이력이 아직 없습니다"
        description="수동 실행이나 예약 실행 후 이 영역에 결과가 쌓입니다."
        action={
          <Button variant="primary" size="sm" onClick={() => store.runRoutine(selected.id)} disabled={!canRequest || store.pending}>
            <Play size={14} aria-hidden="true" /> 지금 실행
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {store.runDetailLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Spinner size={14} /> 실행 상세를 불러오는 중
        </div>
      ) : null}
      {selected.runs.map((run) => (
        <RunHistoryItem key={`${run.ts}-${run.runAtLocal}`} routineId={selected.id} run={run} canRequest={canRequest} />
      ))}
    </div>
  );
}

function RunMetaLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      <span className="shrink-0 font-semibold text-foreground/70">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function RunHistoryItem({ routineId, run, canRequest }: { routineId: string; run: RoutineRunSummary; canRequest: boolean }) {
  const store = useAutomateStore();
  return (
    <article className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(run.status)} className="shrink-0">{run.status || "-"}</Badge>
            <strong className="truncate text-sm">{run.runAtLocal || "-"}</strong>
          </div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">
            {run.source || "-"} · {run.durationText || "-"} · {Math.max(1, run.attemptCount || 1)}회
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => store.openRunDetail(routineId, run.ts)} disabled={!canRequest || !run.ts}>
            <FileText size={14} aria-hidden="true" /> 상세
          </Button>
          <Button variant="ghost" size="sm" onClick={() => store.resendRunTelegram(routineId, run.ts)} disabled={!canRequest || !run.ts}>
            <Send size={14} aria-hidden="true" /> 재전송
          </Button>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{run.summary || "요약 없음"}</p>
      {run.error ? <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{run.error}</div> : null}
      <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
        <RunMetaLine label="agent" value={run.agentProvider || run.agentModel ? `${run.agentProvider || "-"}:${run.agentModel || "-"}` : ""} />
        <RunMetaLine label="도구" value={run.toolProfile ? toolProfileLabel(run.toolProfile) : ""} />
        <RunMetaLine label="최종 URL" value={run.finalUrl} />
        <RunMetaLine label="페이지" value={run.pageTitle} />
        <RunMetaLine label="스크린샷" value={run.screenshotPath} />
        <RunMetaLine label="다운로드" value={run.downloadPaths.join(" | ")} />
        <RunMetaLine label="텔레그램" value={run.telegramStatus} />
        <RunMetaLine label="다음 실행" value={run.nextRunLocal} />
      </div>
    </article>
  );
}

function OutputPanel({ selected }: { selected: RoutineItem }) {
  const rows = [
    ["ID", selected.id],
    ["실행 모드", modeLabel(routineVisibleMode(selected))],
    ["언어", selected.language || "-"],
    ["시간대", selected.timezoneId || "-"],
    ["재시도", `${Math.max(0, selected.maxRetries)}회 / ${Math.max(0, selected.retryDelaySeconds)}초`],
    ["텔레그램 응답", selected.notifyTelegram ? "켜짐" : "꺼짐"],
    ["알림", notifyPolicyLabel(selected.notifyPolicy)],
    ["에이전트", `${selected.agentProvider || "-"} / ${selected.agentModel || "-"}`],
    ["시작 URL", selected.agentStartUrl || "-"],
    ["스크립트", selected.scriptPath || "-"]
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
            <div className="truncate text-[11px] font-semibold text-muted-foreground">{label}</div>
            <div className="truncate text-sm">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold">최근 실행 출력</div>
          <Badge tone={statusTone(selected.lastStatus)}>{selected.lastStatus || "실행 전"}</Badge>
        </div>
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {selected.lastOutput || "출력 없음"}
        </pre>
      </div>
    </div>
  );
}

function DetailHeader({ selected, canRequest }: { selected: RoutineItem; canRequest: boolean }) {
  const store = useAutomateStore();
  const mode = routineVisibleMode(selected);
  const browserAgent = mode === "browser_agent";

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>루틴 상세</SectionLabel>
          <h2 className="truncate text-lg font-semibold tracking-tight">{selected.title || selected.id}</h2>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => store.toggleRoutine(selected.id, !selected.enabled)}
              disabled={!canRequest || store.pending}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors duration-200 disabled:opacity-50",
                selected.enabled ? "border-success/30 bg-success/15 text-success" : "border-border bg-muted text-muted-foreground"
              )}
            >
              {selected.enabled ? <Check size={13} aria-hidden="true" /> : null}
              {selected.enabled ? "활성" : "비활성"}
            </button>
            <button
              type="button"
              onClick={() => store.toggleRoutineTelegram(selected, !selected.notifyTelegram)}
              disabled={!canRequest || store.pending}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors duration-200 disabled:opacity-50",
                selected.notifyTelegram ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"
              )}
            >
              <MessageCircle size={13} aria-hidden="true" />
              {selected.notifyTelegram ? "텔레그램 응답 ON" : "텔레그램 응답 OFF"}
            </button>
            <Badge tone="outline">{modeLabel(mode)}</Badge>
            {browserAgent ? <Badge tone="outline">{toolProfileLabel(selected.agentToolProfile)}</Badge> : null}
            <Badge tone="outline">{sourceModeLabel(selected.scheduleSourceMode)}</Badge>
            <Badge tone="outline" className="max-w-[240px] truncate">{routineWhen(selected)}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={() => store.runRoutine(selected.id)} disabled={!canRequest || store.pending}>
            <Play size={14} aria-hidden="true" /> 실행
          </Button>
          {browserAgent ? (
            <Button variant="outline" size="sm" onClick={() => store.testBrowserAgentRoutine(selected.id)} disabled={!canRequest || store.pending}>
              <MousePointer2 size={14} aria-hidden="true" /> 브라우저
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => store.testRoutineTelegram(selected.id)} disabled={!canRequest || store.pending}>
            <Send size={14} aria-hidden="true" /> 텔레그램
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => store.deleteRoutine(selected.id)} disabled={!canRequest || store.pending}>
            <Trash2 size={14} aria-hidden="true" /> 삭제
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="line-clamp-3">{selected.request || "요청 원문 없음"}</span>
      </div>
    </div>
  );
}

function RoutineDetail({ selected, canRequest }: { selected: RoutineItem | null; canRequest: boolean }) {
  const store = useAutomateStore();

  if (!selected) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <EmptyState
          icon={ListChecks}
          title="루틴을 선택하세요"
          description="왼쪽 목록에서 루틴을 선택하면 상세 설정과 실행 이력을 볼 수 있습니다."
          action={
            <Button variant="primary" size="sm" onClick={() => store.setCreatePanelOpen(true)}>
              <Plus size={14} aria-hidden="true" /> 새 루틴
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-3">
      <DetailHeader selected={selected} canRequest={canRequest} />
      {selected.qualityStatus === "quality_failed" || selected.qualityWarnings.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden="true" /> 품질 확인 필요
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {(selected.qualityWarnings.length > 0 ? selected.qualityWarnings : ["품질 검증을 통과하지 못했습니다."]).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        <StatCard label="다음 실행" value={selected.nextRunLocal || "-"} note={selected.scheduleSummary || "-"} />
        <StatCard label="마지막 실행" value={selected.lastRunLocal || "-"} note={selected.lastStatus || "실행 전"} />
        <StatCard label="생성 모델" value={selected.coderModel || "-"} note="루틴 생성 LLM" />
        <StatCard label="실행 모드" value={modeLabel(routineVisibleMode(selected))} note={selected.runCommand || "-"} />
        <StatCard label="텔레그램" value={selected.notifyTelegram ? "켜짐" : "꺼짐"} note={notifyPolicyLabel(selected.notifyPolicy)} />
      </div>
      <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {DETAIL_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = store.detailPane === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => store.setDetailPane(tab.key)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors duration-200 active:scale-[0.98]",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon size={14} aria-hidden="true" /> {tab.label}
              </button>
            );
          })}
        </div>
        <div className="p-3">
          {store.detailPane === "edit" ? <EditPanel selected={selected} canRequest={canRequest} /> : null}
          {store.detailPane === "history" ? <RunHistoryPanel selected={selected} canRequest={canRequest} /> : null}
          {store.detailPane === "output" ? <OutputPanel selected={selected} /> : null}
        </div>
      </div>
    </section>
  );
}

function RunDetailDialog({ detail }: { detail: RoutineRunDetail | null }) {
  const store = useAutomateStore();
  if (!detail) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="루틴 실행 상세">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{detail.title || "루틴 실행 상세"}</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(detail.status)}>{detail.status || "-"}</Badge>
              <Badge tone="outline">{detail.runAtLocal || "-"}</Badge>
              <Badge tone="outline">{detail.source || "-"}</Badge>
              <Badge tone="outline">{Math.max(1, detail.attemptCount || 1)}회</Badge>
            </div>
          </div>
          <IconButton icon={X} label="닫기" onClick={store.closeRunDetail} />
        </div>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {[
              ["Routine", detail.routineId],
              ["Artifact", detail.artifactPath],
              ["Agent", detail.agentProvider || detail.agentModel ? `${detail.agentProvider || "-"} / ${detail.agentModel || "-"}` : ""],
              ["Tool", detail.toolProfile ? toolProfileLabel(detail.toolProfile) : ""],
              ["Start URL", detail.startUrl],
              ["Final URL", detail.finalUrl],
              ["Page", detail.pageTitle],
              ["Screenshot", detail.screenshotPath],
              ["Downloads", detail.downloadPaths.join(" | ")],
              ["Telegram", detail.telegramStatus],
              ["Session", detail.agentSessionId],
              ["Run", detail.agentRunId]
            ].map(([label, value]) => value ? (
              <div key={label} className="min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="truncate text-[11px] font-semibold text-muted-foreground">{label}</div>
                <div className="truncate text-xs">{value}</div>
              </div>
            ) : null)}
          </div>
          {detail.error ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{detail.error}</div>
          ) : null}
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {detail.content || "상세 내용 없음"}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function AutomatePage() {
  useAutomatePageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const telegramConfigured = useDesktopAuthStore((state) => state.auth.telegramConfigured);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const setActivePage = useDesktopNavigationStore((state) => state.setActivePage);
  const routePayload = useDesktopNavigationStore((state) => state.routePayload);
  const routeVersion = useDesktopNavigationStore((state) => state.routeVersion);
  const clearRoutePayload = useDesktopNavigationStore((state) => state.clearRoutePayload);
  const store = useAutomateStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const selected = store.routines.find((routine) => routine.id === store.selectedRoutineId) || null;
  const stats = useMemo(() => {
    const enabled = store.routines.filter((routine) => routine.enabled).length;
    const browser = store.routines.filter((routine) => routineVisibleMode(routine) === "browser_agent").length;
    const failed = store.routines.filter((routine) => isFailureStatus(routine.lastStatus)).length;
    const scheduled = store.routines.filter((routine) => routine.nextRunLocal && routine.nextRunLocal !== "-").length;
    return { enabled, browser, failed, scheduled };
  }, [store.routines]);

  useEffect(() => {
    if (canRequest) store.loadRoutines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  useEffect(() => {
    if (!routePayload) return;
    const input = String(routePayload.input || "").trim();
    if (routePayload.create || input) {
      store.setCreatePanelOpen(true);
      if (input) {
        store.patchCreateForm({
          request: input,
          title: input.length > 36 ? `${input.slice(0, 36)}...` : input
        });
      }
    }
    clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  return (
    <div className="dashboard-tab space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">자동화</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">예약, 실행 결과, 알림을 한 화면에서 관리합니다.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={store.loadRoutines} disabled={!canRequest || store.pending}>
            <RefreshCcw size={14} aria-hidden="true" /> {store.pending ? "동기화 중" : "새로고침"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setActivePage("settings")}>
            <Settings size={14} aria-hidden="true" /> 설정
          </Button>
          <Button variant="primary" size="sm" onClick={() => store.setCreatePanelOpen(true)}>
            <Plus size={14} aria-hidden="true" /> 새 루틴
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
        <StatCard label="전체 루틴" value={store.routines.length} note="등록된 반복 작업" />
        <StatCard label="활성 루틴" value={stats.enabled} note={`비활성 ${Math.max(0, store.routines.length - stats.enabled)}개`} />
        <StatCard label="예약 대기" value={stats.scheduled} note="다음 실행 시간이 잡힌 루틴" />
        <StatCard label="브라우저" value={stats.browser} note="브라우저 실행 루틴" />
        <StatCard label="최근 오류" value={stats.failed} note="마지막 실행 기준" />
        <StatCard label="텔레그램" value={telegramConfigured ? "연결" : "미설정"} note={telegramConfigured ? "응답 전송 가능" : "설정에서 연결"} />
      </div>

      <ProgressStrip />

      {store.lastMessage ? (
        <p className={cn("rounded-md px-3 py-2 text-xs", messageLooksDangerous(store.lastMessage) ? "border border-destructive/30 bg-destructive/10 text-destructive" : "border border-border bg-muted/40 text-muted-foreground")}>
          {store.lastMessage}
        </p>
      ) : null}

      <div className="grid min-h-[calc(100vh-300px)] grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="flex min-h-[520px] min-w-[280px] flex-col rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <div className="mb-3 flex rounded-md border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => store.setCreatePanelOpen(false)}
              className={cn("flex h-8 flex-1 min-w-0 items-center justify-center gap-2 rounded px-2 text-xs font-medium transition-colors duration-200", !store.createPanelOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
            >
              <ListChecks size={14} aria-hidden="true" /> <span className="truncate">목록</span>
            </button>
            <button
              type="button"
              onClick={() => store.setCreatePanelOpen(true)}
              className={cn("flex h-8 flex-1 min-w-0 items-center justify-center gap-2 rounded px-2 text-xs font-medium transition-colors duration-200", store.createPanelOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
            >
              <Plus size={14} aria-hidden="true" /> <span className="truncate">새 루틴</span>
            </button>
          </div>
          {store.createPanelOpen ? (
            <CardBoundary title="새 루틴" card="navigation" onError={recordCardError} hideTitle>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">새 루틴</div>
                  <div className="truncate text-xs text-muted-foreground">요청, 실행, 스케줄, 알림을 순서대로 설정합니다.</div>
                </div>
                <IconButton icon={X} label="닫기" onClick={() => store.setCreatePanelOpen(false)} />
              </div>
              <RoutineCreateWizard canRequest={canRequest} />
            </CardBoundary>
          ) : (
            <RoutineLibrary routines={store.routines} canRequest={canRequest} />
          )}
        </aside>

        <RoutineDetail selected={selected} canRequest={canRequest} />
      </div>
      <RunDetailDialog detail={store.runDetail} />
    </div>
  );
}

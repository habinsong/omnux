import { AlarmClock, CalendarClock, History, Play, Plus, Power, RefreshCcw, Trash2, X, Info } from "lucide-react";
import { Badge, Button, Spinner, cn } from "../../components/ui/primitives";
import { CronAddForm } from "./OperationsCronAddForm";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { formatDateTimeMs, formatDurationMs, statusLabel, tone } from "./OperationsPage.shared";

type OperationsCronPanelProps = {
  readonly cron: OpsToolsState["cron"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsCronPanel({ cron, store, canRequest }: OperationsCronPanelProps) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">예약 작업</p>
            <p className="truncate text-xs text-muted-foreground">예약 상태, 작업 생성, 실행 기록을 관리합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={store.loadCronStatus} disabled={!canRequest || cron.loading}>
            {cron.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 상태
          </Button>
          <Button variant="outline" size="sm" onClick={store.loadCronJobs} disabled={!canRequest || cron.loading}>
            목록
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void store.wakeCron()} disabled={!canRequest || cron.waking} title="실행 예정 작업 즉시 평가">
            {cron.waking ? <Spinner size={14} /> : <AlarmClock size={14} aria-hidden="true" />} 깨우기
          </Button>
          <Button variant={cron.showAddForm ? "secondary" : "primary"} size="sm" onClick={store.toggleCronAddForm} disabled={!canRequest}>
            {cron.showAddForm ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} {cron.showAddForm ? "닫기" : "추가"}
          </Button>
        </div>
      </div>
      {cron.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{cron.lastError}</p> : null}
      {cron.lastActionMessage ? (
        <p className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <Info size={13} className="shrink-0" aria-hidden="true" /> {cron.lastActionMessage}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">상태</p>
          <p className="truncate text-sm font-semibold">{cron.status?.enabled ? "켜짐" : "꺼짐"}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">작업</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{cron.status?.jobCount ?? cron.jobs.length}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">다음 실행</p>
          <p className="truncate text-sm font-semibold">{formatDateTimeMs(cron.status?.nextWakeAtMs || null)}</p>
        </div>
      </div>

      {cron.showAddForm ? (
        <CronAddForm form={cron.form} mutating={cron.mutating} canRequest={canRequest} onField={store.setCronFormField} onSubmit={store.submitCronJob} />
      ) : null}

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {cron.jobs.map((job) => {
          const selected = cron.selectedJobId === job.id;
          return (
            <div
              key={job.id}
              className={cn(
                "group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs transition-colors",
                selected ? "bg-primary/10 text-foreground" : "bg-background/50 hover:bg-accent/60"
              )}
            >
              <button
                type="button"
                title={job.enabled ? "사용 중 · 클릭하면 비활성화" : "비활성 · 클릭하면 활성화"}
                aria-label={job.enabled ? "예약 작업 비활성화" : "예약 작업 활성화"}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors active:scale-[0.96]",
                  job.enabled ? "text-success hover:bg-success/15" : "text-muted-foreground hover:bg-accent"
                )}
                onClick={() => store.toggleCronJobEnabled(job.id, !job.enabled)}
                disabled={!canRequest || cron.mutating}
              >
                <Power size={13} aria-hidden="true" />
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.setCronSelectedJob(job.id)}>
                <span className="block truncate font-medium">{job.name || job.id}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{job.scheduleSummary} · {job.payloadSummary}</span>
              </button>
              {job.lastRunStatus ? <Badge tone={tone(job.lastRunStatus)} className="hidden shrink-0 lg:inline-flex">{job.lastRunStatus}</Badge> : null}
              <button
                type="button"
                title="실행 기록"
                aria-label="예약 작업 실행 기록 보기"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
                onClick={() => store.loadCronRuns(job.id)}
                disabled={!canRequest || cron.runsLoading}
              >
                <History size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="삭제"
                aria-label="예약 작업 삭제"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-[0.96]"
                onClick={() => void store.removeCronJob(job.id)}
                disabled={!canRequest || cron.mutating}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        {cron.jobs.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">예약 작업 없음</p> : null}
      </div>

      <CronRunsPanel cron={cron} store={store} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="truncate">
            {cron.lastResult
              ? `${cron.lastResult.jobId || "-"} · ${cron.lastResult.ran ? "실행됨" : cron.lastResult.reason || cron.lastResult.error || "실행 안 됨"}`
              : `마지막 실행: ${formatDurationMs(cron.jobs.find((job) => job.id === cron.selectedJobId)?.lastDurationMs || null)}`}
          </span>
        </div>
        <Button variant="destructive" size="sm" onClick={store.runSelectedCronJob} disabled={!canRequest || !cron.selectedJobId || cron.running}>
          {cron.running ? <Spinner size={14} /> : <Play size={14} aria-hidden="true" />} 선택 실행
        </Button>
      </div>
    </div>
  );
}

function CronRunsPanel({ cron, store }: { readonly cron: OpsToolsState["cron"]; readonly store: OpsStoreActions }) {
  if (!cron.runsJobId) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <History size={13} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">실행 기록 · {cron.jobs.find((job) => job.id === cron.runsJobId)?.name || cron.runsJobId}</span>
        </p>
        <button type="button" aria-label="실행 기록 닫기" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={store.closeCronRuns}>
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {cron.runsLoading ? (
          <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><Spinner size={13} /> 기록 조회 중</p>
        ) : cron.runs.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">실행 기록 없음</p>
        ) : (
          cron.runs.map((run, index) => (
            <div key={`${run.ts}-${index}`} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Badge tone={run.error ? "destructive" : tone(run.status || run.action)} className="shrink-0">{statusLabel(run.status || run.action || "run")}</Badge>
                  <span className="truncate text-muted-foreground">{formatDateTimeMs(run.runAtMs ?? run.ts)}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatDurationMs(run.durationMs)}</span>
              </div>
              {run.error || run.summary ? <p className="mt-0.5 truncate text-muted-foreground">{run.error || run.summary}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

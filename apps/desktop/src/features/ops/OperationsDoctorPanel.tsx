import { Activity, ClipboardCheck, RefreshCcw, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Button, EmptyState, Spinner } from "../../components/ui/primitives";
import type { DesktopDoctorSnapshot, DoctorCheck, DoctorFixAction } from "./ops-doctor";
import { formatDoctorTime } from "./ops-doctor";

function doctorTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const value = status.toLowerCase();
  if (value === "ok" || value === "applied") return "success";
  if (value === "warn" || value === "skipped" || value === "manual_check") return "warning";
  if (value === "fail" || value === "failed" || value === "error") return "destructive";
  if (value === "preview" || value === "pending") return "primary";
  if (value === "skip") return "outline";
  return "default";
}

function doctorStatusLabel(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "-";
  const labels: Record<string, string> = {
    actions: "항목",
    applied: "적용됨",
    auto: "자동",
    error: "오류",
    fail: "실패",
    failed: "실패",
    manual: "수동",
    manual_check: "수동 점검",
    ok: "정상",
    pending: "대기",
    preview: "미리보기",
    skip: "건너뜀",
    skipped: "건너뜀",
    warn: "주의"
  };
  return labels[text.toLowerCase()] || text;
}

function CountCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
      <Badge tone={doctorTone(tone)}>{doctorStatusLabel(tone)}</Badge>
    </div>
  );
}

function DoctorCheckRow({ check }: { check: DoctorCheck }) {
  return (
    <article className="rounded-md border border-border bg-card/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">{check.id || "check"}</p>
          <p className="truncate text-xs text-muted-foreground">{check.summary || "-"}</p>
        </div>
        <Badge tone={doctorTone(check.status)}>{doctorStatusLabel(check.status)}</Badge>
      </div>
      {check.detail ? <p className="mt-1 truncate rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">{check.detail}</p> : null}
      {check.suggestedActions.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-wrap gap-1">
          {check.suggestedActions.slice(0, 3).map((action) => (
            <Badge key={action} tone="outline" className="max-w-full truncate">{action}</Badge>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FixActionRow({ action }: { action: DoctorFixAction }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{action.description || action.actionId}</span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{action.target || action.kind}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Badge tone={action.autoApply ? "primary" : "outline"}>{action.autoApply ? "자동" : "수동"}</Badge>
        <Badge tone={doctorTone(action.status || action.kind)}>{doctorStatusLabel(action.status || action.kind)}</Badge>
      </span>
    </div>
  );
}

export function OperationsDoctorPanel({
  doctor,
  canRequest,
  onLoadLast,
  onRun,
  onPreviewFix
}: {
  doctor: DesktopDoctorSnapshot;
  canRequest: boolean;
  onLoadLast: () => void;
  onRun: () => void;
  onPreviewFix: () => void;
}) {
  const report = doctor.report;
  const busy = doctor.loading || doctor.running || doctor.fixPreviewing || doctor.fixApplying;
  const autoApplyCount = doctor.fixResult?.actions.filter((action) => action.autoApply).length || 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone={report ? doctorTone(report.status) : "outline"}>{report ? doctorStatusLabel(report.status) : "보고서 없음"}</Badge>
          <Badge tone="outline" className="font-mono">{report?.reportId || "보고서 -"}</Badge>
          <Badge tone="outline">{formatDoctorTime(report?.createdAtUtc)}</Badge>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onLoadLast} disabled={!canRequest || busy}>
            {doctor.loading ? <Spinner size={13} /> : <RefreshCcw size={13} aria-hidden="true" />} 최근
          </Button>
          <Button variant="primary" size="sm" onClick={onRun} disabled={!canRequest || busy}>
            {doctor.running ? <Spinner size={13} /> : <Activity size={13} aria-hidden="true" />} 실행
          </Button>
        </div>
      </div>

      {doctor.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{doctor.lastError}</p> : null}
      {doctor.lastAction ? <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{doctor.lastAction}</p> : null}

      {report ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <CountCard label="정상" value={report.okCount} tone="ok" />
            <CountCard label="주의" value={report.warnCount} tone="warn" />
            <CountCard label="실패" value={report.failCount} tone="fail" />
            <CountCard label="건너뜀" value={report.skipCount} tone="skip" />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {report.checks.map((check) => <DoctorCheckRow key={`${check.id}-${check.status}`} check={check} />)}
          </div>
        </>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="진단 보고서 없음"
          description="최근 보고서를 조회하거나 새 환경 진단을 실행하세요."
          action={<Button variant="primary" size="sm" onClick={onRun} disabled={!canRequest || busy}><Activity size={13} aria-hidden="true" /> 진단 실행</Button>}
        />
      )}

      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">진단 수정 미리보기</p>
            <p className="truncate text-xs text-muted-foreground">자동 생성 가능한 상태 디렉터리와 수동 점검 항목을 적용 전 확인합니다.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPreviewFix} disabled={!canRequest || busy}>
              {doctor.fixPreviewing ? <Spinner size={13} /> : <Wrench size={13} aria-hidden="true" />} 미리보기
            </Button>
            <Button variant="destructive" size="sm" disabled>
              <ShieldCheck size={13} aria-hidden="true" /> 적용 보류
            </Button>
          </div>
        </div>
        {doctor.fixResult ? (
          <div className="mt-2 space-y-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              <Badge tone={doctor.fixResult.ok ? "success" : "destructive"}>{doctorStatusLabel(doctor.fixResult.action || "fix")}</Badge>
              <Badge tone="outline" className="max-w-full truncate font-mono">{doctor.fixResult.previewId || "-"}</Badge>
              <Badge tone="outline">항목 {doctor.fixResult.actions.length}</Badge>
              <Badge tone={autoApplyCount > 0 ? "warning" : "outline"}>자동 {autoApplyCount}</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{doctor.fixResult.message || doctor.fixResult.error}</p>
            <div className="space-y-1">
              {doctor.fixResult.actions.slice(0, 8).map((action) => <FixActionRow key={action.actionId} action={action} />)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { Info, RefreshCcw, Send, ShieldAlert } from "lucide-react";
import { Badge, Button, Spinner, Textarea } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { formatDateTimeUtc, statusLabel, tone } from "./OperationsPage.shared";

type OperationsGuardDispatchPanelProps = {
  readonly guard: OpsToolsState["guard"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsGuardDispatchPanel({ guard, store, canRequest }: OperationsGuardDispatchPanelProps) {
  const guardDispatchResult = guard.dispatchResult;
  const guardConfiguredTargets = guardDispatchResult?.targets.filter((target) => !(target.status === "skipped" && target.error === "target_not_configured")).length ?? null;

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2" data-testid="guard-alert-dispatch-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">경고 전송</p>
            <p className="truncate text-xs text-muted-foreground">설정된 대상에 경고 이벤트를 시험 전송합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Badge tone={guardDispatchResult?.ok ? "success" : guardDispatchResult ? tone(guardDispatchResult.status) : "outline"}>
            {statusLabel(guardDispatchResult?.status || "idle")}
          </Badge>
          {guardConfiguredTargets !== null ? <Badge tone={guardConfiguredTargets > 0 ? "success" : "warning"}>대상 {guardConfiguredTargets}</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Badge tone="outline">스키마 v1</Badge>
              <Badge tone="outline">경고 요약</Badge>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={store.resetGuardAlertEventJson} disabled={guard.dispatching}>
                <RefreshCcw size={14} aria-hidden="true" /> 샘플 재생성
              </Button>
              <Button variant="primary" size="sm" onClick={() => void store.dispatchGuardAlert()} disabled={!canRequest || guard.dispatching || !guard.eventJson.trim()}>
                {guard.dispatching ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 전송 점검
              </Button>
            </div>
          </div>
          <Textarea
            rows={12}
            value={guard.eventJson}
            onChange={(event) => store.setGuardAlertEventJson(event.target.value)}
            className="min-h-64 font-mono text-xs"
            spellCheck={false}
            placeholder='{"schemaVersion":"guard_alert_event.v1","eventType":"omnux.guard_alert.summary"}'
          />
          {guard.dispatchError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{guard.dispatchError}</p>
          ) : (
            <p className="rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              endpoint URL은 앱에서 저장하지 않고 `OMNUX_GUARD_ALERT_WEBHOOK_URL`, `OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL` 환경변수만 사용합니다.
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">전송</p>
              <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.sentCount ?? 0}</p>
            </div>
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">실패</p>
              <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.failedCount ?? 0}</p>
            </div>
            <div className="rounded-md bg-background/60 px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">건너뜀</p>
              <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.skippedCount ?? 0}</p>
            </div>
          </div>
          <div className="rounded-md bg-background/60 px-3 py-2 text-xs">
            <div className="mb-1 flex min-w-0 items-center gap-1.5 font-semibold">
              <Info size={13} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">전송 설정</span>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <p className="truncate font-mono">OMNUX_GUARD_ALERT_WEBHOOK_URL</p>
              <p className="truncate font-mono">OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL</p>
              <p className="truncate font-mono">OMNUX_GUARD_ALERT_DISPATCH_TIMEOUT_MS</p>
              <p className="truncate font-mono">OMNUX_GUARD_ALERT_DISPATCH_MAX_ATTEMPTS</p>
            </div>
          </div>
          <GuardDispatchResultPanel result={guardDispatchResult} />
        </div>
      </div>
    </div>
  );
}

function GuardDispatchResultPanel({ result }: { readonly result: OpsToolsState["guard"]["dispatchResult"] }) {
  if (!result) {
    return <p className="rounded-md bg-background/60 px-3 py-8 text-center text-xs text-muted-foreground">전송 점검 결과가 여기에 표시됩니다.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs">
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-semibold">{result.message || statusLabel(result.status)}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDateTimeUtc(result.attemptedAtUtc)}</span>
        </div>
        <p className="truncate text-muted-foreground">{result.schemaVersion} · {result.eventType}</p>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {result.targets.map((target) => (
          <div key={target.name} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-semibold">{target.name}</span>
              <Badge tone={target.status === "skipped" ? "warning" : tone(target.status)}>{statusLabel(target.status)}</Badge>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">시도 {target.attempts}</span>
              <span className="truncate">HTTP {target.statusCode ?? "-"}</span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{target.endpoint || "-"}</p>
            {target.error && target.error !== "-" ? <p className="truncate text-[11px] text-destructive">{target.error}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

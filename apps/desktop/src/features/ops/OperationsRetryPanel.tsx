import { RefreshCcw, ShieldAlert } from "lucide-react";
import { Badge, Button, Spinner } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { formatDateTimeUtc } from "./OperationsPage.shared";

type OperationsRetryPanelProps = {
  readonly guard: OpsToolsState["guard"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsRetryPanel({ guard, store, canRequest }: OperationsRetryPanelProps) {
  const guardSnapshot = guard.snapshot;
  const guardTotalSamples = guardSnapshot?.channels.reduce((sum, channel) => sum + channel.totalSamples, 0) || 0;
  const guardRetryRequired = guardSnapshot?.channels.reduce((sum, channel) => sum + channel.retryRequiredSamples, 0) || 0;

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">재시도 흐름</p>
            <p className="truncate text-xs text-muted-foreground">채팅, 코딩, 텔레그램 재시도 집계를 읽기 전용으로 확인합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {guardSnapshot ? <Badge tone="outline">{guardSnapshot.windowMinutes}m</Badge> : null}
          <Button variant="outline" size="sm" onClick={() => void store.loadGuardRetryTimeline()} disabled={!canRequest || guard.loading}>
            {guard.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 새로고침
          </Button>
        </div>
      </div>
      {guard.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{guard.lastError}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">표본</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{guardTotalSamples}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">재시도</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{guardRetryRequired}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">생성</p>
          <p className="truncate text-sm font-semibold">{formatDateTimeUtc(guardSnapshot?.generatedAtUtc || "")}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {(guardSnapshot?.channels || []).map((channel) => (
          <div key={channel.channel} className="min-w-0 rounded-md border border-border bg-background/50 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold">{channel.channel}</span>
              <Badge tone={channel.retryRequiredSamples > 0 ? "warning" : "success"}>
                {channel.retryRequiredSamples}/{channel.totalSamples}
              </Badge>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              <Badge tone="outline">최대 {channel.maxRetryAttempt}/{channel.maxRetryMaxAttempts || "-"}</Badge>
              {channel.lastRetryStopReason && channel.lastRetryStopReason !== "-" ? <Badge tone="outline" className="max-w-full truncate">{channel.lastRetryStopReason}</Badge> : null}
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
              {channel.buckets.slice(0, 6).map((bucket) => (
                <div key={`${channel.channel}-${bucket.bucketStartUtc}`} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{formatDateTimeUtc(bucket.bucketStartUtc)}</span>
                    <span className="shrink-0 font-mono tabular-nums">{bucket.retryRequiredCount}/{bucket.samples}</span>
                  </div>
                  {bucket.topRetryStopReason && bucket.topRetryStopReason !== "-" ? (
                    <p className="truncate text-muted-foreground">{bucket.topRetryStopReason}</p>
                  ) : null}
                </div>
              ))}
              {channel.buckets.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">최근 구간 없음</p> : null}
            </div>
          </div>
        ))}
        {guardSnapshot && guardSnapshot.channels.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground lg:col-span-3">재시도 채널 없음</p> : null}
        {!guardSnapshot ? <p className="py-4 text-center text-xs text-muted-foreground lg:col-span-3">새로고침하면 재시도 집계가 표시됩니다.</p> : null}
      </div>
    </div>
  );
}

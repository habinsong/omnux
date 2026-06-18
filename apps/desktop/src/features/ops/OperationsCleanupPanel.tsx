import { HardDrive, RefreshCcw, Trash2 } from "lucide-react";
import { Badge, Button, Spinner } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { formatBytes } from "./OperationsPage.shared";

type OperationsCleanupPanelProps = {
  readonly cleanup: OpsToolsState["cleanup"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsCleanupPanel({ cleanup, store, canRequest }: OperationsCleanupPanelProps) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">정리</p>
            <p className="truncate text-xs text-muted-foreground">삭제 후보를 먼저 확인한 뒤 적용합니다.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={store.previewCleanup} disabled={!canRequest || cleanup.previewing || cleanup.applying}>
          {cleanup.previewing ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 미리보기
        </Button>
      </div>
      {cleanup.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{cleanup.lastError}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">후보</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{cleanup.preview?.candidates.length || 0}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">크기</p>
          <p className="truncate font-mono text-sm font-semibold">{formatBytes(cleanup.preview?.totalSizeBytes || 0)}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">미리보기</p>
          <p className="truncate font-mono text-sm font-semibold">{cleanup.preview?.previewId || "-"}</p>
        </div>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {(cleanup.preview?.candidates || []).slice(0, 40).map((candidate) => (
          <div key={candidate.path} className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
            <Trash2 size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono">{candidate.path}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{candidate.kind} · {formatBytes(candidate.sizeBytes)} · {candidate.reason}</span>
            </span>
          </div>
        ))}
        {cleanup.preview && cleanup.preview.candidates.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">삭제 후보 없음</p> : null}
        {!cleanup.preview ? <p className="py-4 text-center text-xs text-muted-foreground">미리보기를 실행하면 후보가 표시됩니다.</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {cleanup.applyResult ? (
          <div className="min-w-0 flex-1">
            <Badge tone={cleanup.applyResult.ok ? "success" : "destructive"}>{cleanup.applyResult.ok ? "적용됨" : "실패"}</Badge>
            <span className="ml-2 truncate text-xs text-muted-foreground">
              {cleanup.applyResult.removedCount}개 · {formatBytes(cleanup.applyResult.removedSizeBytes)}
            </span>
          </div>
        ) : <span className="text-xs text-muted-foreground">적용은 미리보기 ID가 있을 때만 가능합니다.</span>}
        <Button
          variant="destructive"
          size="sm"
          onClick={store.applyCleanupPreview}
          disabled={!canRequest || !cleanup.preview?.ok || !cleanup.preview.previewId || cleanup.applying}
        >
          {cleanup.applying ? <Spinner size={14} /> : <Trash2 size={14} aria-hidden="true" />} 적용
        </Button>
      </div>
    </div>
  );
}

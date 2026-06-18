import { RefreshCcw } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Button } from "../../components/ui/primitives";
import { AuthReadOnlyCard } from "../shell/ShellStatusCards";
import { OperationsDoctorPanel } from "./OperationsDoctorPanel";
import type { CardErrorHandler, OpsPageState, OpsStoreActions } from "./OperationsPage.shared";
import { statusLabel } from "./OperationsPage.shared";

type OperationsOverviewSectionProps = {
  readonly doctor: OpsPageState["doctor"];
  readonly ops: OpsPageState["ops"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
  readonly onError: CardErrorHandler;
};

export function OperationsOverviewSection({ doctor, ops, store, canRequest, onError }: OperationsOverviewSectionProps) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-4">
        <CardBoundary title="인증 / 연결" card="operations" onError={onError}>
          <AuthReadOnlyCard />
        </CardBoundary>

        <CardBoundary title="작업 상태" card="operations" onError={onError}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">계획 / 작업</p>
                <p className="truncate text-xs text-muted-foreground">계획과 작업 흐름 목록을 읽기 전용으로 확인합니다.</p>
              </div>
              <Button variant="outline" size="sm" onClick={store.loadOpsSnapshot} disabled={!canRequest || ops.loadingPlans || ops.loadingTaskGraphs}>
                <RefreshCcw size={14} aria-hidden="true" /> 새로고침
              </Button>
            </div>
            {ops.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{ops.lastError}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border bg-card/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">계획</p>
                <p className="font-mono text-lg font-semibold tabular-nums">{ops.planCount}</p>
                <p className="truncate text-[11px] text-muted-foreground">{ops.latestPlanTitle || (ops.loadingPlans ? "조회 중" : "최근 계획 없음")}</p>
              </div>
              <div className="rounded-md border border-border bg-card/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">작업 흐름</p>
                <p className="font-mono text-lg font-semibold tabular-nums">{ops.taskGraphCount}</p>
                <p className="truncate text-[11px] text-muted-foreground">{ops.latestTaskGraphStatus ? statusLabel(ops.latestTaskGraphStatus) : (ops.loadingTaskGraphs ? "조회 중" : "최근 흐름 없음")}</p>
              </div>
            </div>
          </div>
        </CardBoundary>
      </div>

      <CardBoundary title="환경 진단" card="operations" onError={onError}>
        <OperationsDoctorPanel
          doctor={doctor}
          canRequest={canRequest}
          onLoadLast={store.loadDoctorLast}
          onRun={store.runDoctor}
          onPreviewFix={store.previewDoctorFix}
        />
      </CardBoundary>
    </section>
  );
}

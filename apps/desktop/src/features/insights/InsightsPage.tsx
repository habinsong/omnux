import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Button } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useBuildStore } from "../build/build-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import {
  CodeRepomapPanel,
  GitTimeMachinePanel,
  LocalLlmPanel,
  McpPanel,
  RepairTimelinePanel,
  RouteMetricsPanel,
  SandboxQualityPanel,
  SemanticSearchPanel,
  TelemetryPanel,
  TerminalPanel
} from "./InsightsPanels";
import { CommitLearningPanel, SelfImprovementPanel } from "./InsightsLearningPanels";
import { useInsightsPageBridge, useInsightsStore } from "./insights-store";

export function InsightsPage() {
  useInsightsPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const buildResult = useBuildStore((state) => state.currentResult);
  const buildRuntime = useBuildStore((state) => state.runtime);
  const store = useInsightsStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="dashboard-tab space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">로그</h1>
          <p className="truncate text-sm text-muted-foreground">호출, 경로, 도구, 터미널 기록을 읽기 전용으로 점검합니다.</p>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadAll} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardBoundary title="호출 기록 / 비용" card="logs" onError={recordCardError}>
          <TelemetryPanel telemetry={store.telemetry} />
        </CardBoundary>

        <CardBoundary title="작업 경로 기록" card="logs" onError={recordCardError}>
          <RouteMetricsPanel telemetry={store.telemetry} />
        </CardBoundary>

        <CardBoundary title="샌드박스 / 품질 점검" card="runtime" onError={recordCardError}>
          <SandboxQualityPanel doctor={store.doctor} />
        </CardBoundary>

        <CardBoundary title="복구 / 품질 흐름" card="operations" onError={recordCardError}>
          <RepairTimelinePanel telemetry={store.telemetry} result={buildResult} runtime={buildRuntime} />
        </CardBoundary>

        <CardBoundary title="Git 체크포인트" card="navigation" onError={recordCardError}>
          <GitTimeMachinePanel git={store.gitTimeMachine} />
        </CardBoundary>

        <CardBoundary title="도구 서버" card="operations" onError={recordCardError}>
          <McpPanel mcp={store.mcp} />
        </CardBoundary>

        <CardBoundary title="로컬 모델" card="middleware" onError={recordCardError}>
          <LocalLlmPanel local={store.localLlm} />
        </CardBoundary>

        <CardBoundary title="터미널 / 도구 상태" card="runtime" onError={recordCardError}>
          <TerminalPanel terminal={store.terminal} />
        </CardBoundary>

        <CardBoundary title="검색 인덱스 상태" card="middleware" onError={recordCardError}>
          <SemanticSearchPanel semantic={store.semantic} />
        </CardBoundary>

        <CardBoundary title="코드 구조 지도" card="navigation" onError={recordCardError}>
          <CodeRepomapPanel repomap={store.repomap} />
        </CardBoundary>

        <CardBoundary title="커밋 기록" card="logs" onError={recordCardError}>
          <CommitLearningPanel commitLearning={store.commitLearning} />
        </CardBoundary>

        <CardBoundary title="개선 제안" card="operations" onError={recordCardError}>
          <SelfImprovementPanel selfImprovement={store.selfImprovement} />
        </CardBoundary>
      </section>
    </div>
  );
}

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Button } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import {
  CodeRepomapPanel,
  GitTimeMachinePanel,
  LocalLlmPanel,
  McpPanel,
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
  const store = useInsightsStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">인사이트</h1>
          <p className="truncate text-sm text-muted-foreground">LLM telemetry, MCP, 로컬 LLM, 터미널, Git 타임머신 — 백엔드 read-only 스냅샷.</p>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadAll} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardBoundary title="LLM Telemetry / 비용" card="logs" onError={recordCardError}>
          <TelemetryPanel telemetry={store.telemetry} />
        </CardBoundary>

        <CardBoundary title="Git 타임머신" card="navigation" onError={recordCardError}>
          <GitTimeMachinePanel git={store.gitTimeMachine} />
        </CardBoundary>

        <CardBoundary title="MCP 서버" card="operations" onError={recordCardError}>
          <McpPanel mcp={store.mcp} />
        </CardBoundary>

        <CardBoundary title="로컬 LLM (Ollama / LM Studio)" card="middleware" onError={recordCardError}>
          <LocalLlmPanel local={store.localLlm} />
        </CardBoundary>

        <CardBoundary title="터미널 / 툴체인 readiness" card="runtime" onError={recordCardError}>
          <TerminalPanel terminal={store.terminal} />
        </CardBoundary>

        <CardBoundary title="Semantic Search readiness" card="middleware" onError={recordCardError}>
          <SemanticSearchPanel semantic={store.semantic} />
        </CardBoundary>

        <CardBoundary title="Code Repomap" card="navigation" onError={recordCardError}>
          <CodeRepomapPanel repomap={store.repomap} />
        </CardBoundary>

        <CardBoundary title="Commit learning" card="logs" onError={recordCardError}>
          <CommitLearningPanel commitLearning={store.commitLearning} />
        </CardBoundary>

        <CardBoundary title="Self improvement 제안" card="operations" onError={recordCardError}>
          <SelfImprovementPanel selfImprovement={store.selfImprovement} />
        </CardBoundary>
      </section>
    </div>
  );
}

import { useEffect } from "react";
import { CheckCircle2, ClipboardList, ListTree, Play, RefreshCcw, Search, Sparkles, XCircle } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { usePlanningPageBridge, usePlanningStore } from "./planning-store";
import { Badge, Button, EmptyState, Textarea, cn } from "../../components/ui/primitives";

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" {
  const v = status.toLowerCase();
  if (/(completed|approved|done|ready)/.test(v)) return "success";
  if (/(running|review|pending)/.test(v)) return "primary";
  if (/(failed|canceled|error|rejected)/.test(v)) return "destructive";
  if (/(draft|waiting)/.test(v)) return "warning";
  return "default";
}

export function PlanningPage() {
  usePlanningPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = usePlanningStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const plan = store.selectedPlan;
  const graph = store.selectedGraph;

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">계획 / 태스크 그래프</h1>
          <p className="text-sm text-muted-foreground">목표를 계획으로 만들고, 리뷰·승인·실행한 뒤 태스크 그래프로 병렬 실행합니다.</p>
        </div>
        <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Plans */}
        <CardBoundary title="계획" card="operations" onError={recordCardError}>
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <Textarea rows={2} value={store.objectiveDraft} placeholder="목표(objective)를 적으면 계획을 생성합니다." onChange={(event) => store.setObjective(event.target.value)} />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={store.createPlan} disabled={!canRequest || store.pending || store.objectiveDraft.trim().length < 5}>
                <Sparkles size={14} aria-hidden="true" /> 계획 생성
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {store.plans.map((item) => (
              <button key={item.planId} type="button" onClick={() => store.openPlan(item.planId)} disabled={!canRequest} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors", item.planId === plan?.planId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title || item.objective || item.planId}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.reviewerSummary || item.objective}</span>
                </span>
                <Badge tone={statusTone(item.status)}>{item.status || "draft"}</Badge>
              </button>
            ))}
            {store.plans.length === 0 ? <EmptyState icon={ClipboardList} title="계획 없음" description="목표를 입력해 첫 계획을 만드세요." /> : null}
          </div>
          {plan ? (
            <div className="space-y-2 rounded-md border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between">
                <b className="truncate text-sm">{plan.title || plan.planId}</b>
                <Badge tone={statusTone(plan.status)}>{plan.status}</Badge>
              </div>
              {plan.objective ? <p className="text-xs text-muted-foreground">{plan.objective}</p> : null}
              {plan.reviewerSummary ? <p className="rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">{plan.reviewerSummary}</p> : null}
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                <Button variant="outline" size="sm" onClick={store.reviewPlan} disabled={!canRequest || store.pending}><Search size={13} aria-hidden="true" /> 리뷰</Button>
                <Button variant="outline" size="sm" onClick={store.approvePlan} disabled={!canRequest || store.pending}><CheckCircle2 size={13} aria-hidden="true" /> 승인</Button>
                <Button variant="primary" size="sm" onClick={store.runPlan} disabled={!canRequest || store.pending}><Play size={13} aria-hidden="true" /> 실행</Button>
                <Button variant="ghost" size="sm" onClick={store.createGraph} disabled={!canRequest || store.pending}><ListTree size={13} aria-hidden="true" /> 태스크 그래프</Button>
              </div>
            </div>
          ) : null}
        </CardBoundary>

        {/* Task graphs */}
        <CardBoundary title="태스크 그래프" card="logs" onError={recordCardError}>
          <div className="space-y-1">
            {store.graphs.map((g) => (
              <button key={g.graphId} type="button" onClick={() => store.openGraph(g.graphId)} disabled={!canRequest} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors", g.graphId === graph?.graphId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{g.graphId}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{g.nodeCount} tasks</span>
                </span>
                <Badge tone={statusTone(g.status)}>{g.status || "-"}</Badge>
              </button>
            ))}
            {store.graphs.length === 0 ? <EmptyState icon={ListTree} title="태스크 그래프 없음" description="계획을 승인한 뒤 [태스크 그래프]로 생성하세요." /> : null}
          </div>
          {graph ? (
            <div className="space-y-2 rounded-md border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between">
                <b className="truncate font-mono text-xs">{graph.graphId}</b>
                <div className="flex items-center gap-1.5">
                  <Badge tone={statusTone(graph.status)}>{graph.status}</Badge>
                  <Button variant="primary" size="sm" onClick={store.runGraph} disabled={!canRequest || store.pending}><Play size={13} aria-hidden="true" /> 실행</Button>
                </div>
              </div>
              <div className="space-y-1">
                {graph.nodes.map((task) => (
                  <div key={task.taskId} className="flex items-center justify-between gap-2 rounded border border-border bg-background/40 px-2 py-1.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.loadOutput(task.taskId)}>
                      <span className="block truncate text-xs font-medium">{task.title || task.taskId}</span>
                    </button>
                    <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                    <button type="button" aria-label="취소" className="text-muted-foreground hover:text-destructive" onClick={() => store.cancelTask(task.taskId)}>
                      <XCircle size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {graph.nodes.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">태스크 노드 없음</p> : null}
              </div>
            </div>
          ) : null}
          {store.output ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono">{store.output.taskId}</span>
                <Badge tone={statusTone(store.output.status)}>{store.output.status}</Badge>
              </div>
              {store.output.stdout ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px]">{store.output.stdout}</pre> : null}
              {store.output.stderr ? <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">{store.output.stderr}</pre> : null}
            </div>
          ) : null}
        </CardBoundary>
      </section>
    </div>
  );
}

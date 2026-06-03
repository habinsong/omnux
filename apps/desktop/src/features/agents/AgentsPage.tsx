import { useEffect } from "react";
import { Activity, GitBranch, Inbox, Network, RefreshCcw } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useAgentsPageBridge, useAgentsStore } from "./agents-store";
import { Badge, Button, EmptyState } from "../../components/ui/primitives";

function healthTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" {
  const v = value.toLowerCase();
  if (/(ok|healthy|completed|clean|idle)/.test(v)) return "success";
  if (/(timeout|stale|attention|dirty)/.test(v)) return "warning";
  if (/(failed|error|killed)/.test(v)) return "destructive";
  if (/(running|dispatching|active)/.test(v)) return "primary";
  return "default";
}

export function AgentsPage() {
  useAgentsPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useAgentsStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const bus = store.bus;
  const watchdog = store.watchdog;
  const worktree = store.worktree;
  const trace = store.trace;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">에이전트</h1>
          <p className="text-sm text-muted-foreground">멀티 에이전트 메시지 버스·보드·생명주기, watchdog, worktree 격리 스냅샷 (read-only).</p>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadAll} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardBoundary title="에이전트 버스" card="logs" onError={recordCardError}>
          {bus ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary">메시지 {bus.totalMessages || bus.messages.length}</Badge>
                <Badge tone="outline">보드 {bus.board.length}</Badge>
                <Badge tone="outline">생명주기 {bus.lifecycle.length}</Badge>
              </div>
              <div className="space-y-1">
                {bus.messages.slice(0, 6).map((m, i) => (
                  <div key={i} className="rounded-md border border-border bg-card/60 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{m.from || "?"}</span> → <span className="font-mono">{m.to || "all"}</span>
                      {m.kind ? <Badge tone="outline">{m.kind}</Badge> : null}
                    </div>
                    <div className="truncate text-xs">{m.body}</div>
                  </div>
                ))}
                {bus.board.slice(0, 4).map((b, i) => (
                  <div key={`b-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                    <span className="truncate"><span className="font-mono text-muted-foreground">{b.agentId}</span> · {b.key}: {b.value}</span>
                    {b.status ? <Badge tone={healthTone(b.status)}>{b.status}</Badge> : null}
                  </div>
                ))}
                {bus.messages.length === 0 && bus.board.length === 0 ? <EmptyState icon={Inbox} title="버스 활동 없음" description="에이전트 간 메시지/보드 활동이 여기에 표시됩니다." /> : null}
              </div>
            </>
          ) : (
            <EmptyState icon={Inbox} title="버스 스냅샷 없음" description="새로고침하면 에이전트 버스가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Watchdog (활성 실행)" card="runtime" onError={recordCardError}>
          {watchdog ? (
            <>
              <div className="flex items-center gap-2">
                <Badge tone={healthTone(watchdog.status)}>{watchdog.status}</Badge>
                <Badge tone="outline">{watchdog.activeCount} active</Badge>
              </div>
              <div className="space-y-1">
                {watchdog.runs.map((r) => (
                  <div key={r.runId} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{r.runId}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{r.backend} · {r.state} · {r.ageSeconds}s</span>
                    </span>
                    <Badge tone={healthTone(r.health)}>{r.health || r.state}</Badge>
                  </div>
                ))}
                {watchdog.runs.length === 0 ? <EmptyState icon={Activity} title="활성 실행 없음" description="실행 중인 sessions_spawn 에이전트가 없습니다." /> : null}
              </div>
            </>
          ) : (
            <EmptyState icon={Activity} title="watchdog 스냅샷 없음" description="새로고침하면 활성 실행 상태가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Worktree 격리" card="operations" onError={recordCardError}>
          {worktree ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={healthTone(worktree.status)}>{worktree.status}</Badge>
                <Badge tone="outline">{worktree.totalWorktreeCount} worktrees</Badge>
                {worktree.cleanupCandidateCount > 0 ? <Badge tone="warning">{worktree.cleanupCandidateCount} cleanup</Badge> : null}
              </div>
              <div className="space-y-1">
                {worktree.worktrees.map((w) => (
                  <div key={w.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{w.name}</span>
                      <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><GitBranch size={10} aria-hidden="true" /> {w.branch || w.headShortHash || "-"}</span>
                    </span>
                    <Badge tone={w.hasChanges ? "warning" : healthTone(w.status)}>{w.hasChanges ? "dirty" : w.status || "clean"}</Badge>
                  </div>
                ))}
                {worktree.worktrees.length === 0 ? <EmptyState icon={GitBranch} title="worktree 없음" description="격리된 에이전트 worktree가 없습니다." /> : null}
              </div>
            </>
          ) : (
            <EmptyState icon={GitBranch} title="worktree 스냅샷 없음" description="새로고침하면 worktree 격리 상태가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Trace projection" card="logs" onError={recordCardError}>
          {trace ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={healthTone(trace.status)}>{trace.status || "snapshot"}</Badge>
                <Badge tone="outline">{trace.agents.length} agents</Badge>
                <Badge tone="outline">{trace.threads.length} threads</Badge>
                <Badge tone={trace.interventions.length > 0 ? "warning" : "outline"}>{trace.interventions.length} interventions</Badge>
                <Badge tone="outline">{trace.edgeCount} edges</Badge>
              </div>
              <div className="space-y-1">
                {trace.interventions.slice(0, 4).map((item) => (
                  <div key={item.interventionId} className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{item.title || item.reason || item.interventionId}</span>
                      <Badge tone={healthTone(item.severity)}>{item.severity || "review"}</Badge>
                    </div>
                    {item.reason ? <div className="truncate text-[11px] text-muted-foreground">{item.reason}</div> : null}
                  </div>
                ))}
                {trace.agents.slice(0, 5).map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{agent.agentId}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{agent.role || "agent"} · {agent.messageCount} msg · {agent.lifecycleEventCount} events</span>
                    </span>
                    <Badge tone={healthTone(agent.state)}>{agent.state || "idle"}</Badge>
                  </div>
                ))}
                {trace.threads.slice(0, 4).map((thread) => (
                  <div key={thread.threadId} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                    <div className="truncate font-medium">{thread.title || thread.threadId}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{thread.messageCount} messages · {thread.lastMessageUtc}</div>
                  </div>
                ))}
                {trace.agents.length === 0 && trace.threads.length === 0 ? <EmptyState icon={Network} title="trace 없음" description="에이전트 bus 이벤트가 쌓이면 trace graph가 표시됩니다." /> : null}
              </div>
            </>
          ) : (
            <EmptyState icon={Network} title="trace 스냅샷 없음" description="새로고침하면 agent bus 기반 trace projection이 표시됩니다." />
          )}
        </CardBoundary>
      </section>
    </div>
  );
}

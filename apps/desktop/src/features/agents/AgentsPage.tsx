import { useEffect } from "react";
import { Activity, GitBranch, Inbox, Network, RefreshCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { AgentBusWritePanel } from "./AgentBusWritePanel";
import { useAgentsPageBridge, useAgentsStore } from "./agents-store";
import { Badge, Button } from "../../components/ui/primitives";

function healthTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" {
  const v = value.toLowerCase();
  if (/(ok|healthy|completed|clean|idle)/.test(v)) return "success";
  if (/(timeout|stale|attention|dirty)/.test(v)) return "warning";
  if (/(failed|error|killed)/.test(v)) return "destructive";
  if (/(running|dispatching|active)/.test(v)) return "primary";
  return "default";
}

function CompactEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/25 px-2.5 py-2">
      <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </div>
  );
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
    <div className="dashboard-tab space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">에이전트</h1>
          <p className="text-sm text-muted-foreground">작업자 간 메시지, 공유 상태, 실행 흐름을 조용히 점검합니다.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={store.loadAll} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardBoundary title="조율 기록" card="operations" onError={recordCardError}>
          <AgentBusWritePanel canRequest={canRequest} />
        </CardBoundary>

        <CardBoundary title="공유 상태" card="logs" onError={recordCardError}>
          {bus ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary">메시지 {bus.totalMessages || bus.messages.length}</Badge>
                <Badge tone="outline">보드 {bus.board.length}</Badge>
                <Badge tone="outline">상태 변경 {bus.lifecycle.length}</Badge>
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
                {bus.messages.length === 0 && bus.board.length === 0 ? <CompactEmptyState icon={Inbox} title="공유 기록 없음" description="작업자 간 메시지와 보드 상태가 여기에 표시됩니다." /> : null}
              </div>
            </>
          ) : (
            <CompactEmptyState icon={Inbox} title="공유 상태 없음" description="새로고침하면 작업자 간 공유 기록이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="활성 실행" card="runtime" onError={recordCardError}>
          {watchdog ? (
            <>
              <div className="flex items-center gap-2">
                <Badge tone={healthTone(watchdog.status)}>{watchdog.status}</Badge>
                <Badge tone="outline">활성 {watchdog.activeCount}</Badge>
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
                {watchdog.runs.length === 0 ? <CompactEmptyState icon={Activity} title="활성 실행 없음" description="현재 실행 중인 작업자가 없습니다." /> : null}
              </div>
            </>
          ) : (
            <CompactEmptyState icon={Activity} title="실행 상태 없음" description="새로고침하면 활성 실행 상태가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="작업 폴더" card="operations" onError={recordCardError}>
          {worktree ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={healthTone(worktree.status)}>{worktree.status}</Badge>
                <Badge tone="outline">폴더 {worktree.totalWorktreeCount}</Badge>
                {worktree.cleanupCandidateCount > 0 ? <Badge tone="warning">정리 {worktree.cleanupCandidateCount}</Badge> : null}
              </div>
              <div className="space-y-1">
                {worktree.worktrees.map((w) => (
                  <div key={w.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{w.name}</span>
                      <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><GitBranch size={10} aria-hidden="true" /> {w.branch || w.headShortHash || "-"}</span>
                    </span>
                    <Badge tone={w.hasChanges ? "warning" : healthTone(w.status)}>{w.hasChanges ? "변경 있음" : w.status || "정리됨"}</Badge>
                  </div>
                ))}
                {worktree.worktrees.length === 0 ? <CompactEmptyState icon={GitBranch} title="작업 폴더 없음" description="분리된 작업 폴더가 없습니다." /> : null}
              </div>
            </>
          ) : (
            <CompactEmptyState icon={GitBranch} title="작업 폴더 상태 없음" description="새로고침하면 분리된 작업 폴더 상태가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="흐름" card="logs" onError={recordCardError}>
          {trace ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={healthTone(trace.status)}>{trace.status || "상태"}</Badge>
                <Badge tone="outline">작업자 {trace.agents.length}</Badge>
                <Badge tone="outline">스레드 {trace.threads.length}</Badge>
                <Badge tone={trace.interventions.length > 0 ? "warning" : "outline"}>개입 {trace.interventions.length}</Badge>
                <Badge tone="outline">연결 {trace.edgeCount}</Badge>
              </div>
              <div className="space-y-1">
                {trace.interventions.slice(0, 4).map((item) => (
                  <div key={item.interventionId} className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{item.title || item.reason || item.interventionId}</span>
                      <Badge tone={healthTone(item.severity)}>{item.severity || "검토"}</Badge>
                    </div>
                    {item.reason ? <div className="truncate text-[11px] text-muted-foreground">{item.reason}</div> : null}
                  </div>
                ))}
                {trace.agents.slice(0, 5).map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{agent.agentId}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{agent.role || "작업자"} · 메시지 {agent.messageCount} · 상태 {agent.lifecycleEventCount}</span>
                    </span>
                    <Badge tone={healthTone(agent.state)}>{agent.state || "대기"}</Badge>
                  </div>
                ))}
                {trace.threads.slice(0, 4).map((thread) => (
                  <div key={thread.threadId} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                    <div className="truncate font-medium">{thread.title || thread.threadId}</div>
                    <div className="truncate text-[11px] text-muted-foreground">메시지 {thread.messageCount} · {thread.lastMessageUtc}</div>
                  </div>
                ))}
                {trace.agents.length === 0 && trace.threads.length === 0 ? <CompactEmptyState icon={Network} title="흐름 없음" description="공유 기록이 쌓이면 작업 흐름이 표시됩니다." /> : null}
              </div>
            </>
          ) : (
            <CompactEmptyState icon={Network} title="흐름 상태 없음" description="새로고침하면 공유 기록 기반 흐름이 표시됩니다." />
          )}
        </CardBoundary>
      </section>
    </div>
  );
}

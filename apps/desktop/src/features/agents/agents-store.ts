import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopAgents } from "../middleware/agents-gateway";

type BusMessage = { from: string; to: string; kind: string; body: string };
type BoardEntry = { agentId: string; key: string; value: string; status: string };
type LifecycleEvent = { agentId: string; event: string; runId: string };
type WatchdogRun = { runId: string; backend: string; state: string; health: string; ageSeconds: number };
type Worktree = { name: string; status: string; branch: string; headShortHash: string; hasChanges: boolean };
type TraceAgent = { agentId: string; role: string; state: string; messageCount: number; boardEntryCount: number; lifecycleEventCount: number };
type TraceThread = { threadId: string; title: string; messageCount: number; lastMessageUtc: string };
type TraceIntervention = { interventionId: string; title: string; severity: string; reason: string };

type AgentsState = {
  bus: { messages: BusMessage[]; board: BoardEntry[]; lifecycle: LifecycleEvent[]; totalMessages: number } | null;
  watchdog: { status: string; activeCount: number; runs: WatchdogRun[] } | null;
  worktree: { status: string; totalWorktreeCount: number; cleanupCandidateCount: number; worktrees: Worktree[] } | null;
  trace: { status: string; agents: TraceAgent[]; threads: TraceThread[]; interventions: TraceIntervention[]; edgeCount: number } | null;
  loading: boolean;
  lastError: string;
  loadAll: () => void;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function n(v: unknown): number { return Number(v || 0); }
function arr(v: unknown): Record<string, unknown>[] { return Array.isArray(v) ? (v as Record<string, unknown>[]) : []; }

export const useAgentsStore = create<AgentsState>((set) => ({
  bus: null,
  watchdog: null,
  worktree: null,
  trace: null,
  loading: false,
  lastError: "",
  loadAll: () => {
    set({ loading: true, lastError: "" });
    const ok = requestDesktopAgents.bus() && requestDesktopAgents.watchdog() && requestDesktopAgents.worktree() && requestDesktopAgents.trace();
    if (!ok) set({ loading: false, lastError: "에이전트 스냅샷 요청을 전송하지 못했다." });
  }
}));

export function useAgentsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      if (message.type === "agent_bus_snapshot") {
        useAgentsStore.setState({
          loading: false,
          bus: {
            messages: arr(payload.messages).map((m) => ({ from: s(m.fromAgentId || m.from), to: s(m.toAgentId || m.to), kind: s(m.kind), body: s(m.body || m.content) })),
            board: arr(payload.board).map((b) => ({ agentId: s(b.agentId), key: s(b.key), value: s(b.value), status: s(b.status) })),
            lifecycle: arr(payload.lifecycle).map((l) => ({ agentId: s(l.agentId), event: s(l.event || l.kind), runId: s(l.runId) })),
            totalMessages: n(payload.totalMessages)
          }
        });
        return;
      }
      if (message.type === "agent_watchdog_snapshot") {
        useAgentsStore.setState({
          watchdog: {
            status: s(payload.status),
            activeCount: n(payload.activeCount),
            runs: arr(payload.runs).map((r) => ({ runId: s(r.runId || r.id), backend: s(r.backend || r.runtime), state: s(r.state), health: s(r.health), ageSeconds: n(r.ageSeconds) }))
          }
        });
        return;
      }
      if (message.type === "agent_worktree_snapshot") {
        useAgentsStore.setState({
          worktree: {
            status: s(payload.status),
            totalWorktreeCount: n(payload.totalWorktreeCount),
            cleanupCandidateCount: n(payload.cleanupCandidateCount),
            worktrees: arr(payload.worktrees).map((w) => ({ name: s(w.name), status: s(w.status), branch: s(w.branch), headShortHash: s(w.headShortHash), hasChanges: !!w.hasChanges }))
          }
        });
        return;
      }
      if (message.type === "multi_agent_trace_snapshot") {
        useAgentsStore.setState({
          trace: {
            status: s(payload.status),
            agents: arr(payload.agents).map((a) => ({
              agentId: s(a.agentId),
              role: s(a.role),
              state: s(a.state),
              messageCount: n(a.messageCount),
              boardEntryCount: n(a.boardEntryCount),
              lifecycleEventCount: n(a.lifecycleEventCount)
            })),
            threads: arr(payload.threads).map((t) => ({ threadId: s(t.threadId), title: s(t.title), messageCount: n(t.messageCount), lastMessageUtc: s(t.lastMessageUtc) })),
            interventions: arr(payload.interventions).map((i) => ({ interventionId: s(i.interventionId || i.id), title: s(i.title), severity: s(i.severity), reason: s(i.reason) })),
            edgeCount: arr(payload.edges).length
          }
        });
        return;
      }
      if (message.type === "error") {
        useAgentsStore.setState({ loading: false, lastError: s(message.message) || "오류" });
      }
    });
  }, []);
}

import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopAgents } from "../middleware/agents-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type BusMessage = { from: string; to: string; kind: string; body: string };
type BoardEntry = { agentId: string; key: string; value: string; status: string };
type LifecycleEvent = { agentId: string; event: string; runId: string };
type WatchdogRun = { runId: string; backend: string; state: string; health: string; ageSeconds: number };
type Worktree = { name: string; status: string; branch: string; headShortHash: string; hasChanges: boolean };
type TraceAgent = { agentId: string; role: string; state: string; messageCount: number; boardEntryCount: number; lifecycleEventCount: number };
type TraceThread = { threadId: string; title: string; messageCount: number; lastMessageUtc: string };
type TraceIntervention = { interventionId: string; title: string; severity: string; reason: string };
type AgentBusDraft = {
  messageFrom: string;
  messageTo: string;
  messageKind: string;
  messageBody: string;
  boardAgentId: string;
  boardKey: string;
  boardValue: string;
  boardStatus: string;
  boardPriority: string;
  lifecycleAgentId: string;
  lifecycleState: string;
  lifecycleDetail: string;
  commandFrom: string;
  commandGroupId: string;
  commandRunId: string;
  command: string;
  commandBody: string;
};

type AgentsState = {
  bus: { messages: BusMessage[]; board: BoardEntry[]; lifecycle: LifecycleEvent[]; totalMessages: number } | null;
  watchdog: { status: string; activeCount: number; runs: WatchdogRun[] } | null;
  worktree: { status: string; totalWorktreeCount: number; cleanupCandidateCount: number; worktrees: Worktree[] } | null;
  trace: { status: string; agents: TraceAgent[]; threads: TraceThread[]; interventions: TraceIntervention[]; edgeCount: number } | null;
  draft: AgentBusDraft;
  submitting: "" | "message" | "board" | "lifecycle" | "command";
  loading: boolean;
  lastError: string;
  lastAction: string;
  setDraft: (patch: Partial<AgentBusDraft>) => void;
  loadAll: () => void;
  postMessage: () => void;
  putBoard: () => void;
  emitLifecycle: () => void;
  postGroupCommand: () => void;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function n(v: unknown): number { return Number(v || 0); }
function arr(v: unknown): Record<string, unknown>[] { return Array.isArray(v) ? (v as Record<string, unknown>[]) : []; }
function normalizeBusSnapshot(payload: Record<string, unknown>) {
  return {
    messages: arr(payload.messages).map((m) => ({ from: s(m.fromAgentId || m.from), to: s(m.toAgentId || m.to), kind: s(m.kind), body: s(m.body || m.content) })),
    board: arr(payload.board).map((b) => ({ agentId: s(b.agentId), key: s(b.key), value: s(b.value), status: s(b.status) })),
    lifecycle: arr(payload.lifecycle).map((l) => ({ agentId: s(l.agentId), event: s(l.event || l.kind), runId: s(l.runId) })),
    totalMessages: n(payload.totalMessages)
  };
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  bus: null,
  watchdog: null,
  worktree: null,
  trace: null,
  draft: {
    messageFrom: "human",
    messageTo: "",
    messageKind: "message",
    messageBody: "",
    boardAgentId: "human",
    boardKey: "progress",
    boardValue: "",
    boardStatus: "running",
    boardPriority: "normal",
    lifecycleAgentId: "human",
    lifecycleState: "running",
    lifecycleDetail: "",
    commandFrom: "human",
    commandGroupId: "",
    commandRunId: "",
    command: "stop",
    commandBody: ""
  },
  submitting: "",
  loading: false,
  lastError: "",
  lastAction: "",
  setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  loadAll: () => {
    set({ loading: true, lastError: "" });
    const ok = requestDesktopAgents.bus() && requestDesktopAgents.watchdog() && requestDesktopAgents.worktree() && requestDesktopAgents.trace();
    if (!ok) set({ loading: false, lastError: "에이전트 스냅샷 요청을 전송하지 못했다." });
  },
  postMessage: () => {
    const draft = get().draft;
    if (!draft.messageFrom.trim() || !draft.messageBody.trim()) {
      set({ lastError: "from agent와 메시지 본문을 입력하세요." });
      return;
    }
    set({ submitting: "message", lastError: "", lastAction: "" });
    const ok = requestDesktopAgents.postMessage({
      fromAgentId: draft.messageFrom,
      toAgentId: draft.messageTo,
      kind: draft.messageKind,
      body: draft.messageBody
    });
    if (!ok) set({ submitting: "", lastError: "에이전트 메시지 기록 요청을 전송하지 못했다." });
  },
  putBoard: () => {
    const draft = get().draft;
    if (!draft.boardAgentId.trim() || !draft.boardKey.trim() || !draft.boardValue.trim()) {
      set({ lastError: "agent, key, value를 입력하세요." });
      return;
    }
    set({ submitting: "board", lastError: "", lastAction: "" });
    const ok = requestDesktopAgents.putBoard({
      agentId: draft.boardAgentId,
      key: draft.boardKey,
      value: draft.boardValue,
      status: draft.boardStatus,
      priority: draft.boardPriority
    });
    if (!ok) set({ submitting: "", lastError: "에이전트 보드 저장 요청을 전송하지 못했다." });
  },
  emitLifecycle: () => {
    const draft = get().draft;
    if (!draft.lifecycleAgentId.trim() || !draft.lifecycleState.trim()) {
      set({ lastError: "agent와 state를 입력하세요." });
      return;
    }
    set({ submitting: "lifecycle", lastError: "", lastAction: "" });
    const ok = requestDesktopAgents.emitLifecycle({
      agentId: draft.lifecycleAgentId,
      state: draft.lifecycleState,
      detail: draft.lifecycleDetail
    });
    if (!ok) set({ submitting: "", lastError: "에이전트 생명주기 기록 요청을 전송하지 못했다." });
  },
  postGroupCommand: () => {
    void (async () => {
      const draft = get().draft;
      if (!draft.commandFrom.trim() || !draft.command.trim() || (!draft.commandGroupId.trim() && !draft.commandRunId.trim())) {
        set({ lastError: "from, command, group 또는 run을 입력하세요." });
        return;
      }
      const confirmed = await requestConfirmDialog({
        title: "그룹 명령 기록",
        message: "실제 프로세스를 중단하지 않고 agent bus에 command 메시지만 저장합니다.",
        confirmLabel: "기록",
        tone: "default"
      });
      if (!confirmed) return;
      set({ submitting: "command", lastError: "", lastAction: "" });
      const ok = requestDesktopAgents.postGroupCommand({
        fromAgentId: draft.commandFrom,
        command: draft.command,
        body: draft.commandBody,
        groupId: draft.commandGroupId,
        runId: draft.commandRunId
      });
      if (!ok) set({ submitting: "", lastError: "에이전트 그룹 명령 기록 요청을 전송하지 못했다." });
    })();
  }
}));

export function useAgentsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      if (message.type === "agent_bus_snapshot") {
        useAgentsStore.setState({
          loading: false,
          bus: normalizeBusSnapshot(payload)
        });
        return;
      }
      if (message.type === "agent_message_result" || message.type === "agent_board_result" || message.type === "agent_lifecycle_result" || message.type === "agent_group_command_result") {
        const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
        const ok = payload.ok !== false;
        useAgentsStore.setState({
          submitting: "",
          bus: normalizeBusSnapshot(snapshot),
          lastAction: ok ? s(payload.message) || message.type : "",
          lastError: ok ? "" : s(payload.message) || "에이전트 버스 쓰기 실패"
        });
        if (ok) requestDesktopAgents.trace();
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
        useAgentsStore.setState({ loading: false, submitting: "", lastError: s(message.message) || "오류" });
      }
    });
  }, []);
}

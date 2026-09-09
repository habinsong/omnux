import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopAgents } from "../middleware/agents-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import {
  AGENT_SLICE_IDS,
  SLICE_TIMEOUT_MS,
  agentRequestId,
  agentSliceForMessage,
  agentSliceForRequestId,
  createAgentSliceMap,
  markAgentFailed,
  markAgentLoading,
  markAgentReady,
  type AgentSliceId,
  type AgentSliceMap
} from "./agents-view";

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
  /** 조회 단위마다 자기 상태를 갖는다. 하나가 실패해도 화면이 멈추지 않는다. */
  slices: AgentSliceMap;
  /** 어느 조회의 응답인지 알 수 없는 서버 오류. 구역 상태를 덮어쓰지 않는다. */
  gatewayNotice: string;
  lastError: string;
  lastAction: string;
  setDraft: (patch: Partial<AgentBusDraft>) => void;
  load: (id: AgentSliceId) => void;
  loadAll: () => void;
  clearGatewayNotice: () => void;
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

function sendSliceRequest(id: AgentSliceId): boolean {
  if (id === "bus") return requestDesktopAgents.bus(100, agentRequestId("bus"));
  if (id === "watchdog") return requestDesktopAgents.watchdog(100, agentRequestId("watchdog"));
  if (id === "worktree") return requestDesktopAgents.worktree(agentRequestId("worktree"));
  return requestDesktopAgents.trace(100, agentRequestId("trace"));
}

const sliceTimers = new Map<AgentSliceId, ReturnType<typeof setTimeout>>();

function clearAgentTimer(id: AgentSliceId) {
  const timer = sliceTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    sliceTimers.delete(id);
  }
}

/** 응답이 오지 않아도 "조회 중"으로 영원히 남지 않게 기한을 둔다. */
function armAgentTimer(id: AgentSliceId) {
  clearAgentTimer(id);
  sliceTimers.set(
    id,
    setTimeout(() => {
      sliceTimers.delete(id);
      if (useAgentsStore.getState().slices[id].status !== "loading") return;
      useAgentsStore.setState((state) => ({
        slices: markAgentFailed(state.slices, id, "응답이 오지 않았습니다. 다시 조회하세요.")
      }));
    }, SLICE_TIMEOUT_MS)
  );
}

function completeAgentSlice(id: AgentSliceId) {
  clearAgentTimer(id);
  useAgentsStore.setState((state) => ({
    slices: markAgentReady(state.slices, id, new Date().toISOString())
  }));
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
  slices: createAgentSliceMap(),
  gatewayNotice: "",
  lastError: "",
  lastAction: "",
  setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  load: (id) => {
    set((state) => ({ slices: markAgentLoading(state.slices, id) }));
    // 요청을 && 로 잇지 않는다. 하나가 실패해도 나머지를 건너뛰지 않는다.
    const sent = sendSliceRequest(id);
    if (!sent) {
      set((state) => ({
        slices: markAgentFailed(state.slices, id, "요청을 보내지 못했습니다. 연결을 확인하세요.")
      }));
      return;
    }
    armAgentTimer(id);
  },
  loadAll: () => {
    for (const id of AGENT_SLICE_IDS) useAgentsStore.getState().load(id);
  },
  clearGatewayNotice: () => set({ gatewayNotice: "" }),
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
      // 응답을 받은 구역만 완료로 바꾼다. 한 응답이 네 구역 전체를 대신하지 않는다.
      const answered = typeof message.type === "string" ? agentSliceForMessage(message.type) : null;
      if (answered !== null) completeAgentSlice(answered);
      if (message.type === "agent_bus_snapshot") {
        useAgentsStore.setState({ bus: normalizeBusSnapshot(payload) });
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
        if (ok) useAgentsStore.getState().load("trace");
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
        // 요청 ID 가 있으면 그 구역만 실패로 바꾸고, 없으면 구역 상태를 건드리지 않는다.
        const requestId = typeof message.requestId === "string" ? message.requestId : "";
        const target = agentSliceForRequestId(requestId);
        const text = s(message.message) || "오류";
        if (target !== null) {
          clearAgentTimer(target);
          useAgentsStore.setState((state) => ({ slices: markAgentFailed(state.slices, target, text) }));
          return;
        }
        useAgentsStore.setState({
          submitting: "",
          gatewayNotice: `미들웨어가 오류를 보냈습니다: ${text} (어느 조회의 응답인지는 알 수 없습니다.)`
        });
      }
    });
  }, []);
}

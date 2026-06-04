import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 멀티 에이전트 버스 쓰기 + watchdog/worktree/trace 스냅샷.
registerDesktopRequestTypes(
  "agent_bus_get",
  "agent_message_post",
  "agent_board_put",
  "agent_lifecycle_emit",
  "agent_group_command",
  "agent_watchdog_snapshot_get",
  "agent_worktree_snapshot_get",
  "multi_agent_trace_snapshot_get"
);

export const requestDesktopAgents = {
  bus(limit = 100) {
    return sendDesktopRequest({ type: "agent_bus_get", limit });
  },
  postMessage(input: { fromAgentId: string; toAgentId: string; kind: string; body: string; groupId?: string; runId?: string }) {
    return sendDesktopRequest({
      type: "agent_message_post",
      fromAgentId: input.fromAgentId.trim(),
      toAgentId: input.toAgentId.trim(),
      kind: input.kind.trim() || "message",
      body: input.body.trim(),
      groupId: input.groupId?.trim() || undefined,
      runId: input.runId?.trim() || undefined
    });
  },
  putBoard(input: { agentId: string; key: string; value: string; status: string; priority: string; groupId?: string; runId?: string }) {
    return sendDesktopRequest({
      type: "agent_board_put",
      agentId: input.agentId.trim(),
      key: input.key.trim(),
      value: input.value.trim(),
      status: input.status.trim() || "running",
      priority: input.priority.trim() || "normal",
      groupId: input.groupId?.trim() || undefined,
      runId: input.runId?.trim() || undefined
    });
  },
  emitLifecycle(input: { agentId: string; state: string; detail: string; groupId?: string; runId?: string }) {
    return sendDesktopRequest({
      type: "agent_lifecycle_emit",
      agentId: input.agentId.trim(),
      state: input.state.trim(),
      detail: input.detail.trim(),
      groupId: input.groupId?.trim() || undefined,
      runId: input.runId?.trim() || undefined
    });
  },
  postGroupCommand(input: { fromAgentId: string; command: string; body: string; groupId?: string; runId?: string }) {
    return sendDesktopRequest({
      type: "agent_group_command",
      fromAgentId: input.fromAgentId.trim(),
      command: input.command.trim(),
      body: input.body.trim(),
      groupId: input.groupId?.trim() || undefined,
      runId: input.runId?.trim() || undefined
    });
  },
  watchdog(limit = 100) {
    return sendDesktopRequest({ type: "agent_watchdog_snapshot_get", limit });
  },
  worktree() {
    return sendDesktopRequest({ type: "agent_worktree_snapshot_get" });
  },
  trace(limit = 100) {
    return sendDesktopRequest({ type: "multi_agent_trace_snapshot_get", limit });
  }
};

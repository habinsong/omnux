import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 멀티 에이전트 버스 / watchdog / worktree 스냅샷 (backend_feature_frontend.md, read-only).
registerDesktopRequestTypes(
  "agent_bus_get",
  "agent_watchdog_snapshot_get",
  "agent_worktree_snapshot_get",
  "multi_agent_trace_snapshot_get"
);

export const requestDesktopAgents = {
  bus(limit = 100) {
    return sendDesktopRequest({ type: "agent_bus_get", limit });
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

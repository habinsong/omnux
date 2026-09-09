import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// backend_feature_frontend.md 신규 read-only 스냅샷 WS 이벤트.
// middleware 디렉터리 안이므로 sendDesktopRequest 직접 사용 허용(계약 경계).
registerDesktopRequestTypes(
  "telemetry_snapshot_get",
  "doctor_get_last",
  "mcp_servers_list",
  "local_llm_snapshot_get",
  "terminal_capabilities_get",
  "git_time_machine_snapshot_get",
  "agent_bus_get",
  "semantic_search_readiness_get",
  "code_repomap_snapshot_get",
  "commit_learning_snapshot_get",
  "self_improvement_snapshot_get"
);

export const requestDesktopInsights = {
  telemetry(limit = 100, requestId?: string) {
    return sendDesktopRequest({ type: "telemetry_snapshot_get", limit, requestId });
  },
  doctorLast(requestId?: string) {
    return sendDesktopRequest({ type: "doctor_get_last", requestId });
  },
  mcpServers(requestId?: string) {
    return sendDesktopRequest({ type: "mcp_servers_list", requestId });
  },
  localLlm(requestId?: string) {
    return sendDesktopRequest({ type: "local_llm_snapshot_get", requestId });
  },
  terminal(requestId?: string) {
    return sendDesktopRequest({ type: "terminal_capabilities_get", requestId });
  },
  gitTimeMachine(limit = 30, requestId?: string) {
    return sendDesktopRequest({ type: "git_time_machine_snapshot_get", limit, requestId });
  },
  agentBus(limit = 100) {
    return sendDesktopRequest({ type: "agent_bus_get", limit });
  },
  semanticSearch(requestId?: string) {
    return sendDesktopRequest({ type: "semantic_search_readiness_get", requestId });
  },
  codeRepomap(limit = 80, requestId?: string) {
    return sendDesktopRequest({ type: "code_repomap_snapshot_get", limit, requestId });
  },
  commitLearning(limit = 30, requestId?: string) {
    return sendDesktopRequest({ type: "commit_learning_snapshot_get", limit, requestId });
  },
  selfImprovement(limit = 30, requestId?: string) {
    return sendDesktopRequest({ type: "self_improvement_snapshot_get", limit, requestId });
  }
};

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
  telemetry(limit = 100) {
    return sendDesktopRequest({ type: "telemetry_snapshot_get", limit });
  },
  doctorLast() {
    return sendDesktopRequest({ type: "doctor_get_last" });
  },
  mcpServers() {
    return sendDesktopRequest({ type: "mcp_servers_list" });
  },
  localLlm() {
    return sendDesktopRequest({ type: "local_llm_snapshot_get" });
  },
  terminal() {
    return sendDesktopRequest({ type: "terminal_capabilities_get" });
  },
  gitTimeMachine(limit = 30) {
    return sendDesktopRequest({ type: "git_time_machine_snapshot_get", limit });
  },
  agentBus(limit = 100) {
    return sendDesktopRequest({ type: "agent_bus_get", limit });
  },
  semanticSearch() {
    return sendDesktopRequest({ type: "semantic_search_readiness_get" });
  },
  codeRepomap(limit = 80) {
    return sendDesktopRequest({ type: "code_repomap_snapshot_get", limit });
  },
  commitLearning(limit = 30) {
    return sendDesktopRequest({ type: "commit_learning_snapshot_get", limit });
  },
  selfImprovement(limit = 30) {
    return sendDesktopRequest({ type: "self_improvement_snapshot_get", limit });
  }
};

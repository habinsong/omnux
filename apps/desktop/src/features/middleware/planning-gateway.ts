import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 에이전트 플래닝 + 태스크 그래프 (옛 omninode-dashboard ws-plans/ws-tasks).
registerDesktopRequestTypes(
  "plan_list", "plan_get", "plan_create", "plan_review", "plan_approve", "plan_run",
  "task_graph_list", "task_graph_get", "task_graph_create", "task_graph_run", "task_cancel", "task_output_get"
);

export const requestDesktopPlan = {
  list() {
    return sendDesktopRequest({ type: "plan_list" });
  },
  get(planId: string) {
    return sendDesktopRequest({ type: "plan_get", planId });
  },
  create(objective: string, mode = "fast") {
    return sendDesktopRequest({ type: "plan_create", text: objective.trim(), constraints: [], mode });
  },
  review(planId: string) {
    return sendDesktopRequest({ type: "plan_review", planId });
  },
  approve(planId: string) {
    return sendDesktopRequest({ type: "plan_approve", planId });
  },
  run(planId: string) {
    return sendDesktopRequest({ type: "plan_run", planId });
  }
};

export const requestDesktopTaskGraph = {
  list() {
    return sendDesktopRequest({ type: "task_graph_list" });
  },
  get(graphId: string) {
    return sendDesktopRequest({ type: "task_graph_get", graphId });
  },
  create(planId: string) {
    return sendDesktopRequest({ type: "task_graph_create", planId });
  },
  run(graphId: string) {
    return sendDesktopRequest({ type: "task_graph_run", graphId });
  },
  cancel(graphId: string, taskId: string) {
    return sendDesktopRequest({ type: "task_cancel", graphId, taskId });
  },
  output(graphId: string, taskId: string) {
    return sendDesktopRequest({ type: "task_output_get", graphId, taskId });
  }
};

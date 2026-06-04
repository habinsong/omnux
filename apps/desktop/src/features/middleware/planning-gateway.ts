import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 에이전트 플래닝 + 태스크 그래프 (정적 대시보드 ws-plans/ws-tasks 흐름).
registerDesktopRequestTypes(
  "plan_list", "plan_get", "plan_create", "plan_review", "plan_approve", "plan_run", "plan_update",
  "task_graph_list", "task_graph_get", "task_graph_create", "task_graph_update", "task_graph_run", "task_cancel", "task_retry", "task_resume", "task_output_get"
);

// task_graph_update가 받는 node 구조(백엔드 BuildUpdatedNodes 기준).
export interface TaskNodeInput {
  taskId: string;
  title: string;
  category: string;
  prompt: string;
  dependsOn: string[];
  requiredSkills: string[];
  requiredTools: string[];
}

export const requestDesktopPlan = {
  list() {
    return sendDesktopRequest({ type: "plan_list" });
  },
  get(planId: string) {
    return sendDesktopRequest({ type: "plan_get", planId });
  },
  create(objective: string, mode = "fast", constraints: string[] = [], conversationId?: string | null) {
    return sendDesktopRequest({
      type: "plan_create",
      text: objective.trim(),
      constraints,
      mode,
      conversationId: conversationId?.trim() || undefined
    });
  },
  review(planId: string) {
    return sendDesktopRequest({ type: "plan_review", planId });
  },
  approve(planId: string) {
    return sendDesktopRequest({ type: "plan_approve", planId });
  },
  run(planId: string) {
    return sendDesktopRequest({ type: "plan_run", planId });
  },
  update(planId: string, patch: { title: string; objective: string; constraints: string[] }) {
    return sendDesktopRequest({
      type: "plan_update",
      planId,
      plan: patch
    });
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
  update(graphId: string, nodes: TaskNodeInput[]) {
    return sendDesktopRequest({
      type: "task_graph_update",
      graphId,
      graph: {
        nodes: nodes.map((node) => ({
          taskId: node.taskId,
          title: node.title.trim(),
          category: node.category.trim() || "coding",
          prompt: node.prompt.trim(),
          dependsOn: node.dependsOn,
          requiredSkills: node.requiredSkills,
          requiredTools: node.requiredTools
        }))
      }
    });
  },
  run(graphId: string) {
    return sendDesktopRequest({ type: "task_graph_run", graphId });
  },
  cancel(graphId: string, taskId: string) {
    return sendDesktopRequest({ type: "task_cancel", graphId, taskId });
  },
  retry(graphId: string, taskId: string) {
    return sendDesktopRequest({ type: "task_retry", graphId, taskId });
  },
  resume(graphId: string) {
    return sendDesktopRequest({ type: "task_resume", graphId });
  },
  output(graphId: string, taskId: string) {
    return sendDesktopRequest({ type: "task_output_get", graphId, taskId });
  }
};

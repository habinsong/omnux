import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type TaskWorkspaceCommand =
  | "plan_list" | "plan_get" | "plan_create" | "plan_review" | "plan_approve" | "plan_update" | "plan_run"
  | "task_graph_list" | "task_graph_get" | "task_graph_create" | "task_graph_update" | "task_graph_run"
  | "task_retry" | "task_cancel" | "task_graph_cancel" | "task_resume" | "task_output_get";

registerDesktopRequestTypes(
  "plan_list", "plan_get", "plan_create", "plan_review", "plan_approve", "plan_update", "plan_run",
  "task_graph_list", "task_graph_get", "task_graph_create", "task_graph_update", "task_graph_run",
  "task_retry", "task_cancel", "task_graph_cancel", "task_resume", "task_output_get"
);

export function sendTaskWorkspaceCommand(type: TaskWorkspaceCommand, requestId: string, fields: Record<string, unknown> = {}) {
  return sendDesktopRequest({ type, requestId, ...fields });
}

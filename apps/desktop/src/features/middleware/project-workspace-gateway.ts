import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type ProjectCommand = "projects_list" | "project_create" | "project_update" | "project_delete" | "project_touch" | "project_folders_list";
registerDesktopRequestTypes("projects_list", "project_create", "project_update", "project_delete", "project_touch", "project_folders_list");
export function projectRequestId() { return `project-workspace-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
export function sendProjectCommand(type: ProjectCommand, requestId: string, fields: Record<string, unknown> = {}) {
  return sendDesktopRequest({ ...fields, type, requestId });
}

import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type AutomationCommand = "get_routines" | "get_routine_scheduler_status" | "preview_routine" | "create_routine" | "update_routine" | "run_routine" | "toggle_routine" | "delete_routine" | "get_routine_run_detail" | "resend_routine_run_telegram";
registerDesktopRequestTypes("get_routines", "get_routine_scheduler_status", "preview_routine", "create_routine", "update_routine", "run_routine", "toggle_routine", "delete_routine", "get_routine_run_detail", "resend_routine_run_telegram");
export function sendAutomationCommand(type: AutomationCommand, requestId: string, fields: Record<string, unknown> = {}) {
  return sendDesktopRequest({ type, requestId, ...fields });
}

import { DESKTOP_MIDDLEWARE_HTTP_ORIGIN } from "../../middleware-contract";
import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type BuildCommand = "projects_list" | "project_build_preview" | "project_build_apply" | "coding_run_single" | "coding_run_orchestration" | "coding_run_multi" | "coding_cancel" | "coding_execute_result" | "list_conversations" | "get_conversation" | "update_conversation_meta" | "delete_conversation" | "skills_list" | "list_memory_notes";
registerDesktopRequestTypes("projects_list", "project_build_preview", "project_build_apply", "coding_run_single", "coding_run_orchestration", "coding_run_multi", "coding_cancel", "coding_execute_result", "list_conversations", "get_conversation", "update_conversation_meta", "delete_conversation", "skills_list", "list_memory_notes");
export function sendBuildCommand(type: BuildCommand, requestId: string, fields: Record<string, unknown> = {}) { return sendDesktopRequest({ type, requestId, ...fields }); }
export function codingFileUrl(conversationId: string, target: string, path: string) {
  if (!conversationId || !/^(main|worker-\d+)$/.test(target) || !path || path.split("/").some(part => part === ".." || part === ".")) return "";
  return `${DESKTOP_MIDDLEWARE_HTTP_ORIGIN}/api/coding-preview/${encodeURIComponent(conversationId)}/${target}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export function localPreviewUrl(value: string) {
  if (!value) return "";
  try { const url = new URL(value, DESKTOP_MIDDLEWARE_HTTP_ORIGIN); return url.origin === DESKTOP_MIDDLEWARE_HTTP_ORIGIN && url.pathname.startsWith("/api/coding-preview/") ? url.href : ""; } catch { return ""; }
}
export async function readCodingFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`파일을 읽지 못했습니다. HTTP ${response.status}`);
  const mime = response.headers.get("content-type") || "";
  if (mime.startsWith("image/")) return { kind: "image" as const, content: "", truncated: false };
  const content = await response.text();
  return { kind: "text" as const, content: content.slice(0, 120000), truncated: content.length > 120000 };
}

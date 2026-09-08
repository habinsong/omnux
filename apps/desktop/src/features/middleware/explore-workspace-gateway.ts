import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type ExploreCommand = "web_search" | "web_fetch" | "sessions_list" | "sessions_history" | "sessions_send" | "sessions_spawn" | "browser" | "canvas";
registerDesktopRequestTypes("web_search", "web_fetch", "sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "browser", "canvas");
export function exploreRequestId() { return `explore-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
export function sendExploreCommand(type: ExploreCommand, requestId: string, fields: Record<string, unknown> = {}) {
  return sendDesktopRequest({ ...fields, type, requestId });
}

import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";

export type DesktopServerMessage = Record<string, unknown> & {
  type?: string;
};

export type DesktopRequestType =
  | "request_otp"
  | "resume_auth"
  | "auth"
  | "doctor_get_last"
  | "plan_list"
  | "task_graph_list"
  | "list_conversations"
  | "get_conversation"
  | "create_conversation"
  | "update_conversation_meta"
  | "delete_conversation"
  | "conversation_search"
  | "llm_chat_single"
  | "list_memory_notes"
  | "read_memory_note"
  | "create_memory_note"
  | "delete_memory_notes"
  | "rename_memory_note"
  | "clear_memory"
  | "memory_search"
  | "backup_export_prepare"
  | "backup_import_preview"
  | "backup_import_apply"
  | "web_search"
  | "web_fetch"
  | "sessions_list"
  | "sessions_history"
  | "browser"
  | "canvas"
  | "get_routines"
  | "run_routine"
  | "delete_routine"
  | "create_routine"
  | "preview_routine";

export type DesktopRequestPayload = Record<string, unknown> & {
  type: DesktopRequestType;
};

export type DesktopMessageListener = (message: DesktopServerMessage) => void;

const DESKTOP_ALLOWED_REQUESTS = new Set<DesktopRequestType>([
  "request_otp",
  "resume_auth",
  "auth",
  "doctor_get_last",
  "plan_list",
  "task_graph_list",
  "list_conversations",
  "get_conversation",
  "create_conversation",
  "update_conversation_meta",
  "delete_conversation",
  "conversation_search",
  "llm_chat_single",
  "list_memory_notes",
  "read_memory_note",
  "create_memory_note",
  "delete_memory_notes",
  "rename_memory_note",
  "clear_memory",
  "memory_search",
  "backup_export_prepare",
  "backup_import_preview",
  "backup_import_apply",
  "web_search",
  "web_fetch",
  "sessions_list",
  "sessions_history",
  "browser",
  "canvas",
  "get_routines",
  "run_routine",
  "delete_routine",
  "create_routine",
  "preview_routine"
]);
const DESKTOP_PUBLIC_REQUESTS = new Set<DesktopRequestType>([
  "request_otp",
  "resume_auth",
  "auth"
]);

const listeners = new Set<DesktopMessageListener>();
let sessionSocket: WebSocket | null = null;

export function bindDesktopSessionSocket(socket: WebSocket | null) {
  sessionSocket = socket;
}

export function publishDesktopMessage(message: DesktopServerMessage) {
  listeners.forEach((listener) => listener(message));
}

export function subscribeDesktopMessages(listener: DesktopMessageListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function sendDesktopRequest(payload: DesktopRequestPayload): boolean {
  if (!DESKTOP_ALLOWED_REQUESTS.has(payload.type)) {
    useDesktopShellStore.getState().markBridgeStatus("error", "데스크톱 WS 게이트웨이에 등록되지 않은 요청이다.");
    return false;
  }

  if (!DESKTOP_PUBLIC_REQUESTS.has(payload.type) && useDesktopAuthStore.getState().auth.status !== "authenticated") {
    useDesktopShellStore.getState().markBridgeStatus("error", "인증 후 데스크톱 WS 요청을 보낼 수 있다.");
    return false;
  }

  if (!sessionSocket || sessionSocket.readyState !== WebSocket.OPEN) {
    useDesktopShellStore.getState().markBridgeStatus("error", "데스크톱 WS 브릿지가 연결되지 않았다.");
    return false;
  }

  sessionSocket.send(JSON.stringify(payload));
  return true;
}

function normalizeToolActionPayload(action: string, extra: Record<string, unknown> = {}) {
  const url = typeof extra.url === "string" ? extra.url.trim() : "";
  const rest = Object.fromEntries(
    Object.entries(extra).filter(([key]) => key !== "url" && key !== "action" && key !== "type")
  );
  return {
    action,
    ...rest,
    ...(url ? { webFetchUrl: url } : {})
  };
}

export const requestDesktopAuth = {
  otp() {
    return sendDesktopRequest({ type: "request_otp" });
  },
  resume(sessionId: string, authToken: string) {
    return sendDesktopRequest({ type: "resume_auth", sessionId, authToken });
  },
  submit(otp: string, authTtlHours = 24) {
    return sendDesktopRequest({ type: "auth", otp, authTtlHours });
  }
};

export const requestDesktopOps = {
  doctorLast() {
    return sendDesktopRequest({ type: "doctor_get_last" });
  },
  planList() {
    return sendDesktopRequest({ type: "plan_list" });
  },
  taskGraphList() {
    return sendDesktopRequest({ type: "task_graph_list" });
  }
};

export const requestDesktopAsk = {
  listConversations(scope = "chat", mode = "single") {
    return sendDesktopRequest({ type: "list_conversations", scope, mode });
  },
  getConversation(conversationId: string) {
    return sendDesktopRequest({ type: "get_conversation", conversationId });
  },
  createConversation(scope = "chat", mode = "single") {
    return sendDesktopRequest({ type: "create_conversation", scope, mode });
  },
  updateConversationMeta(conversationId: string, conversationTitle: string) {
    return sendDesktopRequest({ type: "update_conversation_meta", conversationId, conversationTitle });
  },
  deleteConversation(conversationId: string, scope = "chat", mode = "single") {
    return sendDesktopRequest({ type: "delete_conversation", conversationId, scope, mode });
  },
  searchConversation(query: string, maxResults = 20) {
    return sendDesktopRequest({ type: "conversation_search", query, maxResults });
  },
  createMemoryNote(conversationId: string, compactConversation = false) {
    return sendDesktopRequest({ type: "create_memory_note", conversationId, compactConversation });
  },
  chatSingle(text: string, conversationId?: string | null) {
    return sendDesktopRequest({ type: "llm_chat_single", text, scope: "chat", mode: "single", conversationId: conversationId || undefined });
  }
};

export const requestDesktopExplore = {
  webSearch(query: string, count = 8) {
    return sendDesktopRequest({ type: "web_search", query, count });
  },
  webFetch(webFetchUrl: string, extractMode = "text", maxChars = 8000) {
    return sendDesktopRequest({ type: "web_fetch", webFetchUrl, extractMode, maxChars });
  },
  sessionsList(limit = 30) {
    return sendDesktopRequest({ type: "sessions_list", limit });
  },
  sessionsHistory(sessionKey: string, limit = 50) {
    return sendDesktopRequest({ type: "sessions_history", sessionKey, limit });
  },
  browser(action: string, extra: Record<string, unknown> = {}) {
    return sendDesktopRequest({ type: "browser", ...normalizeToolActionPayload(action, extra) });
  },
  canvas(action: string, extra: Record<string, unknown> = {}) {
    return sendDesktopRequest({ type: "canvas", ...normalizeToolActionPayload(action, extra) });
  }
};

export const requestDesktopSettings = {
  listMemoryNotes() {
    return sendDesktopRequest({ type: "list_memory_notes" });
  },
  readMemoryNote(noteName: string) {
    return sendDesktopRequest({ type: "read_memory_note", noteName });
  },
  renameMemoryNote(noteName: string, newName: string) {
    return sendDesktopRequest({ type: "rename_memory_note", noteName, newName });
  },
  deleteMemoryNotes(memoryNotes: string[]) {
    return sendDesktopRequest({ type: "delete_memory_notes", memoryNotes });
  },
  clearMemory(scope = "chat") {
    return sendDesktopRequest({ type: "clear_memory", scope });
  },
  memorySearch(query: string, maxResults = 10, minScore = 0) {
    return sendDesktopRequest({ type: "memory_search", query, maxResults, minScore });
  },
  backupExportPrepare(includeScopes: string[]) {
    return sendDesktopRequest({ type: "backup_export_prepare", includeScopes });
  },
  backupImportPreview(fileName: string, contentBase64: string) {
    return sendDesktopRequest({ type: "backup_import_preview", fileName, contentBase64 });
  },
  backupImportApply(previewId: string, overwrite = false) {
    return sendDesktopRequest({ type: "backup_import_apply", previewId, overwrite });
  }
};

export const requestDesktopRoutine = {
  listRoutines() {
    return sendDesktopRequest({ type: "get_routines" });
  },
  runRoutine(routineId: string) {
    return sendDesktopRequest({ type: "run_routine", routineId });
  },
  deleteRoutine(routineId: string) {
    return sendDesktopRequest({ type: "delete_routine", routineId });
  },
  previewRoutine(form: RoutineCreateInput) {
    return sendDesktopRequest({ type: "preview_routine", ...buildRoutinePreviewPayload(form) });
  },
  createRoutine(form: RoutineCreateInput) {
    return sendDesktopRequest({ type: "create_routine", ...buildRoutineCreatePayload(form) });
  }
};

// React 폼 입력 → 미들웨어 routine 필드 변환. UI는 폼만 넘기고 필드명/형변환은 gateway가 맡는다.
export interface RoutineCreateInput {
  title: string;
  request: string;
  scheduleKind: string;
  scheduleTime: string;
  weekdays: number[];
  dayOfMonth: number;
  runImmediately: boolean;
  notifyTelegram: boolean;
}

function buildRoutineSchedulePayload(form: RoutineCreateInput): Record<string, unknown> {
  const kind = form.scheduleKind || "manual";
  const payload: Record<string, unknown> = { scheduleKind: kind };
  if (kind === "daily" || kind === "weekly" || kind === "monthly") {
    payload.scheduleTime = form.scheduleTime || "08:00";
  }
  if (kind === "weekly") {
    payload.weekdays = Array.isArray(form.weekdays) ? form.weekdays : [];
  }
  if (kind === "monthly") {
    payload.dayOfMonth = form.dayOfMonth || 1;
  }
  return payload;
}

function buildRoutinePreviewPayload(form: RoutineCreateInput): Record<string, unknown> {
  return { text: form.request.trim(), ...buildRoutineSchedulePayload(form) };
}

function buildRoutineCreatePayload(form: RoutineCreateInput): Record<string, unknown> {
  return {
    text: form.request.trim(),
    title: form.title.trim(),
    runImmediately: !!form.runImmediately,
    notifyTelegram: !!form.notifyTelegram,
    ...buildRoutineSchedulePayload(form)
  };
}

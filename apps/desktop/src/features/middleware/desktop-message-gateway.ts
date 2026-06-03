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
  | "projects_list"
  | "project_create"
  | "project_update"
  | "project_delete"
  | "project_touch"
  | "list_conversations"
  | "get_conversation"
  | "create_conversation"
  | "update_conversation_meta"
  | "delete_conversation"
  | "conversation_search"
  | "llm_chat_single"
  | "llm_chat_orchestration"
  | "llm_chat_multi"
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
  | "get_cerebras_models"
  | "get_groq_models"
  | "get_copilot_models"
  | "set_groq_model"
  | "set_copilot_model"
  | "get_copilot_status"
  | "get_codex_status"
  | "get_usage_stats"
  | "set_llm_credentials"
  | "delete_llm_credentials"
  | "start_copilot_login"
  | "web_search"
  | "web_fetch"
  | "sessions_list"
  | "sessions_history"
  | "sessions_send"
  | "sessions_spawn"
  | "browser"
  | "canvas"
  | "get_routines"
  | "run_routine"
  | "update_routine"
  | "toggle_routine"
  | "delete_routine"
  | "create_routine"
  | "preview_routine"
  | "coding_run_single"
  | "coding_run_orchestration"
  | "coding_run_multi"
  | "coding_execute_result"
  | "refactor_restore"
  | "logic_graph_list"
  | "logic_graph_get"
  | "logic_graph_save"
  | "logic_graph_delete"
  | "logic_graph_run"
  | "logic_graph_run_get"
  | "logic_graph_cancel";

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
  "projects_list",
  "project_create",
  "project_update",
  "project_delete",
  "project_touch",
  "list_conversations",
  "get_conversation",
  "create_conversation",
  "update_conversation_meta",
  "delete_conversation",
  "conversation_search",
  "llm_chat_single",
  "llm_chat_orchestration",
  "llm_chat_multi",
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
  "get_cerebras_models",
  "get_groq_models",
  "get_copilot_models",
  "set_groq_model",
  "set_copilot_model",
  "get_copilot_status",
  "get_codex_status",
  "get_usage_stats",
  "set_llm_credentials",
  "delete_llm_credentials",
  "start_copilot_login",
  "web_search",
  "web_fetch",
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "sessions_spawn",
  "browser",
  "canvas",
  "get_routines",
  "run_routine",
  "update_routine",
  "toggle_routine",
  "delete_routine",
  "create_routine",
  "preview_routine",
  "coding_run_single",
  "coding_run_orchestration",
  "coding_run_multi",
  "coding_execute_result",
  "refactor_restore",
  "logic_graph_list",
  "logic_graph_get",
  "logic_graph_save",
  "logic_graph_delete",
  "logic_graph_run",
  "logic_graph_run_get",
  "logic_graph_cancel"
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
  chat(mode: "single" | "orchestration" | "multi", text: string, conversationId?: string | null) {
    const type =
      mode === "orchestration"
        ? "llm_chat_orchestration"
        : mode === "multi"
          ? "llm_chat_multi"
          : "llm_chat_single";
    return sendDesktopRequest({ type, text, scope: "chat", mode, conversationId: conversationId || undefined });
  },
  chatSingle(text: string, conversationId?: string | null) {
    return requestDesktopAsk.chat("single", text, conversationId);
  }
};

export const requestDesktopProjects = {
  listProjects() {
    return sendDesktopRequest({ type: "projects_list" });
  },
  createProject(name: string, filePath: string, description: string, color: string) {
    return sendDesktopRequest({
      type: "project_create",
      title: name.trim() || undefined,
      filePath: filePath.trim(),
      message: description.trim() || undefined,
      category: color.trim() || undefined
    });
  },
  updateProject(projectKey: string, name: string, filePath: string, description: string, color: string, isMain = false) {
    return sendDesktopRequest({
      type: "project_update",
      projectKey: projectKey.trim(),
      title: name.trim() || undefined,
      filePath: filePath.trim() || undefined,
      message: description.trim(),
      category: color.trim() || undefined,
      enabled: isMain ? true : undefined
    });
  },
  deleteProject(projectKey: string) {
    return sendDesktopRequest({ type: "project_delete", projectKey: projectKey.trim() });
  },
  touchProject(projectKey: string) {
    return sendDesktopRequest({ type: "project_touch", projectKey: projectKey.trim() });
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
  sessionsSend(sessionKey: string, message: string, timeoutSeconds = 60) {
    return sendDesktopRequest({ type: "sessions_send", sessionKey, message, timeoutSeconds });
  },
  sessionsSpawn(task: string, runtime = "acp", mode = "run", label = "", runTimeoutSeconds = 900, thread = true) {
    return sendDesktopRequest({
      type: "sessions_spawn",
      spawnTask: task,
      runtime,
      mode,
      label: label.trim() || undefined,
      runTimeoutSeconds,
      timeoutSeconds: runTimeoutSeconds,
      thread
    });
  },
  sessionsSpawnStatus() {
    return sendDesktopRequest({ type: "sessions_spawn", action: "status" });
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
  },
  cerebrasModels() {
    return sendDesktopRequest({ type: "get_cerebras_models" });
  }
};

export interface LlmCredentialInput {
  groqApiKey?: string;
  geminiApiKey?: string;
  cerebrasApiKey?: string;
}

export const requestDesktopLlm = {
  groqModels() {
    return sendDesktopRequest({ type: "get_groq_models" });
  },
  copilotModels() {
    return sendDesktopRequest({ type: "get_copilot_models" });
  },
  setGroqModel(model: string) {
    return sendDesktopRequest({ type: "set_groq_model", model: model.trim() });
  },
  setCopilotModel(model: string) {
    return sendDesktopRequest({ type: "set_copilot_model", model: model.trim() });
  },
  copilotStatus() {
    return sendDesktopRequest({ type: "get_copilot_status" });
  },
  codexStatus() {
    return sendDesktopRequest({ type: "get_codex_status" });
  },
  usageStats() {
    return sendDesktopRequest({ type: "get_usage_stats" });
  },
  startCopilotLogin() {
    return sendDesktopRequest({ type: "start_copilot_login" });
  },
  setCredentials(keys: LlmCredentialInput, persist = true) {
    return sendDesktopRequest({
      type: "set_llm_credentials",
      groqApiKey: keys.groqApiKey?.trim() || undefined,
      geminiApiKey: keys.geminiApiKey?.trim() || undefined,
      cerebrasApiKey: keys.cerebrasApiKey?.trim() || undefined,
      persist
    });
  },
  deleteCredentials(persist = false) {
    return sendDesktopRequest({ type: "delete_llm_credentials", persist });
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
  toggleRoutine(routineId: string, enabled: boolean) {
    return sendDesktopRequest({ type: "toggle_routine", routineId, enabled });
  },
  previewRoutine(form: RoutineCreateInput) {
    return sendDesktopRequest({ type: "preview_routine", ...buildRoutinePreviewPayload(form) });
  },
  createRoutine(form: RoutineCreateInput) {
    return sendDesktopRequest({ type: "create_routine", ...buildRoutineCreatePayload(form) });
  },
  updateRoutine(routineId: string, form: RoutineCreateInput) {
    return sendDesktopRequest({ type: "update_routine", routineId, ...buildRoutineCreatePayload(form), runImmediately: false });
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

export const requestDesktopCoding = {
  run(mode: "single" | "orchestration" | "multi", input: string, conversationId?: string) {
    const type =
      mode === "orchestration"
        ? "coding_run_orchestration"
        : mode === "multi"
          ? "coding_run_multi"
          : "coding_run_single";
    const payload: Record<string, unknown> = {
      type,
      text: input.trim(),
      scope: "coding",
      mode
    };
    if (conversationId) {
      payload.conversationId = conversationId;
    }
    return sendDesktopRequest(payload as DesktopRequestPayload);
  },
  runSingle(input: string, conversationId?: string) {
    return requestDesktopCoding.run("single", input, conversationId);
  },
  executeLatest(conversationId: string, standardInput?: string) {
    return sendDesktopRequest({
      type: "coding_execute_result",
      conversationId: conversationId.trim(),
      standardInput: standardInput || undefined
    });
  }
};

export const requestDesktopRefactor = {
  restore(rollbackId: string) {
    return sendDesktopRequest({ type: "refactor_restore", rollbackId: rollbackId.trim() });
  }
};

export const requestDesktopLogic = {
  listGraphs() {
    return sendDesktopRequest({ type: "logic_graph_list" });
  },
  getGraph(graphId: string) {
    return sendDesktopRequest({ type: "logic_graph_get", graphId: graphId.trim() });
  },
  saveGraph(graphId: string, logicGraphJson: string) {
    return sendDesktopRequest({ type: "logic_graph_save", graphId: graphId.trim() || undefined, logicGraphJson });
  },
  deleteGraph(graphId: string) {
    return sendDesktopRequest({ type: "logic_graph_delete", graphId: graphId.trim() });
  },
  runGraph(graphId: string, runInput?: string) {
    const payload: Record<string, unknown> = { type: "logic_graph_run", graphId: graphId.trim() };
    if (runInput && runInput.trim()) {
      payload.logicRunInput = runInput.trim();
    }
    return sendDesktopRequest(payload as DesktopRequestPayload);
  },
  getRun(logicRunId: string) {
    return sendDesktopRequest({ type: "logic_graph_run_get", logicRunId: logicRunId.trim() });
  },
  cancelRun(logicRunId: string) {
    return sendDesktopRequest({ type: "logic_graph_cancel", logicRunId: logicRunId.trim() });
  }
};

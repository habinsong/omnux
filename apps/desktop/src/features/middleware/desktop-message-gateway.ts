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
  | "sync_config_read"
  | "sync_config_write"
  | "cloud_sync_upload"
  | "cloud_sync_download"
  | "get_cerebras_models"
  | "web_search"
  | "web_fetch"
  | "sessions_list"
  | "sessions_history"
  | "sessions_send"
  | "sessions_spawn"
  | "browser"
  | "canvas"
  | "get_routines"
  | "get_routine_scheduler_status"
  | "run_routine"
  | "test_routine_telegram"
  | "test_browser_agent_routine"
  | "get_routine_run_detail"
  | "resend_routine_run_telegram"
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
  | "logic_graph_cancel"
  | "skills_list"
  | "skill_get"
  | "skill_save"
  | "skill_delete"
  | "skill_active_clear";

export type DesktopRequestPayload = Record<string, unknown> & {
  type: DesktopRequestType;
};

export type DesktopMessageListener = (message: DesktopServerMessage) => void;

const DESKTOP_ALLOWED_REQUESTS = new Set<string>([
  "request_otp", "resume_auth", "auth", "doctor_get_last", "plan_list", "task_graph_list",
  "projects_list", "project_create", "project_update", "project_delete", "project_touch",
  "list_conversations", "get_conversation", "create_conversation", "update_conversation_meta",
  "delete_conversation", "conversation_search", "llm_chat_single", "llm_chat_orchestration", "llm_chat_multi",
  "list_memory_notes", "read_memory_note", "create_memory_note", "delete_memory_notes", "rename_memory_note",
  "clear_memory", "memory_search", "backup_export_prepare", "backup_import_preview", "backup_import_apply",
  "sync_config_read", "sync_config_write", "cloud_sync_upload", "cloud_sync_download",
  "get_cerebras_models", "web_search", "web_fetch", "sessions_list", "sessions_history", "sessions_send",
  "sessions_spawn", "browser", "canvas", "get_routines", "get_routine_scheduler_status", "run_routine",
  "test_routine_telegram", "test_browser_agent_routine", "get_routine_run_detail", "resend_routine_run_telegram",
  "update_routine", "toggle_routine", "delete_routine", "create_routine", "preview_routine", "coding_run_single", "coding_run_orchestration",
  "coding_run_multi", "coding_execute_result", "refactor_restore", "logic_graph_list", "logic_graph_get",
  "logic_graph_save", "logic_graph_delete", "logic_graph_run", "logic_graph_run_get", "logic_graph_cancel",
  "skills_list", "skill_get", "skill_save", "skill_delete", "skill_active_clear"
]);
const DESKTOP_PUBLIC_REQUESTS = new Set<string>([
  "request_otp",
  "resume_auth",
  "auth",
  "get_cerebras_models"
]);
const READ_ONLY_DEDUPE_WINDOW_MS = 1200;
const MAX_PENDING_READ_ONLY_REQUESTS = 64;
const READ_ONLY_DEDUPE_REQUESTS = new Set<string>([
  "doctor_get_last",
  "get_settings",
  "get_setup_state",
  "get_groq_models",
  "get_copilot_models",
  "get_cerebras_models",
  "get_gemini_models",
  "get_nvidia_models",
  "get_codex_models",
  "get_copilot_status",
  "get_codex_status",
  "get_usage_stats",
  "plan_list",
  "plan_get",
  "task_graph_list",
  "task_graph_get",
  "task_output_get",
  "telemetry_snapshot_get",
  "mcp_servers_list",
  "local_llm_snapshot_get",
  "terminal_capabilities_get",
  "git_time_machine_snapshot_get",
  "agent_bus_get",
  "agent_watchdog_snapshot_get",
  "agent_worktree_snapshot_get",
  "multi_agent_trace_snapshot_get",
  "semantic_search_readiness_get",
  "code_repomap_snapshot_get",
  "commit_learning_snapshot_get",
  "self_improvement_snapshot_get",
  "git_automation_snapshot_get",
  "projects_list",
  "list_conversations",
  "get_conversation",
  "conversation_search",
  "list_memory_notes",
  "read_memory_note",
  "memory_search",
  "sync_config_read",
  "get_routines",
  "get_routine_scheduler_status",
  "get_routine_run_detail",
  "logic_graph_list",
  "logic_graph_get",
  "logic_graph_run_get",
  "context_scan",
  "commands_list",
  "skills_list",
  "skill_get",
  "read_workspace_file",
  "get_metrics",
  "logic_path_list",
  "logic_graph_recovery_list",
  "routing_policy_get",
  "routing_decision_get_last",
  "sessions_list",
  "sessions_history",
  "session_replay_get",
  "notebook_get"
]);
const READ_ONLY_DEDUPE_ACTIONS: Record<string, Set<string>> = {
  cron: new Set(["status", "list", "runs"]),
  nodes: new Set(["status", "pending", "describe"]),
  sessions_spawn: new Set(["status"]),
};
const recentReadOnlyRequests = new Map<string, number>();
const pendingReadOnlyRequests = new Map<string, { payload: { type: string } & Record<string, unknown>; queuedAt: number }>();

/**
 * 도메인별 게이트웨이 파일(features/middleware/*-gateway.ts)이 자신의 요청 타입을
 * allow-list에 등록한다. 보안 경계는 그대로: 외부 page/store는 sendDesktopRequest를
 * 직접 호출하지 못하고(계약 검사) middleware 디렉터리 안에서만 사용한다.
 */
export function registerDesktopRequestTypes(...types: string[]): void {
  for (const type of types) {
    DESKTOP_ALLOWED_REQUESTS.add(type);
  }
}

export function registerDesktopPublicRequestTypes(...types: string[]): void {
  for (const type of types) {
    DESKTOP_ALLOWED_REQUESTS.add(type);
    DESKTOP_PUBLIC_REQUESTS.add(type);
  }
}

const listeners = new Set<DesktopMessageListener>();
let sessionSocket: WebSocket | null = null;

let isAuthSubscribed = false;

export function bindDesktopSessionSocket(socket: WebSocket | null) {
  sessionSocket = socket;

  if (!isAuthSubscribed) {
    isAuthSubscribed = true;
    useDesktopAuthStore.subscribe((state, prev) => {
      if (state.auth.status === "authenticated" && prev.auth.status !== "authenticated") {
        flushPendingReadOnlyRequests();
      }
    });
  }

  if (!socket) return;
  if (socket.readyState === WebSocket.OPEN) {
    if (useDesktopAuthStore.getState().auth.status === "authenticated") {
      flushPendingReadOnlyRequests();
    }
    return;
  }
  socket.addEventListener("open", () => {
    if (sessionSocket === socket) {
      if (useDesktopAuthStore.getState().auth.status === "authenticated") {
        flushPendingReadOnlyRequests();
      }
    }
  }, { once: true });
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

function isReadOnlyDedupeRequest(payload: { type: string } & Record<string, unknown>): boolean {
  if (READ_ONLY_DEDUPE_REQUESTS.has(payload.type)) return true;
  const action = typeof payload.action === "string" ? payload.action : "";
  return Boolean(action && READ_ONLY_DEDUPE_ACTIONS[payload.type]?.has(action));
}

function shouldSkipDuplicateReadOnlyRequest(payload: { type: string } & Record<string, unknown>): boolean {
  if (!isReadOnlyDedupeRequest(payload)) return false;
  const now = Date.now();
  for (const [key, sentAt] of recentReadOnlyRequests.entries()) {
    if (now - sentAt > READ_ONLY_DEDUPE_WINDOW_MS) {
      recentReadOnlyRequests.delete(key);
    }
  }
  const key = JSON.stringify(payload);
  const lastSentAt = recentReadOnlyRequests.get(key) || 0;
  if (now - lastSentAt <= READ_ONLY_DEDUPE_WINDOW_MS) {
    return true;
  }
  recentReadOnlyRequests.set(key, now);
  return false;
}

function queueReadOnlyRequest(payload: { type: string } & Record<string, unknown>): boolean {
  if (!isReadOnlyDedupeRequest(payload)) return false;
  const key = JSON.stringify(payload);
  pendingReadOnlyRequests.delete(key);
  pendingReadOnlyRequests.set(key, { payload, queuedAt: Date.now() });
  while (pendingReadOnlyRequests.size > MAX_PENDING_READ_ONLY_REQUESTS) {
    const oldest = pendingReadOnlyRequests.keys().next().value as string | undefined;
    if (!oldest) break;
    pendingReadOnlyRequests.delete(oldest);
  }
  return true;
}

function flushPendingReadOnlyRequests() {
  const socket = sessionSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN || pendingReadOnlyRequests.size === 0) {
    return;
  }
  
  const authStatus = useDesktopAuthStore.getState().auth.status;
  const pending = [...pendingReadOnlyRequests.values()]
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .map((entry) => entry.payload);
  
  pendingReadOnlyRequests.clear();
  
  for (const payload of pending) {
    if (!DESKTOP_PUBLIC_REQUESTS.has(payload.type) && authStatus !== "authenticated") {
      queueReadOnlyRequest(payload);
      continue;
    }
    if (!shouldSkipDuplicateReadOnlyRequest(payload)) {
      socket.send(JSON.stringify(payload));
    }
  }
}

/**
 * 디듀프 trailing 합치기.
 *
 * read-only 요청이 1.2초 디듀프 윈도우에 걸려 지금 전송되지 않으면, 호출자(스토어)는
 * 응답을 기다리며 loading=true로 남는다. 그런데 디듀프된 요청은 응답이 오지 않으므로
 * loading이 영원히 풀리지 않는 락이 생긴다(리소스 사용량 갱신 연타 등).
 *
 * 이를 막기 위해 디듀프된 요청을 모아 두었다가 윈도우가 지난 뒤 한 번 "보장 전송"한다.
 * 그러면 실제 응답이 도착해 어떤 스토어든 loading이 결국 해제된다. 연타해도 같은 payload는
 * 1.2초에 한 번으로 합쳐지므로 spam 방지 의도는 유지된다.
 */
const trailingReadOnlyRequests = new Map<string, { type: string } & Record<string, unknown>>();
let trailingReadOnlyFlushTimer: ReturnType<typeof setTimeout> | null = null;

function coalesceTrailingReadOnlyRequest(payload: { type: string } & Record<string, unknown>): void {
  const key = JSON.stringify(payload);
  trailingReadOnlyRequests.delete(key);
  trailingReadOnlyRequests.set(key, payload);
  while (trailingReadOnlyRequests.size > MAX_PENDING_READ_ONLY_REQUESTS) {
    const oldest = trailingReadOnlyRequests.keys().next().value as string | undefined;
    if (!oldest) break;
    trailingReadOnlyRequests.delete(oldest);
  }
  if (trailingReadOnlyFlushTimer) return;
  trailingReadOnlyFlushTimer = setTimeout(flushTrailingReadOnlyRequests, READ_ONLY_DEDUPE_WINDOW_MS);
}

function flushTrailingReadOnlyRequests(): void {
  trailingReadOnlyFlushTimer = null;
  if (trailingReadOnlyRequests.size === 0) return;
  const items = [...trailingReadOnlyRequests.values()];
  trailingReadOnlyRequests.clear();
  const socket = sessionSocket;
  const authStatus = useDesktopAuthStore.getState().auth.status;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    // 끊긴 상태면 재연결 큐로 넘겨 재연결 후 결국 응답을 받게 한다.
    for (const payload of items) queueReadOnlyRequest(payload);
    return;
  }
  for (const payload of items) {
    if (!DESKTOP_PUBLIC_REQUESTS.has(payload.type) && authStatus !== "authenticated") {
      queueReadOnlyRequest(payload);
      continue;
    }
    // 윈도우가 지난 요청만 실제 전송한다. 아직 윈도우 안이면 그 사이 실제 전송이 있었다는 뜻이고,
    // 그 전송의 응답이 loading을 풀어 주므로 여기서는 버려도 안전하다.
    if (!shouldSkipDuplicateReadOnlyRequest(payload)) {
      socket.send(JSON.stringify(payload));
    }
  }
}

export function sendDesktopRequest(payload: { type: string } & Record<string, unknown>): boolean {
  if (!DESKTOP_ALLOWED_REQUESTS.has(payload.type)) {
    useDesktopShellStore.getState().markBridgeStatus("error", "데스크톱 WS 게이트웨이에 등록되지 않은 요청이다.");
    return false;
  }

  if (!DESKTOP_PUBLIC_REQUESTS.has(payload.type) && useDesktopAuthStore.getState().auth.status !== "authenticated") {
    useDesktopShellStore.getState().markBridgeStatus("error", "인증 후 데스크톱 WS 요청을 보낼 수 있다.");
    return false;
  }

  if (!sessionSocket || sessionSocket.readyState !== WebSocket.OPEN) {
    if (queueReadOnlyRequest(payload)) {
      return true;
    }
    useDesktopShellStore.getState().markBridgeStatus("error", "데스크톱 WS 브릿지가 연결되지 않았다.");
    return false;
  }

  if (shouldSkipDuplicateReadOnlyRequest(payload)) {
    // 디듀프됨: 지금은 안 보내지만 윈도우 후 한 번 보장 전송해 호출자 loading 락을 방지한다.
    coalesceTrailingReadOnlyRequest(payload);
    return true;
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
  createConversation(scope = "chat", mode = "single", meta: { title?: string; project?: string; category?: string; tags?: string } = {}) {
    return sendDesktopRequest({
      type: "create_conversation",
      scope,
      mode,
      conversationTitle: meta.title?.trim() || undefined,
      project: meta.project?.trim() || undefined,
      category: meta.category?.trim() || undefined,
      tags: parseTagList(meta.tags)
    });
  },
  updateConversationMeta(
    conversationId: string,
    meta: { title?: string; project?: string; category?: string; tags?: string }
  ) {
    return sendDesktopRequest({
      type: "update_conversation_meta",
      conversationId,
      conversationTitle: meta.title ?? undefined,
      project: meta.project ?? undefined,
      category: meta.category ?? undefined,
      tags: parseTagList(meta.tags)
    });
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
  chat(
    mode: "single" | "orchestration" | "multi",
    text: string,
    conversationId?: string | null,
    options: {
      provider?: string;
      summaryProvider?: string;
      thinkPlus?: boolean;
      models?: Partial<Record<"groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex", string>>;
      workerModels?: Partial<Record<"groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex", string>>;
      project?: string;
      category?: string;
      tags?: string;
      memoryNotes?: string[];
      attachments?: unknown[];
      webUrls?: string[];
      webSearchEnabled?: boolean;
    } = {}
  ) {
    const type =
      mode === "orchestration"
        ? "llm_chat_orchestration"
        : mode === "multi"
          ? "llm_chat_multi"
          : "llm_chat_single";
    const provider = options.provider && options.provider !== "auto" ? options.provider : undefined;
    const summaryProvider = options.summaryProvider && options.summaryProvider !== "auto" ? options.summaryProvider : undefined;
    const pick = (value?: string) => (value && value.trim() ? value.trim() : undefined);
    const models = options.models || {};
    const workerModels = options.workerModels || models;
    const selectedModel = provider ? pick(models[provider as keyof typeof models]) : undefined;
    return sendDesktopRequest({
      type,
      text,
      scope: "chat",
      mode,
      conversationId: conversationId || undefined,
      // single/orchestration: 워커 provider, orchestration/multi: 요약 provider
      provider: mode === "multi" ? undefined : provider,
      model: mode === "multi" ? undefined : selectedModel,
      summaryProvider: mode === "single" ? undefined : summaryProvider,
      thinkPlus: options.thinkPlus ? true : undefined,
      project: options.project?.trim() || undefined,
      category: options.category?.trim() || undefined,
      tags: parseTagList(options.tags),
      memoryNotes: Array.isArray(options.memoryNotes) ? options.memoryNotes : undefined,
      attachments: Array.isArray(options.attachments) ? options.attachments : undefined,
      webUrls: Array.isArray(options.webUrls) ? options.webUrls : undefined,
      webSearchEnabled: options.webSearchEnabled === false ? false : undefined,
      groqModel: pick(workerModels.groq),
      geminiModel: pick(workerModels.gemini),
      cerebrasModel: pick(workerModels.cerebras),
      nvidiaModel: pick(workerModels.nvidia),
      copilotModel: pick(workerModels.copilot),
      codexModel: pick(workerModels.codex)
    });
  },
  chatSingle(text: string, conversationId?: string | null) {
    return requestDesktopAsk.chat("single", text, conversationId);
  }
};

function parseTagList(value?: string) {
  const tags = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

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
  syncConfigRead() {
    return sendDesktopRequest({ type: "sync_config_read" });
  },
  syncConfigWrite(input: { gistId?: string; gitHubToken?: string }) {
    return sendDesktopRequest({
      type: "sync_config_write",
      ...(input.gistId !== undefined ? { gistId: input.gistId } : {}),
      ...(input.gitHubToken !== undefined ? { gitHubToken: input.gitHubToken } : {})
    });
  },
  cloudSyncUpload(includeScopes: string[]) {
    return sendDesktopRequest({ type: "cloud_sync_upload", includeScopes });
  },
  cloudSyncDownload(gistId?: string) {
    return sendDesktopRequest({ type: "cloud_sync_download", ...(gistId ? { gistId } : {}) });
  },
  cerebrasModels() {
    return sendDesktopRequest({ type: "get_cerebras_models" });
  }
};

export const requestDesktopRoutine = {
  listRoutines() {
    return sendDesktopRequest({ type: "get_routines" });
  },
  schedulerStatus() {
    return sendDesktopRequest({ type: "get_routine_scheduler_status" });
  },
  runRoutine(routineId: string) {
    return sendDesktopRequest({ type: "run_routine", routineId });
  },
  testRoutineTelegram(routineId: string) {
    return sendDesktopRequest({ type: "test_routine_telegram", routineId });
  },
  testBrowserAgentRoutine(routineId: string) {
    return sendDesktopRequest({ type: "test_browser_agent_routine", routineId });
  },
  getRunDetail(routineId: string, timestamp: number) {
    return sendDesktopRequest({ type: "get_routine_run_detail", routineId, timestamp });
  },
  resendRunTelegram(routineId: string, timestamp: number) {
    return sendDesktopRequest({ type: "resend_routine_run_telegram", routineId, timestamp });
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
  executionMode?: string;
  agentProvider?: string;
  agentModel?: string;
  agentStartUrl?: string;
  agentTimeoutSeconds?: number;
  agentToolProfile?: string;
  agentUsePlaywright?: boolean;
  scheduleSourceMode?: string;
  maxRetries?: number;
  retryDelaySeconds?: number;
  notifyPolicy?: string;
  scheduleKind: string;
  scheduleTime: string;
  weekdays: number[];
  dayOfMonth: number;
  timezoneId?: string;
  runImmediately: boolean;
  notifyTelegram: boolean;
  permissions?: Partial<Record<"read" | "write" | "run" | "network" | "delete", "allow" | "ask" | "deny">>;
}

function buildRoutinePermissionsPayload(form: RoutineCreateInput): Record<string, string> | undefined {
  if (!form.permissions) return undefined;
  const actions = ["read", "write", "run", "network", "delete"] as const;
  const result: Record<string, string> = {};
  for (const action of actions) {
    const decision = form.permissions[action];
    if (decision === "allow" || decision === "ask" || decision === "deny") {
      result[action] = decision;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildRoutineSchedulePayload(form: RoutineCreateInput): Record<string, unknown> {
  const kind = form.scheduleKind || "daily";
  const payload: Record<string, unknown> = {
    scheduleSourceMode: form.scheduleSourceMode || "auto",
    scheduleKind: kind,
    timezoneId: form.timezoneId?.trim() || undefined
  };
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
  return {
    text: form.request.trim(),
    executionMode: form.executionMode?.trim() || undefined,
    ...buildRoutineSchedulePayload(form)
  };
}

function buildRoutineCreatePayload(form: RoutineCreateInput): Record<string, unknown> {
  return {
    text: form.request.trim(),
    title: form.title.trim(),
    executionMode: form.executionMode?.trim() || undefined,
    agentProvider: form.agentProvider?.trim() || undefined,
    agentModel: form.agentModel?.trim() || undefined,
    agentStartUrl: form.agentStartUrl?.trim() || undefined,
    agentTimeoutSeconds: Number.isFinite(form.agentTimeoutSeconds) ? form.agentTimeoutSeconds : undefined,
    agentToolProfile: form.agentToolProfile?.trim() || undefined,
    agentUsePlaywright: form.agentUsePlaywright !== false,
    maxRetries: Number.isFinite(form.maxRetries) ? form.maxRetries : undefined,
    retryDelaySeconds: Number.isFinite(form.retryDelaySeconds) ? form.retryDelaySeconds : undefined,
    notifyPolicy: form.notifyPolicy?.trim() || undefined,
    runImmediately: !!form.runImmediately,
    notifyTelegram: !!form.notifyTelegram,
    permissions: buildRoutinePermissionsPayload(form),
    ...buildRoutineSchedulePayload(form)
  };
}

export const requestDesktopCoding = {
  run(
    mode: "single" | "orchestration" | "multi",
    input: string,
    conversationId?: string,
    options: {
      provider?: string;
      model?: string;
      language?: string;
      title?: string;
      project?: string;
      category?: string;
      tags?: string;
      memoryNotes?: string[];
      attachments?: unknown[];
      webUrls?: string[];
      webSearchEnabled?: boolean;
      thinkPlus?: boolean;
      skillName?: string;
      skillScope?: string;
      workerModels?: Partial<Record<"groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex", string>>;
    } = {}
  ) {
    const type =
      mode === "orchestration"
        ? "coding_run_orchestration"
        : mode === "multi"
          ? "coding_run_multi"
          : "coding_run_single";
    const pick = (value?: string) => (value && value.trim() && value !== "none" ? value.trim() : undefined);
    const provider = options.provider && options.provider !== "auto" ? options.provider : undefined;
    const workerModels = options.workerModels || {};
    const payload: Record<string, unknown> = {
      type,
      text: input.trim(),
      scope: "coding",
      mode,
      provider,
      model: pick(options.model),
      language: options.language?.trim() || "auto",
      conversationTitle: options.title?.trim() || undefined,
      project: options.project?.trim() || undefined,
      category: options.category?.trim() || undefined,
      tags: parseTagList(options.tags),
      memoryNotes: Array.isArray(options.memoryNotes) ? options.memoryNotes : undefined,
      attachments: Array.isArray(options.attachments) ? options.attachments : undefined,
      webUrls: Array.isArray(options.webUrls) ? options.webUrls : undefined,
      webSearchEnabled: options.webSearchEnabled === false ? false : undefined,
      thinkPlus: options.thinkPlus ? true : undefined,
      skillName: options.skillName?.trim() || undefined,
      skillScope: options.skillScope?.trim() || undefined,
      groqModel: pick(workerModels.groq),
      geminiModel: pick(workerModels.gemini),
      cerebrasModel: pick(workerModels.cerebras),
      nvidiaModel: pick(workerModels.nvidia),
      copilotModel: pick(workerModels.copilot),
      codexModel: pick(workerModels.codex)
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

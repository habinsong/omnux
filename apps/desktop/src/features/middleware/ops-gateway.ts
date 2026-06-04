import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 운영/Doctor WS 요청. Doctor fix apply는 Phase 5 운영 위험 명령이라 UI에서는 preview만 연결한다.
registerDesktopRequestTypes(
  "doctor_get_last",
  "doctor_run",
  "doctor_fix_preview",
  "plan_list",
  "task_graph_list",
  "cleanup_preview",
  "cleanup_apply",
  "cron",
  "nodes",
  "command",
  "telegram_stub_command",
  "context_scan",
  "commands_list",
  "get_setup_state",
  "read_workspace_file",
  "get_metrics",
  "logic_path_list",
  "dispatch_guard_alert"
);

export const requestDesktopOps = {
  doctorLast() {
    return sendDesktopRequest({ type: "doctor_get_last" });
  },
  doctorRun() {
    return sendDesktopRequest({ type: "doctor_run" });
  },
  doctorFixPreview() {
    return sendDesktopRequest({ type: "doctor_fix_preview" });
  },
  planList() {
    return sendDesktopRequest({ type: "plan_list" });
  },
  taskGraphList() {
    return sendDesktopRequest({ type: "task_graph_list" });
  },
  cleanupPreview() {
    return sendDesktopRequest({ type: "cleanup_preview" });
  },
  cleanupApply(previewId: string) {
    return sendDesktopRequest({ type: "cleanup_apply", previewId });
  },
  cronStatus() {
    return sendDesktopRequest({ type: "cron", action: "status" });
  },
  cronList(includeDisabled = true) {
    return sendDesktopRequest({ type: "cron", action: "list", includeDisabled, limit: 50, offset: 0 });
  },
  cronRun(jobId: string, runMode = "manual") {
    return sendDesktopRequest({ type: "cron", action: "run", jobId, runMode });
  },
  cronRuns(jobId: string, limit = 20, offset = 0) {
    return sendDesktopRequest({ type: "cron", action: "runs", jobId, limit, offset });
  },
  cronWake(text?: string, mode?: string) {
    return sendDesktopRequest({
      type: "cron",
      action: "wake",
      ...(mode?.trim() ? { mode: mode.trim() } : {}),
      ...(text?.trim() ? { text: text.trim() } : {})
    });
  },
  cronRemove(jobId: string) {
    return sendDesktopRequest({ type: "cron", action: "remove", jobId });
  },
  // 백엔드 BuildCronAddJobJson은 message.RawJson 최상위의 synthetic job 필드를 읽는다.
  cronAdd(job: CronJobInput) {
    return sendDesktopRequest({ type: "cron", action: "add", ...buildCronJobPayload(job) });
  },
  cronUpdate(jobId: string, patch: Partial<CronJobInput>) {
    return sendDesktopRequest({ type: "cron", action: "update", jobId, ...buildCronJobPayload(patch) });
  },
  cronSetEnabled(jobId: string, enabled: boolean) {
    return sendDesktopRequest({ type: "cron", action: "update", jobId, enabled });
  },
  nodes(
    action: string,
    options: {
      node?: string;
      requestId?: string;
      invokeCommand?: string;
      invokeParamsJson?: string;
      title?: string;
      body?: string;
      priority?: string;
      delivery?: string;
    } = {}
  ) {
    return sendDesktopRequest({ type: "nodes", action, ...options });
  },
  command(text: string) {
    return sendDesktopRequest({ type: "command", text });
  },
  telegramStubCommand(text: string) {
    return sendDesktopRequest({ type: "telegram_stub_command", text });
  },
  contextScan() {
    return sendDesktopRequest({ type: "context_scan" });
  },
  commandsList() {
    return sendDesktopRequest({ type: "commands_list" });
  },
  setupState() {
    return sendDesktopRequest({ type: "get_setup_state" });
  },
  readWorkspaceFile(filePath: string) {
    return sendDesktopRequest({ type: "read_workspace_file", filePath });
  },
  metrics() {
    return sendDesktopRequest({ type: "get_metrics" });
  },
  logicPathList(scope: string, rootKey?: string, browsePath?: string) {
    return sendDesktopRequest({
      type: "logic_path_list",
      scope,
      target: rootKey?.trim() || undefined,
      filePath: browsePath?.trim() || undefined
    });
  },
  guardAlertDispatch(guardAlertEvent: Record<string, unknown>) {
    return sendDesktopRequest({ type: "dispatch_guard_alert", guardAlertEvent });
  }
};

// React 폼 입력 → cron job synthetic 필드. 백엔드 schedule.kind는 cron/at/every만 허용한다.
export interface CronJobInput {
  name: string;
  description?: string;
  enabled?: boolean;
  sessionTarget?: "main" | "isolated" | "";
  wakeMode?: "next-heartbeat" | "now";
  scheduleKind: "cron" | "at" | "every";
  // cron: 매일 HH:MM
  scheduleHour?: number;
  scheduleMinute?: number;
  scheduleTz?: string;
  // at: ISO 8601
  scheduleAt?: string;
  // every: 초 단위 입력
  scheduleEverySeconds?: number;
  payloadKind?: string;
  payloadText?: string;
  payloadModel?: string;
}

function buildCronSchedulePayload(input: Partial<CronJobInput>): Record<string, unknown> | undefined {
  if (!input.scheduleKind) return undefined;
  if (input.scheduleKind === "cron") {
    const hour = Math.max(0, Math.min(23, Math.round(input.scheduleHour ?? 8)));
    const minute = Math.max(0, Math.min(59, Math.round(input.scheduleMinute ?? 0)));
    return {
      kind: "cron",
      expr: `${minute} ${hour} * * *`,
      ...(input.scheduleTz?.trim() ? { tz: input.scheduleTz.trim() } : {})
    };
  }
  if (input.scheduleKind === "at") {
    return { kind: "at", at: (input.scheduleAt || "").trim() };
  }
  if (input.scheduleKind === "every") {
    const seconds = Math.max(1, Math.round(input.scheduleEverySeconds ?? 60));
    return { kind: "every", everyMs: seconds * 1000 };
  }
  return undefined;
}

function buildCronPayloadPayload(input: Partial<CronJobInput>): Record<string, unknown> | undefined {
  const text = input.payloadText?.trim();
  const model = input.payloadModel?.trim();
  const kind = input.payloadKind?.trim();
  if (!text && !model && !kind) return undefined;
  return {
    ...(kind ? { kind } : {}),
    ...(text ? { text } : {}),
    ...(model ? { model } : {})
  };
}

function buildCronJobPayload(input: Partial<CronJobInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name?.trim()) payload.name = input.name.trim();
  if (input.description?.trim()) payload.description = input.description.trim();
  if (input.enabled !== undefined) payload.enabled = input.enabled;
  if (input.sessionTarget) payload.sessionTarget = input.sessionTarget;
  if (input.wakeMode) payload.wakeMode = input.wakeMode;
  const schedule = buildCronSchedulePayload(input);
  if (schedule) payload.schedule = schedule;
  const cronPayload = buildCronPayloadPayload(input);
  if (cronPayload) payload.payload = cronPayload;
  return payload;
}

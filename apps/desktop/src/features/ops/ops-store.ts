import { useEffect } from "react";
import { create } from "zustand";
import { requestConfirmDialog, requestPermissionDialog } from "../dialog/dialog-store";
import { requestDesktopGit, type GitOperationName } from "../middleware/git-gateway";
import { requestDesktopOps, type CronJobInput } from "../middleware/ops-gateway";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { type DesktopDoctorSnapshot, type DoctorResultPayload, normalizeDoctorFixResult, normalizeDoctorReport, summarizeDoctorReport } from "./ops-doctor";
export type { DesktopDoctorSnapshot } from "./ops-doctor";
export type DesktopOpsSnapshot = {
  loadingPlans: boolean;
  loadingTaskGraphs: boolean;
  planCount: number;
  taskGraphCount: number;
  latestPlanTitle: string | null;
  latestTaskGraphStatus: string | null;
  lastError: string | null;
};

export type CleanupCandidate = {
  path: string;
  kind: string;
  sizeBytes: number;
  lastModifiedUtc: string;
  reason: string;
};

export type CleanupPreview = {
  ok: boolean;
  message: string;
  previewId: string;
  totalSizeBytes: number;
  error: string;
  candidates: CleanupCandidate[];
};

export type CleanupApplyResult = {
  ok: boolean;
  message: string;
  previewId: string;
  removedCount: number;
  removedSizeBytes: number;
  removedPaths: string[];
  failedPaths: string[];
  error: string;
};

export type CronStatus = {
  enabled: boolean;
  storePath: string;
  jobCount: number;
  nextWakeAtMs: number | null;
};

export type CronJob = {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  sessionTarget: string;
  wakeMode: string;
  scheduleSummary: string;
  payloadSummary: string;
  nextRunAtMs: number | null;
  lastRunStatus: string;
  lastError: string;
  lastDurationMs: number | null;
};

export type CronActionResult = {
  action: string;
  ok: boolean | null;
  jobId: string;
  ran: boolean;
  reason: string;
  error: string;
};

export type CronRunEntry = {
  ts: number;
  jobId: string;
  jobName: string;
  action: string;
  status: string;
  error: string;
  summary: string;
  runAtMs: number | null;
  durationMs: number | null;
  nextRunAtMs: number | null;
};

export type CronJobForm = CronJobInput;

const INITIAL_CRON_FORM: CronJobForm = {
  name: "",
  description: "",
  enabled: true,
  sessionTarget: "main",
  wakeMode: "next-heartbeat",
  scheduleKind: "cron",
  scheduleHour: 8,
  scheduleMinute: 0,
  scheduleTz: "",
  scheduleAt: "",
  scheduleEverySeconds: 3600,
  payloadKind: "chat",
  payloadText: "",
  payloadModel: ""
};

const GUARD_ALERT_SCHEMA_VERSION = "guard_alert_event.v1";
const GUARD_ALERT_EVENT_TYPE = "omnux.guard_alert.summary";

function buildGuardAlertSampleEventJson(): string {
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      schemaVersion: GUARD_ALERT_SCHEMA_VERSION,
      eventType: GUARD_ALERT_EVENT_TYPE,
      severity: "warning",
      source: "desktop.operations.manual_dispatch_test",
      category: "Coverage",
      reason: "manual_dispatch_test",
      detail: "Operations에서 보낸 Guard Alert dispatch 테스트 이벤트",
      conversationId: "manual-test",
      route: "operations",
      retryRequired: false,
      createdAtUtc: now
    },
    null,
    2
  );
}

export type NodeEntry = {
  nodeId: string;
  label: string;
  online: boolean;
  platform: string;
  commands: string[];
  lastCommand: string;
  lastCommandAtMs: number | null;
  updatedAtMs: number | null;
};

export type NodePendingRequest = {
  requestId: string;
  nodeLabel: string;
  status: string;
  requestedAtMs: number | null;
  updatedAtMs: number | null;
};

export type NodesSnapshot = {
  ok: boolean;
  action: string;
  profile: string;
  disabled: boolean;
  adapter: string;
  selectedNodeId: string;
  selectedCommand: string;
  invokePayloadJson: string;
  updatedAtMs: number | null;
  error: string;
  nodes: NodeEntry[];
  pendingRequests: NodePendingRequest[];
};

export type TelegramStubResult = {
  input: string;
  ok: boolean;
  status: string;
  response: string;
  error: string;
  guardCategory: string;
  guardReason: string;
  retryRequired: boolean;
  retryAction: string;
};

export type CommandConsoleEntry = {
  id: string;
  input: string;
  output: string;
  status: "success" | "error";
  ranAtMs: number;
  durationMs: number | null;
};

export type ContextSource = {
  path: string;
  scope: string;
  order: number;
};

export type ContextItem = {
  name: string;
  description: string;
  summary: string;
  path: string;
  scope: string;
};

export type ProjectContextSnapshot = {
  projectRoot: string;
  currentDirectory: string;
  scannedAtUtc: string;
  combinedText: string;
  sources: ContextSource[];
  skills: ContextItem[];
  commands: ContextItem[];
};

export type CommandListSnapshot = {
  projectRoot: string;
  currentDirectory: string;
  scannedAtUtc: string;
  items: ContextItem[];
};

export type SetupStateSnapshot = {
  telegramBotTokenSet: boolean;
  telegramChatIdSet: boolean;
  groqApiKeySet: boolean;
  geminiApiKeySet: boolean;
  cerebrasApiKeySet: boolean;
  nvidiaApiKeySet: boolean;
  codexApiKeySet: boolean;
  externalDashboardEnabled: boolean;
  remoteDashboardClient: boolean;
  dashboardExternalUrls: string[];
};

export type WorkspaceFilePreview = {
  ok: boolean;
  conversationId: string;
  path: string;
  content: string;
  message: string;
};

export type MetricsSnapshot = {
  summary: string;
  raw: string;
};

export type GuardRetryTimelineBucket = {
  bucketStartUtc: string;
  samples: number;
  retryRequiredCount: number;
  maxRetryAttempt: number;
  maxRetryMaxAttempts: number;
  topRetryStopReason: string;
  uniqueRetryStopReasons: number;
};

export type GuardRetryTimelineChannel = {
  channel: string;
  totalSamples: number;
  retryRequiredSamples: number;
  maxRetryAttempt: number;
  maxRetryMaxAttempts: number;
  lastRetryStopReason: string;
  buckets: GuardRetryTimelineBucket[];
};

export type GuardRetryTimelineSnapshot = {
  schemaVersion: string;
  generatedAtUtc: string;
  bucketMinutes: number;
  windowMinutes: number;
  channels: GuardRetryTimelineChannel[];
};

export type GuardAlertTargetResult = {
  name: string;
  status: string;
  attempts: number;
  statusCode: number | null;
  error: string;
  endpoint: string;
};

export type GuardAlertDispatchResult = {
  ok: boolean;
  status: string;
  message: string;
  schemaVersion: string;
  eventType: string;
  attemptedAtUtc: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  targets: GuardAlertTargetResult[];
};

export type LogicPathEntry = {
  name: string;
  isDirectory: boolean;
  browsePath: string;
  selectPath: string;
  description: string;
};

export type LogicPathSnapshot = {
  ok: boolean;
  message: string;
  scope: string;
  rootKey: string;
  rootLabel: string;
  displayPath: string;
  browsePath: string;
  parentBrowsePath: string;
  directorySelectPath: string;
  roots: Array<{ key: string; label: string }>;
  items: LogicPathEntry[];
};

type OpsToolsState = {
  cleanup: {
    previewing: boolean;
    applying: boolean;
    preview: CleanupPreview | null;
    applyResult: CleanupApplyResult | null;
    lastError: string;
  };
  cron: {
    loading: boolean;
    running: boolean;
    waking: boolean;
    mutating: boolean;
    runsLoading: boolean;
    includeDisabled: boolean;
    selectedJobId: string;
    runsJobId: string;
    showAddForm: boolean;
    wakeText: string;
    form: CronJobForm;
    status: CronStatus | null;
    jobs: CronJob[];
    runs: CronRunEntry[];
    lastResult: CronActionResult | null;
    lastActionMessage: string;
    lastError: string;
  };
  nodes: {
    loading: boolean;
    selectedNodeId: string;
    requestId: string;
    invokeCommand: string;
    invokeParamsJson: string;
    notifyTitle: string;
    notifyBody: string;
    notifyPriority: string;
    notifyDelivery: string;
    snapshot: NodesSnapshot | null;
    lastError: string;
  };
  telegram: {
    sending: boolean;
    text: string;
    result: TelegramStubResult | null;
    lastError: string;
  };
  command: {
    running: boolean;
    text: string;
    pendingInput: string;
    startedAtMs: number | null;
    result: CommandConsoleEntry | null;
    history: CommandConsoleEntry[];
    lastError: string;
  };
  context: {
    loading: boolean;
    commandsLoading: boolean;
    setupLoading: boolean;
    readingFile: boolean;
    filePath: string;
    workspaceSearch: string;
    recentWorkspaceFiles: string[];
    logicScope: string;
    logicRootKey: string;
    logicBrowsePath: string;
    project: ProjectContextSnapshot | null;
    commands: CommandListSnapshot | null;
    setup: SetupStateSnapshot | null;
    filePreview: WorkspaceFilePreview | null;
    metrics: MetricsSnapshot | null;
    logicPath: LogicPathSnapshot | null;
    lastError: string;
  };
  guard: {
    loading: boolean;
    dispatching: boolean;
    eventJson: string;
    snapshot: GuardRetryTimelineSnapshot | null;
    dispatchResult: GuardAlertDispatchResult | null;
    lastError: string;
    dispatchError: string;
  };
};

type OpsPageState = {
  doctor: DesktopDoctorSnapshot;
  ops: DesktopOpsSnapshot;
  git: GitAutomationState;
  tools: OpsToolsState;
  markDoctorLoading: () => void;
  markDoctorRunning: () => void;
  markDoctorResult: (payload: DoctorResultPayload) => void;
  markDoctorFixResult: (payload: Record<string, unknown>) => void;
  markDoctorError: (message: string) => void;
  markOpsLoading: () => void;
  markPlanListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markTaskGraphListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markOpsError: (message: string) => void;
  markCleanupPreviewResult: (payload: Record<string, unknown>) => void;
  markCleanupApplyResult: (payload: Record<string, unknown>) => void;
  markCronResult: (payload: Record<string, unknown>) => void;
  markNodesResult: (payload: Record<string, unknown>) => void;
  markCommandResult: (payload: Record<string, unknown>) => void;
  markTelegramStubResult: (payload: Record<string, unknown>) => void;
  markContextScanResult: (payload: Record<string, unknown>) => void;
  markCommandsListResult: (payload: Record<string, unknown>) => void;
  markSetupStateResult: (payload: Record<string, unknown>) => void;
  markWorkspaceFilePreview: (payload: Record<string, unknown>) => void;
  markMetricsResult: (payload: Record<string, unknown>) => void;
  markLogicPathResult: (payload: Record<string, unknown>) => void;
  markGuardAlertDispatchResult: (payload: Record<string, unknown>) => void;
  markToolsError: (message: string) => void;
  loadDoctorLast: () => void;
  runDoctor: () => void;
  previewDoctorFix: () => void;
  loadOpsSnapshot: () => void;
  previewCleanup: () => void;
  applyCleanupPreview: () => Promise<void>;
  loadCronStatus: () => void;
  loadCronJobs: () => void;
  setCronSelectedJob: (jobId: string) => void;
  runSelectedCronJob: () => Promise<void>;
  loadCronRuns: (jobId: string) => void;
  closeCronRuns: () => void;
  setCronWakeText: (text: string) => void;
  wakeCron: () => Promise<void>;
  removeCronJob: (jobId: string) => Promise<void>;
  toggleCronJobEnabled: (jobId: string, enabled: boolean) => void;
  toggleCronAddForm: () => void;
  setCronFormField: <K extends keyof CronJobForm>(key: K, value: CronJobForm[K]) => void;
  submitCronJob: () => void;
  loadNodesSnapshot: () => void;
  loadNodesPending: () => void;
  setNodesField: (key: "selectedNodeId" | "requestId" | "invokeCommand" | "invokeParamsJson" | "notifyTitle" | "notifyBody" | "notifyPriority" | "notifyDelivery", value: string) => void;
  approveNodeRequest: (requestId: string) => Promise<void>;
  rejectNodeRequest: (requestId: string) => Promise<void>;
  invokeSelectedNodeCommand: () => Promise<void>;
  describeSelectedNode: () => void;
  notifySelectedNode: () => Promise<void>;
  setCommandText: (text: string) => void;
  runCommandConsole: () => Promise<void>;
  setTelegramStubText: (text: string) => void;
  sendTelegramStubCommand: () => void;
  loadProjectContext: () => void;
  loadCommandTemplates: () => void;
  loadSetupState: () => void;
  setWorkspaceFilePath: (filePath: string) => void;
  setWorkspaceSearch: (query: string) => void;
  readWorkspaceFile: () => void;
  openWorkspaceFile: (filePath: string) => void;
  loadMetrics: () => void;
  loadGuardRetryTimeline: () => Promise<void>;
  setGuardAlertEventJson: (eventJson: string) => void;
  resetGuardAlertEventJson: () => void;
  dispatchGuardAlert: () => Promise<void>;
  setLogicPathField: (key: "logicScope" | "logicRootKey" | "logicBrowsePath", value: string) => void;
  loadLogicPath: (browsePath?: string, rootKey?: string) => void;
  loadGitAutomation: () => void;
  setGitOperation: (operation: GitOperationName) => void;
  setGitField: (key: keyof GitOperationForm, value: string | boolean) => void;
  toggleGitPath: (path: string) => void;
  previewGitOperation: () => void;
  applyGitPreview: () => Promise<void>;
};

type GitAutomationFile = {
  path: string;
  category: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  addedLines: number;
  deletedLines: number;
};

type GitAutomationSnapshot = {
  branchName: string;
  headShortHash: string;
  isClean: boolean;
  changedFileCount: number;
  stagedFileCount: number;
  unstagedFileCount: number;
  untrackedFileCount: number;
  conflictedFileCount: number;
  diffShortStat: string;
  suggestedCommitMessage: string;
  suggestedBranchName: string;
  readinessStatus: string;
  publishStatus: string;
  blockers: string[];
  files: GitAutomationFile[];
};

type GitOperationForm = {
  operation: GitOperationName;
  branchName: string;
  commitMessage: string;
  remoteName: string;
  remoteBranchName: string;
  pullRequestTitle: string;
  pullRequestBody: string;
  baseBranchName: string;
  draft: boolean;
};

type GitOperationPreview = {
  ok: boolean;
  status: string;
  previewId: string;
  operation: string;
  requiresApproval: boolean;
  checks: Array<{ code: string; status: string; message: string }>;
  plannedCommands: Array<{ display: string }>;
  affectedFiles: Array<{ path: string; category: string }>;
  blockers: string[];
  warnings: string[];
  approval: Record<string, unknown> | null;
};

type GitOperationApply = {
  ok: boolean;
  status: string;
  operation: string;
  message: string;
  executedCommands: Array<{ executable: string; exitCode: number; stdOut: string; stdErr: string }>;
};

type GitAutomationState = {
  snapshot: GitAutomationSnapshot | null;
  form: GitOperationForm;
  selectedPaths: string[];
  preview: GitOperationPreview | null;
  applyResult: GitOperationApply | null;
  loading: boolean;
  previewing: boolean;
  applying: boolean;
  lastError: string;
};

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRateLimitedMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "rate_limited" || normalized.includes("rate limit");
}

function formatOpsErrorMessage(message: Record<string, unknown>, fallback: string): string {
  if (!isRateLimitedMessage(fallback)) return fallback;
  const requestType = stringFromUnknown(message.requestType) || "unknown";
  const requestAction = stringFromUnknown(message.requestAction);
  const limitPerMinute = numberFromUnknown(message.limitPerMinute);
  const windowSeconds = numberFromUnknown(message.windowSeconds);
  const target = requestAction ? `${requestType}/${requestAction}` : requestType;
  const limit = limitPerMinute > 0 ? `${limitPerMinute}/min` : "limit unknown";
  const window = windowSeconds > 0 ? `, window=${windowSeconds}s` : "";
  return `rate_limited: ${target} (${limit}${window})`;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function payloadRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = asRecord(payload.payload);
  return Object.keys(nested).length > 0 ? nested : payload;
}

function field(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
}

function nullableNumberFromUnknown(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numberFromUnknown(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeContextItem(item: Record<string, unknown>): ContextItem {
  return {
    name: stringFromUnknown(field(item, "name", "Name")),
    description: stringFromUnknown(field(item, "description", "Description")),
    summary: stringFromUnknown(field(item, "summary", "Summary")),
    path: stringFromUnknown(field(item, "path", "Path")),
    scope: stringFromUnknown(field(item, "scope", "Scope"))
  };
}

function normalizeContextSource(item: Record<string, unknown>): ContextSource {
  return {
    path: stringFromUnknown(field(item, "path", "Path")),
    scope: stringFromUnknown(field(item, "scope", "Scope")),
    order: numberFromUnknown(field(item, "order", "Order"))
  };
}

function truncateSingleLine(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function summarizeCronSchedule(schedule: Record<string, unknown>): string {
  const kind = stringFromUnknown(schedule.kind) || "schedule";
  const expr = stringFromUnknown(schedule.expr);
  const at = stringFromUnknown(schedule.at);
  const tz = stringFromUnknown(schedule.tz);
  const everyMs = nullableNumberFromUnknown(schedule.everyMs);
  if (expr) return `${kind} · ${expr}${tz ? ` · ${tz}` : ""}`;
  if (at) return `${kind} · ${at}`;
  if (everyMs) return `${kind} · every ${Math.round(everyMs / 1000)}s`;
  return kind;
}

function summarizeCronPayload(payload: Record<string, unknown>): string {
  const kind = stringFromUnknown(payload.kind) || "payload";
  const text = stringFromUnknown(payload.message) || stringFromUnknown(payload.text);
  const model = stringFromUnknown(payload.model);
  const summary = truncateSingleLine(text || model || "-");
  return `${kind} · ${summary}`;
}

function normalizeCleanupPreview(payload: Record<string, unknown>): CleanupPreview {
  return {
    ok: payload.ok === true,
    message: stringFromUnknown(payload.message),
    previewId: stringFromUnknown(payload.previewId),
    totalSizeBytes: numberFromUnknown(payload.totalSizeBytes),
    error: stringFromUnknown(payload.error),
    candidates: records(payload.candidates).map((item) => ({
      path: stringFromUnknown(item.path),
      kind: stringFromUnknown(item.kind),
      sizeBytes: numberFromUnknown(item.sizeBytes),
      lastModifiedUtc: stringFromUnknown(item.lastModifiedUtc),
      reason: stringFromUnknown(item.reason)
    })).filter((item) => item.path)
  };
}

function normalizeCleanupApply(payload: Record<string, unknown>): CleanupApplyResult {
  return {
    ok: payload.ok === true,
    message: stringFromUnknown(payload.message),
    previewId: stringFromUnknown(payload.previewId),
    removedCount: numberFromUnknown(payload.removedCount),
    removedSizeBytes: numberFromUnknown(payload.removedSizeBytes),
    removedPaths: stringArrayFromUnknown(payload.removedPaths),
    failedPaths: stringArrayFromUnknown(payload.failedPaths),
    error: stringFromUnknown(payload.error)
  };
}

function normalizeCronStatus(payload: Record<string, unknown>): CronStatus {
  return {
    enabled: payload.enabled === true,
    storePath: stringFromUnknown(payload.storePath),
    jobCount: numberFromUnknown(payload.jobs),
    nextWakeAtMs: nullableNumberFromUnknown(payload.nextWakeAtMs)
  };
}

function normalizeCronJobs(value: unknown): CronJob[] {
  return records(value).map((job) => {
    const schedule = asRecord(job.schedule);
    const payload = asRecord(job.payload);
    const state = asRecord(job.state);
    return {
      id: stringFromUnknown(job.id),
      name: stringFromUnknown(job.name),
      enabled: job.enabled === true,
      description: stringFromUnknown(job.description),
      sessionTarget: stringFromUnknown(job.sessionTarget),
      wakeMode: stringFromUnknown(job.wakeMode),
      scheduleSummary: summarizeCronSchedule(schedule),
      payloadSummary: summarizeCronPayload(payload),
      nextRunAtMs: nullableNumberFromUnknown(state.nextRunAtMs),
      lastRunStatus: stringFromUnknown(state.lastRunStatus),
      lastError: stringFromUnknown(state.lastError),
      lastDurationMs: nullableNumberFromUnknown(state.lastDurationMs)
    };
  }).filter((job) => job.id);
}

function normalizeCronAction(payload: Record<string, unknown>): CronActionResult {
  return {
    action: stringFromUnknown(payload.action),
    ok: typeof payload.ok === "boolean" ? payload.ok : null,
    jobId: stringFromUnknown(payload.jobId),
    ran: payload.ran === true,
    reason: stringFromUnknown(payload.reason),
    error: stringFromUnknown(payload.error)
  };
}

function normalizeCronRuns(value: unknown): CronRunEntry[] {
  return records(value).map((entry) => ({
    ts: numberFromUnknown(entry.ts),
    jobId: stringFromUnknown(entry.jobId),
    jobName: stringFromUnknown(entry.jobName),
    action: stringFromUnknown(entry.action),
    status: stringFromUnknown(entry.status),
    error: stringFromUnknown(entry.error),
    summary: stringFromUnknown(entry.summary),
    runAtMs: nullableNumberFromUnknown(entry.runAtMs),
    durationMs: nullableNumberFromUnknown(entry.durationMs),
    nextRunAtMs: nullableNumberFromUnknown(entry.nextRunAtMs)
  }));
}

function normalizeNodesSnapshot(payload: Record<string, unknown>): NodesSnapshot {
  return {
    ok: payload.ok === true,
    action: stringFromUnknown(payload.action) || stringFromUnknown(payload.requestedAction),
    profile: stringFromUnknown(payload.profile),
    disabled: payload.disabled === true,
    adapter: stringFromUnknown(payload.adapter),
    selectedNodeId: stringFromUnknown(payload.selectedNodeId),
    selectedCommand: stringFromUnknown(payload.selectedCommand),
    invokePayloadJson: stringFromUnknown(payload.invokePayloadJson),
    updatedAtMs: nullableNumberFromUnknown(payload.updatedAtMs),
    error: stringFromUnknown(payload.error),
    nodes: records(payload.nodes).map((node) => ({
      nodeId: stringFromUnknown(node.nodeId),
      label: stringFromUnknown(node.label),
      online: node.online === true,
      platform: stringFromUnknown(node.platform),
      commands: stringArrayFromUnknown(node.commands),
      lastCommand: stringFromUnknown(node.lastCommand),
      lastCommandAtMs: nullableNumberFromUnknown(node.lastCommandAtMs),
      updatedAtMs: nullableNumberFromUnknown(node.updatedAtMs)
    })).filter((node) => node.nodeId),
    pendingRequests: records(payload.pendingRequests).map((item) => ({
      requestId: stringFromUnknown(item.requestId),
      nodeLabel: stringFromUnknown(item.nodeLabel),
      status: stringFromUnknown(item.status),
      requestedAtMs: nullableNumberFromUnknown(item.requestedAtMs),
      updatedAtMs: nullableNumberFromUnknown(item.updatedAtMs)
    })).filter((item) => item.requestId)
  };
}

function normalizeTelegramStub(payload: Record<string, unknown>): TelegramStubResult {
  return {
    input: stringFromUnknown(payload.input),
    ok: payload.ok === true,
    status: stringFromUnknown(payload.status),
    response: stringFromUnknown(payload.response),
    error: stringFromUnknown(payload.error),
    guardCategory: stringFromUnknown(payload.guardCategory),
    guardReason: stringFromUnknown(payload.guardReason),
    retryRequired: payload.retryRequired === true,
    retryAction: stringFromUnknown(payload.retryAction)
  };
}

function looksLikeRiskyCommand(text: string): boolean {
  return /(?:\bkill\b|\bdelete\b|\bremove\b|\breset\b|\brollback\b|\bapply\b|\bclear\b|\boff\b|삭제|제거|초기화|롤백|적용|종료|비활성)/i.test(text);
}

function buildCommandConsoleEntry(payload: Record<string, unknown>, input: string, startedAtMs: number | null): CommandConsoleEntry {
  const output = stringFromUnknown(payload.text) || stringFromUnknown(payload.message) || stringFromUnknown(payload.response);
  const ranAtMs = Date.now();
  const status = /(?:error|failed|blocked|denied|실패|오류|거절|차단)/i.test(output) ? "error" : "success";
  return {
    id: `${ranAtMs}-${Math.random().toString(36).slice(2, 8)}`,
    input,
    output: output || "응답 없음",
    status,
    ranAtMs,
    durationMs: startedAtMs ? Math.max(0, ranAtMs - startedAtMs) : null
  };
}

function normalizeProjectContext(payload: Record<string, unknown>): ProjectContextSnapshot {
  const root = payloadRecord(payload);
  const instructions = asRecord(field(root, "instructions", "Instructions"));
  return {
    projectRoot: stringFromUnknown(field(root, "projectRoot", "ProjectRoot")),
    currentDirectory: stringFromUnknown(field(root, "currentDirectory", "CurrentDirectory")),
    scannedAtUtc: stringFromUnknown(field(root, "scannedAtUtc", "ScannedAtUtc")),
    combinedText: stringFromUnknown(field(instructions, "combinedText", "CombinedText")),
    sources: records(field(instructions, "sources", "Sources")).map(normalizeContextSource).filter((item) => item.path),
    skills: records(field(root, "skills", "Skills")).map(normalizeContextItem).filter((item) => item.name),
    commands: records(field(root, "commands", "Commands")).map(normalizeContextItem).filter((item) => item.name)
  };
}

function normalizeCommandList(payload: Record<string, unknown>): CommandListSnapshot {
  const root = payloadRecord(payload);
  return {
    projectRoot: stringFromUnknown(field(root, "projectRoot", "ProjectRoot")),
    currentDirectory: stringFromUnknown(field(root, "currentDirectory", "CurrentDirectory")),
    scannedAtUtc: stringFromUnknown(field(root, "scannedAtUtc", "ScannedAtUtc")),
    items: records(field(root, "items", "Items")).map(normalizeContextItem).filter((item) => item.name)
  };
}

function normalizeSetupState(payload: Record<string, unknown>): SetupStateSnapshot {
  return {
    telegramBotTokenSet: payload.telegramBotTokenSet === true,
    telegramChatIdSet: payload.telegramChatIdSet === true,
    groqApiKeySet: payload.groqApiKeySet === true,
    geminiApiKeySet: payload.geminiApiKeySet === true,
    cerebrasApiKeySet: payload.cerebrasApiKeySet === true,
    nvidiaApiKeySet: payload.nvidiaApiKeySet === true,
    codexApiKeySet: payload.codexApiKeySet === true,
    externalDashboardEnabled: payload.externalDashboardEnabled === true,
    remoteDashboardClient: payload.remoteDashboardClient === true,
    dashboardExternalUrls: stringArrayFromUnknown(payload.dashboardExternalUrls)
  };
}

function normalizeWorkspaceFilePreview(payload: Record<string, unknown>): WorkspaceFilePreview {
  return {
    ok: payload.ok === true,
    conversationId: stringFromUnknown(payload.conversationId),
    path: stringFromUnknown(payload.path),
    content: stringFromUnknown(payload.content),
    message: stringFromUnknown(payload.message)
  };
}

function normalizeMetrics(payload: Record<string, unknown>): MetricsSnapshot {
  const value = payload.payload;
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  const summary = typeof value === "string"
    ? truncateSingleLine(value, 120)
    : truncateSingleLine(Object.keys(asRecord(value)).slice(0, 8).join(", ") || "metrics", 120);
  return { summary, raw };
}

function normalizeGuardBucket(payload: Record<string, unknown>): GuardRetryTimelineBucket {
  return {
    bucketStartUtc: stringFromUnknown(field(payload, "bucketStartUtc", "BucketStartUtc")),
    samples: numberFromUnknown(field(payload, "samples", "Samples")),
    retryRequiredCount: numberFromUnknown(field(payload, "retryRequiredCount", "RetryRequiredCount")),
    maxRetryAttempt: numberFromUnknown(field(payload, "maxRetryAttempt", "MaxRetryAttempt")),
    maxRetryMaxAttempts: numberFromUnknown(field(payload, "maxRetryMaxAttempts", "MaxRetryMaxAttempts")),
    topRetryStopReason: stringFromUnknown(field(payload, "topRetryStopReason", "TopRetryStopReason")),
    uniqueRetryStopReasons: numberFromUnknown(field(payload, "uniqueRetryStopReasons", "UniqueRetryStopReasons"))
  };
}

function normalizeGuardRetryTimeline(payload: Record<string, unknown>): GuardRetryTimelineSnapshot {
  return {
    schemaVersion: stringFromUnknown(field(payload, "schemaVersion", "SchemaVersion")),
    generatedAtUtc: stringFromUnknown(field(payload, "generatedAtUtc", "GeneratedAtUtc")),
    bucketMinutes: numberFromUnknown(field(payload, "bucketMinutes", "BucketMinutes")),
    windowMinutes: numberFromUnknown(field(payload, "windowMinutes", "WindowMinutes")),
    channels: records(field(payload, "channels", "Channels")).map((channel) => ({
      channel: stringFromUnknown(field(channel, "channel", "Channel")),
      totalSamples: numberFromUnknown(field(channel, "totalSamples", "TotalSamples")),
      retryRequiredSamples: numberFromUnknown(field(channel, "retryRequiredSamples", "RetryRequiredSamples")),
      maxRetryAttempt: numberFromUnknown(field(channel, "maxRetryAttempt", "MaxRetryAttempt")),
      maxRetryMaxAttempts: numberFromUnknown(field(channel, "maxRetryMaxAttempts", "MaxRetryMaxAttempts")),
      lastRetryStopReason: stringFromUnknown(field(channel, "lastRetryStopReason", "LastRetryStopReason")),
      buckets: records(field(channel, "buckets", "Buckets")).map(normalizeGuardBucket)
    })).filter((channel) => channel.channel)
  };
}

function normalizeGuardAlertDispatchResult(payload: Record<string, unknown>): GuardAlertDispatchResult {
  const targets = records(field(payload, "targets", "Targets")).map((target) => ({
    name: stringFromUnknown(field(target, "name", "Name")),
    status: stringFromUnknown(field(target, "status", "Status")),
    attempts: numberFromUnknown(field(target, "attempts", "Attempts")),
    statusCode: nullableNumberFromUnknown(field(target, "statusCode", "StatusCode")),
    error: stringFromUnknown(field(target, "error", "Error")),
    endpoint: stringFromUnknown(field(target, "endpoint", "Endpoint"))
  })).filter((target) => target.name);
  const sentCount = numberFromUnknown(field(payload, "sentCount", "SentCount")) || targets.filter((target) => target.status === "sent").length;
  const failedCount = numberFromUnknown(field(payload, "failedCount", "FailedCount")) || targets.filter((target) => target.status === "failed").length;
  const skippedCount = numberFromUnknown(field(payload, "skippedCount", "SkippedCount")) || targets.filter((target) => target.status === "skipped").length;
  return {
    ok: payload.ok === true,
    status: stringFromUnknown(field(payload, "status", "Status")),
    message: stringFromUnknown(field(payload, "message", "Message")),
    schemaVersion: stringFromUnknown(field(payload, "schemaVersion", "SchemaVersion")),
    eventType: stringFromUnknown(field(payload, "eventType", "EventType")),
    attemptedAtUtc: stringFromUnknown(field(payload, "attemptedAtUtc", "AttemptedAtUtc")),
    sentCount,
    failedCount,
    skippedCount,
    targets
  };
}

function parseGuardAlertEventJson(eventJson: string): { event?: Record<string, unknown>; error?: string } {
  const normalized = eventJson.trim();
  if (!normalized) {
    return { error: "Guard Alert 이벤트 JSON을 입력해야 합니다." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return { error: "Guard Alert 이벤트 JSON 형식이 올바르지 않습니다." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Guard Alert 이벤트는 JSON object여야 합니다." };
  }
  const event = parsed as Record<string, unknown>;
  if (event.schemaVersion !== GUARD_ALERT_SCHEMA_VERSION) {
    return { error: `schemaVersion은 ${GUARD_ALERT_SCHEMA_VERSION}이어야 합니다.` };
  }
  if (event.eventType !== GUARD_ALERT_EVENT_TYPE) {
    return { error: `eventType은 ${GUARD_ALERT_EVENT_TYPE}이어야 합니다.` };
  }
  return { event };
}

function normalizeLogicPath(payload: Record<string, unknown>): LogicPathSnapshot {
  return {
    ok: payload.ok === true,
    message: stringFromUnknown(payload.message),
    scope: stringFromUnknown(payload.scope),
    rootKey: stringFromUnknown(payload.rootKey),
    rootLabel: stringFromUnknown(payload.rootLabel),
    displayPath: stringFromUnknown(payload.displayPath),
    browsePath: stringFromUnknown(payload.browsePath),
    parentBrowsePath: stringFromUnknown(payload.parentBrowsePath),
    directorySelectPath: stringFromUnknown(payload.directorySelectPath),
    roots: records(payload.roots).map((root) => ({
      key: stringFromUnknown(field(root, "key", "Key")),
      label: stringFromUnknown(field(root, "label", "Label"))
    })).filter((root) => root.key),
    items: records(payload.items).map((item) => ({
      name: stringFromUnknown(field(item, "name", "Name")),
      isDirectory: field(item, "isDirectory", "IsDirectory") === true,
      browsePath: stringFromUnknown(field(item, "browsePath", "BrowsePath")),
      selectPath: stringFromUnknown(field(item, "selectPath", "SelectPath")),
      description: stringFromUnknown(field(item, "description", "Description"))
    })).filter((item) => item.name)
  };
}

const INITIAL_GIT_FORM: GitOperationForm = {
  operation: "stage_and_commit",
  branchName: "",
  commitMessage: "",
  remoteName: "",
  remoteBranchName: "",
  pullRequestTitle: "",
  pullRequestBody: "",
  baseBranchName: "main",
  draft: true
};

function normalizeGitSnapshot(payload: Record<string, unknown>): GitAutomationSnapshot {
  const readiness = asRecord(payload.readiness);
  const publishReadiness = asRecord(payload.publishReadiness);
  return {
    branchName: stringFromUnknown(payload.branchName),
    headShortHash: stringFromUnknown(payload.headShortHash),
    isClean: payload.isClean === true,
    changedFileCount: numberFromUnknown(payload.changedFileCount),
    stagedFileCount: numberFromUnknown(payload.stagedFileCount),
    unstagedFileCount: numberFromUnknown(payload.unstagedFileCount),
    untrackedFileCount: numberFromUnknown(payload.untrackedFileCount),
    conflictedFileCount: numberFromUnknown(payload.conflictedFileCount),
    diffShortStat: stringFromUnknown(payload.diffShortStat),
    suggestedCommitMessage: stringFromUnknown(payload.suggestedCommitMessage),
    suggestedBranchName: stringFromUnknown(payload.suggestedBranchName),
    readinessStatus: stringFromUnknown(readiness.status),
    publishStatus: stringFromUnknown(publishReadiness.status),
    blockers: Array.isArray(readiness.blockers)
      ? readiness.blockers.map((item) => {
          const record = asRecord(item);
          return typeof item === "string" ? item : stringFromUnknown(record.message) || stringFromUnknown(record.code);
        }).filter(Boolean)
      : [],
    files: records(payload.files).map((file) => ({
      path: stringFromUnknown(file.path),
      category: stringFromUnknown(file.category),
      staged: file.staged === true,
      unstaged: file.unstaged === true,
      untracked: file.untracked === true,
      addedLines: numberFromUnknown(file.addedLines),
      deletedLines: numberFromUnknown(file.deletedLines)
    })).filter((file) => file.path)
  };
}

function normalizeGitPreview(payload: Record<string, unknown>): GitOperationPreview {
  return {
    ok: payload.ok === true,
    status: stringFromUnknown(payload.status),
    previewId: stringFromUnknown(payload.previewId),
    operation: stringFromUnknown(payload.operation),
    requiresApproval: payload.requiresApproval !== false,
    checks: records(payload.checks).map((check) => ({ code: stringFromUnknown(check.code), status: stringFromUnknown(check.status), message: stringFromUnknown(check.message) })),
    plannedCommands: records(payload.plannedCommands).map((command) => ({ display: stringFromUnknown(command.display) })),
    affectedFiles: records(payload.affectedFiles).map((file) => ({ path: stringFromUnknown(file.path), category: stringFromUnknown(file.category) })),
    blockers: Array.isArray(payload.blockers) ? payload.blockers.map(String) : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
    approval: payload.approval && typeof payload.approval === "object" ? (payload.approval as Record<string, unknown>) : null
  };
}

function normalizeGitApply(payload: Record<string, unknown>): GitOperationApply {
  return {
    ok: payload.ok === true,
    status: stringFromUnknown(payload.status),
    operation: stringFromUnknown(payload.operation),
    message: stringFromUnknown(payload.message),
    executedCommands: records(payload.executedCommands).map((command) => ({
      executable: stringFromUnknown(command.executable),
      exitCode: numberFromUnknown(command.exitCode),
      stdOut: stringFromUnknown(command.stdOut),
      stdErr: stringFromUnknown(command.stdErr)
    }))
  };
}

export const useOpsPageStore = create<OpsPageState>((set) => ({
  doctor: {
    loading: false,
    running: false,
    fixPreviewing: false,
    fixApplying: false,
    found: null,
    report: null,
    fixResult: null,
    lastError: null,
    lastAction: null
  },
  ops: {
    loadingPlans: false,
    loadingTaskGraphs: false,
    planCount: 0,
    taskGraphCount: 0,
    latestPlanTitle: null,
    latestTaskGraphStatus: null,
    lastError: null
  },
  git: {
    snapshot: null,
    form: INITIAL_GIT_FORM,
    selectedPaths: [],
    preview: null,
    applyResult: null,
    loading: false,
    previewing: false,
    applying: false,
    lastError: ""
  },
  tools: {
    cleanup: {
      previewing: false,
      applying: false,
      preview: null,
      applyResult: null,
      lastError: ""
    },
    cron: {
      loading: false,
      running: false,
      waking: false,
      mutating: false,
      runsLoading: false,
      includeDisabled: true,
      selectedJobId: "",
      runsJobId: "",
      showAddForm: false,
      wakeText: "",
      form: INITIAL_CRON_FORM,
      status: null,
      jobs: [],
      runs: [],
      lastResult: null,
      lastActionMessage: "",
      lastError: ""
    },
    nodes: {
      loading: false,
      selectedNodeId: "",
      requestId: "",
      invokeCommand: "",
      invokeParamsJson: "{}",
      notifyTitle: "",
      notifyBody: "",
      notifyPriority: "active",
      notifyDelivery: "auto",
      snapshot: null,
      lastError: ""
    },
    telegram: {
      sending: false,
      text: "",
      result: null,
      lastError: ""
    },
    command: {
      running: false,
      text: "",
      pendingInput: "",
      startedAtMs: null,
      result: null,
      history: [],
      lastError: ""
    },
    context: {
      loading: false,
      commandsLoading: false,
      setupLoading: false,
      readingFile: false,
      filePath: "",
      workspaceSearch: "",
      recentWorkspaceFiles: [],
      logicScope: "workspace",
      logicRootKey: "",
      logicBrowsePath: "",
      project: null,
      commands: null,
      setup: null,
      filePreview: null,
      metrics: null,
      logicPath: null,
      lastError: ""
    },
    guard: {
      loading: false,
      dispatching: false,
      eventJson: buildGuardAlertSampleEventJson(),
      snapshot: null,
      dispatchResult: null,
      lastError: "",
      dispatchError: ""
    }
  },
  markDoctorLoading: () =>
    set((state) => ({
      doctor: {
        ...state.doctor,
        loading: true,
        lastAction: null,
        lastError: null
      }
    })),
  markDoctorRunning: () =>
    set((state) => ({
      doctor: {
        ...state.doctor,
        running: true,
        fixResult: null,
        lastAction: null,
        lastError: null
      }
    })),
  markDoctorResult: (payload) =>
    set(() => {
      const report = normalizeDoctorReport(payload.report);
      const summary = summarizeDoctorReport(report, Boolean(payload.found));
      useUiLogStore.getState().recordLog("info", `doctor_get_last: ${summary}`, { source: "doctor" });

      return {
        doctor: {
          loading: false,
          running: false,
          fixPreviewing: false,
          fixApplying: false,
          found: Boolean(payload.found),
          report,
          fixResult: null,
          lastError: null,
          lastAction: report ? "Doctor 보고서를 수신했습니다." : summary
        }
      };
    }),
  markDoctorFixResult: (payload) =>
    set((state) => {
      const fixResult = normalizeDoctorFixResult(payload);
      useUiLogStore.getState().recordLog(fixResult.ok ? "info" : "error", `doctor_fix_${fixResult.action}: ${fixResult.message}`, { source: "doctor" });
      return {
        doctor: {
          ...state.doctor,
          fixPreviewing: false,
          fixApplying: false,
          fixResult,
          lastAction: fixResult.ok ? fixResult.message : null,
          lastError: fixResult.ok ? null : fixResult.error || fixResult.message
        }
      };
    }),
  markDoctorError: (message) =>
    set((state) => {
      useUiLogStore.getState().recordLog("error", message, { source: "doctor" });
      return {
        doctor: {
          ...state.doctor,
          loading: false,
          running: false,
          fixPreviewing: false,
          fixApplying: false,
          lastError: message
        }
      };
    }),
  markOpsLoading: () =>
    set((state) => ({
      ops: {
        ...state.ops,
        loadingPlans: true,
        loadingTaskGraphs: true,
        lastError: null
      }
    })),
  markPlanListResult: (payload) =>
    set((state) => {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const first = items[0] || {};
      const latestPlanTitle = stringFromUnknown(first.title) || stringFromUnknown(first.objective) || stringFromUnknown(first.planId) || null;
      useUiLogStore.getState().recordLog("info", `plan_list: ${items.length}건`, { source: "ops" });

      return {
        ops: {
          ...state.ops,
          loadingPlans: false,
          planCount: items.length,
          latestPlanTitle,
          lastError: null
        }
      };
    }),
  markTaskGraphListResult: (payload) =>
    set((state) => {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const first = items[0] || {};
      const latestTaskGraphStatus = stringFromUnknown(first.status) || stringFromUnknown(first.graphId) || null;
      useUiLogStore.getState().recordLog("info", `task_graph_list: ${items.length}건`, { source: "ops" });

      return {
        ops: {
          ...state.ops,
          loadingTaskGraphs: false,
          taskGraphCount: items.length,
          latestTaskGraphStatus,
          lastError: null
        }
      };
    }),
  markOpsError: (message) =>
    set((state) => {
      useUiLogStore.getState().recordLog("error", message, { source: "ops" });
      return {
        ops: {
          ...state.ops,
          loadingPlans: false,
          loadingTaskGraphs: false,
          lastError: message
        }
      };
    }),
  markCleanupPreviewResult: (payload) =>
    set((state) => {
      const preview = normalizeCleanupPreview(payload);
      useUiLogStore.getState().recordLog(preview.ok ? "info" : "error", `cleanup_preview: ${preview.candidates.length}건`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          cleanup: {
            ...state.tools.cleanup,
            previewing: false,
            preview,
            applyResult: null,
            lastError: preview.ok ? "" : preview.error || preview.message
          }
        }
      };
    }),
  markCleanupApplyResult: (payload) =>
    set((state) => {
      const applyResult = normalizeCleanupApply(payload);
      useUiLogStore.getState().recordLog(applyResult.ok ? "info" : "error", `cleanup_apply: ${applyResult.removedCount}건`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          cleanup: {
            ...state.tools.cleanup,
            applying: false,
            applyResult,
            preview: applyResult.ok ? null : state.tools.cleanup.preview,
            lastError: applyResult.ok ? "" : applyResult.error || applyResult.message
          }
        }
      };
    }),
  markCronResult: (payload) =>
    set((state) => {
      const action = stringFromUnknown(payload.action);
      const result = normalizeCronAction(payload);
      const jobs = action === "list" ? normalizeCronJobs(payload.jobs) : state.tools.cron.jobs;
      const selectedJobId = state.tools.cron.selectedJobId && jobs.some((job) => job.id === state.tools.cron.selectedJobId)
        ? state.tools.cron.selectedJobId
        : jobs[0]?.id || "";
      const status = action === "status" ? normalizeCronStatus(payload) : state.tools.cron.status;
      const error = stringFromUnknown(payload.error);
      const ok = payload.ok !== false && !error;
      const runs = action === "runs" ? normalizeCronRuns(payload.entries) : state.tools.cron.runs;
      const runsJobId = action === "runs" ? stringFromUnknown(payload.jobId) || state.tools.cron.runsJobId : state.tools.cron.runsJobId;
      let lastActionMessage = state.tools.cron.lastActionMessage;
      if (action === "wake") {
        lastActionMessage = ok ? `wake(${stringFromUnknown(payload.mode) || "-"}): ${numberFromUnknown(payload.triggeredRuns)}건 트리거` : "";
      } else if (action === "add") {
        lastActionMessage = ok ? "새 cron job을 추가했습니다." : "";
      } else if (action === "update") {
        lastActionMessage = ok ? `${stringFromUnknown(payload.jobId) || "job"} 설정을 갱신했습니다.` : "";
      } else if (action === "remove") {
        lastActionMessage = ok && payload.removed === true ? `${stringFromUnknown(payload.jobId) || "job"} job을 삭제했습니다.` : "";
      }
      useUiLogStore.getState().recordLog(error ? "error" : "info", `cron_${action || "result"}: ${error || lastActionMessage || "ok"}`, { source: "ops" });
      // add/update/remove 성공 시 목록·상태를 다시 조회한다.
      if (ok && (action === "add" || action === "update" || action === "remove")) {
        setTimeout(() => {
          useOpsPageStore.getState().loadCronJobs();
          useOpsPageStore.getState().loadCronStatus();
        }, 0);
      }
      return {
        tools: {
          ...state.tools,
          cron: {
            ...state.tools.cron,
            loading: false,
            running: action === "run" ? false : state.tools.cron.running,
            waking: action === "wake" ? false : state.tools.cron.waking,
            mutating: action === "add" || action === "update" || action === "remove" ? false : state.tools.cron.mutating,
            runsLoading: action === "runs" ? false : state.tools.cron.runsLoading,
            showAddForm: action === "add" && ok ? false : state.tools.cron.showAddForm,
            form: action === "add" && ok ? INITIAL_CRON_FORM : state.tools.cron.form,
            status,
            jobs,
            runs,
            runsJobId,
            selectedJobId,
            lastResult: action === "run" ? result : state.tools.cron.lastResult,
            lastActionMessage,
            lastError: error
          }
        }
      };
    }),
  markNodesResult: (payload) =>
    set((state) => {
      const snapshot = normalizeNodesSnapshot(payload);
      const selectedNodeStillExists = state.tools.nodes.selectedNodeId && snapshot.nodes.some((node) => node.nodeId === state.tools.nodes.selectedNodeId);
      const selectedNodeId = selectedNodeStillExists ? state.tools.nodes.selectedNodeId : snapshot.selectedNodeId || snapshot.nodes[0]?.nodeId || "";
      const selectedNode = snapshot.nodes.find((node) => node.nodeId === selectedNodeId);
      const requestId = state.tools.nodes.requestId || snapshot.pendingRequests[0]?.requestId || "";
      const invokeCommand = state.tools.nodes.invokeCommand || selectedNode?.commands[0] || "";
      useUiLogStore.getState().recordLog(snapshot.ok ? "info" : "error", `nodes_${snapshot.action || "result"}: ${snapshot.nodes.length} nodes`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          nodes: {
            ...state.tools.nodes,
            loading: false,
            selectedNodeId,
            requestId,
            invokeCommand,
            snapshot,
            lastError: snapshot.ok ? "" : snapshot.error
          }
        }
      };
    }),
  markCommandResult: (payload) =>
    set((state) => {
      const entry = buildCommandConsoleEntry(payload, state.tools.command.pendingInput || state.tools.command.text, state.tools.command.startedAtMs);
      useUiLogStore.getState().recordLog(entry.status === "success" ? "info" : "error", `command: ${truncateSingleLine(entry.input, 80)}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          command: {
            ...state.tools.command,
            running: false,
            pendingInput: "",
            startedAtMs: null,
            result: entry,
            history: [entry, ...state.tools.command.history].slice(0, 8),
            lastError: entry.status === "success" ? "" : entry.output
          }
        }
      };
    }),
  markTelegramStubResult: (payload) =>
    set((state) => {
      const result = normalizeTelegramStub(payload);
      useUiLogStore.getState().recordLog(result.ok ? "info" : "error", `telegram_stub: ${result.status || "result"}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          telegram: {
            ...state.tools.telegram,
            sending: false,
            result,
            lastError: result.ok ? "" : result.error || result.response
          }
        }
      };
    }),
  markContextScanResult: (payload) =>
    set((state) => {
      const project = normalizeProjectContext(payload);
      useUiLogStore.getState().recordLog("info", `context_scan: sources=${project.sources.length} skills=${project.skills.length} commands=${project.commands.length}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            loading: false,
            project,
            lastError: ""
          }
        }
      };
    }),
  markCommandsListResult: (payload) =>
    set((state) => {
      const commands = normalizeCommandList(payload);
      useUiLogStore.getState().recordLog("info", `commands_list: ${commands.items.length}건`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            commandsLoading: false,
            commands,
            lastError: ""
          }
        }
      };
    }),
  markSetupStateResult: (payload) =>
    set((state) => {
      const setup = normalizeSetupState(payload);
      useUiLogStore.getState().recordLog("info", "get_setup_state: settings_state 수신", { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            setupLoading: false,
            setup,
            lastError: ""
          }
        }
      };
    }),
  markWorkspaceFilePreview: (payload) =>
    set((state) => {
      const filePreview = normalizeWorkspaceFilePreview(payload);
      const recentWorkspaceFiles = filePreview.ok && filePreview.path
        ? [filePreview.path, ...state.tools.context.recentWorkspaceFiles.filter((path) => path !== filePreview.path)].slice(0, 8)
        : state.tools.context.recentWorkspaceFiles;
      useUiLogStore.getState().recordLog(filePreview.ok ? "info" : "error", `read_workspace_file: ${filePreview.path || filePreview.message}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            readingFile: false,
            filePreview,
            filePath: filePreview.ok ? filePreview.path || state.tools.context.filePath : state.tools.context.filePath,
            recentWorkspaceFiles,
            lastError: filePreview.ok ? "" : filePreview.message
          }
        }
      };
    }),
  markMetricsResult: (payload) =>
    set((state) => {
      const metrics = normalizeMetrics(payload);
      useUiLogStore.getState().recordLog("info", `get_metrics: ${metrics.summary}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            setupLoading: false,
            metrics,
            lastError: ""
          }
        }
      };
    }),
  markLogicPathResult: (payload) =>
    set((state) => {
      const logicPath = normalizeLogicPath(payload);
      useUiLogStore.getState().recordLog(logicPath.ok ? "info" : "error", `logic_path_list: ${logicPath.items.length}건`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          context: {
            ...state.tools.context,
            loading: false,
            logicScope: logicPath.scope || state.tools.context.logicScope,
            logicRootKey: logicPath.rootKey || state.tools.context.logicRootKey,
            logicBrowsePath: logicPath.browsePath || state.tools.context.logicBrowsePath,
            logicPath,
            lastError: logicPath.ok ? "" : logicPath.message
          }
        }
      };
    }),
  markGuardAlertDispatchResult: (payload) =>
    set((state) => {
      const result = normalizeGuardAlertDispatchResult(payload);
      useUiLogStore.getState().recordLog(result.ok ? "info" : "error", `guard_alert_dispatch: ${result.status || "result"}`, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          guard: {
            ...state.tools.guard,
            dispatching: false,
            dispatchResult: result,
            dispatchError: result.ok ? "" : result.message || result.status
          }
        }
      };
    }),
  markToolsError: (message) =>
    set((state) => {
      useUiLogStore.getState().recordLog("error", message, { source: "ops" });
      return {
        tools: {
          ...state.tools,
          cleanup: {
            ...state.tools.cleanup,
            previewing: false,
            applying: false,
            lastError: state.tools.cleanup.previewing || state.tools.cleanup.applying ? message : state.tools.cleanup.lastError
          },
          cron: {
            ...state.tools.cron,
            loading: false,
            running: false,
            waking: false,
            mutating: false,
            runsLoading: false,
            lastError: state.tools.cron.loading || state.tools.cron.running || state.tools.cron.waking || state.tools.cron.mutating || state.tools.cron.runsLoading
              ? message
              : state.tools.cron.lastError
          },
          nodes: {
            ...state.tools.nodes,
            loading: false,
            lastError: state.tools.nodes.loading ? message : state.tools.nodes.lastError
          },
          telegram: {
            ...state.tools.telegram,
            sending: false,
            lastError: state.tools.telegram.sending ? message : state.tools.telegram.lastError
          },
          command: {
            ...state.tools.command,
            running: false,
            pendingInput: state.tools.command.running ? "" : state.tools.command.pendingInput,
            startedAtMs: state.tools.command.running ? null : state.tools.command.startedAtMs,
            lastError: state.tools.command.running ? message : state.tools.command.lastError
          },
          context: {
            ...state.tools.context,
            loading: false,
            commandsLoading: false,
            setupLoading: false,
            readingFile: false,
            lastError: state.tools.context.loading || state.tools.context.commandsLoading || state.tools.context.setupLoading || state.tools.context.readingFile
              ? message
              : state.tools.context.lastError
          },
          guard: {
            ...state.tools.guard,
            loading: false,
            dispatching: false,
            lastError: state.tools.guard.loading ? message : state.tools.guard.lastError,
            dispatchError: state.tools.guard.dispatching ? message : state.tools.guard.dispatchError
          }
        }
      };
    }),
  loadDoctorLast: () => {
    useOpsPageStore.getState().markDoctorLoading();
    if (!requestDesktopOps.doctorLast()) {
      useOpsPageStore.getState().markDoctorError("Doctor 최근 보고서 요청을 전송하지 못했다.");
    }
  },
  runDoctor: () => {
    useOpsPageStore.getState().markDoctorRunning();
    if (!requestDesktopOps.doctorRun()) {
      useOpsPageStore.getState().markDoctorError("Doctor 실행 요청을 전송하지 못했다.");
    }
  },
  previewDoctorFix: () => {
    set((state) => ({ doctor: { ...state.doctor, fixPreviewing: true, fixResult: null, lastError: null } }));
    if (!requestDesktopOps.doctorFixPreview()) {
      useOpsPageStore.getState().markDoctorError("Doctor fix preview 요청을 전송하지 못했다.");
    }
  },
  loadOpsSnapshot: () => {
    useOpsPageStore.getState().markOpsLoading();
    const planSent = requestDesktopOps.planList();
    const taskSent = requestDesktopOps.taskGraphList();
    if (!planSent || !taskSent) {
      useOpsPageStore.getState().markOpsError("운영 목록 조회 요청을 전송하지 못했다.");
    }
  },
  previewCleanup: () => {
    set((state) => ({
      tools: {
        ...state.tools,
        cleanup: { ...state.tools.cleanup, previewing: true, applyResult: null, lastError: "" }
      }
    }));
    if (!requestDesktopOps.cleanupPreview()) {
      useOpsPageStore.getState().markToolsError("Cleanup preview 요청을 전송하지 못했다.");
    }
  },
  applyCleanupPreview: async () => {
    const preview = useOpsPageStore.getState().tools.cleanup.preview;
    if (!preview?.previewId) return;
    const permission = await requestPermissionDialog({
      title: "Cleanup 적용",
      message: `${preview.candidates.length}개 후보를 삭제합니다. previewId와 후보 목록을 확인했을 때만 진행하세요.`,
      permissionAction: "delete",
      actionLabel: "cleanup_apply",
      files: preview.candidates.map((candidate) => `${candidate.path} · ${candidate.kind}`),
      approvalToken: preview.previewId,
      confirmLabel: "한 번 허용",
      tone: "danger"
    });
    if (!permission) return;
    set((state) => ({
      tools: {
        ...state.tools,
        cleanup: { ...state.tools.cleanup, applying: true, lastError: "" }
      }
    }));
    if (!requestDesktopOps.cleanupApply(preview.previewId)) {
      useOpsPageStore.getState().markToolsError("Cleanup apply 요청을 전송하지 못했다.");
    }
  },
  loadCronStatus: () => {
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.cronStatus()) {
      useOpsPageStore.getState().markToolsError("Cron status 요청을 전송하지 못했다.");
    }
  },
  loadCronJobs: () => {
    const includeDisabled = useOpsPageStore.getState().tools.cron.includeDisabled;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.cronList(includeDisabled)) {
      useOpsPageStore.getState().markToolsError("Cron list 요청을 전송하지 못했다.");
    }
  },
  setCronSelectedJob: (jobId) =>
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, selectedJobId: jobId, lastResult: null } } })),
  runSelectedCronJob: async () => {
    const jobId = useOpsPageStore.getState().tools.cron.selectedJobId;
    if (!jobId) return;
    const confirmed = await requestConfirmDialog({
      title: "Cron job 실행",
      message: `${jobId} job을 지금 수동 실행합니다. 루틴 동작과 알림 전송 여부를 확인한 뒤 진행하세요.`,
      confirmLabel: "실행",
      tone: "danger"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, running: true, lastError: "", lastResult: null } } }));
    if (!requestDesktopOps.cronRun(jobId)) {
      useOpsPageStore.getState().markToolsError("Cron run 요청을 전송하지 못했다.");
    }
  },
  loadCronRuns: (jobId) => {
    if (!jobId) return;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, runsLoading: true, runsJobId: jobId, runs: state.tools.cron.runsJobId === jobId ? state.tools.cron.runs : [], lastError: "" } } }));
    if (!requestDesktopOps.cronRuns(jobId)) {
      useOpsPageStore.getState().markToolsError("Cron runs 요청을 전송하지 못했다.");
    }
  },
  closeCronRuns: () =>
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, runsJobId: "", runs: [] } } })),
  setCronWakeText: (text) =>
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, wakeText: text } } })),
  wakeCron: async () => {
    const wakeText = useOpsPageStore.getState().tools.cron.wakeText.trim();
    const confirmed = await requestConfirmDialog({
      title: "스케줄러 깨우기",
      message: "지금 due 상태인 cron job들을 즉시 평가해 실행합니다. 진행할까요?",
      confirmLabel: "깨우기"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, waking: true, lastError: "", lastActionMessage: "" } } }));
    if (!requestDesktopOps.cronWake(wakeText || undefined)) {
      useOpsPageStore.getState().markToolsError("Cron wake 요청을 전송하지 못했다.");
    }
  },
  removeCronJob: async (jobId) => {
    if (!jobId) return;
    const job = useOpsPageStore.getState().tools.cron.jobs.find((item) => item.id === jobId);
    const permission = await requestPermissionDialog({
      title: "Cron job 삭제",
      message: `${job?.name || jobId} job을 영구 삭제합니다. 되돌릴 수 없습니다.`,
      permissionAction: "delete",
      actionLabel: `cron_remove · ${jobId}`,
      files: job ? [`${job.scheduleSummary} · ${job.payloadSummary}`] : undefined,
      approvalToken: jobId,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!permission) return;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, mutating: true, lastError: "", lastActionMessage: "" } } }));
    if (!requestDesktopOps.cronRemove(jobId)) {
      useOpsPageStore.getState().markToolsError("Cron remove 요청을 전송하지 못했다.");
    }
  },
  toggleCronJobEnabled: (jobId, enabled) => {
    if (!jobId) return;
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, mutating: true, lastError: "", lastActionMessage: "" } } }));
    if (!requestDesktopOps.cronSetEnabled(jobId, enabled)) {
      useOpsPageStore.getState().markToolsError("Cron 토글 요청을 전송하지 못했다.");
    }
  },
  toggleCronAddForm: () =>
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, showAddForm: !state.tools.cron.showAddForm, lastError: "" } } })),
  setCronFormField: (key, value) =>
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, form: { ...state.tools.cron.form, [key]: value } } } })),
  submitCronJob: () => {
    const form = useOpsPageStore.getState().tools.cron.form;
    if (!form.name.trim()) {
      set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, lastError: "cron job 이름을 입력해야 합니다." } } }));
      return;
    }
    if (form.scheduleKind === "at" && !form.scheduleAt?.trim()) {
      set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, lastError: "예약 일시(at)를 입력해야 합니다." } } }));
      return;
    }
    set((state) => ({ tools: { ...state.tools, cron: { ...state.tools.cron, mutating: true, lastError: "", lastActionMessage: "" } } }));
    if (!requestDesktopOps.cronAdd(form)) {
      useOpsPageStore.getState().markToolsError("Cron add 요청을 전송하지 못했다.");
    }
  },
  loadNodesSnapshot: () => {
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("status")) {
      useOpsPageStore.getState().markToolsError("Nodes status 요청을 전송하지 못했다.");
    }
  },
  loadNodesPending: () => {
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("pending")) {
      useOpsPageStore.getState().markToolsError("Nodes pending 요청을 전송하지 못했다.");
    }
  },
  setNodesField: (key, value) =>
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, [key]: value, lastError: "" } } })),
  approveNodeRequest: async (requestId) => {
    if (!requestId) return;
    const confirmed = await requestConfirmDialog({
      title: "Node pairing 승인",
      message: `${requestId} 요청을 승인해 node 목록에 추가합니다.`,
      confirmLabel: "승인"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("approve", { requestId })) {
      useOpsPageStore.getState().markToolsError("Nodes approve 요청을 전송하지 못했다.");
    }
  },
  rejectNodeRequest: async (requestId) => {
    if (!requestId) return;
    const confirmed = await requestConfirmDialog({
      title: "Node pairing 거절",
      message: `${requestId} 요청을 pending 목록에서 제거합니다.`,
      confirmLabel: "거절",
      tone: "danger"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("reject", { requestId })) {
      useOpsPageStore.getState().markToolsError("Nodes reject 요청을 전송하지 못했다.");
    }
  },
  invokeSelectedNodeCommand: async () => {
    const nodes = useOpsPageStore.getState().tools.nodes;
    const node = nodes.selectedNodeId.trim();
    const invokeCommand = nodes.invokeCommand.trim();
    const invokeParamsJson = nodes.invokeParamsJson.trim() || "{}";
    if (!node || !invokeCommand) {
      set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, lastError: "node와 command를 선택해야 한다." } } }));
      return;
    }
    try {
      JSON.parse(invokeParamsJson);
    } catch {
      set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, lastError: "invoke params JSON 형식이 올바르지 않다." } } }));
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "Node command 실행",
      message: `${node}에 ${invokeCommand} 명령을 보냅니다. 대상 node와 payload를 확인하세요.`,
      confirmLabel: "실행",
      tone: "danger"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("invoke", { node, invokeCommand, invokeParamsJson })) {
      useOpsPageStore.getState().markToolsError("Nodes invoke 요청을 전송하지 못했다.");
    }
  },
  describeSelectedNode: () => {
    const node = useOpsPageStore.getState().tools.nodes.selectedNodeId.trim();
    if (!node) {
      set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, lastError: "describe할 node를 선택해야 한다." } } }));
      return;
    }
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("describe", { node })) {
      useOpsPageStore.getState().markToolsError("Nodes describe 요청을 전송하지 못했다.");
    }
  },
  notifySelectedNode: async () => {
    const nodes = useOpsPageStore.getState().tools.nodes;
    const node = nodes.selectedNodeId.trim();
    const title = nodes.notifyTitle.trim();
    const body = nodes.notifyBody.trim();
    if (!node) {
      set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, lastError: "알림을 보낼 node를 선택해야 한다." } } }));
      return;
    }
    if (!title && !body) {
      set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, lastError: "알림 제목 또는 본문을 입력해야 한다." } } }));
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "Node 알림 전송",
      message: `${node}에 시스템 알림을 전송합니다.`,
      confirmLabel: "전송"
    });
    if (!confirmed) return;
    set((state) => ({ tools: { ...state.tools, nodes: { ...state.tools.nodes, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.nodes("notify", { node, title, body, priority: nodes.notifyPriority, delivery: nodes.notifyDelivery })) {
      useOpsPageStore.getState().markToolsError("Nodes notify 요청을 전송하지 못했다.");
    }
  },
  setCommandText: (text) =>
    set((state) => ({ tools: { ...state.tools, command: { ...state.tools.command, text, lastError: "" } } })),
  runCommandConsole: async () => {
    const text = useOpsPageStore.getState().tools.command.text.trim();
    if (!text) {
      set((state) => ({ tools: { ...state.tools, command: { ...state.tools.command, lastError: "실행할 자연어 명령을 입력해야 한다." } } }));
      return;
    }
    if (looksLikeRiskyCommand(text)) {
      const confirmed = await requestConfirmDialog({
        title: "자연어 명령 실행",
        message: "삭제, 종료, 초기화, 적용 같은 변경 가능 키워드가 포함되어 있습니다. 입력한 명령을 백엔드 라우터로 보낼까요?",
        confirmLabel: "실행",
        tone: "danger"
      });
      if (!confirmed) return;
    }
    const startedAtMs = Date.now();
    set((state) => ({
      tools: {
        ...state.tools,
        command: {
          ...state.tools.command,
          running: true,
          pendingInput: text,
          startedAtMs,
          result: null,
          lastError: ""
        }
      }
    }));
    if (!requestDesktopOps.command(text)) {
      useOpsPageStore.getState().markToolsError("자연어 command 요청을 전송하지 못했다.");
    }
  },
  setTelegramStubText: (text) =>
    set((state) => ({ tools: { ...state.tools, telegram: { ...state.tools.telegram, text, lastError: "" } } })),
  sendTelegramStubCommand: () => {
    const text = useOpsPageStore.getState().tools.telegram.text.trim();
    if (!text) {
      set((state) => ({ tools: { ...state.tools, telegram: { ...state.tools.telegram, lastError: "Telegram stub command 내용을 입력해야 한다." } } }));
      return;
    }
    set((state) => ({ tools: { ...state.tools, telegram: { ...state.tools.telegram, sending: true, result: null, lastError: "" } } }));
    if (!requestDesktopOps.telegramStubCommand(text)) {
      useOpsPageStore.getState().markToolsError("Telegram stub command 요청을 전송하지 못했다.");
    }
  },
  loadProjectContext: () => {
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.contextScan()) {
      useOpsPageStore.getState().markToolsError("Context scan 요청을 전송하지 못했다.");
    }
  },
  loadCommandTemplates: () => {
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, commandsLoading: true, lastError: "" } } }));
    if (!requestDesktopOps.commandsList()) {
      useOpsPageStore.getState().markToolsError("Commands list 요청을 전송하지 못했다.");
    }
  },
  loadSetupState: () => {
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, setupLoading: true, lastError: "" } } }));
    if (!requestDesktopOps.setupState()) {
      useOpsPageStore.getState().markToolsError("Setup state 요청을 전송하지 못했다.");
    }
  },
  setWorkspaceFilePath: (filePath) =>
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, filePath, lastError: "" } } })),
  setWorkspaceSearch: (query) =>
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, workspaceSearch: query, lastError: "" } } })),
  readWorkspaceFile: () => {
    const filePath = useOpsPageStore.getState().tools.context.filePath.trim();
    if (!filePath) {
      set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, lastError: "읽을 workspace 파일 경로를 입력해야 한다." } } }));
      return;
    }
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, readingFile: true, filePreview: null, lastError: "" } } }));
    if (!requestDesktopOps.readWorkspaceFile(filePath)) {
      useOpsPageStore.getState().markToolsError("Workspace file preview 요청을 전송하지 못했다.");
    }
  },
  openWorkspaceFile: (filePath) => {
    const normalized = filePath.trim();
    if (!normalized) return;
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, filePath: normalized, readingFile: true, filePreview: null, lastError: "" } } }));
    if (!requestDesktopOps.readWorkspaceFile(normalized)) {
      useOpsPageStore.getState().markToolsError("Workspace file preview 요청을 전송하지 못했다.");
    }
  },
  loadMetrics: () => {
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, setupLoading: true, lastError: "" } } }));
    if (!requestDesktopOps.metrics()) {
      useOpsPageStore.getState().markToolsError("Metrics 요청을 전송하지 못했다.");
    }
  },
  loadGuardRetryTimeline: async () => {
    set((state) => ({ tools: { ...state.tools, guard: { ...state.tools.guard, loading: true, lastError: "" } } }));
    try {
      const response = await fetch("/api/guard/retry-timeline?bucketMinutes=5&windowMinutes=60&maxBucketRows=12&channels=chat,coding,telegram", {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const snapshot = normalizeGuardRetryTimeline(payload);
      set((state) => ({ tools: { ...state.tools, guard: { ...state.tools.guard, loading: false, snapshot, lastError: "" } } }));
      useUiLogStore.getState().recordLog("info", `guard retry timeline: ${snapshot.channels.length} channels`, { source: "ops" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Guard retry timeline 조회 실패";
      set((state) => ({ tools: { ...state.tools, guard: { ...state.tools.guard, loading: false, lastError: message } } }));
    }
  },
  setGuardAlertEventJson: (eventJson) =>
    set((state) => ({ tools: { ...state.tools, guard: { ...state.tools.guard, eventJson, dispatchError: "" } } })),
  resetGuardAlertEventJson: () =>
    set((state) => ({
      tools: {
        ...state.tools,
        guard: {
          ...state.tools.guard,
          eventJson: buildGuardAlertSampleEventJson(),
          dispatchResult: null,
          dispatchError: ""
        }
      }
    })),
  dispatchGuardAlert: async () => {
    const guard = useOpsPageStore.getState().tools.guard;
    const parsed = parseGuardAlertEventJson(guard.eventJson);
    if (parsed.error || !parsed.event) {
      set((state) => ({ tools: { ...state.tools, guard: { ...state.tools.guard, dispatchError: parsed.error || "Guard Alert 이벤트를 확인해야 합니다." } } }));
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "Guard Alert dispatch 테스트",
      message: "현재 이벤트를 백엔드 Guard Alert dispatcher로 전송합니다. 실제 endpoint는 환경변수 설정을 따릅니다.",
      confirmLabel: "Dispatch",
      tone: "danger"
    });
    if (!confirmed) return;
    set((state) => ({
      tools: {
        ...state.tools,
        guard: {
          ...state.tools.guard,
          dispatching: true,
          dispatchResult: null,
          dispatchError: ""
        }
      }
    }));
    if (!requestDesktopOps.guardAlertDispatch(parsed.event)) {
      useOpsPageStore.getState().markToolsError("Guard Alert dispatch 요청을 전송하지 못했다.");
    }
  },
  setLogicPathField: (key, value) =>
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, [key]: value, lastError: "" } } })),
  loadLogicPath: (browsePath, rootKey) => {
    const context = useOpsPageStore.getState().tools.context;
    const nextBrowsePath = browsePath ?? context.logicBrowsePath;
    const nextRootKey = rootKey ?? context.logicRootKey;
    set((state) => ({ tools: { ...state.tools, context: { ...state.tools.context, loading: true, lastError: "" } } }));
    if (!requestDesktopOps.logicPathList(context.logicScope || "workspace", nextRootKey, nextBrowsePath)) {
      useOpsPageStore.getState().markToolsError("Logic path list 요청을 전송하지 못했다.");
    }
  },
  loadGitAutomation: () => {
    set((state) => ({ git: { ...state.git, loading: true, lastError: "" } }));
    if (!requestDesktopGit.automationSnapshot()) {
      set((state) => ({ git: { ...state.git, loading: false, lastError: "Git automation snapshot 요청을 전송하지 못했다." } }));
    }
  },
  setGitOperation: (operation) =>
    set((state) => ({ git: { ...state.git, form: { ...state.git.form, operation }, preview: null, applyResult: null } })),
  setGitField: (key, value) =>
    set((state) => ({ git: { ...state.git, form: { ...state.git.form, [key]: value }, preview: null, applyResult: null } })),
  toggleGitPath: (path) =>
    set((state) => {
      const selected = new Set(state.git.selectedPaths);
      if (selected.has(path)) selected.delete(path);
      else selected.add(path);
      return { git: { ...state.git, selectedPaths: Array.from(selected), preview: null, applyResult: null } };
    }),
  previewGitOperation: () => {
    const { form, selectedPaths } = useOpsPageStore.getState().git;
    set((state) => ({ git: { ...state.git, previewing: true, lastError: "", preview: null, applyResult: null } }));
    if (!requestDesktopGit.preview({ ...form, paths: selectedPaths })) {
      set((state) => ({ git: { ...state.git, previewing: false, lastError: "Git operation preview 요청을 전송하지 못했다." } }));
    }
  },
  applyGitPreview: async () => {
    const preview = useOpsPageStore.getState().git.preview;
    const token = stringFromUnknown(preview?.approval?.confirmationToken);
    if (!preview?.previewId || !token) return;
    const permission = await requestPermissionDialog({
      title: "Git operation 적용",
      message: `${preview.operation} preview를 적용합니다. 실행 명령과 대상 파일을 확인했을 때만 진행하세요.`,
      permissionAction: "write",
      actionLabel: `git_operation_apply · ${preview.operation}`,
      files: preview.affectedFiles.map((file) => `${file.path} · ${file.category}`),
      commands: preview.plannedCommands.map((command) => command.display),
      approvalToken: token,
      confirmLabel: "한 번 허용",
      tone: "danger"
    });
    if (!permission) return;
    set((state) => ({ git: { ...state.git, applying: true, lastError: "" } }));
    if (!requestDesktopGit.apply(preview.previewId, token, preview.approval || undefined)) {
      set((state) => ({ git: { ...state.git, applying: false, lastError: "Git operation apply 요청을 전송하지 못했다." } }));
    }
  }
}));

export function useGitAutomationBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = asRecord(message.payload);
      if (message.type === "doctor_fix_result") {
        useOpsPageStore.getState().markDoctorFixResult(message);
        return;
      }
      if (message.type === "cleanup_preview_result") {
        useOpsPageStore.getState().markCleanupPreviewResult(message);
        return;
      }
      if (message.type === "cleanup_apply_result") {
        useOpsPageStore.getState().markCleanupApplyResult(message);
        return;
      }
      if (message.type === "cron_result") {
        useOpsPageStore.getState().markCronResult(message);
        return;
      }
      if (message.type === "nodes_result") {
        useOpsPageStore.getState().markNodesResult(message);
        return;
      }
      if (message.type === "command_result") {
        useOpsPageStore.getState().markCommandResult(message);
        return;
      }
      if (message.type === "telegram_stub_result") {
        useOpsPageStore.getState().markTelegramStubResult(message);
        return;
      }
      if (message.type === "context_scan_result") {
        useOpsPageStore.getState().markContextScanResult(message);
        return;
      }
      if (message.type === "commands_list_result") {
        useOpsPageStore.getState().markCommandsListResult(message);
        return;
      }
      if (message.type === "settings_state" && useOpsPageStore.getState().tools.context.setupLoading) {
        useOpsPageStore.getState().markSetupStateResult(message);
        return;
      }
      if (message.type === "workspace_file_preview") {
        useOpsPageStore.getState().markWorkspaceFilePreview(message);
        return;
      }
      if (message.type === "metrics" && useOpsPageStore.getState().tools.context.setupLoading) {
        useOpsPageStore.getState().markMetricsResult(message);
        return;
      }
      if (message.type === "logic_path_list_result") {
        useOpsPageStore.getState().markLogicPathResult(message);
        return;
      }
      if (message.type === "guard_alert_dispatch_result") {
        useOpsPageStore.getState().markGuardAlertDispatchResult(message);
        return;
      }
      if (message.type === "git_automation_snapshot") {
        const snapshot = normalizeGitSnapshot(payload);
        useOpsPageStore.setState((state) => ({
          git: {
            ...state.git,
            snapshot,
            form: {
              ...state.git.form,
              commitMessage: state.git.form.commitMessage || snapshot.suggestedCommitMessage,
              branchName: state.git.form.branchName || snapshot.suggestedBranchName,
              pullRequestTitle: state.git.form.pullRequestTitle || snapshot.suggestedCommitMessage
            },
            selectedPaths: state.git.selectedPaths.filter((path) => snapshot.files.some((file) => file.path === path)),
            loading: false,
            lastError: ""
          }
        }));
        return;
      }
      if (message.type === "git_operation_preview_result") {
        useOpsPageStore.setState((state) => ({ git: { ...state.git, previewing: false, preview: normalizeGitPreview(payload), lastError: "" } }));
        return;
      }
      if (message.type === "git_operation_apply_result") {
        useOpsPageStore.setState((state) => ({ git: { ...state.git, applying: false, applyResult: normalizeGitApply(payload), preview: null, lastError: "" } }));
        useOpsPageStore.getState().loadGitAutomation();
        return;
      }
      if (message.type === "error") {
        const rawMessageText = stringFromUnknown(message.message) || "Operations 요청 처리 중 오류가 발생했다.";
        const messageText = formatOpsErrorMessage(message, rawMessageText);
        if (isRateLimitedMessage(rawMessageText)) {
          useOpsPageStore.setState((state) => {
            const doctorPending = state.doctor.loading || state.doctor.running || state.doctor.fixPreviewing || state.doctor.fixApplying;
            const opsPending = state.ops.loadingPlans || state.ops.loadingTaskGraphs;
            const cleanupPending = state.tools.cleanup.previewing || state.tools.cleanup.applying;
            const cronPending = state.tools.cron.loading || state.tools.cron.running || state.tools.cron.waking || state.tools.cron.mutating || state.tools.cron.runsLoading;
            const nodesPending = state.tools.nodes.loading;
            const telegramPending = state.tools.telegram.sending;
            const commandPending = state.tools.command.running;
            const contextPending = state.tools.context.loading || state.tools.context.commandsLoading || state.tools.context.setupLoading || state.tools.context.readingFile;
            const gitPending = state.git.loading || state.git.previewing || state.git.applying;
            return {
              doctor: {
                ...state.doctor,
                loading: false,
                running: false,
                fixPreviewing: false,
                fixApplying: false,
                lastError: doctorPending ? messageText : state.doctor.lastError
              },
              ops: {
                ...state.ops,
                loadingPlans: false,
                loadingTaskGraphs: false,
                lastError: opsPending ? messageText : state.ops.lastError
              },
              tools: {
                ...state.tools,
                cleanup: {
                  ...state.tools.cleanup,
                  previewing: false,
                  applying: false,
                  lastError: cleanupPending ? messageText : state.tools.cleanup.lastError
                },
                cron: {
                  ...state.tools.cron,
                  loading: false,
                  running: false,
                  waking: false,
                  mutating: false,
                  runsLoading: false,
                  lastError: cronPending ? messageText : state.tools.cron.lastError
                },
                nodes: {
                  ...state.tools.nodes,
                  loading: false,
                  lastError: nodesPending ? messageText : state.tools.nodes.lastError
                },
                telegram: {
                  ...state.tools.telegram,
                  sending: false,
                  lastError: telegramPending ? messageText : state.tools.telegram.lastError
                },
                command: {
                  ...state.tools.command,
                  running: false,
                  pendingInput: commandPending ? "" : state.tools.command.pendingInput,
                  startedAtMs: commandPending ? null : state.tools.command.startedAtMs,
                  lastError: commandPending ? messageText : state.tools.command.lastError
                },
                context: {
                  ...state.tools.context,
                  loading: false,
                  commandsLoading: false,
                  setupLoading: false,
                  readingFile: false,
                  lastError: contextPending ? messageText : state.tools.context.lastError
                },
                guard: {
                  ...state.tools.guard,
                  loading: false,
                  dispatching: false,
                  lastError: state.tools.guard.loading ? messageText : state.tools.guard.lastError,
                  dispatchError: state.tools.guard.dispatching ? messageText : state.tools.guard.dispatchError
                }
              },
              git: {
                ...state.git,
                loading: false,
                previewing: false,
                applying: false,
                lastError: gitPending ? messageText : state.git.lastError
              }
            };
          });
          return;
        }
        useOpsPageStore.getState().markToolsError(messageText);
        useOpsPageStore.setState((state) => ({ git: { ...state.git, loading: false, previewing: false, applying: false, lastError: messageText } }));
      }
    });
  }, []);
}

import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopRoutine,
  subscribeDesktopMessages,
  type DesktopServerMessage,
  type RoutineCreateInput
} from "../middleware/desktop-message-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { usePermissionPolicyStore } from "../dialog/permission-policy-store";

const DEFAULT_AGENT_PROVIDER = "codex";
const DEFAULT_AGENT_MODEL = "gpt-5.4";
const DEFAULT_AGENT_TIMEOUT_SECONDS = 120;
const MIN_AGENT_TIMEOUT_SECONDS = 120;
const MAX_AGENT_TIMEOUT_SECONDS = 1800;

export const ROUTINE_WEEKDAY_OPTIONS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" }
];

export const ROUTINE_AGENT_PROVIDER_OPTIONS = [
  { value: DEFAULT_AGENT_PROVIDER, label: "Codex" }
];

export const ROUTINE_AGENT_MODEL_OPTIONS = [
  { value: DEFAULT_AGENT_MODEL, label: `Codex 기본: ${DEFAULT_AGENT_MODEL}` }
];

export type RoutineRunSummary = {
  ts: number;
  runAtLocal: string;
  status: string;
  source: string;
  attemptCount: number;
  summary: string;
  error: string;
  telegramStatus: string;
  artifactPath: string;
  agentSessionId: string;
  agentRunId: string;
  agentProvider: string;
  agentModel: string;
  toolProfile: string;
  startUrl: string;
  finalUrl: string;
  pageTitle: string;
  screenshotPath: string;
  downloadPaths: string[];
  durationMs: number | null;
  durationText: string;
  nextRunLocal: string;
};

export type RoutineItem = {
  id: string;
  title: string;
  enabled: boolean;
  request: string;
  preview: string;
  executionMode: string;
  resolvedExecutionMode: string;
  agentProvider: string;
  agentModel: string;
  agentStartUrl: string;
  agentTimeoutSeconds: number;
  agentToolProfile: string;
  agentUsePlaywright: boolean;
  scheduleSummary: string;
  scheduleSourceMode: string;
  scheduleKind: string;
  scheduleTime: string;
  scheduleExpr: string;
  timezoneId: string;
  dayOfMonth: number | null;
  weekdays: number[];
  maxRetries: number;
  retryDelaySeconds: number;
  notifyPolicy: string;
  notifyTelegram: boolean;
  nextRunLocal: string;
  lastRunLocal: string;
  lastStatus: string;
  lastOutput: string;
  scriptPath: string;
  language: string;
  coderModel: string;
  qualityStatus: string;
  qualityWarnings: string[];
  runCommand: string;
  runs: RoutineRunSummary[];
};

export type RoutineCreateForm = RoutineCreateInput;

export type RoutinePreview = {
  request: string;
  scheduleSourceMode: string;
  scheduleText: string;
  scheduleKind: string;
  timezoneId: string;
  resolvedExecutionMode: string;
  executionRoute: string;
  warnings: string[];
};

export type RoutineProgress = {
  active: boolean;
  operation: string;
  message: string;
  percent: number;
  done: boolean;
  ok: boolean | null;
  stageKey: string;
  stageTitle: string;
  stageDetail: string;
  stageIndex: number;
  updatedAt: number;
};

export type RoutineSchedulerStatus = {
  enabled: boolean;
  totalRoutines: number;
  enabledRoutines: number;
  runningRoutines: number;
  dueRoutines: number;
  nextRunAtMs: number | null;
  lastError: string;
};

export type RoutineRunDetail = {
  ok: boolean;
  routineId: string;
  ts: number;
  runAtLocal: string;
  title: string;
  status: string;
  source: string;
  attemptCount: number;
  telegramStatus: string;
  artifactPath: string;
  agentSessionId: string;
  agentRunId: string;
  agentProvider: string;
  agentModel: string;
  toolProfile: string;
  startUrl: string;
  finalUrl: string;
  pageTitle: string;
  screenshotPath: string;
  downloadPaths: string[];
  error: string;
  content: string;
};

export type RoutineDetailPane = "edit" | "history" | "output";
export type RoutineListFilter = "all" | "enabled" | "disabled" | "failed" | "quality" | "browser";

const EMPTY_PROGRESS: RoutineProgress = {
  active: false,
  operation: "",
  message: "",
  percent: 0,
  done: false,
  ok: null,
  stageKey: "",
  stageTitle: "",
  stageDetail: "",
  stageIndex: 0,
  updatedAt: 0
};

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  } catch (_error) {
    return "Asia/Seoul";
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createRoutineFormState(overrides: Partial<RoutineCreateForm> = {}): RoutineCreateForm {
  const permissionDefaults = usePermissionPolicyStore.getState().defaults;
  return {
    title: "",
    request: "",
    executionMode: "",
    agentProvider: DEFAULT_AGENT_PROVIDER,
    agentModel: DEFAULT_AGENT_MODEL,
    agentStartUrl: "",
    agentTimeoutSeconds: DEFAULT_AGENT_TIMEOUT_SECONDS,
    agentToolProfile: "playwright_only",
    agentUsePlaywright: true,
    scheduleSourceMode: "auto",
    maxRetries: 1,
    retryDelaySeconds: 15,
    notifyPolicy: "always",
    scheduleKind: "daily",
    scheduleTime: "08:00",
    weekdays: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    timezoneId: getLocalTimezone(),
    runImmediately: false,
    notifyTelegram: true,
    permissions: { ...permissionDefaults },
    ...overrides
  };
}

const EMPTY_CREATE_FORM = createRoutineFormState();

type AutomateState = {
  routines: RoutineItem[];
  selectedRoutineId: string;
  pending: boolean;
  creating: boolean;
  updating: boolean;
  runDetailLoading: boolean;
  lastMessage: string;
  createForm: RoutineCreateForm;
  editForm: RoutineCreateForm;
  createPanelOpen: boolean;
  preview: RoutinePreview | null;
  editPreview: RoutinePreview | null;
  previewTarget: "create" | "edit";
  progress: RoutineProgress;
  schedulerStatus: RoutineSchedulerStatus | null;
  listQuery: string;
  listFilter: RoutineListFilter;
  detailPane: RoutineDetailPane;
  runDetail: RoutineRunDetail | null;
  loadRoutines: () => void;
  loadSchedulerStatus: () => void;
  selectRoutine: (id: string) => void;
  setListQuery: (query: string) => void;
  setListFilter: (filter: RoutineListFilter) => void;
  setDetailPane: (pane: RoutineDetailPane) => void;
  runRoutine: (id: string) => void;
  testRoutineTelegram: (id: string) => void;
  testBrowserAgentRoutine: (id: string) => void;
  toggleRoutine: (id: string, enabled: boolean) => void;
  toggleRoutineTelegram: (routine: RoutineItem, enabled: boolean) => void;
  deleteRoutine: (id: string) => void;
  patchCreateForm: (patch: Partial<RoutineCreateForm>) => void;
  patchEditForm: (patch: Partial<RoutineCreateForm>) => void;
  toggleWeekday: (day: number) => void;
  toggleEditWeekday: (day: number) => void;
  resetCreateForm: () => void;
  resetEditForm: () => void;
  setCreatePanelOpen: (open: boolean) => void;
  previewRoutine: (target?: "create" | "edit") => void;
  createRoutine: () => void;
  updateRoutine: () => void;
  openRunDetail: (routineId: string, timestamp: number) => void;
  closeRunDetail: () => void;
  resendRunTelegram: (routineId: string, timestamp: number) => void;
};

function readString(record: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === "string");
  return typeof value === "string" ? value : "";
}

function readNumber(record: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === "number" && Number.isFinite(candidate));
  return typeof value === "number" ? value : null;
}

function readBoolean(record: Record<string, unknown>, fallback: boolean, ...keys: string[]) {
  const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === "boolean");
  return typeof value === "boolean" ? value : fallback;
}

function readNumberList(record: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => record[key]).find(Array.isArray);
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isInteger(item))
    : [];
}

function readStringList(record: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => record[key]).find(Array.isArray);
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeExecutionMode(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "web" || normalized === "url" || normalized === "script" || normalized === "browser_agent"
    ? normalized
    : "";
}

function normalizeScheduleSourceMode(value: string, fallback = "auto") {
  const normalized = value.trim().toLowerCase();
  return normalized === "manual" || normalized === "auto" ? normalized : fallback;
}

function normalizeScheduleKind(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "weekly" || normalized === "monthly" || normalized === "daily" ? normalized : "daily";
}

function normalizeToolProfile(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "desktop-control") return "desktop_control";
  if (normalized === "playwright" || normalized === "playwright-only") return "playwright_only";
  return normalized || "playwright_only";
}

function normalizeWeekdays(values: number[]) {
  const unique = Array.from(new Set(values.map((value) => (value === 7 ? 0 : value)).filter((value) => value >= 0 && value <= 6)));
  unique.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return unique;
}

function normalizeRuns(value: unknown): RoutineRunSummary[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          ts: readNumber(record, "ts", "Ts") ?? 0,
          runAtLocal: readString(record, "runAtLocal", "RunAtLocal"),
          status: readString(record, "status", "Status"),
          source: readString(record, "source", "Source"),
          attemptCount: readNumber(record, "attemptCount", "AttemptCount") ?? 1,
          summary: readString(record, "summary", "Summary"),
          error: readString(record, "error", "Error"),
          telegramStatus: readString(record, "telegramStatus", "TelegramStatus"),
          artifactPath: readString(record, "artifactPath", "ArtifactPath"),
          agentSessionId: readString(record, "agentSessionId", "AgentSessionId"),
          agentRunId: readString(record, "agentRunId", "AgentRunId"),
          agentProvider: readString(record, "agentProvider", "AgentProvider"),
          agentModel: readString(record, "agentModel", "AgentModel"),
          toolProfile: readString(record, "toolProfile", "ToolProfile"),
          startUrl: readString(record, "startUrl", "StartUrl"),
          finalUrl: readString(record, "finalUrl", "FinalUrl"),
          pageTitle: readString(record, "pageTitle", "PageTitle"),
          screenshotPath: readString(record, "screenshotPath", "ScreenshotPath"),
          downloadPaths: readStringList(record, "downloadPaths", "DownloadPaths"),
          durationMs: readNumber(record, "durationMs", "DurationMs"),
          durationText: readString(record, "durationText", "DurationText"),
          nextRunLocal: readString(record, "nextRunLocal", "NextRunLocal")
        };
      }).filter((item) => item.ts > 0)
    : [];
}

function normalizeRoutine(value: unknown): RoutineItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = readString(record, "id", "Id", "routineId", "RoutineId");
  if (!id) return null;

  const request = readString(record, "request", "Request", "text", "Text");
  const scheduleSummary = readString(record, "scheduleText", "ScheduleText", "scheduleSummary", "schedule");
  const resolvedExecutionMode = normalizeExecutionMode(readString(record, "resolvedExecutionMode", "ResolvedExecutionMode"));
  const executionMode = normalizeExecutionMode(readString(record, "executionMode", "ExecutionMode"));
  const scheduleTime = readString(record, "timeOfDay", "TimeOfDay", "scheduleTime", "ScheduleTime") || "08:00";
  const agentTimeoutSeconds = readNumber(record, "agentTimeoutSeconds", "AgentTimeoutSeconds") ?? DEFAULT_AGENT_TIMEOUT_SECONDS;

  return {
    id,
    title: readString(record, "title", "Title", "name", "Name") || "루틴",
    enabled: readBoolean(record, true, "enabled", "Enabled"),
    request,
    preview: readString(record, "preview", "description", "lastOutput", "LastOutput") || request,
    executionMode,
    resolvedExecutionMode,
    agentProvider: readString(record, "agentProvider", "AgentProvider") || DEFAULT_AGENT_PROVIDER,
    agentModel: readString(record, "agentModel", "AgentModel") || DEFAULT_AGENT_MODEL,
    agentStartUrl: readString(record, "agentStartUrl", "AgentStartUrl"),
    agentTimeoutSeconds: clampNumber(agentTimeoutSeconds, MIN_AGENT_TIMEOUT_SECONDS, MAX_AGENT_TIMEOUT_SECONDS),
    agentToolProfile: normalizeToolProfile(readString(record, "agentToolProfile", "AgentToolProfile", "toolProfile", "ToolProfile")),
    agentUsePlaywright: readBoolean(record, true, "agentUsePlaywright", "AgentUsePlaywright"),
    scheduleSummary,
    scheduleSourceMode: normalizeScheduleSourceMode(readString(record, "scheduleSourceMode", "ScheduleSourceMode"), "manual"),
    scheduleKind: normalizeScheduleKind(readString(record, "scheduleKind", "ScheduleKind")),
    scheduleTime,
    scheduleExpr: readString(record, "scheduleExpr", "ScheduleExpr"),
    timezoneId: readString(record, "timezoneId", "TimezoneId") || getLocalTimezone(),
    dayOfMonth: readNumber(record, "dayOfMonth", "DayOfMonth"),
    weekdays: normalizeWeekdays(readNumberList(record, "weekdays", "Weekdays")),
    maxRetries: readNumber(record, "maxRetries", "MaxRetries") ?? 1,
    retryDelaySeconds: readNumber(record, "retryDelaySeconds", "RetryDelaySeconds") ?? 15,
    notifyPolicy: readString(record, "notifyPolicy", "NotifyPolicy") || "always",
    notifyTelegram: readBoolean(record, true, "notifyTelegram", "NotifyTelegram"),
    nextRunLocal: readString(record, "nextRunLocal", "NextRunLocal"),
    lastRunLocal: readString(record, "lastRunLocal", "LastRunLocal"),
    lastStatus: readString(record, "lastStatus", "LastStatus"),
    lastOutput: readString(record, "lastOutput", "LastOutput"),
    scriptPath: readString(record, "scriptPath", "ScriptPath"),
    language: readString(record, "language", "Language"),
    coderModel: readString(record, "coderModel", "CoderModel"),
    qualityStatus: readString(record, "qualityStatus", "QualityStatus") || "unknown",
    qualityWarnings: readStringList(record, "qualityWarnings", "QualityWarnings"),
    runCommand: readString(record, "runCommand", "RunCommand"),
    runs: normalizeRuns(record.runs ?? record.Runs)
  };
}

function normalizeList(value: unknown): RoutineItem[] {
  return Array.isArray(value)
    ? value.map(normalizeRoutine).filter((item): item is RoutineItem => !!item)
    : [];
}

function hydrateRoutineFormFromRoutine(routine: RoutineItem | null): RoutineCreateForm {
  if (!routine) return createRoutineFormState({ scheduleSourceMode: "manual" });
  return createRoutineFormState({
    title: routine.title || "",
    request: routine.request || "",
    executionMode: routine.executionMode || "",
    agentProvider: routine.agentProvider || DEFAULT_AGENT_PROVIDER,
    agentModel: routine.agentModel || DEFAULT_AGENT_MODEL,
    agentStartUrl: routine.agentStartUrl || "",
    agentTimeoutSeconds: routine.agentTimeoutSeconds || DEFAULT_AGENT_TIMEOUT_SECONDS,
    agentToolProfile: normalizeToolProfile(routine.agentToolProfile),
    agentUsePlaywright: routine.agentUsePlaywright !== false,
    scheduleSourceMode: normalizeScheduleSourceMode(routine.scheduleSourceMode, "manual"),
    maxRetries: routine.maxRetries,
    retryDelaySeconds: routine.retryDelaySeconds,
    notifyPolicy: routine.notifyPolicy || "always",
    scheduleKind: normalizeScheduleKind(routine.scheduleKind),
    scheduleTime: routine.scheduleTime || "08:00",
    weekdays: normalizeWeekdays(routine.weekdays),
    dayOfMonth: routine.dayOfMonth || 1,
    timezoneId: routine.timezoneId || getLocalTimezone(),
    runImmediately: false,
    notifyTelegram: routine.notifyTelegram
  });
}

function validateForm(form: RoutineCreateForm) {
  if (form.request.trim().length < 5) {
    return "요청 원문은 최소 5자 이상이어야 합니다.";
  }
  if (form.scheduleSourceMode === "manual" && form.scheduleKind === "weekly" && form.weekdays.length === 0) {
    return "주간 스케줄은 요일을 하나 이상 선택해야 합니다.";
  }
  return "";
}

function toggleWeekdayValue(values: number[], day: number) {
  return normalizeWeekdays(values.includes(day) ? values.filter((value) => value !== day) : [...values, day]);
}

function normalizeRunDetail(message: DesktopServerMessage): RoutineRunDetail {
  return {
    ok: message.ok !== false,
    routineId: String(message.routineId || ""),
    ts: Number(message.ts || 0),
    runAtLocal: String(message.runAtLocal || ""),
    title: String(message.title || ""),
    status: String(message.status || ""),
    source: String(message.source || ""),
    attemptCount: Number(message.attemptCount || 1),
    telegramStatus: String(message.telegramStatus || ""),
    artifactPath: String(message.artifactPath || ""),
    agentSessionId: String(message.agentSessionId || ""),
    agentRunId: String(message.agentRunId || ""),
    agentProvider: String(message.agentProvider || ""),
    agentModel: String(message.agentModel || ""),
    toolProfile: String(message.toolProfile || ""),
    startUrl: String(message.startUrl || ""),
    finalUrl: String(message.finalUrl || ""),
    pageTitle: String(message.pageTitle || ""),
    screenshotPath: String(message.screenshotPath || ""),
    downloadPaths: Array.isArray(message.downloadPaths) ? message.downloadPaths.map(String).filter(Boolean) : [],
    error: String(message.error || ""),
    content: String(message.content || "")
  };
}

export const useAutomateStore = create<AutomateState>((set, get) => ({
  routines: [],
  selectedRoutineId: "",
  pending: false,
  creating: false,
  updating: false,
  runDetailLoading: false,
  lastMessage: "",
  createForm: { ...EMPTY_CREATE_FORM },
  editForm: createRoutineFormState({ scheduleSourceMode: "manual" }),
  createPanelOpen: false,
  preview: null,
  editPreview: null,
  previewTarget: "create",
  progress: { ...EMPTY_PROGRESS },
  schedulerStatus: null,
  listQuery: "",
  listFilter: "all",
  detailPane: "history",
  runDetail: null,
  loadRoutines: () => {
    set({ pending: true });
    const listOk = requestDesktopRoutine.listRoutines();
    requestDesktopRoutine.schedulerStatus();
    if (!listOk) {
      set({ pending: false, lastMessage: "루틴 목록 요청을 전송하지 못했습니다." });
    }
  },
  loadSchedulerStatus: () => {
    if (!requestDesktopRoutine.schedulerStatus()) {
      set({ lastMessage: "스케줄러 상태 요청을 전송하지 못했습니다." });
    }
  },
  selectRoutine: (id) => {
    const routine = get().routines.find((item) => item.id === id) || null;
    set({
      selectedRoutineId: id,
      editForm: hydrateRoutineFormFromRoutine(routine),
      editPreview: null,
      runDetail: null
    });
  },
  setListQuery: (query) => set({ listQuery: query }),
  setListFilter: (filter) => set({ listFilter: filter }),
  setDetailPane: (pane) => set({ detailPane: pane }),
  runRoutine: (id) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.runRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 실행 요청을 전송하지 못했습니다." });
    }
  },
  testRoutineTelegram: (id) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.testRoutineTelegram(id)) {
      set({ pending: false, lastMessage: "텔레그램 테스트 요청을 전송하지 못했습니다." });
    }
  },
  testBrowserAgentRoutine: (id) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.testBrowserAgentRoutine(id)) {
      set({ pending: false, lastMessage: "브라우저 에이전트 테스트 요청을 전송하지 못했습니다." });
    }
  },
  toggleRoutine: (id, enabled) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.toggleRoutine(id, enabled)) {
      set({ pending: false, lastMessage: "루틴 상태 변경 요청을 전송하지 못했습니다." });
    }
  },
  toggleRoutineTelegram: (routine, enabled) => {
    if (!routine?.id) return;
    const form = hydrateRoutineFormFromRoutine(routine);
    set({ pending: true, updating: true, selectedRoutineId: routine.id });
    if (!requestDesktopRoutine.updateRoutine(routine.id, { ...form, notifyTelegram: enabled })) {
      set({ pending: false, updating: false, lastMessage: "텔레그램 응답 설정 요청을 전송하지 못했습니다." });
    }
  },
  deleteRoutine: async (id) => {
    if (!id) return;
    const confirmed = await requestConfirmDialog({
      title: "루틴 삭제",
      message: "선택한 루틴과 실행 설정을 삭제할까요?",
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.deleteRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 삭제 요청을 전송하지 못했습니다." });
    }
  },
  patchCreateForm: (patch) => set({ createForm: { ...get().createForm, ...patch } }),
  patchEditForm: (patch) => set({ editForm: { ...get().editForm, ...patch } }),
  toggleWeekday: (day) => set({ createForm: { ...get().createForm, weekdays: toggleWeekdayValue(get().createForm.weekdays, day) } }),
  toggleEditWeekday: (day) => set({ editForm: { ...get().editForm, weekdays: toggleWeekdayValue(get().editForm.weekdays, day) } }),
  resetCreateForm: () => set({ createForm: createRoutineFormState(), preview: null }),
  resetEditForm: () => {
    const selected = get().routines.find((item) => item.id === get().selectedRoutineId) || null;
    set({ editForm: hydrateRoutineFormFromRoutine(selected), editPreview: null });
  },
  setCreatePanelOpen: (open) => set({ createPanelOpen: open, ...(open ? {} : { preview: null }) }),
  previewRoutine: (target = "create") => {
    const form = target === "edit" ? get().editForm : get().createForm;
    const error = validateForm(form);
    if (error) {
      set({ lastMessage: error });
      return;
    }
    set({ previewTarget: target });
    if (!requestDesktopRoutine.previewRoutine(form)) {
      set({ lastMessage: "루틴 미리보기 요청을 전송하지 못했습니다." });
    }
  },
  createRoutine: () => {
    const form = get().createForm;
    const error = validateForm(form);
    if (error) {
      set({ lastMessage: error });
      return;
    }
    set({ creating: true, pending: true });
    if (!requestDesktopRoutine.createRoutine(form)) {
      set({ creating: false, pending: false, lastMessage: "루틴 생성 요청을 전송하지 못했습니다." });
    }
  },
  updateRoutine: () => {
    const id = get().selectedRoutineId;
    if (!id) {
      set({ lastMessage: "먼저 수정할 루틴을 선택하세요." });
      return;
    }
    const form = get().editForm;
    const error = validateForm(form);
    if (error) {
      set({ lastMessage: error });
      return;
    }
    set({ updating: true, pending: true });
    if (!requestDesktopRoutine.updateRoutine(id, form)) {
      set({ updating: false, pending: false, lastMessage: "루틴 수정 요청을 전송하지 못했습니다." });
    }
  },
  openRunDetail: (routineId, timestamp) => {
    if (!routineId || !timestamp) return;
    set({ runDetailLoading: true, runDetail: null });
    if (!requestDesktopRoutine.getRunDetail(routineId, timestamp)) {
      set({ runDetailLoading: false, lastMessage: "실행 상세 요청을 전송하지 못했습니다." });
    }
  },
  closeRunDetail: () => set({ runDetail: null, runDetailLoading: false }),
  resendRunTelegram: (routineId, timestamp) => {
    if (!routineId || !timestamp) return;
    set({ pending: true });
    if (!requestDesktopRoutine.resendRunTelegram(routineId, timestamp)) {
      set({ pending: false, lastMessage: "텔레그램 재전송 요청을 전송하지 못했습니다." });
    }
  }
}));

export function useAutomatePageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "routines_state") {
        const routines = normalizeList(message.items);
        const currentId = useAutomateStore.getState().selectedRoutineId;
        const selected = routines.find((item) => item.id === currentId) || routines[0] || null;
        useAutomateStore.setState({
          routines,
          selectedRoutineId: selected?.id || "",
          editForm: hydrateRoutineFormFromRoutine(selected),
          pending: false,
          creating: false,
          updating: false
        });
        return;
      }

      if (message.type === "routine_scheduler_status") {
        useAutomateStore.setState({
          schedulerStatus: {
            enabled: message.enabled !== false,
            totalRoutines: Number(message.totalRoutines || 0),
            enabledRoutines: Number(message.enabledRoutines || 0),
            runningRoutines: Number(message.runningRoutines || 0),
            dueRoutines: Number(message.dueRoutines || 0),
            nextRunAtMs: typeof message.nextRunAtMs === "number" ? message.nextRunAtMs : null,
            lastError: String(message.lastError || "")
          }
        });
        return;
      }

      if (message.type === "routine_preview") {
        const preview = {
          request: String(message.request || ""),
          scheduleSourceMode: String(message.scheduleSourceMode || ""),
          scheduleText: String(message.scheduleText || ""),
          scheduleKind: String(message.scheduleKind || ""),
          timezoneId: String(message.timezoneId || ""),
          resolvedExecutionMode: String(message.resolvedExecutionMode || ""),
          executionRoute: String(message.executionRoute || ""),
          warnings: Array.isArray(message.warnings) ? (message.warnings as unknown[]).map(String) : []
        };
        const target = useAutomateStore.getState().previewTarget;
        useAutomateStore.setState(target === "edit" ? { editPreview: preview } : { preview });
        return;
      }

      if (message.type === "routine_result") {
        const store = useAutomateStore.getState();
        const succeeded = message.ok !== false;
        const normalizedRoutine = normalizeRoutine(message.routine);
        useAutomateStore.setState({
          pending: false,
          creating: false,
          updating: false,
          lastMessage: String(message.message || ""),
          selectedRoutineId: normalizedRoutine?.id || store.selectedRoutineId,
          ...(store.creating && succeeded ? { createForm: { ...EMPTY_CREATE_FORM }, preview: null, createPanelOpen: false } : {}),
          ...(store.updating && succeeded ? { editPreview: null } : {})
        });
        return;
      }

      if (message.type === "routine_progress") {
        const done = message.done === true;
        useAutomateStore.setState({
          progress: {
            active: true,
            operation: String(message.operation || ""),
            message: String(message.message || ""),
            percent: Number(message.percent || 0),
            done,
            ok: typeof message.ok === "boolean" ? message.ok : null,
            stageKey: String(message.stageKey || ""),
            stageTitle: String(message.stageTitle || ""),
            stageDetail: String(message.stageDetail || ""),
            stageIndex: Number(message.stageIndex || 0),
            updatedAt: Date.now()
          },
          lastMessage: String(message.message || ""),
          pending: !done
        });
        return;
      }

      if (message.type === "routine_run_detail") {
        useAutomateStore.setState({
          runDetail: normalizeRunDetail(message),
          runDetailLoading: false,
          pending: false
        });
        return;
      }

      if (message.type === "error") {
        useAutomateStore.setState({
          pending: false,
          creating: false,
          updating: false,
          runDetailLoading: false,
          lastMessage: String(message.message || "오류가 발생했습니다.")
        });
      }
    });
  }, []);
}

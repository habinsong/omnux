import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopRoutine,
  subscribeDesktopMessages,
  type DesktopServerMessage,
  type RoutineCreateInput
} from "../middleware/desktop-message-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type RoutineItem = {
  id: string;
  title: string;
  enabled: boolean;
  toolProfile: string;
  scheduleSummary: string;
  preview: string;
  request: string;
  scheduleKind: string;
  scheduleTime: string;
  dayOfMonth: number | null;
  weekdays: number[];
  notifyTelegram: boolean;
  executionMode: string;
  resolvedExecutionMode: string;
  runCommand: string;
  lastStatus: string;
};

export type RoutineCreateForm = RoutineCreateInput;

export type RoutinePreview = {
  scheduleText: string;
  resolvedExecutionMode: string;
  executionRoute: string;
  warnings: string[];
};

const EMPTY_CREATE_FORM: RoutineCreateForm = {
  title: "",
  request: "",
  scheduleKind: "daily",
  scheduleTime: "08:00",
  weekdays: [],
  dayOfMonth: 1,
  runImmediately: false,
  notifyTelegram: false
};

type AutomateState = {
  routines: RoutineItem[];
  selectedRoutineId: string;
  pending: boolean;
  lastMessage: string;
  createForm: RoutineCreateForm;
  creating: boolean;
  createPanelOpen: boolean;
  preview: RoutinePreview | null;
  loadRoutines: () => void;
  selectRoutine: (id: string) => void;
  runRoutine: (id: string) => void;
  toggleRoutine: (id: string, enabled: boolean) => void;
  deleteRoutine: (id: string) => void;
  patchCreateForm: (patch: Partial<RoutineCreateForm>) => void;
  toggleWeekday: (day: number) => void;
  resetCreateForm: () => void;
  setCreatePanelOpen: (open: boolean) => void;
  previewRoutine: () => void;
  createRoutine: () => void;
};

export const useAutomateStore = create<AutomateState>((set, get) => ({
  routines: [],
  selectedRoutineId: "",
  pending: false,
  lastMessage: "",
  createForm: { ...EMPTY_CREATE_FORM },
  creating: false,
  createPanelOpen: false,
  preview: null,
  loadRoutines: () => {
    set({ pending: true });
    if (!requestDesktopRoutine.listRoutines()) {
      set({ pending: false, lastMessage: "루틴 목록 요청을 전송하지 못했다." });
    }
  },
  selectRoutine: (id) => set({ selectedRoutineId: id }),
  runRoutine: (id) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.runRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 실행 요청을 전송하지 못했다." });
    }
  },
  toggleRoutine: (id, enabled) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.toggleRoutine(id, enabled)) {
      set({ pending: false, lastMessage: "루틴 상태 변경 요청을 전송하지 못했다." });
    }
  },
  deleteRoutine: async (id) => {
    if (!id) return;
    const confirmed = await requestConfirmDialog({
      title: "루틴 삭제",
      message: "선택한 루틴을 삭제할까요?",
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.deleteRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 삭제 요청을 전송하지 못했다." });
    }
  },
  patchCreateForm: (patch) => set({ createForm: { ...get().createForm, ...patch } }),
  toggleWeekday: (day) => {
    const current = get().createForm.weekdays;
    const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b);
    set({ createForm: { ...get().createForm, weekdays: next } });
  },
  resetCreateForm: () => set({ createForm: { ...EMPTY_CREATE_FORM }, preview: null }),
  setCreatePanelOpen: (open) => set({ createPanelOpen: open }),
  previewRoutine: () => {
    const form = get().createForm;
    if (form.request.trim().length < 5) {
      set({ lastMessage: "요청 원문은 최소 5자 이상이어야 한다." });
      return;
    }
    if (!requestDesktopRoutine.previewRoutine(form)) {
      set({ lastMessage: "루틴 미리보기 요청을 전송하지 못했다." });
    }
  },
  createRoutine: () => {
    const form = get().createForm;
    if (form.request.trim().length < 5) {
      set({ lastMessage: "요청 원문은 최소 5자 이상이어야 한다." });
      return;
    }
    set({ creating: true });
    if (!requestDesktopRoutine.createRoutine(form)) {
      set({ creating: false, lastMessage: "루틴 생성 요청을 전송하지 못했다." });
    }
  }
}));

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

function normalizeList(value: unknown): RoutineItem[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const record = item as Record<string, unknown>;
        const request = readString(record, "request", "Request", "text", "Text");
        const scheduleText = readString(record, "scheduleText", "ScheduleText", "scheduleSummary", "schedule");
        const scheduleKind = readString(record, "scheduleKind", "ScheduleKind") || "daily";
        const scheduleTime = readString(record, "scheduleTime", "ScheduleTime", "timeOfDay", "TimeOfDay");
        const toolProfile = readString(record, "toolProfile", "ToolProfile", "agentToolProfile", "AgentToolProfile", "profile");
        const lastStatus = readString(record, "lastStatus", "LastStatus");
        return {
          id: readString(record, "id", "Id", "routineId", "RoutineId"),
          title: readString(record, "title", "Title", "name", "Name") || "루틴",
          enabled: readBoolean(record, true, "enabled", "Enabled"),
          toolProfile,
          scheduleSummary: scheduleText,
          preview: readString(record, "preview", "description", "lastOutput", "LastOutput") || request,
          request,
          scheduleKind,
          scheduleTime,
          dayOfMonth: readNumber(record, "dayOfMonth", "DayOfMonth"),
          weekdays: readNumberList(record, "weekdays", "Weekdays"),
          notifyTelegram: readBoolean(record, false, "notifyTelegram", "NotifyTelegram"),
          executionMode: readString(record, "executionMode", "ExecutionMode"),
          resolvedExecutionMode: readString(record, "resolvedExecutionMode", "ResolvedExecutionMode"),
          runCommand: readString(record, "runCommand", "RunCommand"),
          lastStatus
        };
      }).filter((item) => item.id)
    : [];
}

export function useAutomatePageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    if (message.type === "routines_state") {
      useAutomateStore.setState({
        routines: normalizeList(message.items),
        pending: false
      });
      return;
    }

    if (message.type === "routine_preview") {
      useAutomateStore.setState({
        preview: {
          scheduleText: String(message.scheduleText || ""),
          resolvedExecutionMode: String(message.resolvedExecutionMode || ""),
          executionRoute: String(message.executionRoute || ""),
          warnings: Array.isArray(message.warnings) ? (message.warnings as unknown[]).map(String) : []
        }
      });
      return;
    }

    if (message.type === "routine_result") {
      const wasCreating = useAutomateStore.getState().creating;
      const succeeded = message.ok !== false;
      useAutomateStore.setState({
        pending: false,
        creating: false,
        lastMessage: String(message.message || ""),
        selectedRoutineId: String((message.routine as { id?: string } | undefined)?.id || useAutomateStore.getState().selectedRoutineId),
        ...(wasCreating && succeeded ? { createForm: { ...EMPTY_CREATE_FORM }, preview: null, createPanelOpen: false } : {})
      });
      return;
    }

    if (message.type === "routine_progress") {
      useAutomateStore.setState({
        lastMessage: String(message.message || ""),
        pending: true
      });
      return;
    }

    if (message.type === "error") {
      useAutomateStore.setState({
        pending: false,
        creating: false,
        lastMessage: String(message.message || "오류")
      });
    }
    });
  }, []);
}

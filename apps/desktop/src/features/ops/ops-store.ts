import { create } from "zustand";
import { useUiLogStore } from "../ui-log/ui-log-store";

export type DesktopDoctorSnapshot = {
  loading: boolean;
  found: boolean | null;
  reportId: string | null;
  createdAtUtc: string | null;
  summary: string | null;
  lastError: string | null;
};

export type DesktopOpsSnapshot = {
  loadingPlans: boolean;
  loadingTaskGraphs: boolean;
  planCount: number;
  taskGraphCount: number;
  latestPlanTitle: string | null;
  latestTaskGraphStatus: string | null;
  lastError: string | null;
};

type DoctorResultPayload = {
  found?: boolean;
  report?: {
    reportId?: string;
    createdAtUtc?: string;
    status?: string;
    summary?: string;
    failCount?: number;
    warnCount?: number;
  } | null;
};

type OpsPageState = {
  doctor: DesktopDoctorSnapshot;
  ops: DesktopOpsSnapshot;
  markDoctorLoading: () => void;
  markDoctorResult: (payload: DoctorResultPayload) => void;
  markDoctorError: (message: string) => void;
  markOpsLoading: () => void;
  markPlanListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markTaskGraphListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markOpsError: (message: string) => void;
};

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const useOpsPageStore = create<OpsPageState>((set) => ({
  doctor: {
    loading: false,
    found: null,
    reportId: null,
    createdAtUtc: null,
    summary: null,
    lastError: null
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
  markDoctorLoading: () =>
    set((state) => ({
      doctor: {
        ...state.doctor,
        loading: true,
        lastError: null
      }
    })),
  markDoctorResult: (payload) =>
    set(() => {
      const report = payload.report || null;
      const summary = report
        ? report.summary || `status=${report.status || "-"} fail=${report.failCount || 0} warn=${report.warnCount || 0}`
        : payload.found
          ? "Doctor 보고서를 읽었지만 표시할 요약이 없습니다."
          : "저장된 Doctor 보고서가 없습니다.";
      useUiLogStore.getState().recordLog("info", `doctor_get_last: ${summary}`, { source: "doctor" });

      return {
        doctor: {
          loading: false,
          found: Boolean(payload.found),
          reportId: report?.reportId || null,
          createdAtUtc: report?.createdAtUtc || null,
          summary,
          lastError: null
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
    })
}));

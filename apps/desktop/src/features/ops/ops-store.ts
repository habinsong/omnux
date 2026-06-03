import { useEffect } from "react";
import { create } from "zustand";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { requestDesktopGit, type GitOperationName } from "../middleware/git-gateway";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
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
  git: GitAutomationState;
  markDoctorLoading: () => void;
  markDoctorResult: (payload: DoctorResultPayload) => void;
  markDoctorError: (message: string) => void;
  markOpsLoading: () => void;
  markPlanListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markTaskGraphListResult: (payload: { items?: Array<Record<string, unknown>> }) => void;
  markOpsError: (message: string) => void;
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

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
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
    }),
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
    const confirmed = await requestConfirmDialog({
      title: "Git operation 적용",
      message: `${preview.operation} preview를 적용합니다. 실행 명령과 대상 파일을 확인했을 때만 진행하세요.`,
      confirmLabel: "적용",
      tone: "danger"
    });
    if (!confirmed) return;
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
        useOpsPageStore.setState((state) => ({ git: { ...state.git, loading: false, previewing: false, applying: false, lastError: stringFromUnknown(message.message) || "Git operation 오류" } }));
      }
    });
  }, []);
}

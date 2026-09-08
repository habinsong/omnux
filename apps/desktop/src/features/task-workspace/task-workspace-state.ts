import { useEffect } from "react";
import { create } from "zustand";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { sendTaskWorkspaceCommand, type TaskWorkspaceCommand } from "../middleware/task-workspace-gateway";
import { asObject, inputLines, items, outputView, planSummary, planView, runStep, runSummary, runView, stepPayload, text, validateSteps, type EditableRunStep, type Notice, type OutputView, type PlanForm, type PlanSummary, type PlanView, type RunSummary, type RunView } from "./task-workspace-model";

type Slot = "plans" | "runs" | "plan" | "run" | "mutation" | "output";
type Request = { id: string; type: TaskWorkspaceCommand; fields: Record<string, unknown> };
export type Confirmation = { title: string; message: string; label: string; type: TaskWorkspaceCommand; fields: Record<string, unknown> };
type State = {
  plans: PlanSummary[]; runs: RunSummary[]; plan: PlanView | null; run: RunView | null;
  planId: string; runId: string; output: OutputView | null; outputStep: string; outputTime: number | null;
  draft: PlanForm & { mode: "fast" | "interview" }; editingPlan: PlanForm | null; editingSteps: EditableRunStep[] | null;
  composer: boolean; notice: Notice; confirmation: Confirmation | null; pending: Partial<Record<Slot, Request>>;
  startAfterApproval: string; cancelingRun: string;
  request: (slot: Slot, type: TaskWorkspaceCommand, fields?: Record<string, unknown>) => void;
  refresh: () => void; openPlan: (id: string) => void; openRun: (id: string) => void;
  readOutput: (stepId: string, time?: number) => void; create: () => void;
  startPlan: () => void; stopRun: () => void;
  savePlan: () => void; saveSteps: () => void; confirm: (value: Confirmation) => void; accept: () => void;
};
const emptyDraft = () => ({ title: "", objective: "", constraints: "", mode: "fast" as const });
const requestId = () => `task-workspace-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export const useTaskWorkspace = create<State>((set, get) => ({
  plans: [], runs: [], plan: null, run: null, planId: "", runId: "", output: null, outputStep: "", outputTime: null,
  draft: emptyDraft(), editingPlan: null, editingSteps: null, composer: true, notice: null, confirmation: null, pending: {},
  startAfterApproval: "", cancelingRun: "",
  request: (slot, type, fields = {}) => {
    if (slot === "mutation" && get().pending.mutation) return;
    const request = { id: requestId(), type, fields };
    const newExecution = slot === "mutation" && ["plan_run", "task_graph_run", "task_resume", "task_retry"].includes(type);
    set(state => ({ pending: { ...state.pending, [slot]: request }, ...(slot === "mutation" ? { notice: null } : {}), ...(newExecution ? { output: null, outputStep: "", outputTime: null } : {}) }));
    if (!sendTaskWorkspaceCommand(type, request.id, fields)) {
      set(state => ({ pending: { ...state.pending, [slot]: undefined }, startAfterApproval: "", cancelingRun: "", ...(slot === "output" ? { output: null } : {}), notice: { tone: "error", text: "요청을 보내지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." } }));
    }
  },
  refresh: () => { get().request("plans", "plan_list"); get().request("runs", "task_graph_list"); },
  openPlan: id => {
    if (!id || get().pending.mutation) return;
    set({ planId: id, plan: null, runId: "", run: null, output: null, outputStep: "", editingPlan: null, editingSteps: null, composer: false, notice: null });
    get().request("plan", "plan_get", { planId: id });
  },
  openRun: id => {
    if (!id) return;
    if (get().runId !== id) set({ runId: id, run: null, output: null, outputStep: "", editingSteps: null });
    get().request("run", "task_graph_get", { graphId: id });
  },
  readOutput: (stepId, time) => {
    const id = get().runId;
    if (!id || !stepId) return;
    set({ outputStep: stepId, outputTime: time ?? null });
    get().request("output", "task_output_get", { graphId: id, taskId: stepId, timestamp: time });
  },
  create: () => {
    const draft = get().draft;
    if (draft.objective.trim().length < 5) { set({ notice: { tone: "error", text: "만들고 싶은 결과를 5자 이상 적어 주세요." } }); return; }
    get().request("mutation", "plan_create", { text: draft.objective.trim(), constraints: inputLines(draft.constraints), mode: draft.mode });
  },
  startPlan: () => {
    const plan = get().plan;
    if (!plan || get().pending.mutation) return;
    if (["approved", "completed"].includes(plan.status)) get().request("mutation", "plan_run", { planId: plan.id });
    else { set({ startAfterApproval: plan.id }); get().request("mutation", "plan_approve", { planId: plan.id }); }
  },
  stopRun: () => {
    if (!get().runId || get().pending.mutation || get().cancelingRun) return;
    set({ cancelingRun: get().runId });
    get().request("mutation", "task_graph_cancel", { graphId: get().runId });
  },
  savePlan: () => {
    const draft = get().editingPlan, plan = get().plan;
    if (!draft || !plan) return;
    if (!draft.title.trim() || draft.objective.trim().length < 5) { set({ notice: { tone: "error", text: "계획 이름과 목표를 입력해 주세요." } }); return; }
    get().confirm({ title: "계획 변경", message: "변경한 계획은 다시 검토하고 승인해야 합니다.", label: "변경 저장", type: "plan_update", fields: { planId: plan.id, plan: { title: draft.title.trim(), objective: draft.objective.trim(), constraints: inputLines(draft.constraints) } } });
  },
  saveSteps: () => {
    const steps = get().editingSteps;
    if (!steps || !get().runId) return;
    const error = validateSteps(steps);
    if (error) { set({ notice: { tone: "error", text: error } }); return; }
    get().confirm({ title: "실행 단계 변경", message: "단계와 선행 관계를 저장합니다. 실행 중인 작업은 변경하지 않습니다.", label: "단계 저장", type: "task_graph_update", fields: { graphId: get().runId, graph: { nodes: steps.map(stepPayload) } } });
  },
  confirm: value => set({ confirmation: value }),
  accept: () => { const action = get().confirmation; if (!action) return; set({ confirmation: null }); get().request("mutation", action.type, action.fields); }
}));

function receive(message: DesktopServerMessage) {
  const state = useTaskWorkspace.getState(), payload = asObject(message.payload);
  if (message.type === "task_updated" && text(message.graphId) === state.runId) {
    const step = runStep(message.task);
    useTaskWorkspace.setState(current => ({ run: current.run ? { ...current.run, steps: current.run.steps.map(item => item.id === step.id ? step : item) } : null }));
    if (["completed", "failed", "canceled"].includes(step.status)) state.openRun(state.runId);
    if (state.outputStep === step.id && state.outputTime === null) state.readOutput(step.id);
    state.request("runs", "task_graph_list");
    return;
  }
  const pair = (Object.entries(state.pending) as Array<[Slot, Request | undefined]>).find(([, request]) => request && request.id === message.requestId);
  if (!pair) {
    if ((message.type === "plan_result" || message.type === "task_graph_result") && ["create", "update", "approve", "run"].includes(text(message.action))) state.refresh();
    return;
  }
  const [slot, request] = pair;
  const finish = (patch: Partial<State>) => useTaskWorkspace.setState(current => ({ ...patch, pending: { ...current.pending, [slot]: undefined } }));
  if (message.type === "error" || payload.ok === false) {
    finish({ startAfterApproval: "", cancelingRun: "", ...(slot === "output" ? { output: null } : {}), notice: { tone: "error", text: text(payload.message) || text(message.message) || "요청을 처리하지 못했습니다." } });
    return;
  }
  if (message.type === "plan_list_result") { finish({ plans: items(payload.items).map(planSummary).filter(item => item.id) }); return; }
  if (message.type === "task_graph_list_result") {
    const runs = items(payload.items).map(runSummary).filter(item => item.id);
    finish({ runs });
    const related = runs.find(run => run.planId === state.planId);
    if (!state.runId && related) state.openRun(related.id);
    return;
  }
  if (message.type === "plan_result") {
    const plan = planView(payload.snapshot);
    if (!plan || (slot === "plan" && plan.id !== state.planId)) { finish({}); return; }
    finish({ plan, planId: plan.id, composer: false, editingPlan: null,
      ...(slot === "mutation" ? { notice: text(payload.message) ? { tone: "info", text: text(payload.message) } : null, ...(request?.type === "plan_create" ? { draft: emptyDraft() } : {}) } : {}) });
    state.refresh();
    if (request?.type === "plan_approve" && state.startAfterApproval === plan.id) {
      useTaskWorkspace.setState({ startAfterApproval: "" });
      state.request("mutation", "plan_run", { planId: plan.id });
    }
    if (request?.type === "plan_run" && plan.execution?.graphId) state.openRun(plan.execution.graphId);
    else if (!state.runId) {
      const runId = plan.execution?.graphId || state.runs.find(run => run.planId === plan.id)?.id;
      if (runId) state.openRun(runId);
    }
    return;
  }
  if (message.type === "task_graph_result") {
    const run = runView(payload.snapshot);
    if (!run || (slot === "run" && run.id !== state.runId)) { finish({}); return; }
    finish({ run, runId: run.id, cancelingRun: run.status === "running" ? state.cancelingRun : "", editingSteps: slot === "mutation" ? null : state.editingSteps,
      ...(slot === "mutation" ? { notice: text(payload.message) ? { tone: "info", text: text(payload.message) } : null } : {}) });
    if (!state.outputStep && ["completed", "failed", "canceled"].includes(run.status) && (!state.pending.mutation || slot === "mutation")) {
      const resultStep = run.steps.find(step => step.status === "failed") || [...run.steps].reverse().find(step => step.status === "completed") || run.steps.find(step => run.attempts.some(attempt => attempt.stepId === step.id));
      if (resultStep) state.readOutput(resultStep.id);
    }
    state.request("runs", "task_graph_list");
    return;
  }
  if (message.type === "task_output_result") {
    const output = outputView(payload);
    finish(output.runId === state.runId && output.stepId === state.outputStep ? { output } : {});
  }
}

export function useTaskWorkspaceSession() {
  useEffect(() => {
    const messages = subscribeDesktopMessages(receive);
    const connection = useDesktopShellStore.subscribe((state, previous) => {
      if (state.bridge.status === "closed" && previous.bridge.status !== "closed") {
        const pending = useTaskWorkspace.getState().pending;
        useTaskWorkspace.setState({ pending: {}, startAfterApproval: "", cancelingRun: "", ...(Object.values(pending).some(Boolean) ? { notice: { tone: "error", text: "연결이 끊겨 상태를 확인할 수 없습니다. 서버의 작업은 계속될 수 있습니다." } as Notice } : {}) });
      }
    });
    const auth = useDesktopAuthStore.subscribe((state, previous) => {
      if (state.auth.status === "authenticated" && previous.auth.status !== "authenticated") {
        const current = useTaskWorkspace.getState(); current.refresh();
        if (current.planId) current.request("plan", "plan_get", { planId: current.planId });
        if (current.runId) current.openRun(current.runId);
      }
    });
    return () => { messages(); connection(); auth(); };
  }, []);
}

import { useEffect } from "react";
import { create } from "zustand";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopPlan, requestDesktopTaskGraph, type TaskNodeInput } from "../middleware/planning-gateway";

type PlanItem = { planId: string; title: string; objective: string; status: string; reviewerSummary: string; constraints: string[] };
type TaskNode = {
  taskId: string;
  title: string;
  category: string;
  status: string;
  error: string;
  prompt: string;
  dependsOn: string[];
  requiredSkills: string[];
  requiredTools: string[];
  outputSummary: string;
  artifactPath: string;
};
type GraphItem = { graphId: string; status: string; sourcePlanId: string; nodeCount: number };
type GraphDetail = { graphId: string; status: string; sourcePlanId: string; nodes: TaskNode[] };
type TaskOutput = { graphId: string; taskId: string; status: string; stdout: string; stderr: string } | null;
type PlanEditDraft = { title: string; objective: string; constraintsText: string };
type PlanCreateMode = "fast" | "interview";
type PlanTemplateKind = "feature" | "bugfix" | "requirements";

export type PlanStepDetail = {
  stepId: string;
  title: string;
  description: string;
  mustDo: string[];
  mustNotDo: string[];
  verification: string[];
};
export type PlanReviewDetail = {
  summary: string;
  findings: string[];
  risks: string[];
  missingVerification: string[];
  approvedRecommendation: boolean;
  reviewerRoute: string;
  reviewedAtUtc: string;
};
export type PlanExecutionDetail = {
  status: string;
  message: string;
  resultSummary: string;
  requestedAtUtc: string;
  completedAtUtc: string;
};
export type PlanDetail = {
  planId: string;
  steps: PlanStepDetail[];
  decisionLog: string[];
  review: PlanReviewDetail | null;
  execution: PlanExecutionDetail | null;
};

// 태스크 그래프 구조 편집용 노드 초안.
export type EditableTaskNode = TaskNodeInput & { status: string };

type PlanningState = {
  plans: PlanItem[];
  selectedPlan: PlanItem | null;
  planDraft: PlanEditDraft;
  objectiveDraft: string;
  createMode: PlanCreateMode;
  createConstraintsText: string;
  planDetail: PlanDetail | null;
  graphs: GraphItem[];
  selectedGraph: GraphDetail | null;
  graphEditNodes: EditableTaskNode[] | null;
  output: TaskOutput;
  loading: boolean;
  pending: boolean;
  lastError: string;
  lastMessage: string;
  setObjective: (value: string) => void;
  setCreateMode: (mode: PlanCreateMode) => void;
  setCreateConstraintsText: (value: string) => void;
  applyCreateTemplate: (kind: PlanTemplateKind) => void;
  setPlanDraft: (key: keyof PlanEditDraft, value: string) => void;
  load: () => void;
  createPlan: () => void;
  openPlan: (planId: string) => void;
  reviewPlan: () => void;
  approvePlan: () => void;
  runPlan: () => void;
  savePlanDraft: () => Promise<void>;
  createGraph: () => void;
  openGraph: (graphId: string) => void;
  runGraph: () => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => Promise<void>;
  resumeGraph: () => Promise<void>;
  loadOutput: (taskId: string) => void;
  startGraphEdit: () => void;
  cancelGraphEdit: () => void;
  setTaskField: (taskId: string, key: "title" | "category" | "prompt", value: string) => void;
  setTaskList: (taskId: string, key: "requiredSkills" | "requiredTools", value: string) => void;
  toggleTaskDependency: (taskId: string, dependsOnId: string) => void;
  addTask: () => void;
  removeTask: (taskId: string) => void;
  saveGraphStructure: () => Promise<void>;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function arr(v: unknown): Record<string, unknown>[] { return Array.isArray(v) ? (v as Record<string, unknown>[]) : []; }
function strings(v: unknown): string[] { return Array.isArray(v) ? v.map(s).filter(Boolean) : []; }
function planItem(v: Record<string, unknown>): PlanItem {
  return { planId: s(v.planId), title: s(v.title), objective: s(v.objective), status: s(v.status), reviewerSummary: s(v.reviewerSummary), constraints: strings(v.constraints) };
}
function taskNode(t: Record<string, unknown>): TaskNode {
  return {
    taskId: s(t.taskId),
    title: s(t.title),
    category: s(t.category),
    status: s(t.status),
    error: s(t.error),
    prompt: s(t.prompt),
    dependsOn: strings(t.dependsOn),
    requiredSkills: strings(t.requiredSkills),
    requiredTools: strings(t.requiredTools),
    outputSummary: s(t.outputSummary),
    artifactPath: s(t.artifactPath)
  };
}

function graphDetail(graph: Record<string, unknown>): GraphDetail {
  return {
    graphId: s(graph.graphId),
    status: s(graph.status),
    sourcePlanId: s(graph.sourcePlanId),
    nodes: arr(graph.nodes).map(taskNode)
  };
}

function planStepDetail(v: Record<string, unknown>): PlanStepDetail {
  return {
    stepId: s(v.stepId),
    title: s(v.title),
    description: s(v.description),
    mustDo: strings(v.mustDo),
    mustNotDo: strings(v.mustNotDo),
    verification: strings(v.verification)
  };
}

function planDetailFrom(snapshot: Record<string, unknown>): PlanDetail {
  const plan = (snapshot.plan || {}) as Record<string, unknown>;
  const review = snapshot.review as Record<string, unknown> | undefined;
  const execution = snapshot.execution as Record<string, unknown> | undefined;
  return {
    planId: s(plan.planId),
    steps: arr(plan.steps).map(planStepDetail),
    decisionLog: strings(plan.decisionLog),
    review: review
      ? {
          summary: s(review.summary),
          findings: strings(review.findings),
          risks: strings(review.risks),
          missingVerification: strings(review.missingVerification),
          approvedRecommendation: review.approvedRecommendation === true,
          reviewerRoute: s(review.reviewerRoute),
          reviewedAtUtc: s(review.reviewedAtUtc)
        }
      : null,
    execution: execution
      ? {
          status: s(execution.status),
          message: s(execution.message),
          resultSummary: s(execution.resultSummary),
          requestedAtUtc: s(execution.requestedAtUtc),
          completedAtUtc: s(execution.completedAtUtc)
        }
      : null
  };
}

function editableFromNode(node: TaskNode): EditableTaskNode {
  return {
    taskId: node.taskId,
    title: node.title,
    category: node.category || "coding",
    prompt: node.prompt,
    dependsOn: [...node.dependsOn],
    requiredSkills: [...node.requiredSkills],
    requiredTools: [...node.requiredTools],
    status: node.status
  };
}

function planDraftFromPlan(plan: PlanItem | null): PlanEditDraft {
  return {
    title: plan?.title || "",
    objective: plan?.objective || "",
    constraintsText: plan?.constraints.join("\n") || ""
  };
}

function parseConstraintLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
}

function templateDraft(kind: PlanTemplateKind): { objective: string; constraints: string; mode: PlanCreateMode } {
  if (kind === "bugfix") {
    return {
      objective: "재현 가능한 UI 깨짐 또는 동작 오류를 수정하고 회귀 포인트를 정리한다.",
      constraints: [
        "문제 재현 범위 외 구조 변경 금지",
        "기존 동작 회귀 방지 포인트 명시",
        "필요 최소 수정만 적용",
        "검증 명령과 남은 위험을 마지막에 기록"
      ].join("\n"),
      mode: "fast"
    };
  }
  if (kind === "requirements") {
    return {
      objective: "작업 착수 전에 빠진 요구사항과 리스크를 질문 먼저 방식으로 정리한다.",
      constraints: [
        "확인되지 않은 요구사항은 추정하지 않음",
        "리스크와 가정을 먼저 정리",
        "승인 전 구현 범위 확장 금지",
        "질문은 꼭 필요한 것만 좁혀서 작성"
      ].join("\n"),
      mode: "interview"
    };
  }
  return {
    objective: "기존 UI/UX를 유지하면서 특정 기능 화면을 개선하고 반응형 정렬 문제를 해결한다.",
    constraints: [
      "사용자가 요청한 범위 외 변경 금지",
      "기존 기능 유지",
      "반응형 레이아웃 붕괴 방지",
      "가짜 데이터 렌더링 금지"
    ].join("\n"),
    mode: "fast"
  };
}

function canEditPlan(plan: PlanItem | null): boolean {
  const status = (plan?.status || "").toLowerCase();
  return Boolean(plan) && !/(approved|running|completed)/.test(status);
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  plans: [],
  selectedPlan: null,
  planDraft: planDraftFromPlan(null),
  objectiveDraft: "",
  createMode: "fast",
  createConstraintsText: "",
  planDetail: null,
  graphs: [],
  selectedGraph: null,
  graphEditNodes: null,
  output: null,
  loading: false,
  pending: false,
  lastError: "",
  lastMessage: "",
  setObjective: (value) => set({ objectiveDraft: value }),
  setCreateMode: (mode) => set({ createMode: mode, lastError: "" }),
  setCreateConstraintsText: (value) => set({ createConstraintsText: value, lastError: "" }),
  applyCreateTemplate: (kind) => {
    const draft = templateDraft(kind);
    set({ objectiveDraft: draft.objective, createConstraintsText: draft.constraints, createMode: draft.mode, lastError: "" });
  },
  setPlanDraft: (key, value) => set((state) => ({ planDraft: { ...state.planDraft, [key]: value }, lastError: "" })),
  load: () => {
    set({ loading: true, lastError: "" });
    requestDesktopPlan.list();
    requestDesktopTaskGraph.list();
  },
  createPlan: () => {
    const objective = get().objectiveDraft.trim();
    if (objective.length < 5) {
      set({ lastError: "목표(objective)는 최소 5자 이상이어야 합니다." });
      return;
    }
    set({ pending: true, lastError: "" });
    requestDesktopPlan.create(objective, get().createMode, parseConstraintLines(get().createConstraintsText));
  },
  openPlan: (planId) => {
    if (planId !== get().selectedPlan?.planId) set({ planDetail: null });
    requestDesktopPlan.get(planId);
  },
  reviewPlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.review(p.planId); } },
  approvePlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.approve(p.planId); } },
  runPlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.run(p.planId); } },
  savePlanDraft: async () => {
    const plan = get().selectedPlan;
    if (!canEditPlan(plan)) {
      set({ lastError: "승인 전 계획만 수정할 수 있습니다." });
      return;
    }
    const draft = get().planDraft;
    if (draft.objective.trim().length < 5) {
      set({ lastError: "목표(objective)는 최소 5자 이상이어야 합니다." });
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "계획 수정",
      message: "계획을 수정하면 리뷰와 실행 기록이 무효화되고 상태가 Draft로 돌아갑니다.",
      confirmLabel: "수정"
    });
    if (!confirmed || !plan) return;
    set({ pending: true, lastError: "" });
    requestDesktopPlan.update(plan.planId, {
      title: draft.title.trim(),
      objective: draft.objective.trim(),
      constraints: parseConstraintLines(draft.constraintsText)
    });
  },
  createGraph: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopTaskGraph.create(p.planId); } },
  openGraph: (graphId) => requestDesktopTaskGraph.get(graphId),
  runGraph: () => { const g = get().selectedGraph; if (g) { set({ pending: true }); requestDesktopTaskGraph.run(g.graphId); } },
  cancelTask: (taskId) => { const g = get().selectedGraph; if (g) requestDesktopTaskGraph.cancel(g.graphId, taskId); },
  retryTask: async (taskId) => {
    const g = get().selectedGraph;
    if (!g) return;
    const confirmed = await requestConfirmDialog({
      title: "태스크 재시도",
      message: `${taskId} 작업을 재시도 대기 상태로 전환하고 실행합니다.`,
      confirmLabel: "재시도"
    });
    if (!confirmed) return;
    set({ pending: true, lastError: "" });
    requestDesktopTaskGraph.retry(g.graphId, taskId);
  },
  resumeGraph: async () => {
    const g = get().selectedGraph;
    if (!g) return;
    const confirmed = await requestConfirmDialog({
      title: "태스크 그래프 재개",
      message: `${g.graphId} 그래프에서 가능한 작업을 이어서 실행합니다.`,
      confirmLabel: "재개"
    });
    if (!confirmed) return;
    set({ pending: true, lastError: "" });
    requestDesktopTaskGraph.resume(g.graphId);
  },
  loadOutput: (taskId) => { const g = get().selectedGraph; if (g) requestDesktopTaskGraph.output(g.graphId, taskId); },
  startGraphEdit: () => {
    const g = get().selectedGraph;
    if (!g) return;
    if ((g.status || "").toLowerCase() === "running") {
      set({ lastError: "실행 중인 태스크 그래프는 구조를 수정할 수 없습니다." });
      return;
    }
    set({ graphEditNodes: g.nodes.map(editableFromNode), lastError: "" });
  },
  cancelGraphEdit: () => set({ graphEditNodes: null, lastError: "" }),
  setTaskField: (taskId, key, value) =>
    set((state) => ({
      graphEditNodes: state.graphEditNodes?.map((node) => (node.taskId === taskId ? { ...node, [key]: value } : node)) || null
    })),
  setTaskList: (taskId, key, value) =>
    set((state) => ({
      graphEditNodes: state.graphEditNodes?.map((node) =>
        node.taskId === taskId ? { ...node, [key]: value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12) } : node
      ) || null
    })),
  toggleTaskDependency: (taskId, dependsOnId) =>
    set((state) => ({
      graphEditNodes: state.graphEditNodes?.map((node) => {
        if (node.taskId !== taskId) return node;
        const has = node.dependsOn.includes(dependsOnId);
        return { ...node, dependsOn: has ? node.dependsOn.filter((id) => id !== dependsOnId) : [...node.dependsOn, dependsOnId] };
      }) || null
    })),
  addTask: () =>
    set((state) => {
      if (!state.graphEditNodes) return {};
      const existing = new Set(state.graphEditNodes.map((node) => node.taskId));
      let index = state.graphEditNodes.length + 1;
      let taskId = `task-${String(index).padStart(2, "0")}`;
      while (existing.has(taskId)) {
        index += 1;
        taskId = `task-${String(index).padStart(2, "0")}`;
      }
      return {
        graphEditNodes: [
          ...state.graphEditNodes,
          { taskId, title: `작업 ${index}`, category: "coding", prompt: "", dependsOn: [], requiredSkills: [], requiredTools: [], status: "pending" }
        ]
      };
    }),
  removeTask: (taskId) =>
    set((state) => ({
      graphEditNodes: state.graphEditNodes
        ? state.graphEditNodes
            .filter((node) => node.taskId !== taskId)
            .map((node) => ({ ...node, dependsOn: node.dependsOn.filter((id) => id !== taskId) }))
        : null
    })),
  saveGraphStructure: async () => {
    const g = get().selectedGraph;
    const nodes = get().graphEditNodes;
    if (!g || !nodes) return;
    if (nodes.length === 0) {
      set({ lastError: "태스크 그래프에는 최소 1개 이상의 작업이 필요합니다." });
      return;
    }
    if (nodes.some((node) => !node.title.trim())) {
      set({ lastError: "모든 작업에 제목이 필요합니다." });
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "태스크 그래프 구조 저장",
      message: "구조를 저장하면 실행 기록과 진행 상태가 초기화되고 그래프가 Draft로 돌아갑니다. 진행할까요?",
      confirmLabel: "저장",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopTaskGraph.update(g.graphId, nodes)) {
      set({ pending: false, lastError: "태스크 그래프 수정 요청을 전송하지 못했다." });
    }
  }
}));

export function usePlanningPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      if (message.type === "plan_list_result") {
        set_plans(arr(payload.items).map(planItem));
        return;
      }
      if (message.type === "plan_result") {
        const snapshot = payload.snapshot as Record<string, unknown> | undefined;
        const plan = snapshot?.plan as Record<string, unknown> | undefined;
        usePlanningStore.setState((prev) => {
          const selectedPlan = plan ? planItem(plan) : prev.selectedPlan;
          return {
            pending: false,
            lastMessage: s(payload.message),
            selectedPlan,
            planDraft: planDraftFromPlan(selectedPlan),
            planDetail: snapshot ? planDetailFrom(snapshot) : prev.planDetail
          };
        });
        usePlanningStore.getState().load();
        return;
      }
      if (message.type === "task_graph_list_result") {
        usePlanningStore.setState({
          loading: false,
          graphs: arr(payload.items).map((g) => ({ graphId: s(g.graphId), status: s(g.status), sourcePlanId: s(g.sourcePlanId), nodeCount: arr(g.nodes).length }))
        });
        return;
      }
      if (message.type === "task_graph_result") {
        const graph = (payload.snapshot as Record<string, unknown>)?.graph as Record<string, unknown> | undefined;
        const ok = payload.ok !== false;
        usePlanningStore.setState((prev) => ({
          pending: false,
          lastMessage: s(payload.message),
          selectedGraph: graph ? graphDetail(graph) : prev.selectedGraph,
          // 구조 저장/그래프 전환 성공 시 편집 모드 종료.
          graphEditNodes: ok && graph ? null : prev.graphEditNodes
        }));
        usePlanningStore.getState().load();
        return;
      }
      if (message.type === "task_output_result") {
        usePlanningStore.setState({ output: { graphId: s(payload.graphId), taskId: s(payload.taskId), status: s(payload.status), stdout: s(payload.stdout), stderr: s(payload.stderr) } });
        return;
      }
      if (message.type === "task_updated") {
        usePlanningStore.getState().load();
        return;
      }
      if (message.type === "error") {
        usePlanningStore.setState({ loading: false, pending: false, lastError: s(message.message) || "오류" });
      }
    });
  }, []);
}

function set_plans(plans: PlanItem[]) {
  usePlanningStore.setState({ loading: false, plans });
}

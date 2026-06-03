import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopPlan, requestDesktopTaskGraph } from "../middleware/planning-gateway";

type PlanItem = { planId: string; title: string; objective: string; status: string; reviewerSummary: string };
type TaskNode = { taskId: string; title: string; status: string };
type GraphItem = { graphId: string; status: string; sourcePlanId: string; nodeCount: number };
type GraphDetail = { graphId: string; status: string; sourcePlanId: string; nodes: TaskNode[] };
type TaskOutput = { graphId: string; taskId: string; status: string; stdout: string; stderr: string } | null;

type PlanningState = {
  plans: PlanItem[];
  selectedPlan: PlanItem | null;
  objectiveDraft: string;
  graphs: GraphItem[];
  selectedGraph: GraphDetail | null;
  output: TaskOutput;
  loading: boolean;
  pending: boolean;
  lastError: string;
  lastMessage: string;
  setObjective: (value: string) => void;
  load: () => void;
  createPlan: () => void;
  openPlan: (planId: string) => void;
  reviewPlan: () => void;
  approvePlan: () => void;
  runPlan: () => void;
  createGraph: () => void;
  openGraph: (graphId: string) => void;
  runGraph: () => void;
  cancelTask: (taskId: string) => void;
  loadOutput: (taskId: string) => void;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function arr(v: unknown): Record<string, unknown>[] { return Array.isArray(v) ? (v as Record<string, unknown>[]) : []; }
function planItem(v: Record<string, unknown>): PlanItem {
  return { planId: s(v.planId), title: s(v.title), objective: s(v.objective), status: s(v.status), reviewerSummary: s(v.reviewerSummary) };
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  plans: [],
  selectedPlan: null,
  objectiveDraft: "",
  graphs: [],
  selectedGraph: null,
  output: null,
  loading: false,
  pending: false,
  lastError: "",
  lastMessage: "",
  setObjective: (value) => set({ objectiveDraft: value }),
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
    requestDesktopPlan.create(objective);
  },
  openPlan: (planId) => requestDesktopPlan.get(planId),
  reviewPlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.review(p.planId); } },
  approvePlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.approve(p.planId); } },
  runPlan: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopPlan.run(p.planId); } },
  createGraph: () => { const p = get().selectedPlan; if (p) { set({ pending: true }); requestDesktopTaskGraph.create(p.planId); } },
  openGraph: (graphId) => requestDesktopTaskGraph.get(graphId),
  runGraph: () => { const g = get().selectedGraph; if (g) { set({ pending: true }); requestDesktopTaskGraph.run(g.graphId); } },
  cancelTask: (taskId) => { const g = get().selectedGraph; if (g) requestDesktopTaskGraph.cancel(g.graphId, taskId); },
  loadOutput: (taskId) => { const g = get().selectedGraph; if (g) requestDesktopTaskGraph.output(g.graphId, taskId); }
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
        const plan = (payload.snapshot as Record<string, unknown>)?.plan as Record<string, unknown> | undefined;
        usePlanningStore.setState((prev) => ({ pending: false, lastMessage: s(payload.message), selectedPlan: plan ? planItem(plan) : prev.selectedPlan }));
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
        usePlanningStore.setState((prev) => ({
          pending: false,
          lastMessage: s(payload.message),
          selectedGraph: graph ? { graphId: s(graph.graphId), status: s(graph.status), sourcePlanId: s(graph.sourcePlanId), nodes: arr(graph.nodes).map((t) => ({ taskId: s(t.taskId), title: s(t.title), status: s(t.status) })) } : prev.selectedGraph
        }));
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

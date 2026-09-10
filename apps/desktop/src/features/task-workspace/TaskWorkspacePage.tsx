import { useEffect, useRef, useState } from "react";
import { ClipboardList, FileOutput, ListChecks, PenLine, Play } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useTaskWorkspace } from "./task-workspace-state";
import { TaskComposerPanel, TaskListPanel, TaskOutputPanel, TaskPlanPanel, TaskRunPanel } from "./TaskPanels";

/* ============================================================================
   작업 화면.
   목록 · 새 계획 · 계획 · 실행 · 결과 를 캡슐 탭으로 가른다.
   없는 것은 탭도 만들지 않는다 — 빈 칸을 보여 주지 않는다.
   ============================================================================ */

type TabId = "list" | "composer" | "plan" | "run" | "output";

export function TaskWorkspacePage() {
  const state = useTaskWorkspace();
  const bridge = useDesktopShellStore((value) => value.bridge.status);
  const auth = useDesktopAuthStore((value) => value.auth.status);
  const connected = bridge === "connected" && auth === "authenticated";
  const busy = Boolean(state.pending.mutation);
  const route = useDesktopNavigationStore((value) => value.routePayload);
  const routeVersion = useDesktopNavigationStore((value) => value.routeVersion);
  const clearRoute = useDesktopNavigationStore((value) => value.clearRoutePayload);
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<TabId>("list");

  useEffect(() => {
    if (connected) useTaskWorkspace.getState().refresh();
  }, [connected]);

  useEffect(() => {
    if (!route) return;
    const conversationId = String(route.conversationId || "").trim();
    const planId = String(route.planId || "").trim();
    if (planId) {
      useTaskWorkspace.getState().openPlan(planId);
    } else if (typeof route.input === "string") {
      useTaskWorkspace.setState((current) => ({
        composer: true,
        draft: { ...current.draft, objective: route.input! },
        ...(conversationId ? { sourceConversationId: conversationId } : {})
      }));
    } else if (route.create) {
      useTaskWorkspace.setState({ composer: true, ...(conversationId ? { sourceConversationId: conversationId } : {}) });
    } else if (conversationId) {
      useTaskWorkspace.setState({ sourceConversationId: conversationId });
    }
    clearRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  useEffect(() => {
    if (!connected || (state.run?.status !== "running" && state.plan?.status !== "running")) return;
    const timer = window.setInterval(() => {
      const current = useTaskWorkspace.getState();
      if (!current.editingSteps && current.run?.status === "running") current.openRun(current.runId);
      if (current.plan?.status === "running") current.request("plan", "plan_get", { planId: current.planId });
      if (current.outputStep && current.outputTime === null) current.readOutput(current.outputStep);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [connected, state.run?.status, state.plan?.status]);

  useEffect(() => {
    if (state.confirmation && !dialog.current?.open) dialog.current?.showModal();
    if (!state.confirmation && dialog.current?.open) dialog.current.close();
  }, [state.confirmation]);

  // 무언가가 새로 생기면 그 탭으로 옮긴다.
  useEffect(() => {
    if (state.composer) setTab("composer");
  }, [state.composer]);
  useEffect(() => {
    if (state.plan && !state.composer) setTab("plan");
  }, [state.plan?.id, state.composer]);
  useEffect(() => {
    if (state.run) setTab("run");
  }, [state.run?.id]);
  useEffect(() => {
    if (state.outputFocus && state.run) setTab("run");
  }, [state.outputFocus, state.run]);

  const newTask = () => {
    useTaskWorkspace.setState({
      composer: true,
      plan: null,
      planId: "",
      run: null,
      runId: "",
      output: null,
      outputStep: "",
      editingPlan: null,
      editingSteps: null,
      notice: null,
      sourceConversationId: ""
    });
  };

  const tabs: ScreenTab[] = [
    { id: "list", label: "목록", icon: ListChecks, badge: state.plans.length > 0 ? String(state.plans.length) : undefined },
    ...(state.composer ? [{ id: "composer", label: "새 계획", icon: PenLine } as ScreenTab] : []),
    ...(state.plan ? [{ id: "plan", label: "계획", icon: ClipboardList } as ScreenTab] : []),
    ...(state.run
      ? [{ id: "run", label: "실행", icon: Play, badge: state.run.status === "running" ? "중" : undefined } as ScreenTab]
      : []),
    ...(state.outputStep ? [{ id: "output", label: "결과", icon: FileOutput } as ScreenTab] : [])
  ];
  const active: TabId = tabs.some((entry) => entry.id === tab) ? tab : "list";

  return (
    <Screen
      surface="tasks"
      title="작업"
      hint="계획을 세우고 단계별로 실행한 뒤 결과까지 확인합니다."
      actions={
        <Button variant="primary" size="sm" onClick={newTask} disabled={busy}>
          <PenLine size={14} aria-hidden="true" /> 새 작업
        </Button>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">서버에 연결하면 계획을 만들고 작업을 실행할 수 있습니다.</ScreenNotice>
        ) : state.notice?.tone === "error" ? (
          <ScreenNotice tone="danger">{state.notice.text}</ScreenNotice>
        ) : busy ? (
          <ScreenNotice>{state.pending.mutation?.type === "plan_create" ? "계획을 작성하고 있습니다." : "요청을 처리하고 있습니다."}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={active} onChange={(id) => setTab(id as TabId)} label="작업 보기 종류" />

      {active === "composer" ? (
        <TaskComposerPanel connected={connected} />
      ) : active === "plan" && state.plan ? (
        <TaskPlanPanel plan={state.plan} connected={connected} />
      ) : active === "run" && state.run ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
          <TaskRunPanel run={state.run} connected={connected} />
          {state.outputStep ? <TaskOutputPanel run={state.run} /> : null}
        </div>
      ) : active === "output" ? (
        <TaskOutputPanel run={state.run} />
      ) : (
        <TaskListPanel connected={connected} />
      )}

      <dialog
        ref={dialog}
        className="max-w-sm rounded-xl border border-border bg-card p-4 text-foreground backdrop:bg-black/40"
        aria-labelledby="task-confirm-title"
        onCancel={() => useTaskWorkspace.setState({ confirmation: null })}
        onClose={() => useTaskWorkspace.setState({ confirmation: null })}
      >
        {state.confirmation ? (
          <form
            className="min-w-0 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              state.accept();
            }}
          >
            <h2 id="task-confirm-title" className="text-sm font-semibold">
              {state.confirmation.title}
            </h2>
            <p className="min-w-0 break-words text-xs text-muted-foreground">{state.confirmation.message}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" autoFocus onClick={() => useTaskWorkspace.setState({ confirmation: null })}>
                돌아가기
              </Button>
              <Button type="submit" variant="primary" size="sm">
                {state.confirmation.label}
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>
    </Screen>
  );
}

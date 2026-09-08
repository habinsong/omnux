import { useEffect, useRef } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { TaskPlanPanel } from "./TaskPlanPanel";
import { TaskRunPanel } from "./TaskRunPanel";
import { statusText } from "./task-workspace-model";
import { useTaskWorkspace } from "./task-workspace-state";
import "./task-workspace.css";

function ConfirmationDialog() {
  const state = useTaskWorkspace(), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state.confirmation && !dialog.current?.open) dialog.current?.showModal();
    if (!state.confirmation && dialog.current?.open) dialog.current.close();
  }, [state.confirmation]);
  return <dialog ref={dialog} className="task-confirmation" onCancel={() => useTaskWorkspace.setState({ confirmation: null })} aria-labelledby="task-confirmation-title">
    {state.confirmation ? <form onSubmit={event => { event.preventDefault(); state.accept(); }}>
      <h2 id="task-confirmation-title">{state.confirmation.title}</h2><p>{state.confirmation.message}</p>
      <div className="task-actions"><button className="task-button" type="button" onClick={() => useTaskWorkspace.setState({ confirmation: null })}>돌아가기</button><button className="task-button" data-primary type="submit">{state.confirmation.label}</button></div>
    </form> : null}
  </dialog>;
}

export function TaskWorkspacePage() {
  const state = useTaskWorkspace();
  const bridge = useDesktopShellStore(value => value.bridge.status);
  const auth = useDesktopAuthStore(value => value.auth.status);
  const connected = bridge === "connected" && auth === "authenticated";
  const busy = Boolean(state.pending.mutation);
  const route = useDesktopNavigationStore(value => value.routePayload);
  const routeVersion = useDesktopNavigationStore(value => value.routeVersion);
  const clearRoute = useDesktopNavigationStore(value => value.clearRoutePayload);
  const requestInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (connected) useTaskWorkspace.getState().refresh(); }, [connected]);
  useEffect(() => {
    if (typeof route?.input === "string") useTaskWorkspace.setState(current => ({ composer: true, draft: { ...current.draft, objective: route.input! } }));
    if (route) clearRoute();
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
  const newTask = () => {
    useTaskWorkspace.setState({ composer: true, plan: null, planId: "", run: null, runId: "", output: null, outputStep: "", editingPlan: null, editingSteps: null, notice: null });
    window.requestAnimationFrame(() => requestInput.current?.focus());
  };
  const matchingRuns = state.runs.filter(run => !state.planId || run.planId === state.planId);
  return <div className="task-workspace" data-surface="tasks">
    <header className="task-page-heading"><div><h1>작업</h1><p>계획을 세우고 실행 결과까지 확인합니다.</p></div><button className="task-button" onClick={newTask} disabled={busy}>새 작업</button></header>
    {!connected ? <p className="task-notice" role="status">서버에 연결하면 계획을 만들고 작업을 실행할 수 있습니다.</p> : null}
    {state.notice?.tone === "error" ? <div className="task-notice" data-tone="error" role="alert"><p>{state.notice.text}</p><button className="task-button task-button-quiet" onClick={() => useTaskWorkspace.setState({ notice: null })}>닫기</button></div> : null}
    {busy ? <p className="task-busy" role="status">{state.pending.mutation?.type === "plan_create" ? "계획을 작성하고 있습니다." : "요청을 처리하고 있습니다."}</p> : null}
    {state.plans.length || state.pending.plans ? <details className="task-library"><summary>저장된 작업</summary><div className="task-catalog">
      <label>작업 선택<select value={state.planId} disabled={!connected || busy} onChange={event => state.openPlan(event.target.value)}>
        <option value="">{state.pending.plans ? "작업 목록을 읽고 있습니다." : "저장된 작업을 선택하세요"}</option>
        {state.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.title} · {statusText(plan.status)}</option>)}
      </select></label>
      <button className="task-button" disabled={!connected || busy || Boolean(state.pending.plans)} onClick={state.refresh}>목록 새로고침</button>
    </div></details> : null}
    {state.composer ? <details className="task-panel task-composer" open>
      <summary>새 계획 작성</summary>
      <form className="task-panel-content" onSubmit={event => { event.preventDefault(); state.create(); }}>
        <fieldset disabled={busy} className="task-fields">
          <label>만들고 싶은 결과<textarea ref={requestInput} rows={4} value={state.draft.objective} required minLength={5} placeholder="무엇을 만들거나 고칠지 적어 주세요." onChange={event => useTaskWorkspace.setState(current => ({ draft: { ...current.draft, objective: event.target.value } }))} /></label>
          <details className="task-inline-details"><summary>조건과 계획 방식</summary><div className="task-fields">
            <label>지켜야 할 조건<textarea rows={3} value={state.draft.constraints} onChange={event => useTaskWorkspace.setState(current => ({ draft: { ...current.draft, constraints: event.target.value } }))} placeholder="한 줄에 한 가지씩 적어 주세요." /></label>
            <label>계획 방식<select value={state.draft.mode} onChange={event => useTaskWorkspace.setState(current => ({ draft: { ...current.draft, mode: event.target.value as "fast" | "interview" } }))}><option value="fast">바로 계획 작성</option><option value="interview">요구사항을 더 자세히 정리</option></select></label>
          </div></details>
          <div className="task-actions"><button className="task-button" data-primary type="submit" disabled={!connected || busy || state.draft.objective.trim().length < 5}>계획 만들기</button></div>
        </fieldset>
      </form>
    </details> : null}
    {state.pending.plan ? <p role="status" className="task-busy">계획을 읽고 있습니다.</p> : state.plan ? <TaskPlanPanel plan={state.plan} connected={connected} /> : null}
    {matchingRuns.length > 1 ? <details className="task-library"><summary>이전 실행</summary><label>이전 실행 선택<select value={state.runId} disabled={!connected || busy} onChange={event => state.openRun(event.target.value)}><option value="">실행 기록을 선택하세요</option>{matchingRuns.map((run, index) => <option key={run.id} value={run.id}>{index + 1}번째 실행 · {statusText(run.status)} · {run.count}단계</option>)}</select></label></details> : null}
    {state.pending.run && !state.run ? <p role="status" className="task-busy">실행 기록을 읽고 있습니다.</p> : state.run ? <TaskRunPanel run={state.run} connected={connected} /> : null}
    <ConfirmationDialog />
  </div>;
}

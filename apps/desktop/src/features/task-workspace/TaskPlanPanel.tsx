import { useEffect, useState } from "react";
import { statusText, type PlanForm, type PlanView } from "./task-workspace-model";
import { useTaskWorkspace } from "./task-workspace-state";

function Checklist({ title, values }: { title: string; values: string[] }) {
  return values.length ? <div className="task-checklist"><h4>{title}</h4><ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul></div> : null;
}

export function TaskPlanPanel({ plan, connected }: { plan: PlanView; connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation);
  const editing = state.editingPlan;
  const [expanded, setExpanded] = useState(!["running", "completed"].includes(plan.status));
  useEffect(() => setExpanded(!["running", "completed"].includes(plan.status)), [plan.id, plan.status]);
  const editable = !["approved", "running", "completed"].includes(plan.status);
  const update = (field: keyof PlanForm, value: string) => useTaskWorkspace.setState(current => ({ editingPlan: current.editingPlan ? { ...current.editingPlan, [field]: value } : null }));
  return <section aria-label="선택한 계획"><details className="task-panel task-plan" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="task-panel-heading"><div><p className="task-eyebrow">계획 확인</p><h2>{plan.title}</h2></div>{expanded ? <span className="task-state" data-state={plan.status}>{statusText(plan.status)}</span> : null}</summary>
    {editing ? <form className="task-panel-content" onSubmit={event => { event.preventDefault(); state.savePlan(); }}>
      <fieldset disabled={busy} className="task-fields">
        <label>계획 이름<input value={editing.title} onChange={event => update("title", event.target.value)} required /></label>
        <label>목표<textarea value={editing.objective} onChange={event => update("objective", event.target.value)} rows={4} minLength={5} required /></label>
        <label>조건<textarea value={editing.constraints} onChange={event => update("constraints", event.target.value)} rows={3} placeholder="한 줄에 한 가지씩 적어 주세요." /></label>
        <div className="task-actions"><button className="task-button" data-primary type="submit" disabled={!connected}>변경 저장</button><button className="task-button" type="button" onClick={() => useTaskWorkspace.setState({ editingPlan: null })}>편집 취소</button></div>
      </fieldset>
    </form> : <div className="task-panel-content">
      <p className="task-objective">{plan.objective}</p>
      <Checklist title="지켜야 할 조건" values={plan.constraints} />
      <ol className="task-plan-steps">{plan.steps.map((step, index) => <li key={step.id || index}>
        <details><summary><span className="task-step-number">{index + 1}</span><span>{step.title || step.description}</span></summary>
          <div className="task-step-content"><p>{step.description}</p><div className="task-check-columns"><Checklist title="할 일" values={step.required} /><Checklist title="피할 일" values={step.excluded} /><Checklist title="확인할 것" values={step.checks} /></div></div>
        </details>
      </li>)}</ol>
      <div className="task-actions">
        {plan.status !== "running" ? <button className="task-button" data-primary disabled={!connected || busy} onClick={state.startPlan}>이 계획으로 실행</button> : null}
        {editable ? <button className="task-button" disabled={busy} onClick={() => useTaskWorkspace.setState({ editingPlan: { title: plan.title, objective: plan.objective, constraints: plan.constraints.join("\n") } })}>계획 편집</button> : null}
      </div>
      {!['approved', 'running', 'completed'].includes(plan.status) ? <p className="task-detail-text">내용을 확인한 뒤 실행하면 이 계획을 승인하고 작업을 시작합니다.</p> : null}
      <details className="task-inline-details"><summary>검토와 실행 설정</summary><div className="task-actions">
        {!['running', 'completed'].includes(plan.status) ? <button className="task-button" disabled={!connected || busy} onClick={() => state.request("mutation", "plan_review", { planId: plan.id })}>검토 요청</button> : null}
        {!['approved', 'running', 'completed'].includes(plan.status) ? <button className="task-button" disabled={!connected || busy} onClick={() => state.request("mutation", "plan_approve", { planId: plan.id })}>승인만 하기</button> : null}
        <button className="task-button" disabled={!connected || busy || plan.status === "running"} onClick={() => state.request("mutation", "task_graph_create", { planId: plan.id })}>실행 단계 먼저 편집</button>
      </div></details>
    </div>}
    {plan.review ? <details className="task-subsection" open><summary>검토 결과</summary><div className="task-panel-content">
      <p>{plan.review.summary}</p><div className="task-check-columns"><Checklist title="발견한 내용" values={plan.review.findings} /><Checklist title="주의할 점" values={plan.review.risks} /><Checklist title="남은 확인" values={plan.review.missing} /></div>
      {!plan.review.recommendsApproval ? <p className="task-attention">검토 결과를 반영한 뒤 승인해 주세요.</p> : null}
      <p className="task-detail-text">{plan.review.route}</p>
    </div></details> : null}
    {plan.execution || plan.decisions.length ? <details className="task-subsection"><summary>계획 기록</summary><div className="task-panel-content">
      {plan.execution ? <p>{plan.execution.message}{plan.execution.summary ? `\n${plan.execution.summary}` : ""}</p> : null}
      {plan.decisions.length ? <ul className="task-record-list">{plan.decisions.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
    </div></details> : null}
  </details></section>;
}

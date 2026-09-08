import { type EditableRunStep } from "./task-workspace-model";
import { useTaskWorkspace } from "./task-workspace-state";

export function TaskStepEditor({ connected }: { connected: boolean }) {
  const state = useTaskWorkspace(), steps = state.editingSteps || [];
  const update = (id: string, patch: Partial<EditableRunStep>) => useTaskWorkspace.setState(current => ({ editingSteps: current.editingSteps?.map(step => step.id === id ? { ...step, ...patch } : step) || null }));
  const add = () => useTaskWorkspace.setState(current => ({ editingSteps: [...(current.editingSteps || []), { id: `step_${globalThis.crypto?.randomUUID?.() || Date.now()}`, title: "", category: "coding", prompt: "", dependencies: [], skills: [], tools: [], status: "pending", summary: "", error: "", artifact: "" }] }));
  const remove = (id: string) => useTaskWorkspace.setState(current => ({ editingSteps: current.editingSteps?.filter(step => step.id !== id).map(step => ({ ...step, dependencies: step.dependencies.filter(dependency => dependency !== id) })) || null }));
  return <form onSubmit={event => { event.preventDefault(); state.saveSteps(); }} className="task-step-editor">
    <fieldset disabled={Boolean(state.pending.mutation)}>
      {steps.map((step, index) => <section key={step.id} className="task-edit-step" aria-label={`실행 단계 ${index + 1}`}>
        <div className="task-edit-heading"><h3>단계 {index + 1}</h3><button type="button" className="task-button task-button-quiet" onClick={() => remove(step.id)}>단계 삭제</button></div>
        <div className="task-form-columns">
          <label>단계 이름<input value={step.title} required onChange={event => update(step.id, { title: event.target.value })} /></label>
          <label>작업 종류<select value={step.category} onChange={event => update(step.id, { category: event.target.value })}>
            {['coding', 'refactor', 'documentation', 'verification', 'research', 'review', 'writing', 'ops'].map(category => <option key={category} value={category}>{({ coding: "코딩", refactor: "코드 수정", documentation: "문서 작성", verification: "검증", research: "조사", review: "검토", writing: "글쓰기", ops: "운영" } as Record<string, string>)[category]}</option>)}
            {!['coding', 'refactor', 'documentation', 'verification', 'research', 'review', 'writing', 'ops'].includes(step.category) ? <option value={step.category}>{step.category}</option> : null}
          </select></label>
        </div>
        <label>실행 내용<textarea value={step.prompt} rows={3} required onChange={event => update(step.id, { prompt: event.target.value })} /></label>
        <fieldset className="task-dependencies"><legend>먼저 끝나야 하는 단계</legend>
          {steps.filter(candidate => candidate.id !== step.id).map(candidate => <label key={candidate.id}><input type="checkbox" checked={step.dependencies.includes(candidate.id)} onChange={event => update(step.id, { dependencies: event.target.checked ? [...step.dependencies, candidate.id] : step.dependencies.filter(id => id !== candidate.id) })} />{candidate.title || "이름 없는 단계"}</label>)}
          {steps.length < 2 ? <p className="task-detail-text">다른 단계를 추가하면 연결할 수 있습니다.</p> : null}
        </fieldset>
        <details className="task-inline-details"><summary>필요한 스킬과 도구</summary><div className="task-form-columns">
          <label>스킬<input value={step.skillsInput ?? step.skills.join(", ")} onChange={event => update(step.id, { skillsInput: event.target.value })} /></label>
          <label>도구<input value={step.toolsInput ?? step.tools.join(", ")} onChange={event => update(step.id, { toolsInput: event.target.value })} /></label>
        </div></details>
      </section>)}
      <div className="task-actions"><button type="button" className="task-button" onClick={add}>단계 추가</button><button type="submit" className="task-button" data-primary disabled={!connected}>단계 저장</button><button type="button" className="task-button" onClick={() => useTaskWorkspace.setState({ editingSteps: null })}>편집 취소</button></div>
    </fieldset>
  </form>;
}

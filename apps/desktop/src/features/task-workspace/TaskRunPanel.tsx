import { useDesktopNavigationStore } from "../shell/navigation-store";
import { statusText, type RunView } from "./task-workspace-model";
import { useTaskWorkspace } from "./task-workspace-state";
import { TaskStepEditor } from "./TaskStepEditor";

export function TaskRunPanel({ run, connected }: { run: RunView; connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation), running = run.status === "running";
  const output = state.output;
  const attempts = run.attempts.filter(attempt => attempt.stepId === state.outputStep);
  const selected = run.steps.find(step => step.id === state.outputStep);
  const start = () => {
    if (!run.attempts.length) state.request("mutation", "task_graph_run", { graphId: run.id });
    else state.confirm({ title: "처음부터 실행", message: "새 작업 폴더에서 모든 단계를 다시 실행합니다. 이전 실행 기록은 남습니다.", label: "전체 실행", type: "task_graph_run", fields: { graphId: run.id } });
  };
  return <section className="task-panel" aria-label="실행 작업">
    <header className="task-panel-heading"><h2>{running ? "작업 진행" : "결과"}</h2><span className="task-state" data-state={run.status}>{statusText(run.status)}</span></header>
    <div className="task-panel-content">
      <div className="task-run-heading"><p>{run.steps.filter(step => step.status === "completed").length} / {run.steps.length}단계 완료</p><div className="task-actions">
        {running ? <button className="task-button" disabled={!connected || busy || state.cancelingRun === run.id} onClick={state.stopRun}>{state.cancelingRun === run.id ? "중단 요청 중…" : "작업 중단"}</button>
          : run.status !== "completed" ? <button className="task-button" data-primary disabled={!connected || busy} onClick={() => run.attempts.length ? state.request("mutation", "task_resume", { graphId: run.id }) : start()}>{run.attempts.length ? "남은 작업 이어가기" : "실행 시작"}</button> : null}
      </div></div>
      {running ? <p className="task-current-step">{run.steps.find(step => step.status === "running")?.title || "다음 단계를 준비하고 있습니다."}</p> : null}
      {!running ? <details className="task-inline-details"><summary>실행 설정</summary><div className="task-actions">
        <button className="task-button" disabled={!connected || busy} onClick={start}>처음부터 실행</button>
        <button className="task-button" disabled={busy} onClick={() => useTaskWorkspace.setState({ editingSteps: run.steps.map(step => ({ ...step, dependencies: [...step.dependencies], skills: [...step.skills], tools: [...step.tools] })) })}>단계 편집</button>
      </div></details> : null}
      {state.editingSteps ? <TaskStepEditor connected={connected} /> : <details className="task-inline-details"><summary>진행 상세</summary><ol className="task-run-steps">{run.steps.map((step, index) => <li key={step.id}>
        <div className="task-run-step-title"><span className="task-step-number">{index + 1}</span><button className="task-title-button" onClick={() => state.readOutput(step.id)} disabled={!connected}>{step.title}</button><span className="task-state" data-state={step.status}>{statusText(step.status)}</span></div>
        <div className="task-actions"><button className="task-button task-button-quiet" onClick={() => state.readOutput(step.id)} disabled={!connected}>{step.error ? "오류 확인" : "결과 보기"}</button></div>
        <details className="task-inline-details"><summary>단계 내용</summary><p>{step.prompt}</p>
          {step.dependencies.length ? <p className="task-detail-text">선행 단계: {step.dependencies.map(id => run.steps.find(item => item.id === id)?.title || id).join(", ")}</p> : null}
          {step.artifact ? <p className="task-file-path">{step.artifact}</p> : null}
          {step.summary || step.error ? <pre className="task-technical-record">{step.error || step.summary}</pre> : null}
          <div className="task-actions">
            {['failed', 'canceled'].includes(step.status) ? <button className="task-button" disabled={!connected || busy} onClick={() => state.request("mutation", "task_retry", { graphId: run.id, taskId: step.id })}>이 단계만 다시 시도</button> : null}
            {['running', 'pending', 'blocked'].includes(step.status) ? <button className="task-button" disabled={!connected || busy} onClick={() => state.request("mutation", "task_cancel", { graphId: run.id, taskId: step.id })}>이 단계만 중단</button> : null}
          </div>
        </details>
      </li>)}</ol></details>}
    </div>
    {state.outputStep ? <section className="task-output" aria-label="선택한 단계 출력">
      <div className="task-output-heading"><h3>{selected?.title || state.outputStep}</h3></div>
      {attempts.length > 1 ? <details className="task-inline-details"><summary>이전 실행 결과</summary><label>실행 기록<select value={state.outputTime ?? ""} onChange={event => state.readOutput(state.outputStep, event.target.value ? Number(event.target.value) : undefined)}>
        <option value="">최신 실행</option>{attempts.map((attempt, index) => <option key={attempt.started} value={Date.parse(attempt.started)}>{index + 1}회 · {statusText(attempt.status)} · {new Date(attempt.started).toLocaleString("ko-KR")}</option>)}
      </select></label></details> : null}
      {state.pending.output ? <p role="status">출력을 읽고 있습니다.</p> : output?.stepId === state.outputStep ? <>
        {state.outputTime !== null || !["completed", "ok"].includes(output.status) ? <p className="task-state" data-state={output.status}>{statusText(output.status)}</p> : null}
        {output.files.length ? <ul className="task-result-files" aria-label="결과 파일">{output.files.map(file => <li key={file} title={file}>{file.split(/[\\/]/).pop()}</li>)}</ul> : null}
        {output.resultOutput ? <pre aria-label="프로그램 출력">{output.resultOutput}</pre> : null}
        {output.resultError ? <pre aria-label="프로그램 오류" className="task-error-output">{output.resultError}</pre> : null}
        {output.conversationId ? <button className="task-button" onClick={() => useDesktopNavigationStore.getState().setActivePage("build", { conversationId: output.conversationId, mode: "orchestration" })}>현재 작업 파일 열기</button> : null}
        <details className="task-inline-details"><summary>자세한 실행 기록</summary><pre aria-label="실행 로그">{output.stdout || "기록된 출력이 없습니다."}</pre>{output.stderr ? <pre aria-label="상세 오류" className="task-error-output">{output.stderr}</pre> : null}</details>
      </> : null}
    </section> : null}
  </section>;
}

import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useSessionExplore } from "./session-explore-state";
import { record, rows, text, number, statusLabel } from "./explore-model";

export function SessionExplorePanel({ connected }: { connected: boolean }) {
  const state = useSessionExplore();
  const selected = state.items.find(item => item.key === state.selected);
  const navigate = useDesktopNavigationStore(s => s.setActivePage);
  const queue = record(state.status?.queue), active = record(state.status?.active);
  return <details className="explore-sheet explore-section" onToggle={event => { if (event.currentTarget.open && connected && !state.items.length) state.refresh(); }}><summary>작업 기록과 에이전트</summary><div className="explore-fields">
    {state.error && <p role="alert" className="explore-notice explore-error">{state.error}</p>}
    {state.notice && <p role="status" className="explore-notice">{state.notice}</p>}
    <div className="explore-input-row"><label>저장된 작업<select value={state.selected} disabled={!connected || !!state.pending.history} onChange={event => state.open(event.target.value)}><option value="">{state.pending.list ? "작업 목록을 읽고 있습니다." : "작업을 선택하세요"}</option>{state.items.map(item => <option value={text(item.key)} key={text(item.key)}>{text(item.displayName) || text(item.label) || text(item.key)}</option>)}</select></label><button className="explore-button" disabled={!connected || !!state.pending.list} onClick={state.refresh}>새로고침</button></div>
    {!state.items.length && !state.pending.list && <p className="explore-muted">아직 저장된 작업이 없습니다.</p>}
    {state.pending.history && <p role="status" className="explore-muted">작업 내용을 읽고 있습니다.</p>}
    {state.history && <section aria-label="선택한 작업" className="explore-fields"><div className="explore-result-heading"><h2>{text(selected?.displayName) || text(selected?.label) || "작업 내용"}</h2>{selected && ["chat", "coding"].includes(text(selected.scope)) && <button className="explore-button" disabled={!!state.pending.message} onClick={() => navigate(selected.scope === "coding" ? "build" : "ask", { conversationId: state.selected })}>이 작업에서 계속하기</button>}</div>
      <div className="explore-session-messages">{rows(state.history.messages).map((message, index) => <article key={index}><small>{text(message.role) === "user" ? "나" : text(message.role) === "assistant" ? "답변" : "기록"}</small><p>{text(message.text)}</p></article>)}</div>
      {state.history.truncated === true && <p className="explore-muted">최근 메시지를 표시하고 있습니다.</p>}
      <details className="explore-fold"><summary>메시지 남기기</summary><form className="explore-fields" onSubmit={event => { event.preventDefault(); if (connected) state.append(); }}><label>이 작업에 남길 메시지<textarea rows={3} value={state.message} onChange={event => useSessionExplore.setState({ message: event.target.value })} /></label><div><button className="explore-button" disabled={!connected || !!state.pending.message || !state.message.trim()}>{state.pending.message ? "저장 중" : "메시지 남기기"}</button></div></form></details>
    </section>}
    <details className="explore-fold"><summary>새 에이전트 작업</summary><form className="explore-fields" onSubmit={event => { event.preventDefault(); if (connected) state.create(); }}>
      <label>에이전트에게 맡길 일<textarea rows={4} value={state.task} onChange={event => useSessionExplore.setState({ task: event.target.value })} /></label>
      <details className="explore-fold"><summary>이름과 실행 설정</summary><div className="explore-columns">
        <label>작업 이름<input value={state.label} onChange={event => useSessionExplore.setState({ label: event.target.value })} /></label>
        <label>실행 환경<select value={state.runtime} onChange={event => useSessionExplore.setState({ runtime: event.target.value as "acp" | "codex" })}><option value="acp">연결한 에이전트</option><option value="codex">Codex CLI</option></select></label>
        <label>작업 방식<select value={state.mode} onChange={event => useSessionExplore.setState({ mode: event.target.value as "run" | "session" | "command" })}><option value="run">한 번 실행</option><option value="session">연속 작업</option><option value="command">세션 명령</option></select></label>
        <label>최대 실행 시간(초)<input type="number" min={30} max={3600} value={state.timeout} onChange={event => useSessionExplore.setState({ timeout: Math.max(30, Math.min(3600, Number(event.target.value) || 900)) })} /></label>
      </div><label className="explore-check"><input type="checkbox" checked={state.thread} onChange={event => useSessionExplore.setState({ thread: event.target.checked })} />작업 문맥 이어 쓰기</label></details>
      <div><button className="explore-button" data-primary disabled={!connected || !!state.pending.spawn || !state.task.trim()}>{state.pending.spawn ? "시작하는 중" : "작업 시작"}</button></div>
    </form>
      {state.spawn && <section aria-label="에이전트 작업 결과" className="explore-fields"><h3>{statusLabel(text(state.spawn.status))}</h3>{text(state.spawn.note) && <p className="explore-plain">{text(state.spawn.note)}</p>}{text(state.spawn.childSessionKey) && <div><button className="explore-button" disabled={!connected || !!state.pending.history} onClick={() => state.open(text(state.spawn!.childSessionKey))}>작업 기록 열기</button></div>}<details className="explore-fold"><summary>실행 상세</summary><pre className="explore-output">{JSON.stringify(state.spawn, null, 2)}</pre></details></section>}
    </details>
    <details className="explore-fold"><summary>실행 대기 상태</summary><div className="explore-fields"><div><button className="explore-button" disabled={!connected || !!state.pending.status} onClick={() => state.request("status", "sessions_spawn", { action: "status" })}>상태 확인</button></div>{state.status && <p className="explore-muted">대기 {number(queue.total)}개 · 실행 중 {number(active.activeCount)}개</p>}</div></details>
  </div></details>;
}

import { useEffect, useRef } from "react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useDesktopShellStore } from "../../shell-store";
import { AutomationFormPanel } from "./AutomationFormPanel";
import { AutomationResultPanel } from "./AutomationResultPanel";
import { useAutomationWorkspace } from "./automation-state";
import "./automation-workspace.css";

export function AutomationWorkspacePage() {
  const state = useAutomationWorkspace();
  const navigation = useDesktopNavigationStore();
  const authenticated = useDesktopAuthStore(value => value.auth.status === "authenticated");
  const online = useDesktopShellStore(value => value.bridge.status === "connected");
  const connected = authenticated && online;
  const selected = state.items.find(item => item.id === state.selectedId);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!connected) return;
    state.refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !useAutomationWorkspace.getState().pending.list) state.refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    const payload = navigation.routePayload;
    if (!payload || state.pending.change) return;
    const request = payload.input?.trim() || "";
    if (payload.create || request) {
      if (state.editor && state.form.request.trim() && (state.editId || (request && request !== state.form.request))) {
        useAutomationWorkspace.setState({ error: "작성 중인 자동화가 있습니다. 저장하거나 취소하면 전달받은 요청을 열 수 있습니다." });
        return;
      }
      if (!state.editor) state.create();
      if (request) state.patch({ request });
      if (payload.scheduleKind) state.patch({ kind: payload.scheduleKind });
      if (payload.scheduleTime) state.patch({ time: payload.scheduleTime });
      if (payload.scheduleWeekdays) state.patch({ weekdays: payload.scheduleWeekdays });
      if (payload.scheduleDayOfMonth) state.patch({ day: payload.scheduleDayOfMonth });
    }
    navigation.clearRoutePayload();
  }, [navigation.routeVersion, state.editor, state.pending.change]);
  useEffect(() => { if (state.confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [state.confirmation]);
  return <div className="automation-workspace" data-surface="automation">
    <header className="automation-page-heading"><div><h1>자동화</h1><p>반복할 일과 시간을 정해 두세요.</p></div>{!state.editor && <button type="button" className="automation-button" data-primary disabled={!connected || Boolean(state.pending.change)} onClick={state.create}>새 자동화</button>}</header>
    {!connected && <p className="automation-notice" role="status">서버에 연결하면 자동화를 불러올 수 있습니다.</p>}
    {state.error && <div className="automation-notice automation-warning" role="alert"><p>{state.error}</p><button type="button" className="automation-button automation-quiet" onClick={() => useAutomationWorkspace.setState({ error: "" })}>닫기</button></div>}
    {state.scheduler && (!state.scheduler.enabled || state.scheduler.error) && <p className="automation-notice automation-warning" role="status">{state.scheduler.error || "예약 실행이 중지되어 있습니다. 서버 상태를 확인해 주세요."}</p>}
    {state.pending.change && <p className="automation-note" role="status">{state.progress || (state.pending.change.type === "run_routine" ? "실행 결과를 기다리고 있습니다." : "변경을 저장하고 있습니다.")}</p>}
    {!state.editor && !selected && <section className="automation-library" aria-label="저장한 자동화">
      {state.pending.list && !state.items.length ? <p role="status">자동화를 불러오고 있습니다.</p> : !state.items.length ? <p className="automation-empty">아직 자동화가 없습니다. 반복할 일을 하나 등록해 보세요.</p> : <ul>{state.items.map(item => <li key={item.id}><button type="button" className="automation-list-link" disabled={Boolean(state.pending.change)} onClick={() => state.select(item.id)}><span>{item.title || "이름 없는 자동화"}</span><small>{item.running ? "실행 중" : item.enabled ? `다음 ${item.next}` : "예약 꺼짐"} · {item.schedule}</small></button><button type="button" className="automation-button automation-quiet" aria-label={`${item.title} ${item.enabled ? "예약 끄기" : "예약 켜기"}`} disabled={!connected || Boolean(state.pending.change)} onClick={() => state.toggle(item)}>{item.enabled ? "예약 켜짐" : "예약 꺼짐"}</button></li>)}</ul>}
    </section>}
    {(state.editor || selected) && state.items.length > 0 && <details className="automation-library-fold"><summary>저장한 자동화 · {state.items.length}</summary><div className="automation-fields-row"><label>자동화 선택<select disabled={state.editor || Boolean(state.pending.change)} value={state.selectedId} onChange={event => state.select(event.target.value)}><option value="">목록으로 돌아가기</option>{state.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{state.editor && <p className="automation-note">작성을 저장하거나 취소한 뒤 다른 자동화를 선택할 수 있습니다.</p>}</div></details>}
    {state.editor ? <AutomationFormPanel connected={connected} /> : selected && <AutomationResultPanel key={selected.id} item={selected} connected={connected} />}
    <dialog ref={dialog} className="automation-dialog" aria-labelledby="automation-confirm-title" onCancel={() => useAutomationWorkspace.setState({ confirmation: null })} onClose={() => useAutomationWorkspace.setState({ confirmation: null })}>
      {state.confirmation && <form onSubmit={event => { event.preventDefault(); state.accept(); }}><h2 id="automation-confirm-title">{state.confirmation.title}</h2><p>{state.confirmation.message}</p><div className="automation-actions"><button type="button" autoFocus className="automation-button" onClick={() => useAutomationWorkspace.setState({ confirmation: null })}>취소</button><button type="submit" className="automation-button" data-primary disabled={!connected}>{state.confirmation.action === "delete" ? "삭제" : "보내기"}</button></div></form>}
    </dialog>
  </div>;
}

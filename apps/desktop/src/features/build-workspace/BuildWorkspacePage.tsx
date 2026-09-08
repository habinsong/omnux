import { useEffect, useRef } from "react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { BuildComposer } from "./BuildComposer";
import { BuildResultPanel } from "./BuildResultPanel";
import { busyBuild, useBuildWorkspace } from "./build-state";
import { modeNames } from "./build-model";
import "./build-workspace.css";

export function BuildWorkspacePage() {
  const state = useBuildWorkspace(), busy = busyBuild(state);
  const online = useDesktopShellStore(value => value.bridge.status === "connected");
  const authenticated = useDesktopAuthStore(value => value.auth.status === "authenticated");
  const connected = online && authenticated;
  const navigation = useDesktopNavigationStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const payload = navigation.routePayload;
    if (!payload || busy) return;
    if (payload.projectKey && state.activeId && state.settings.projectKey !== payload.projectKey) {
      if (state.input.trim() || state.attachments.length) {
        useBuildWorkspace.setState({ error: "작성 중인 요청이 있습니다. 새 빌드를 시작하면 선택한 프로젝트를 열 수 있습니다." });
        return;
      }
      state.fresh();
    }
    if (payload.input) useBuildWorkspace.setState({ input: payload.input });
    if (payload.conversationId && connected) state.open(payload.conversationId);
    if (payload.projectName || payload.projectKey) state.patchSettings({ project: payload.projectName || payload.projectKey || "", projectKey: payload.projectKey || "", projectPath: payload.projectPath || "" });
    if (!payload.conversationId || connected) navigation.clearRoutePayload();
  }, [navigation.routeVersion, connected, busy, state.activeId, state.input]);
  useEffect(() => { if (state.confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [state.confirmation]);
  return <div className="build-workspace" data-surface="build-workspace">
    <header className="build-page-heading"><div><h1>빌드</h1><p>{state.settings.projectKey ? state.settings.project : "필요한 결과를 만들고 실행합니다."}</p></div><button type="button" className="build-button" disabled={busy} onClick={() => { if (state.input.trim() || state.attachments.length) useBuildWorkspace.setState({ confirmation: "new" }); else state.fresh(); }}>새 빌드</button></header>
    {!connected && <p className="build-notice" role="status">서버에 연결하면 작업을 시작할 수 있습니다. 작성한 내용은 유지됩니다.</p>}
    {state.error && <div className="build-notice build-error" role="alert"><p>{state.error}</p><button type="button" className="build-button build-quiet" onClick={() => useBuildWorkspace.setState({ error: "" })}>닫기</button></div>}
    {Boolean(state.pending.run || state.pending.execute) && <div className="build-notice"><p role="status">{state.cancelPending ? "작업을 중단하고 있습니다." : state.progress || "작업 중입니다."}</p><button type="button" className="build-button" disabled={!connected || state.cancelPending} onClick={state.cancel}>작업 중단</button></div>}
    <details className="build-history" onToggle={event => { if (event.currentTarget.open && connected) state.loadHistory(); }}><summary>저장한 빌드</summary><div className="build-form-fields">{Object.keys(state.pending).some(key => key.startsWith("list-") && state.pending[key]) && <p role="status" className="build-muted">빌드 목록을 불러오고 있습니다.</p>}<label>빌드 선택<select disabled={!connected || busy || Boolean(state.input.trim() || state.attachments.length)} value={state.activeId} onChange={event => state.open(event.target.value)}><option value="">선택해 주세요.</option>{state.items.map(item => <option key={item.id} value={item.id}>{item.title} · {modeNames[item.mode]}</option>)}</select></label>{(state.input.trim() || state.attachments.length > 0) && <p className="build-muted">작성한 요청을 보내거나 새 빌드에서 비운 뒤 다른 기록을 선택할 수 있습니다.</p>}{state.activeId && <button type="button" className="build-button build-delete" disabled={!connected || busy} onClick={() => useBuildWorkspace.setState({ confirmation: "delete" })}>이 빌드 기록 삭제</button>}</div></details>
    {state.pending.detail && <p role="status" className="build-muted">저장된 결과를 불러오고 있습니다.</p>}
    <BuildResultPanel connected={connected} />
    <BuildComposer connected={connected} />
    {state.submitted && (state.pending.run || (state.error && state.active?.messages.filter(message => message.role === "user").slice(-1)[0]?.text !== state.submitted.input)) && <details className="build-history"><summary>보낸 요청</summary><p className="build-sent-request">{state.submitted.input}</p></details>}
    {Boolean(state.active?.messages.length) && <details className="build-history"><summary>이 빌드의 요청 기록</summary><ol className="build-request-history">{state.active?.messages.map((message, index) => <li key={index}><strong>{message.role === "user" ? "요청" : "응답"}</strong><p>{message.text}</p></li>)}</ol></details>}
    <dialog ref={dialog} className="build-dialog" aria-labelledby="build-confirm-title" onCancel={() => useBuildWorkspace.setState({ confirmation: null })} onClose={() => useBuildWorkspace.setState({ confirmation: null })}>{state.confirmation && <form onSubmit={event => { event.preventDefault(); state.confirm(); }}><h2 id="build-confirm-title">{state.confirmation === "new" ? "새 빌드 시작" : "빌드 기록 삭제"}</h2><p>{state.confirmation === "new" ? "작성 중인 요청과 첨부를 비우고 새 빌드를 시작합니다." : "이 빌드의 대화와 결과 기록을 삭제합니다."}</p><div className="build-actions"><button type="button" autoFocus className="build-button" onClick={() => useBuildWorkspace.setState({ confirmation: null })}>취소</button><button type="submit" className="build-button" data-primary>{state.confirmation === "new" ? "새로 시작" : "삭제"}</button></div></form>}</dialog>
  </div>;
}

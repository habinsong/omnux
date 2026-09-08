import { useRef } from "react";
import { useBuildWorkspace, busyBuild } from "./build-state";
import { BuildSettings } from "./BuildSettings";

export function BuildComposer({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace(), busy = busyBuild(state);
  const files = useRef<HTMLInputElement>(null);
  return <section className="build-sheet" aria-label="빌드 요청">
    <form className="build-composer" onSubmit={event => { event.preventDefault(); state.run(); }} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={event => { if (!Array.from(event.dataTransfer.types).includes("Files")) return; event.preventDefault(); if (!busy) void state.attach(Array.from(event.dataTransfer.files)); }}>
      <label>만들거나 바꾸고 싶은 내용<textarea id="build-workspace-request" rows={state.currentResult ? 3 : 5} value={state.input} onChange={event => useBuildWorkspace.setState({ input: event.target.value })} placeholder="필요한 동작과 원하는 결과를 적어 주세요." onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (connected && !busy) state.run(); } }} onPaste={event => { const values = Array.from(event.clipboardData.files); if (values.length && !busy) { event.preventDefault(); void state.attach(values); } }} /></label>
      {state.readingFiles && <p role="status" className="build-muted">첨부 파일을 읽고 있습니다.</p>}
      {state.attachments.length > 0 && <ul className="build-attached-files">{state.attachments.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><button type="button" className="build-button build-quiet" disabled={busy} aria-label={`${file.name} 첨부 제거`} onClick={() => useBuildWorkspace.setState(current => ({ attachments: current.attachments.filter((_, i) => i !== index) }))}>제거</button></li>)}</ul>}
      <div className="build-actions"><button type="submit" className="build-button" data-primary disabled={!connected || busy || (!state.input.trim() && !state.attachments.length)}>{state.currentResult ? "요청 보내기" : "만들기"}</button><button type="button" className="build-button build-quiet" disabled={busy} onClick={() => files.current?.click()}>파일 첨부</button><input ref={files} className="build-file-input" type="file" multiple aria-label="빌드에 첨부할 파일" onChange={event => { const values = Array.from(event.target.files || []); event.target.value = ""; void state.attach(values); }} /></div>
      <BuildSettings connected={connected} />
      <details className="build-fold" onToggle={event => { if (event.currentTarget.open && connected) state.loadReferences(); }}><summary>스킬과 참고 노트</summary><fieldset disabled={busy} className="build-form-fields">
        {state.pending.skills || state.pending.memory ? <p className="build-muted" role="status">참고 자료를 불러오고 있습니다.</p> : null}
        <label>적용할 스킬<select value={state.settings.skill} onChange={event => state.patchSettings({ skill: event.target.value })}><option value="">자동 선택</option>{state.skills.map(skill => <option key={`${skill.scope}:${skill.name}`} value={`${skill.scope}:${skill.name}`}>{skill.name} · {skill.scope === "global" ? "전역" : "프로젝트"}</option>)}</select></label>
        <fieldset className="build-note-options"><legend>참고할 노트</legend>{state.memory.length ? state.memory.map(note => <label key={note.name}><input type="checkbox" checked={state.settings.memory.includes(note.name)} onChange={event => state.patchSettings({ memory: event.target.checked ? [...state.settings.memory, note.name] : state.settings.memory.filter(name => name !== note.name) })} /><span>{note.name}</span></label>) : <p className="build-muted">저장된 노트가 없습니다.</p>}</fieldset>
      </fieldset></details>
    </form>
  </section>;
}

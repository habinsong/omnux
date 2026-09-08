import { useContextPickerStore, useContextPickerBridge, appendContextSelectionBundle, type ContextPickerTab } from "../context-picker/context-picker-store";
import { useAskStore } from "../ask/ask-store";

export function ChatReferencePicker({ canRequest }: { canRequest: boolean }) {
  const state = useContextPickerStore();
  useContextPickerBridge();
  const paths = state.tab === "workspace" ? state.workspacePath : state.pathSnapshot;
  const loading = state.tab === "workspace" ? state.workspaceLoading : state.pathLoading;
  return <details className="chat-fold"><summary>메모리·파일 찾아서 추가</summary><div className="chat-fields">
    <label>자료 위치<select value={state.tab} onChange={event => state.setTab(event.target.value as ContextPickerTab)}><option value="memory">메모리 검색</option><option value="workspace">작업 폴더의 파일</option><option value="paths">폴더·경로 선택</option></select></label>
    {state.lastError && <p role="alert" className="chat-error">{state.lastError}</p>}
    {state.tab === "memory" ? <>
      <form className="chat-search" onSubmit={event => { event.preventDefault(); state.searchMemory(); }}><label>메모리 검색어<input value={state.memoryQuery} onChange={event => state.setMemoryQuery(event.target.value)} /></label><button className="chat-button" disabled={!canRequest || state.memoryLoading || !state.memoryQuery.trim()}>찾기</button></form>
      {state.memoryResults.map((item, i) => <div className="chat-row" key={i}><p>{item.title || item.path}</p><div className="chat-actions"><button className="chat-button" disabled={!canRequest} onClick={() => state.previewMemory(item)}>읽기</button><button className="chat-button" onClick={() => state.selectMemory(item)}>선택</button></div></div>)}
    </> : <>
      {state.tab === "paths" && <div className="chat-columns"><label>기준 폴더<select value={state.pathScope} onChange={event => state.setPathScope(event.target.value as "workspace" | "memory")}><option value="memory">메모리</option><option value="workspace">작업 폴더</option></select></label>
        {!!paths?.roots.length && <label>저장 위치<select value={state.pathRootKey} onChange={event => state.setPathRootKey(event.target.value)}><option value="">기본 위치</option>{paths.roots.map(root => <option key={root.key} value={root.key}>{root.label}</option>)}</select></label>}</div>}
      <form className="chat-search" onSubmit={event => { event.preventDefault(); if (state.tab === "workspace") state.loadWorkspace(); else state.loadPathBrowser(); }}>
        <label>폴더 경로<input value={state.tab === "workspace" ? state.workspaceBrowsePath : state.pathBrowsePath} onChange={event => state.tab === "workspace" ? state.setWorkspaceBrowsePath(event.target.value) : state.setPathBrowsePath(event.target.value)} placeholder="비워 두면 기본 폴더" /></label><button className="chat-button" disabled={!canRequest || loading}>폴더 열기</button>
      </form>
      {paths && <><p className="chat-muted">{paths.displayPath || paths.rootLabel}</p><div className="chat-actions">
        {!!paths.browsePath && <button className="chat-button" disabled={!canRequest || loading} onClick={() => state.tab === "workspace" ? state.loadWorkspace(paths.parentBrowsePath) : state.loadPathBrowser(paths.parentBrowsePath)}>상위 폴더</button>}
        {state.tab === "paths" && paths.directorySelectPath && <button className="chat-button" onClick={() => state.addSelection({ id: `path:${paths.directorySelectPath}`, kind: "path", title: paths.rootLabel || paths.directorySelectPath, path: paths.directorySelectPath, detail: "폴더", text: paths.directorySelectPath })}>현재 폴더 선택</button>}
      </div>{paths.items.map((entry, index) => <div className="chat-row" key={index}><p>{entry.name}</p><div className="chat-actions">
        {entry.isDirectory ? <button className="chat-button" disabled={!canRequest || loading} onClick={() => state.tab === "workspace" ? state.loadWorkspace(entry.browsePath) : state.loadPathBrowser(entry.browsePath)}>열기</button> : <>
          {state.tab === "workspace" && <button className="chat-button" disabled={!canRequest} onClick={() => state.previewWorkspaceFile(entry.selectPath)}>읽기</button>}
          <button className="chat-button" onClick={() => state.tab === "workspace" ? state.selectWorkspaceFile(entry) : state.selectPathEntry(entry)}>선택</button>
        </>}
      </div></div>)}</>}
    </>}
    {(loading || state.memoryLoading) && <p role="status">자료를 읽고 있습니다.</p>}
    {state.preview && <section className="chat-fields" aria-label="참고 자료 내용"><h3>{state.preview.title}</h3><pre className="chat-output">{state.preview.loading ? "읽고 있습니다." : state.preview.error || state.preview.text}</pre><div><button className="chat-button" onClick={state.clearPreview}>미리보기 닫기</button></div></section>}
    {!!state.selections.length && <><ul className="chat-files">{state.selections.map(item => <li className="chat-row" key={item.id}><span>{item.title}</span><button className="chat-button chat-quiet" onClick={() => state.removeSelection(item.id)}>선택 해제</button></li>)}</ul>
      <div><button className="chat-button" onClick={() => { useAskStore.getState().setInput(appendContextSelectionBundle(useAskStore.getState().input, state.selections)); state.clearSelections(); }}>질문에 추가</button></div></>}
  </div></details>;
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useBuildWorkspace, busyBuild } from "./build-state";
import { relativeFile, selectedResult, statusName } from "./build-model";
import { saveBuildResultToNotebook, useBuildNotebookSave } from "./build-notebook-save";

export function BuildResultPanel({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace(), result = state.currentResult;
  const selected = selectedResult(result, state.target);
  const navigate = useDesktopNavigationStore((s) => s.setActivePage);
  const notebook = useBuildNotebookSave();
  if (!result || !selected) return null;
  const matches = state.runtime && state.runtime.target === state.target && (!state.runtime.targetProvider || state.runtime.targetProvider === selected.provider) && (!state.runtime.targetModel || state.runtime.targetModel === selected.model);
  const execution = matches && state.runtime?.execution ? state.runtime.execution : selected.execution;
  const paths = Array.from(new Set([...selected.changedFiles, selected.execution.entryFile])).filter(path => relativeFile(path, selected.execution.runDirectory));
  const preview = state.file?.kind === "page" ? state.file.url : matches ? state.runtime?.previewUrl : "";
  const busy = busyBuild(state);
  const runnable = !(execution.status === "skipped" && paths.length === 0);
  const handoff = [selected.summary || state.active?.title || "만든 결과", paths.length ? `파일: ${paths.map((path) => relativeFile(path, selected.execution.runDirectory)).filter(Boolean).join(", ")}` : ""].filter(Boolean).join("\n\n");
  const send = (page: "ask" | "planning" | "automate") =>
    navigate(page, {
      input: handoff,
      ...(page === "planning" || page === "automate" ? { create: true } : {}),
      ...(state.settings.projectKey ? { projectKey: state.settings.projectKey, projectName: state.settings.project || state.settings.projectKey, projectPath: state.settings.projectPath } : {})
    });
  return <section className="build-sheet" aria-label="빌드 결과">
    <header className="build-result-heading"><div><h2>{state.active?.title || "만든 결과"}</h2><p className="build-muted">{state.pending.run ? "이전 결과 · " : ""}{statusName(execution.status)}</p></div>{result.resumeInput && <button type="button" className="build-button" disabled={busy} onClick={() => { state.resume(); document.getElementById("build-workspace-request")?.focus(); }}>중단한 요청 이어 쓰기</button>}</header>
    <div className="build-result-body">
      {selected.summary && <div className="build-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.summary}</ReactMarkdown></div>}
      {paths.length > 0 && <div><h3>파일</h3><ul className="build-result-files">{paths.map(path => <li key={path}><button type="button" className="build-file-name" disabled={!connected || Boolean(state.pending.run)} onClick={() => state.showFile(path)}>{relativeFile(path, selected.execution.runDirectory)}</button>{/\.html?$/i.test(path) && <button type="button" className="build-button build-quiet" disabled={!connected || Boolean(state.pending.run)} onClick={() => state.showFile(path, true)}>미리 보기</button>}</li>)}</ul></div>}
      {execution.stdout && <div><h3>프로그램 출력</h3><pre className="build-program-output" aria-label="프로그램 출력">{execution.stdout}</pre></div>}
      {execution.stderr && <div><h3>오류 출력</h3><pre className="build-program-output build-error" aria-label="오류 출력">{execution.stderr}</pre></div>}
      {state.runtime && matches && <p className="build-muted" role="status">{state.runtime.message}</p>}
      {preview && <div className="build-preview"><div className="build-preview-heading"><h3>미리 보기</h3><a href={preview} target="_blank" rel="noreferrer">새 창에서 열기</a></div><iframe title="만든 결과 미리보기" src={preview} sandbox="allow-scripts allow-same-origin allow-forms" /></div>}
      {state.file && state.file.kind !== "page" && <section className="build-file-view" aria-label="선택한 파일"><div className="build-preview-heading"><h3>{state.file.path}</h3><button type="button" className="build-button build-quiet" onClick={() => useBuildWorkspace.setState({ file: null })}>파일 닫기</button></div>{state.file.loading ? <p role="status">파일을 불러오고 있습니다.</p> : state.file.error ? <p role="alert" className="build-error">{state.file.error}</p> : state.file.kind === "image" ? <img src={state.file.url} alt={state.file.path} /> : <pre className="build-source-code">{state.file.content}</pre>}{state.file.truncated && <p className="build-muted">처음 120,000자를 표시합니다.</p>}<a href={state.file.url} target="_blank" rel="noreferrer">원본 파일 열기</a></section>}
      {!result.resumeInput && runnable && <details className="build-fold"><summary>다시 실행하기</summary><div className="build-form-fields"><label>프로그램에 전달할 입력<textarea rows={2} value={state.standardInput} disabled={busy} onChange={event => useBuildWorkspace.setState({ standardInput: event.target.value })} placeholder="입력이 필요한 프로그램에만 적어 주세요." /></label><div className="build-actions"><button type="button" className="build-button" disabled={!connected || busy} onClick={state.execute}>선택한 결과 실행</button></div></div></details>}
      {handoff ? <details className="build-fold"><summary>결과 활용</summary><div className="build-actions">
        <button type="button" className="build-button" onClick={() => send("ask")}>질문으로 보내기</button>
        <button type="button" className="build-button" onClick={() => send("planning")}>작업으로 보내기</button>
        <button type="button" className="build-button" onClick={() => send("automate")}>자동화로 보내기</button>
        <button type="button" className="build-button" disabled={!connected || !!notebook.requestId} onClick={() => saveBuildResultToNotebook(handoff, [selected.provider, selected.model].filter(Boolean).join(" · "), result.conversationId, state.settings.projectKey)}>{notebook.requestId ? "저장 중" : "노트에 저장"}</button>
      </div></details> : null}
      {result.workers.length > 0 && <details className="build-fold"><summary>멀티 결과</summary><div className="build-form-fields"><label>살펴볼 결과<select value={state.target} disabled={Boolean(state.pending.run || state.pending.execute)} onChange={event => state.chooseTarget(event.target.value)}><option value="main">대표 결과 · {result.model}</option>{result.workers.map((worker, index) => <option key={index} value={`worker-${index}`}>{worker.model} · {statusName(worker.execution.status)}</option>)}</select></label></div></details>}
      <details className="build-fold"><summary>실행 상세</summary><div className="build-form-fields"><dl className="build-metadata"><div><dt>모델</dt><dd>{selected.provider} · {selected.model}</dd></div><div><dt>작업 폴더</dt><dd>{execution.runDirectory}</dd></div><div><dt>실행 명령</dt><dd>{execution.command || "없음"}</dd></div>{execution.exitCode !== null && <div><dt>종료 코드</dt><dd>{execution.exitCode}</dd></div>}</dl><pre className="build-technical-record">{[execution.rawOut, execution.rawError].filter(Boolean).join("\n") || "추가 실행 기록이 없습니다."}</pre>{result.retryReason && <p className="build-error">{result.retryReason}</p>}</div></details>
    </div>
  </section>;
}

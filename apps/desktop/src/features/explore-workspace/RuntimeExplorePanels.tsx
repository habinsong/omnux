import { requestConfirmDialog } from "../dialog/dialog-store";
import { number, rows, text, externalUrl, type Frame } from "./explore-model";
import { useRuntimeExplore } from "./runtime-explore-state";

function CapturedFrame({ frame }: { frame: Frame | null }) {
  return frame ? <figure className="explore-capture"><img src={frame.url} alt="브라우저에서 실제로 캡처한 화면" width={frame.width} height={frame.height} /><figcaption>마지막 캡처 · {new Date(frame.capturedAt).toLocaleTimeString("ko-KR")}</figcaption></figure> : null;
}

export function BrowserExplorePanel({ connected }: { connected: boolean }) {
  const state = useRuntimeExplore(), browser = state.browser;
  const busy = !!browser.pending, result = browser.result, tabs = rows(result?.tabs);
  return <details className="explore-sheet explore-section"><summary>브라우저</summary><div className="explore-fields">
    <form onSubmit={event => { event.preventDefault(); if (connected && browser.url.trim()) state.run("browser", "open", { url: browser.url.trim() }); }}>
      <label htmlFor="explore-browser-url">열 웹 주소</label><div className="explore-input-row"><input id="explore-browser-url" value={browser.url} type="url" placeholder="https://" onChange={event => state.patch("browser", { url: event.target.value })} /><button className="explore-button" data-primary disabled={!connected || busy || !browser.url.trim()}>열기</button></div>
    </form>
    {browser.error && <p className="explore-notice explore-error" role="alert">{browser.error}</p>}
    {busy && <p role="status" className="explore-muted">{browser.pending?.action === "snapshot" ? "화면을 캡처하고 있습니다." : "브라우저 동작을 기다리고 있습니다."}</p>}
    {!!tabs.length && <div className="explore-fields"><label>열린 페이지<select value={text(result?.activeTargetId)} disabled={!connected || busy} onChange={event => state.run("browser", "focus", { targetId: event.target.value })}>{tabs.map(tab => <option value={text(tab.targetId)} key={text(tab.targetId)}>{text(tab.title) || text(tab.url) || "빈 페이지"}</option>)}</select></label>
      <div className="explore-actions"><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("browser", "snapshot")}>화면 새로 캡처</button><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("browser", "close", { targetId: result?.activeTargetId })}>선택한 페이지 닫기</button></div>
    </div>}
    <CapturedFrame frame={browser.frame} />
    <details className="explore-fold"><summary>브라우저 관리</summary><div className="explore-fields">
      <p className="explore-muted">{result ? result.running ? "브라우저가 실행 중입니다." : "브라우저가 실행 중이지 않습니다." : "상태를 확인하면 열린 페이지를 불러옵니다."}</p>
      <label>브라우저 프로필<input value={browser.profile} disabled={busy} onChange={event => state.patch("browser", { profile: event.target.value, frame: null, result: null })} /></label>
      <div className="explore-actions"><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("browser", "status")}>상태 확인</button><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("browser", "start")}>빈 페이지 시작</button><button className="explore-button" disabled={!connected || busy || !result?.running} onClick={() => state.run("browser", "stop")}>브라우저 종료</button></div>
    </div></details>
  </div></details>;
}

export function CanvasExplorePanel({ connected }: { connected: boolean }) {
  const state = useRuntimeExplore(), canvas = state.canvas, busy = !!canvas.pending;
  const visible = canvas.result?.visible === true;
  const reset = async () => {
    if (await requestConfirmDialog({ title: "캔버스 초기화", message: "현재 화면과 입력한 내용을 비울까요?", confirmLabel: "초기화" })) state.run("canvas", "a2ui_reset");
  };
  return <details className="explore-sheet explore-section"><summary>캔버스</summary><div className="explore-fields">
    <form onSubmit={event => { event.preventDefault(); if (connected && externalUrl(canvas.url)) state.run("canvas", "navigate", { url: canvas.url.trim() }); }}>
      <label htmlFor="explore-canvas-url">캔버스에서 볼 주소</label><div className="explore-input-row"><input id="explore-canvas-url" value={canvas.url} type="url" placeholder="https://" onChange={event => state.patch("canvas", { url: event.target.value })} /><button className="explore-button" data-primary disabled={!connected || busy || !externalUrl(canvas.url)}>보기</button></div>
    </form>
    {canvas.error && <p role="alert" className="explore-notice explore-error">{canvas.error}</p>}
    {busy && <p role="status" className="explore-muted">{canvas.pending?.action === "snapshot" ? "화면을 캡처하고 있습니다." : "캔버스 동작을 기다리고 있습니다."}</p>}
    <div className="explore-actions"><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("canvas", visible ? "hide" : "present")}>{visible ? "화면 숨기기" : "캔버스 열기"}</button><button className="explore-button" disabled={!connected || busy || !visible} onClick={() => state.run("canvas", "snapshot", { maxWidth: state.width })}>화면 새로 캡처</button></div>
    {visible && <CapturedFrame frame={canvas.frame} />}
    <details className="explore-fold"><summary>화면 만들기와 점검</summary><div className="explore-fields">
      <div className="explore-columns"><label>캔버스 프로필<input value={canvas.profile} disabled={busy} onChange={event => state.patch("canvas", { profile: event.target.value, frame: null, result: null })} /></label><label>캡처 너비<select value={state.width} onChange={event => useRuntimeExplore.setState({ width: Number(event.target.value) })}><option value={390}>390px · 모바일</option><option value={768}>768px · 태블릿</option><option value={1280}>1,280px · PC</option><option value={1920}>1,920px · 넓게</option></select></label></div>
      <details className="explore-fold"><summary>JavaScript 실행</summary><form className="explore-fields" onSubmit={event => { event.preventDefault(); if (connected) state.run("canvas", "eval", { text: state.script }); }}>
        <label>캔버스에서 실행할 JavaScript<textarea rows={5} spellCheck={false} value={state.script} onChange={event => useRuntimeExplore.setState({ script: event.target.value })} /></label><div><button className="explore-button" disabled={!connected || busy || !visible || !state.script.trim()}>실행</button></div>
        {state.evaluation !== null && <section aria-label="JavaScript 실행 결과"><h3>실행 결과</h3><pre className="explore-output">{state.evaluation || "빈 문자열"}</pre></section>}
      </form></details>
      <details className="explore-fold"><summary>선언형 UI</summary><form className="explore-fields" onSubmit={event => { event.preventDefault(); if (connected) state.run("canvas", "a2ui_push", { text: state.definition }); }}>
        <label>A2UI JSONL<textarea rows={6} spellCheck={false} value={state.definition} onChange={event => useRuntimeExplore.setState({ definition: event.target.value })} /></label><div><button className="explore-button" disabled={!connected || busy || !state.definition.trim()}>화면에 적용</button></div>
        {number(canvas.result?.a2uiRevision) > 0 && <p className="explore-muted">화면 갱신 {number(canvas.result?.a2uiRevision)}회</p>}
      </form></details>
      {!!rows(canvas.result?.actionEvents).length && <details className="explore-fold"><summary>화면에서 발생한 동작</summary><pre className="explore-output">{JSON.stringify(canvas.result?.actionEvents, null, 2)}</pre></details>}
      <div className="explore-actions"><button className="explore-button" disabled={!connected || busy} onClick={() => state.run("canvas", "status")}>상태 확인</button><button className="explore-button explore-error" disabled={!connected || busy || !visible} onClick={() => void reset()}>캔버스 초기화</button></div>
    </div></details>
  </div></details>;
}

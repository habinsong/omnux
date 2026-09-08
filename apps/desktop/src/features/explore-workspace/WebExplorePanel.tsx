import { useState } from "react";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useWebExplore } from "./web-explore-state";

export function WebExplorePanel({ connected }: { connected: boolean }) {
  const state = useWebExplore();
  const navigate = useDesktopNavigationStore(s => s.setActivePage);
  const [notice, setNotice] = useState("");
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice("복사했습니다."); } catch { setNotice("복사하지 못했습니다."); } };
  return <section className="explore-sheet" aria-label="웹 탐색"><form className="explore-fields" onSubmit={event => { event.preventDefault(); if (connected) state.search(); }}>
    <div className="explore-fields"><label htmlFor="explore-web-query">찾을 내용이나 웹 주소</label><div className="explore-input-row"><input id="explore-web-query" type="search" value={state.input} placeholder="검색어 또는 https:// 주소" onChange={event => useWebExplore.setState({ input: event.target.value })} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} /><button className="explore-button" data-primary disabled={!connected || !!state.pending || !state.input.trim()}>{state.pending ? "찾는 중" : "찾기"}</button></div></div>
    <details className="explore-fold"><summary>페이지 읽기 설정</summary><label>가져올 본문 길이<select value={state.maxChars} onChange={event => useWebExplore.setState({ maxChars: Number(event.target.value) })}><option value={8000}>짧게 · 8,000자</option><option value={20000}>보통 · 20,000자</option><option value={50000}>길게 · 50,000자</option></select></label></details>
  </form>
    {state.error && <p role="alert" className="explore-notice explore-error">{state.error}</p>}
    {state.pending && <p role="status" className="explore-muted">{state.pending.kind === "document" ? "페이지 본문을 가져오고 있습니다." : "검색 결과를 기다리고 있습니다."}</p>}
    {notice && <p role="status" className="explore-muted">{notice}</p>}
    {state.results && <section aria-label="검색 결과" className="explore-fields"><h2>{state.query ? `‘${state.query}’ 검색 결과` : "검색 결과"}</h2>
      {!state.results.length && <p className="explore-muted">검색 결과가 없습니다. 다른 검색어로 다시 찾아보세요.</p>}
      <ol className="explore-results">{state.results.map((item, index) => <li key={`${item.url}-${index}`}>
        <h3>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title || item.url}</a> : item.title}</h3><p>{item.description}</p>
        <div className="explore-actions"><small>{item.url ? new URL(item.url).hostname : ""}{item.published ? ` · ${item.published}` : ""}</small>
          {item.url && <button className="explore-button explore-quiet" onClick={() => { useWebExplore.setState({ input: item.url }); useWebExplore.getState().search(); }} disabled={!connected || !!state.pending}>본문 읽기</button>}
          <button className="explore-button explore-quiet" onClick={() => navigate("ask", { input: [item.title, item.url, item.description].filter(Boolean).join("\n") })}>질문에 사용</button>
        </div>
      </li>)}</ol>
    </section>}
    {state.document && <section aria-label="페이지 본문" className="explore-fields"><div className="explore-result-heading"><h2>페이지 본문</h2><div className="explore-actions"><button className="explore-button" onClick={() => void copy(state.document!.text)}>본문 복사</button><button className="explore-button" onClick={() => navigate("ask", { input: [state.document!.url, state.document!.text].join("\n\n") })}>질문에 사용</button></div></div>
      {state.document.url && <a href={state.document.url} target="_blank" rel="noopener noreferrer">{state.document.url}</a>}
      {state.document.truncated && <p className="explore-notice">본문 일부를 가져왔습니다. 전체 내용은 원문에서 확인할 수 있습니다.</p>}
      <div className="explore-document" tabIndex={0}>{state.document.text || "가져올 본문이 없습니다."}</div>
      <details className="explore-fold"><summary>페이지 정보</summary><p className="explore-muted">HTTP {state.document.status} · {state.document.contentType}</p></details>
    </section>}
  </section>;
}

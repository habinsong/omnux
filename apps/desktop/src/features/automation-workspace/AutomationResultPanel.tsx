import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { statusLabel, type Automation } from "./automation-model";
import { useAutomationWorkspace } from "./automation-state";

export function AutomationResultPanel({ item, connected }: { item: Automation; connected: boolean }) {
  const state = useAutomationWorkspace();
  const latest = item.runs[0]?.timestamp;
  const selectedTime = state.selectedTime ?? latest;
  const record = item.runs.find(run => run.timestamp === selectedTime);
  const detail = state.detail?.id === item.id && state.detail.timestamp === selectedTime ? state.detail : null;
  const changing = Boolean(state.pending.change);
  const running = item.running || (state.pending.change?.type === "run_routine" && state.pending.change.fields.routineId === item.id);
  useEffect(() => {
    const pending = useAutomationWorkspace.getState().pending.detail;
    if (connected && selectedTime !== undefined && !detail && (pending?.fields.routineId !== item.id || pending.fields.timestamp !== selectedTime)) state.read(selectedTime, state.selectedTime !== null);
  }, [connected, item.id, selectedTime, latest]);
  return <section className="automation-sheet" aria-label="선택한 자동화">
    <div className="automation-sheet-heading"><div><h2>{item.title || "이름 없는 자동화"}</h2><p className="automation-note">{item.schedule} · {item.enabled ? `다음 ${item.next}` : "예약 꺼짐"}</p></div><button type="button" className="automation-button automation-quiet" disabled={!connected || changing || running} onClick={state.edit}>편집</button></div>
    <div className="automation-result-body">
      <p className="automation-request">{item.request}</p>
      <div className="automation-result-heading"><h3>{state.selectedTime && state.selectedTime !== latest ? "이전 실행" : "최근 실행"}</h3><span className="automation-note">{running ? "실행 중" : record ? `${record.time} · ${statusLabel(record.status)}` : "아직 실행하지 않았습니다."}</span></div>
      {running && <p role="status">작업을 실행하고 있습니다. 완료되면 결과가 여기에 표시됩니다.</p>}
      {state.pending.detail && <p role="status">실행 결과를 불러오고 있습니다.</p>}
      {detail ? <div className="automation-output" aria-label="실행 결과">
        {detail.error && detail.error.trim() !== detail.content.trim() && <p className="automation-warning">{detail.error}</p>}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content || "저장된 결과가 없습니다."}</ReactMarkdown>
      </div> : record && !state.pending.detail && <div className="automation-output" aria-label="실행 요약"><p>{record.summary || record.error || "저장된 실행 기록입니다."}</p><button type="button" className="automation-button" disabled={!connected} onClick={() => state.read(record.timestamp)}>결과 다시 읽기</button></div>}
      <div className="automation-actions"><button type="button" className="automation-button" disabled={!connected || changing || running} onClick={() => state.run(item)}>지금 실행</button><button type="button" className="automation-button automation-quiet" disabled={!connected || changing} onClick={() => state.toggle(item)}>{item.enabled ? "예약 끄기" : "예약 켜기"}</button></div>
      {running && <p className="automation-note">예약을 꺼도 현재 실행은 완료될 때까지 계속됩니다.</p>}
      <details className="automation-fold"><summary>이전 실행 기록{item.runs.length ? ` · ${item.runs.length}` : ""}</summary><div className="automation-fold-content">
        {item.runs.length ? <label>실행 선택<select value={selectedTime ?? ""} disabled={!connected} onChange={event => state.read(Number(event.target.value))}>{item.runs.map(run => <option key={run.timestamp} value={run.timestamp}>{run.time} · {statusLabel(run.status)}</option>)}</select></label> : <p className="automation-note">저장된 실행 기록이 없습니다.</p>}
        {record?.duration && <p className="automation-note">소요 시간 {record.duration}</p>}
      </div></details>
      <details className="automation-fold"><summary>상세 정보와 관리</summary><div className="automation-fold-content">
        <dl className="automation-metadata"><div><dt>시간대</dt><dd>{item.form.timezone}</dd></div>{detail?.artifact && <div><dt>결과 파일</dt><dd>{detail.artifact}</dd></div>}{item.script && <div><dt>실행 파일</dt><dd>{item.script}</dd></div>}{detail?.url && <div><dt>마지막 주소</dt><dd>{/^https?:\/\//i.test(detail.url) ? <a href={detail.url} target="_blank" rel="noreferrer">{detail.url}</a> : detail.url}</dd></div>}</dl>
        {detail?.downloads.map(file => <p key={file} className="automation-note">다운로드: {file}</p>)}
        {detail?.raw && <details className="automation-fold"><summary>원본 기록</summary><pre className="automation-raw-record">{detail.raw}</pre></details>}
        {item.qualityWarnings.map((warning, index) => <p key={index} className="automation-warning">{warning}</p>)}
        <div className="automation-actions">{record && <button type="button" className="automation-button" disabled={!connected || changing} onClick={() => useAutomationWorkspace.setState({ confirmation: { title: "결과 보내기", message: "선택한 실행 결과를 연결된 Telegram 대화로 보냅니다.", action: "resend", id: item.id, timestamp: record.timestamp } })}>이 결과를 Telegram으로 보내기</button>}<button type="button" className="automation-button automation-danger" disabled={!connected || changing || running} onClick={() => useAutomationWorkspace.setState({ confirmation: { title: "자동화 삭제", message: `‘${item.title}’의 예약과 실행 기록을 삭제합니다.`, action: "delete", id: item.id } })}>자동화 삭제</button></div>
      </div></details>
    </div>
  </section>;
}

import { STATIC_MODEL_OPTIONS } from "../ask/model-registry";
import { useAutomationWorkspace } from "./automation-state";
import type { AutomationForm } from "./automation-model";

export function AutomationFormPanel({ connected }: { connected: boolean }) {
  const state = useAutomationWorkspace();
  const form = state.form;
  const busy = Boolean(state.pending.change);
  const patch = state.patch;
  return <section className="automation-sheet" aria-label={state.editId ? "자동화 편집" : "자동화 작성"}>
    <form onInvalidCapture={event => { let parent = (event.target as HTMLElement).parentElement; while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; } }} onSubmit={event => { event.preventDefault(); state.save(); }}>
      <div className="automation-sheet-heading"><h2>{state.editId ? "자동화 편집" : "어떤 일을 반복할까요?"}</h2></div>
      <fieldset disabled={busy} className="automation-form-body">
        <label>자동으로 할 일<textarea required minLength={5} value={form.request} onChange={event => patch({ request: event.target.value })} placeholder="매일 확인할 내용이나 반복할 작업을 적어 주세요." rows={4} /></label>
        <div className="automation-fields-row">
          <label>반복<select value={form.kind} onChange={event => patch({ kind: event.target.value as AutomationForm["kind"] })}><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
          <label>실행 시간<input type="time" required value={form.time} onChange={event => patch({ time: event.target.value })} /></label>
          {form.kind === "monthly" && <label>매월 날짜<input type="number" required min={1} max={31} value={form.day || ""} onChange={event => patch({ day: Number(event.target.value) })} /></label>}
        </div>
        {form.kind === "weekly" && <fieldset className="automation-weekdays"><legend>실행 요일</legend><div>{["월", "화", "수", "목", "금", "토", "일"].map((name, index) => {
          const day = (index + 1) % 7;
          return <label key={day}><input type="checkbox" checked={form.weekdays.includes(day)} onChange={event => patch({ weekdays: event.target.checked ? [...form.weekdays, day].sort() : form.weekdays.filter(value => value !== day) })} />{name}</label>;
        })}</div></fieldset>}
        <p className="automation-note">{form.timezone} 기준 · 저장하면 다음 예약부터 실행합니다.</p>
        <details className="automation-fold"><summary>이름과 추가 설정</summary><div className="automation-fold-content">
          <label>자동화 이름<input value={form.title} onChange={event => patch({ title: event.target.value })} placeholder="비워 두면 할 일에서 정합니다." /></label>
          <label>시간대<input required value={form.timezone} onChange={event => patch({ timezone: event.target.value })} placeholder="Asia/Seoul" /></label>
          <label>실행 방식<select value={form.execution} onChange={event => patch({ execution: event.target.value })}><option value="">요청에 맞게 선택</option><option value="web">웹 검색</option><option value="url">링크 읽기</option><option value="script">코드 실행</option><option value="browser_agent">브라우저 조작</option></select></label>
          <p className="automation-note">웹 검색·링크 읽기는 Gemini, 코드 생성은 Groq, 브라우저 조작은 Codex 연결이 필요합니다.</p>
          {form.execution === "browser_agent" && <div className="automation-fold-content">
            <label>브라우저 실행 모델<select required value={form.agentModel} onChange={event => patch({ agentModel: event.target.value })}><option value="">모델 선택</option>{Array.from(new Set([...(STATIC_MODEL_OPTIONS.codex || []), form.agentModel])).filter(Boolean).map(model => <option key={model} value={model}>{model}</option>)}</select></label>
            <label>시작할 주소<input type="url" value={form.startUrl} onChange={event => patch({ startUrl: event.target.value })} placeholder="https://" /></label>
            <label>제한 시간(초)<input type="number" min={120} max={1800} value={form.timeout} onChange={event => patch({ timeout: Number(event.target.value) })} /></label>
          </div>}
          <div className="automation-fields-row"><label>실패 시 재시도<input type="number" min={0} max={5} value={form.retries} onChange={event => patch({ retries: Number(event.target.value) })} /></label>{form.retries > 0 && <label>재시도 간격(초)<input type="number" min={0} max={300} value={form.retryDelay} onChange={event => patch({ retryDelay: Number(event.target.value) })} /></label>}</div>
          <label className="automation-check"><input type="checkbox" checked={form.telegram} onChange={event => patch({ telegram: event.target.checked })} />Telegram으로 결과 받기</label>
          {form.telegram && <label>알림 조건<select value={form.notify} onChange={event => patch({ notify: event.target.value })}><option value="on_change">결과가 달라지면</option><option value="always">실행할 때마다</option><option value="error_only">오류가 생기면</option><option value="never">알림 보내지 않기</option></select></label>}
        </div></details>
        {state.preview && <div className="automation-preview" role="status"><p>{state.preview.schedule} · {state.preview.timezone}</p>{state.preview.warnings.map((warning, index) => <p key={index} className="automation-warning">{warning}</p>)}</div>}
        <div className="automation-actions"><button type="submit" className="automation-button" data-primary disabled={!connected}>{state.editId ? "변경 저장" : "자동화 저장"}</button><button type="button" className="automation-button automation-quiet" disabled={!connected || Boolean(state.pending.preview)} onClick={state.inspect}>{state.pending.preview ? "확인 중…" : "시간 확인"}</button><button type="button" className="automation-button automation-quiet" onClick={() => useAutomationWorkspace.setState({ editor: false, editId: null, error: "", preview: null })}>취소</button></div>
      </fieldset>
    </form>
  </section>;
}

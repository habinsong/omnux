import { useAskStore, type AskChatMode, type AskModelProvider, type AskProvider } from "../ask/ask-store";
import { PROVIDER_KEYS, PROVIDER_LABEL, modelOptionsForProvider } from "../ask/ask-models";
import { useSpeechStore, isSpeechSupported } from "../ask/ask-speech";

function ModelField({ provider, worker = false }: { provider: AskModelProvider; worker?: boolean }) {
  const state = useAskStore();
  const selected = (worker ? state.workerModels[provider] : state.selectedModels[provider]) || "";
  const options = [...new Set([...modelOptionsForProvider(provider, state.modelCatalogs), selected].filter(value => value && value !== "none"))];
  return <label>{PROVIDER_LABEL[provider]} {worker ? "비교 모델" : "응답 모델"}
    <select value={selected} disabled={state.pending} onChange={event => worker ? state.setWorkerModel(provider, event.target.value) : state.setSelectedModel(provider, event.target.value)}>
      <option value="">기본 모델</option>{worker && <option value="none">사용 안 함</option>}
      {options.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
  </label>;
}

export function ChatOptions({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const speech = useSpeechStore();
  const providers = PROVIDER_KEYS.map(provider => <option key={provider} value={provider}>{PROVIDER_LABEL[provider]}</option>);
  // 화면이 탭으로 갈려 있으므로 여기서 다시 접지 않는다.
  return <div className="chat-fields">
      <div className="chat-columns">
        <label>응답 방식<select value={state.chatMode} disabled={state.pending} onChange={event => { if (event.target.value !== state.chatMode) state.setChatMode(event.target.value as AskChatMode); }}><option value="single">한 모델로 대화</option><option value="orchestration">역할을 나눠 대화</option><option value="multi">모델별 답변 비교</option></select></label>
        {state.chatMode !== "multi" && <label>응답 제공자<select value={state.provider} disabled={state.pending} onChange={event => state.setProvider(event.target.value as AskProvider)}><option value="auto">자동 선택</option>{providers}</select></label>}
        {state.chatMode !== "multi" && state.provider !== "auto" && <ModelField provider={state.provider} />}
        {state.chatMode !== "single" && <label>요약 제공자<select value={state.summaryProvider} disabled={state.pending} onChange={event => state.setSummaryProvider(event.target.value as AskProvider)}><option value="auto">자동 선택</option>{providers}</select></label>}
      </div>
      {state.chatMode !== "single" && <fieldset><legend>참여할 모델</legend><div className="chat-columns">{PROVIDER_KEYS.map(provider => <ModelField key={provider} provider={provider} worker />)}</div></fieldset>}
      <div className="chat-checks">
        <label><input type="checkbox" checked={state.webSearchEnabled} disabled={state.pending} onChange={event => state.setWebSearchEnabled(event.target.checked)} />웹 자동 검색</label>
        <label><input type="checkbox" checked={state.thinkPlus} disabled={state.pending} onChange={event => state.setThinkPlus(event.target.checked)} />깊이 생각하기</label>
        {isSpeechSupported() && <label><input type="checkbox" checked={speech.autoSpeak} onChange={speech.toggleAutoSpeak} />답변 자동 읽기</label>}
      </div>
      <details className="chat-fold"><summary>제공자별 기본 모델</summary><div className="chat-columns">{PROVIDER_KEYS.map(provider => <ModelField key={provider} provider={provider} />)}</div></details>
      <div><button className="chat-button" disabled={!canRequest || state.pending} onClick={state.loadModelCatalogs}>모델 목록 새로고침</button></div>
  </div>;
}

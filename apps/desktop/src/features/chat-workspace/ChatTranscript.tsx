import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAskStore } from "../ask/ask-store";
import { useAskNotebookSave } from "../ask/ask-notebook-save";
import type { AskMessage } from "../ask/ask-context";
import { isSpeechSupported, useSpeechStore } from "../ask/ask-speech";
import { useDesktopNavigationStore } from "../shell/navigation-store";

function safeHref(value?: string) { return value && /^(https?:|mailto:)/i.test(value) ? value : undefined; }

export function ChatMarkdown({ text }: { text: string }) {
  return <div className="chat-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={safeHref(href)} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }) => <div className="chat-table-scroll" tabIndex={0} role="region" aria-label="답변 표"><table>{children}</table></div>
  }}>{text}</ReactMarkdown></div>;
}

function ReplyActions({ text, message, index, canRequest }: { text: string; message: AskMessage; index: number; canRequest: boolean }) {
  const state = useAskStore();
  const saving = useAskNotebookSave(s => !!s.requestId);
  const speech = useSpeechStore();
  const navigate = useDesktopNavigationStore(s => s.setActivePage);
  const [copyResult, setCopyResult] = useState("");
  const key = `${state.activeConversationId}-${index}-${message.model}`;
  const transfer = (page: "planning" | "automate" | "build" | "ask") => navigate(page, { input: text, ...(page === "automate" ? { create: true } : {}), ...(page === "ask" ? { mode: "compare" } : {}) });
  return <div className="chat-reply-actions">
    <div className="chat-actions"><button className="chat-button chat-quiet" aria-label="답변 복사" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopyResult("복사했습니다."); }
      catch { setCopyResult("복사하지 못했습니다."); }
    }}>복사</button>
      {isSpeechSupported() && <button className="chat-button chat-quiet" aria-pressed={speech.speakingKey === key} onClick={() => speech.toggle(key, text)}>{speech.speakingKey === key ? "읽기 중지" : "읽기"}</button>}
      {copyResult && <span role="status" className="chat-muted">{copyResult}</span>}
    </div>
    <details className="chat-fold"><summary>답변 활용</summary><div className="chat-actions">
      <button className="chat-button" onClick={() => transfer("planning")}>작업으로 보내기</button>
      <button className="chat-button" onClick={() => transfer("build")}>빌드로 보내기</button>
      <button className="chat-button" onClick={() => transfer("automate")}>자동화로 보내기</button>
      <button className="chat-button" disabled={state.pending} onClick={() => transfer("ask")}>모델 비교</button>
      <button className="chat-button" disabled={!canRequest || saving} onClick={() => state.saveMessageToNotebook(index, text, message.meta)}>{saving ? "저장 중" : "노트에 저장"}</button>
      {message.actionSuggestions?.map((suggestion, i) => <button key={i} className="chat-button" disabled={!canRequest || state.pending} onClick={() => state.runActionSuggestion(suggestion)}>{suggestion.label}</button>)}
    </div></details>
  </div>;
}

function ReplyDetails({ message }: { message: AskMessage }) {
  return <>
    {!!message.citations?.length && <details className="chat-fold"><summary>출처 {message.citations.length}</summary><ol className="chat-sources">
      {message.citations.map((source, index) => <li key={`${source.id}-${index}`}>
        {/^(https?:)\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a> : <span>{source.title || "출처"}</span>}
        {source.snippet && <p>{source.snippet}</p>}{source.published && <small>{source.published}</small>}
      </li>)}
    </ol>{message.citationValidation && <p className="chat-muted">{message.citationValidation.passed ? "인용 확인을 통과했습니다." : `출처 표시가 없는 문장 ${message.citationValidation.missingSentences}개가 있습니다.`}</p>}</details>}
    <details className="chat-fold"><summary>응답 정보</summary><dl className="chat-metadata">
      <div><dt>모델</dt><dd>{[message.provider, message.model].filter(Boolean).join(" · ") || "기록 없음"}</dd></div>
      {message.route && <div><dt>응답 경로</dt><dd>{message.route}</dd></div>}
      {message.meta && <div><dt>기록</dt><dd>{message.meta}</dd></div>}
      {message.tokenUsage && <div><dt>사용 토큰</dt><dd>{message.tokenUsage.totalTokens.toLocaleString()} · {message.tokenUsage.source}</dd></div>}
      {message.latency && <div><dt>응답 시간</dt><dd>{(message.latency.fullResponseMs / 1000).toFixed(1)}초</dd></div>}
      {message.retrievalTrace?.steps.map((step, i) => <div key={i}><dt>{step.tool}</dt><dd>{[step.status, step.detail, step.injected ? "답변에 반영" : ""].filter(Boolean).join(" · ")}</dd></div>)}
    </dl></details>
    {message.guard?.detail && <p className="chat-notice">{message.guard.detail}</p>}
    {message.responseNotes?.map((note, i) => <p key={i} className={note.ok ? "chat-muted" : "chat-error"}>{note.label}</p>)}
  </>;
}

export function ChatTranscript({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const [selected, setSelected] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { setSelected(0); }, [state.multiResult]);
  useEffect(() => { if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [state.messages, state.streamingText]);
  const comparison = state.multiResult?.providers[Math.min(selected, Math.max(0, state.multiResult.providers.length - 1))];
  return <section className="chat-transcript" aria-label="질문과 답변">
    {state.activeConversation?.title && <h2>{state.activeConversation.title}</h2>}
    {state.pending && !state.streamingActive && <p role="status" className="chat-muted">대화를 불러오고 있습니다.</p>}
    <div className="chat-log" role="log" aria-label="대화 내용" aria-live="polite" ref={log} onScroll={event => {
      const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }}>
      {state.messages.map((message, index) => <article className="chat-message" data-role={message.role} key={`${state.activeConversationId}-${index}`}>
        <p className="chat-speaker">{message.role === "user" ? "나" : message.role === "system" ? "안내" : "답변"}</p>
        {message.role === "ai" ? <ChatMarkdown text={message.text} /> : <p className="chat-plain">{message.text}</p>}
        {message.role === "ai" && <><ReplyActions message={message} text={message.text} index={index} canRequest={canRequest} /><ReplyDetails message={message} /></>}
      </article>)}
      {state.streamingActive && <article className="chat-message" aria-busy="true"><p className="chat-speaker">답변 작성 중</p>{state.streamingText ? <ChatMarkdown text={state.streamingText} /> : <p className="chat-muted">응답을 기다리고 있습니다.</p>}</article>}
    </div>
    {comparison && <details className="chat-fold chat-comparison"><summary>모델별 답변</summary><div className="chat-fields">
      <label>살펴볼 답변<select value={selected} onChange={event => setSelected(Number(event.target.value))}>{state.multiResult!.providers.map((provider, index) => <option key={`${provider.key}-${index}`} value={index}>{provider.label} · {provider.model}</option>)}</select></label>
      <ChatMarkdown text={comparison.text} />
      <ReplyActions text={comparison.text} message={{ ...state.messages[state.messages.length - 1], model: comparison.model }} index={state.messages.length - 1} canRequest={canRequest} />
    </div></details>}
  </section>;
}

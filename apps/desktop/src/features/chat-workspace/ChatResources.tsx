import { useRef } from "react";
import { useAskStore } from "../ask/ask-store";
import { filesToVisionAttachments } from "../ask/ask-vision";
import { ChatReferencePicker } from "./ChatReferencePicker";

export function ChatResources({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const images = useRef<HTMLInputElement>(null);
  const busy = !canRequest || state.pending;
  return <details className="chat-fold" open={state.sidePanel === "memory" || state.sidePanel === "context" || undefined} onToggle={event => {
    if (!event.currentTarget.open && (state.sidePanel === "memory" || state.sidePanel === "context")) state.setSidePanel(null);
  }}><summary>참고 자료 <span className="chat-summary-note">{state.selectedMemoryNotes.length ? `메모리 ${state.selectedMemoryNotes.length}개` : "필요할 때 추가"}</span></summary>
    <div className="chat-fields">
      <details className="chat-fold" open={state.sidePanel === "memory" || undefined}><summary>공유 메모리</summary><div className="chat-fields">
        {!state.memoryNotes.length && <p className="chat-muted">{state.loadingMemoryNotes ? "메모리를 읽고 있습니다." : "저장된 메모리가 없습니다."}</p>}
        <div className="chat-memory-list">{state.memoryNotes.map(note => <div className="chat-row" key={note.name}>
          <label className="chat-check"><input type="checkbox" checked={state.selectedMemoryNotes.includes(note.name)} onChange={() => state.toggleMemoryNote(note.name)} />{note.name}</label>
          <div className="chat-actions"><button className="chat-button chat-quiet" disabled={!canRequest} onClick={() => state.readMemoryNote(note.name)}>내용 보기</button><button className="chat-button chat-quiet" disabled={busy} onClick={() => state.renameMemoryNote(note.name)}>이름 변경</button></div>
        </div>)}</div>
        {state.memoryPreview && <section aria-label="메모리 내용" className="chat-fields"><h3>{state.memoryPreview.name}</h3><pre className="chat-output">{state.memoryPreview.content}</pre><div><button className="chat-button" onClick={() => useAskStore.setState({ memoryPreview: null })}>내용 닫기</button></div></section>}
        <div className="chat-actions"><button className="chat-button" disabled={!canRequest || state.loadingMemoryNotes} onClick={state.loadMemoryNotes}>메모리 새로고침</button><button className="chat-button" disabled={busy || !state.activeConversationId} onClick={() => state.createActiveConversationMemoryNote(false)}>현재 대화를 메모리로 저장</button></div>
        <details className="chat-fold"><summary>메모리 관리</summary><div className="chat-actions">
          <button className="chat-button" disabled={busy || !state.activeConversationId} onClick={() => state.createActiveConversationMemoryNote(true)}>대화를 요약해 저장</button>
          <button className="chat-button chat-error" disabled={busy || !state.selectedMemoryNotes.length} onClick={state.deleteSelectedMemoryNotes}>선택한 메모리 삭제</button>
          <button className="chat-button chat-error" disabled={busy} onClick={state.clearScopeMemory}>대화 메모리 초기화</button>
        </div></details>
      </div></details>
      <ChatReferencePicker canRequest={canRequest} />
      <details className="chat-fold"><summary>검색할 자료 확인</summary><div className="chat-fields">
        <div><button className="chat-button" disabled={!canRequest || state.ragPending || !state.input.trim()} onClick={state.runRagPreflight}>{state.ragPending ? "확인 중" : "질문에 맞는 자료 찾기"}</button></div>
        {state.ragPreflight?.candidates.map((candidate, index) => <div className="chat-row" key={index}><p>{candidate.reason || candidate.kind}</p><button className="chat-button" disabled={!canRequest || state.ragExecution?.loading || candidate.kind === "none" || !candidate.suggestedRequestType || (candidate.suggestedRequestType === "session_replay_get" && !state.activeConversationId)} onClick={() => state.runRagCandidate(candidate)}>조회</button></div>)}
        {state.ragExecution?.loading && <p role="status">자료를 읽고 있습니다.</p>}
        {state.ragExecution?.error && <p role="alert" className="chat-error">{state.ragExecution.error}</p>}
        {state.ragExecution?.items.map((item, index) => <div className="chat-row" key={index}><div><strong>{item.title}</strong><p>{item.detail}</p></div>{item.path && <button className="chat-button" disabled={!canRequest || state.ragMemoryPreview?.loading} onClick={() => state.openRagMemoryItem(item)}>원문</button>}</div>)}
        {state.ragMemoryPreview && <pre className="chat-output">{state.ragMemoryPreview.loading ? "읽고 있습니다." : state.ragMemoryPreview.error || state.ragMemoryPreview.text}</pre>}
        {state.ragPreflight && <div><button className="chat-button" onClick={state.clearRagPreflight}>검색 결과 지우기</button></div>}
      </div></details>
      <details className="chat-fold"><summary>첨부 이미지 확인</summary><div className="chat-fields">
        <input type="file" className="chat-file-input" ref={images} multiple accept="image/*" aria-label="확인할 이미지" onChange={async event => {
          const reading = filesToVisionAttachments(event.currentTarget.files); event.currentTarget.value = "";
          try { const attachments = await reading; useAskStore.setState({ visionFiles: attachments, visionPreflight: null }); }
          catch { useAskStore.setState({ lastError: "이미지를 읽지 못했습니다." }); }
        }} />
        <div className="chat-actions"><button className="chat-button" onClick={() => images.current?.click()}>이미지 선택</button><button className="chat-button" disabled={!canRequest || !state.visionFiles.length || state.visionPending} onClick={state.runVisionPreflight}>{state.visionPending ? "확인 중" : "형식과 모델 지원 확인"}</button></div>
        {state.visionFiles.map((file, index) => <p className="chat-muted" key={index}>{file.name}</p>)}
        {state.visionPreflight && <><ul className="chat-sources">{state.visionPreflight.images.map((image, index) => <li key={index}>{image.name} · {image.message || (image.supported ? "지원하는 형식" : "지원하지 않는 형식")}</li>)}</ul>
          {state.visionPreflight.warnings.map((warning, index) => <p className="chat-error" key={index}>{warning}</p>)}
          <details className="chat-fold"><summary>이미지 확인 상세</summary><ul className="chat-sources">{state.visionPreflight.checks.map((check, i) => <li key={i}>{check.name} · {check.message}</li>)}{state.visionPreflight.providerCandidates.map((provider, i) => <li key={`provider-${i}`}>{provider.provider} · {provider.model} · {provider.message}</li>)}</ul></details>
        </>}
        {!!state.visionFiles.length && <div><button className="chat-button" onClick={state.clearVisionPreflight}>점검 이미지 지우기</button></div>}
      </div></details>
      {!!state.conversationContext.compressionEvents.length && <details className="chat-fold"><summary>이전 대화의 요약</summary>{state.conversationContext.compressionEvents.map((entry, index) => <p key={index} className="chat-plain">{entry.preview}</p>)}</details>}
      <details className="chat-fold"><summary>작성한 질문으로 작업 시작</summary><div className="chat-actions"><button className="chat-button" disabled={!state.input.trim()} onClick={state.createPlanFromInput}>작업으로 가져가기</button><button className="chat-button" disabled={!state.input.trim()} onClick={state.saveInputAsRoutine}>자동화로 가져가기</button></div></details>
    </div>
  </details>;
}

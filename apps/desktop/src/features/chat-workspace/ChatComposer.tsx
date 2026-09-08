import { useRef, useState } from "react";
import { Paperclip, Mic, MicOff, ArrowUp } from "lucide-react";
import { useAskStore } from "../ask/ask-store";
import { filesToAttachments, hasDraggedFiles } from "../ask/AskAttachments";
import { useVoiceInput } from "../ask/AskSpeech";
import { shortcutMatches, useDesktopPreferenceStore } from "../shell/preference-store";
import { ChatOptions } from "./ChatOptions";
import { ChatResources } from "./ChatResources";

export function ChatComposer({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const voice = useVoiceInput();
  const shortcuts = useDesktopPreferenceStore(s => s.shortcuts);
  const canSend = canRequest && !state.pending && !state.readingFiles && (!!state.input.trim() || !!state.attachments.length);
  const attach = async (files: FileList | File[] | null) => {
    const current = useAskStore.getState();
    if (current.readingFiles || !files?.length) return;
    useAskStore.setState({ readingFiles: true });
    try {
      const result = await filesToAttachments(files, current.attachments.length);
      useAskStore.getState().addAttachments(result.items);
      if (result.error) useAskStore.setState({ lastError: result.error });
    } catch (error) { useAskStore.setState({ lastError: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }); }
    finally { useAskStore.setState({ readingFiles: false }); }
  };
  const send = () => { if (canSend) { voice.stop(); state.sendMessage(); } };
  return <section className="chat-compose" aria-label="질문 작성" data-dragging={dragging || undefined}
    onDragOver={event => { if (hasDraggedFiles(event.dataTransfer)) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { if (hasDraggedFiles(event.dataTransfer)) { event.preventDefault(); setDragging(false); void attach(event.dataTransfer.files); } }}>
    <form onSubmit={event => { event.preventDefault(); send(); }}>
      <label htmlFor="chat-request">{state.messages.length ? "이어서 질문하기" : "무엇이 궁금하신가요?"}</label>
      <textarea id="chat-request" rows={4} value={state.input} placeholder="질문을 적어 주세요. 파일을 첨부하거나 여기에 놓을 수도 있습니다."
        onChange={event => state.setInput(event.target.value)}
        onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); void attach(event.clipboardData.files); } }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if ((event.key === "Enter" && !event.shiftKey) || shortcutMatches(event.nativeEvent, shortcuts.send)) { event.preventDefault(); send(); }
        }} />
      <input className="chat-file-input" ref={input} type="file" multiple aria-label="질문 첨부 파일" onChange={event => { void attach(event.currentTarget.files); event.currentTarget.value = ""; }} />
      {(state.attachmentPanelOpen || state.attachments.length > 0) && <div className="chat-files" aria-label="첨부한 파일">
        {state.attachments.map((file, index) => <div className="chat-row" key={`${file.name}-${index}`}><span>{file.name} <small>({Math.ceil(file.sizeBytes / 1024)} KB)</small></span><button type="button" className="chat-button chat-quiet" aria-label={`${file.name} 첨부 제거`} onClick={() => useAskStore.setState(s => ({ attachments: s.attachments.filter((_, i) => i !== index) }))}>제거</button></div>)}
        {!state.attachments.length && <button type="button" className="chat-button" onClick={() => input.current?.click()}>파일 선택</button>}
      </div>}
      {voice.error && <p role="alert" className="chat-error">{voice.error}</p>}
      {state.readingFiles && <p role="status" className="chat-muted">파일을 읽고 있습니다.</p>}
      {dragging && <p role="status">여기에 파일을 놓으세요.</p>}
      <div className="chat-compose-actions"><div className="chat-actions">
        <button type="button" className="chat-button chat-quiet" disabled={state.readingFiles} onClick={() => input.current?.click()}><Paperclip size={15} aria-hidden="true" />파일 첨부</button>
        {voice.supported && <button type="button" className="chat-button chat-quiet" aria-label="음성 입력" aria-pressed={voice.active} onClick={() => voice.toggle(state.input)}>{voice.active ? <MicOff size={15} /> : <Mic size={15} />}</button>}
      </div><button className="chat-button" data-primary type="submit" aria-label="질문 보내기" disabled={!canSend}><ArrowUp size={16} aria-hidden="true" />{state.pending ? "응답 중" : "보내기"}</button></div>
    </form>
    <ChatOptions canRequest={canRequest} />
    <ChatResources canRequest={canRequest} />
  </section>;
}

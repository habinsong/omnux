import { useEffect, useRef, useState } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useAskStore } from "../ask/ask-store";
import { normalizeConversation } from "../ask/ask-normalization";
import { useAskNotebookSave } from "../ask/ask-notebook-save";
import { isSpeechSupported, useSpeechStore } from "../ask/ask-speech";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { ChatTranscript } from "./ChatTranscript";
import "./chat-workspace.css";

export function ChatWorkspacePage() {
  const state = useAskStore();
  const notebook = useAskNotebookSave();
  const connected = useDesktopShellStore(s => s.bridge.status) === "connected";
  const authenticated = useDesktopAuthStore(s => s.auth.status) === "authenticated";
  const canRequest = connected && authenticated;
  const route = useDesktopNavigationStore(s => s.routePayload);
  const version = useDesktopNavigationStore(s => s.routeVersion);
  const [incoming, setIncoming] = useState<Record<string, unknown> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastSpoken = useRef("");
  const autoSpeak = useSpeechStore(s => s.autoSpeak);
  const focus = () => document.getElementById("chat-request")?.focus();

  useEffect(() => {
    if (canRequest) { state.loadConversations(); state.loadMemoryNotes(); state.loadModelCatalogs(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const applyIncoming = (payload: Record<string, unknown>) => {
    const current = useAskStore.getState();
    if (typeof payload.conversationId === "string") current.openConversation(normalizeConversation({ id: payload.conversationId, scope: "chat" }));
    const mode = payload.mode === "compare" ? "multi" : payload.mode;
    if (mode === "single" || mode === "multi" || mode === "orchestration") {
      if (mode !== current.chatMode) current.setChatMode(mode);
    }
    if (typeof payload.input === "string") current.setInput(payload.input);
    if (payload.projectName || payload.projectKey) current.patchMetaDraft({ project: String(payload.projectName || payload.projectKey) });
    if (payload.openAttachmentPanel || payload.mode === "file") current.setAttachmentPanelOpen(true);
    setIncoming(null);
    window.requestAnimationFrame(focus);
  };
  useEffect(() => {
    if (!route) return;
    if (useAskStore.getState().input.trim() || useAskStore.getState().pending) setIncoming(route);
    else applyIncoming(route);
    useDesktopNavigationStore.getState().clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const newConversation = async () => {
    if (state.pending || state.readingFiles) return;
    if ((state.input.trim() || state.attachments.length) && !await requestConfirmDialog({ title: "새 대화 시작", message: "작성 중인 질문과 첨부를 비우고 새 대화를 시작할까요?", confirmLabel: "새 대화" })) return;
    state.createConversation();
  };
  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "focusComposer") focus();
      if (action === "newConversation" && canRequest) void newConversation();
      if (action === "searchConversations") { setHistoryOpen(true); window.requestAnimationFrame(() => document.getElementById("chat-search")?.focus()); }
    };
    window.addEventListener("omnux:shortcut", handler);
    return () => window.removeEventListener("omnux:shortcut", handler);
  });
  useEffect(() => {
    const candidate = state.autoSpeakCandidate;
    if (!candidate || candidate.key === lastSpoken.current) return;
    lastSpoken.current = candidate.key;
    if (autoSpeak && isSpeechSupported()) useSpeechStore.getState().speak(candidate.key, candidate.text);
  }, [autoSpeak, state.autoSpeakCandidate]);
  useEffect(() => () => useSpeechStore.getState().stop(), []);

  return <div className="chat-workspace" data-surface="chat">
    <header className="chat-heading"><div><h1>질문</h1><p>궁금한 내용을 묻고, 답변을 다음 작업으로 이어 가세요.</p></div>
      <button className="chat-button" disabled={!canRequest || state.pending || state.readingFiles} onClick={() => void newConversation()}>새 대화</button>
    </header>
    {!canRequest && <p className="chat-notice" role="status">서버에 연결하면 질문을 보낼 수 있습니다. 작성한 내용은 유지됩니다.</p>}
    {notebook.notice && <div className={`chat-notice${notebook.failed ? " chat-error" : ""}`} role={notebook.failed ? "alert" : "status"}><p>{notebook.notice}</p>{!notebook.requestId && <button className="chat-button chat-quiet" onClick={() => useAskNotebookSave.setState({ notice: "" })}>닫기</button>}</div>}
    {state.lastError && <div className="chat-notice chat-error" role="alert"><p>{state.lastError}</p><button className="chat-button chat-quiet" onClick={() => useAskStore.setState({ lastError: null })}>닫기</button></div>}
    {state.lastError && state.failedSubmission && !state.pending && <button className="chat-button" disabled={!!state.input.trim() || !!state.attachments.length} onClick={() => {
      const failed = state.failedSubmission;
      if (failed) useAskStore.setState({ input: failed.text, attachments: failed.attachments, failedSubmission: null });
      focus();
    }}>질문 다시 쓰기</button>}
    {incoming && <div className="chat-notice"><p>다른 화면에서 전달받은 요청이 있습니다.</p><div className="chat-actions"><button className="chat-button" disabled={state.pending || !!state.input.trim() || !!state.attachments.length} onClick={() => applyIncoming(incoming)}>입력에 가져오기</button><button className="chat-button chat-quiet" onClick={() => setIncoming(null)}>닫기</button></div></div>}
    {(state.messages.length > 0 || state.pending) && <ChatTranscript canRequest={canRequest} />}
    <ChatComposer canRequest={canRequest} />
    <ChatHistory canRequest={canRequest} open={historyOpen || state.sidePanel === "info"} onToggle={setHistoryOpen} />
  </div>;
}

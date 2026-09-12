import { useEffect, useRef, useState } from "react";
import { History, MessageSquare, Paperclip, SlidersHorizontal } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useAskStore } from "../ask/ask-store";
import { normalizeConversation } from "../ask/ask-normalization";
import { useAskNotebookSave } from "../ask/ask-notebook-save";
import { isSpeechSupported, useSpeechStore } from "../ask/ask-speech";
import { useDesktopNavigationStore, workModeFromRoute } from "../shell/navigation-store";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { ChatOptions } from "./ChatOptions";
import { ChatResources } from "./ChatResources";
import { ChatTranscript } from "./ChatTranscript";
import { useHomeRecentStore } from "../home/home-recent-store";
import "./chat-workspace.css";

/* ============================================================================
   질문 화면.
   대화 / 모델 / 참고 자료 / 기록 을 캡슐 탭으로 가른다.
   대화 탭에서는 주고받은 말이 남은 높이를 차지하고 작성칸은 아래에 붙는다.
   ============================================================================ */

type TabId = "chat" | "models" | "resources" | "history";

export function ChatWorkspacePage() {
  const state = useAskStore();
  const notebook = useAskNotebookSave();
  const connected = useDesktopShellStore((s) => s.bridge.status) === "connected";
  const authenticated = useDesktopAuthStore((s) => s.auth.status) === "authenticated";
  const canRequest = connected && authenticated;
  const route = useDesktopNavigationStore((s) => s.routePayload);
  const version = useDesktopNavigationStore((s) => s.routeVersion);
  const [incoming, setIncoming] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<TabId>("chat");
  const lastSpoken = useRef("");
  const attachRule = useRef(false);
  const autoSpeak = useSpeechStore((s) => s.autoSpeak);
  const focus = () => document.getElementById("chat-request")?.focus();

  useEffect(() => {
    if (canRequest) {
      state.loadConversations();
      state.loadMemoryNotes();
      state.loadModelCatalogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const applyIncoming = (payload: Record<string, unknown>) => {
    const current = useAskStore.getState();
    const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const mode = workModeFromRoute(typeof payload.mode === "string" ? payload.mode : undefined);
    if (conversationId) {
      current.openConversation(normalizeConversation({ id: conversationId, scope: "chat", mode: mode || current.chatMode }));
    } else if (mode && mode !== current.chatMode) {
      current.setChatMode(mode);
    }
    if (typeof payload.input === "string") current.setInput(payload.input);
    if (payload.projectName || payload.projectKey) {
      current.patchMetaDraft({ project: String(payload.projectName || payload.projectKey) });
      attachRule.current = true;
    }
    if (payload.openAttachmentPanel || payload.mode === "file") current.setAttachmentPanelOpen(true);
    setIncoming(null);
    setTab("chat");
    window.requestAnimationFrame(focus);
  };

  useEffect(() => {
    if (!route) return;
    if (useAskStore.getState().input.trim() || useAskStore.getState().pending) setIncoming(route);
    else applyIncoming(route);
    useDesktopNavigationStore.getState().clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // 다른 화면이 "여기 열어라" 라고 알려 주면 그 탭으로 옮긴다.
  useEffect(() => {
    if (state.sidePanel === "models") setTab("models");
    else if (state.sidePanel === "memory" || state.sidePanel === "context") setTab("resources");
    else if (state.sidePanel === "info") setTab("history");
  }, [state.sidePanel]);

  useEffect(() => {
    if (!attachRule.current) return;
    const rule = state.memoryNotes.find((note) => note.name === "작업 규칙.md");
    if (!rule) return;
    if (!state.selectedMemoryNotes.includes(rule.name)) state.toggleMemoryNote(rule.name);
    attachRule.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.memoryNotes, state.selectedMemoryNotes]);

  const newConversation = async () => {
    if (state.pending || state.readingFiles) return;
    if (
      (state.input.trim() || state.attachments.length) &&
      !(await requestConfirmDialog({ title: "새 대화 시작", message: "작성 중인 질문과 첨부를 비우고 새 대화를 시작할까요?", confirmLabel: "새 대화" }))
    )
      return;
    state.createConversation();
    setTab("chat");
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "focusComposer") {
        setTab("chat");
        focus();
      }
      if (action === "newConversation" && canRequest) void newConversation();
      if (action === "searchConversations") {
        setTab("history");
        window.requestAnimationFrame(() => document.getElementById("chat-search")?.focus());
      }
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

  const tabs: ScreenTab[] = [
    { id: "chat", label: "대화", icon: MessageSquare, badge: state.messages.length > 0 ? String(state.messages.length) : undefined },
    { id: "models", label: "모델", icon: SlidersHorizontal },
    { id: "resources", label: "참고 자료", icon: Paperclip, badge: state.selectedMemoryNotes.length > 0 ? String(state.selectedMemoryNotes.length) : undefined },
    { id: "history", label: "기록", icon: History }
  ];

  const notice = incoming ? (
    <ScreenNotice tone="info">다른 화면에서 전달받은 요청이 있습니다. 「가져오기」를 누르면 작성칸에 넣습니다.</ScreenNotice>
  ) : state.lastError ? (
    <ScreenNotice tone="danger">{state.lastError}</ScreenNotice>
  ) : !canRequest ? (
    <ScreenNotice tone="warning">서버에 연결하면 질문을 보낼 수 있습니다. 작성한 내용은 그대로 둡니다.</ScreenNotice>
  ) : notebook.notice ? (
    <ScreenNotice tone={notebook.failed ? "danger" : "info"}>{notebook.notice}</ScreenNotice>
  ) : null;

  return (
    <Screen
      surface="chat"
      title="질문"
      hint=""
      actions={
        <>
          {incoming ? (
            <Button
              variant="outline"
              size="sm"
              disabled={state.pending || !!state.input.trim() || !!state.attachments.length}
              onClick={() => applyIncoming(incoming)}
            >
              가져오기
            </Button>
          ) : null}
          {state.lastError && state.failedSubmission && !state.pending ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!!state.input.trim() || !!state.attachments.length}
              onClick={() => {
                const failed = state.failedSubmission;
                if (failed) useAskStore.setState({ input: failed.text, attachments: failed.attachments, failedSubmission: null, lastError: null });
                setTab("chat");
                focus();
              }}
            >
              질문 다시 쓰기
            </Button>
          ) : null}
          <Button variant="primary" size="sm" disabled={!canRequest || state.pending || state.readingFiles} onClick={() => void newConversation()}>
            새 대화
          </Button>
        </>
      }
      notice={notice}
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="질문 보기 종류" />

      <div className="chat-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {tab === "chat" ? (
          // 대화가 있으면 안쪽 대화 칸이 스크롤한다. 여기서 또 스크롤하면 스크롤 칸이 둘이 된다.
          <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden ${state.messages.length > 0 || state.pending ? "overflow-hidden" : "overflow-y-auto"}`}>
            {state.messages.length > 0 || state.pending ? (
              <ChatTranscript canRequest={canRequest} />
            ) : (
              <AskEmptyContinue />
            )}
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
            <div className="min-h-0 h-full overflow-y-auto overflow-x-hidden">
              <div className="min-w-0 p-3">
                {tab === "models" ? (
                  <ChatOptions canRequest={canRequest} />
                ) : tab === "resources" ? (
                  <ChatResources canRequest={canRequest} />
                ) : (
                  <ChatHistory canRequest={canRequest} />
                )}
              </div>
            </div>
          </div>
        )}
        <div className="min-w-0 shrink-0">
          <ChatComposer canRequest={canRequest} />
        </div>
      </div>
    </Screen>
  );
}

function AskEmptyContinue() {
  const recent = useHomeRecentStore((state) => state.items);
  const items = recent.filter((item) => item.kind === "ask").slice(0, 3);
  const open = useAskStore((state) => state.openConversation);
  if (items.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">아직 주고받은 말이 없습니다.</p>;
  }
  return (
    <div className="min-w-0 space-y-2 px-3 py-4">
      <p className="text-center text-xs text-muted-foreground">아직 이 칸은 비어 있습니다. 아래에서 이어서 열 수 있습니다.</p>
      <ul className="mx-auto flex max-w-md min-w-0 flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent"
              onClick={() => open(normalizeConversation({ id: item.id, scope: "chat", mode: item.mode, title: item.title }))}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
              {item.preview ? <span className="hidden min-w-0 max-w-[40%] truncate text-muted-foreground sm:inline">{item.preview}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

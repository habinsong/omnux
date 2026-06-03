import { useEffect, useMemo } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useAskPageBridge, useAskStore } from "./ask-store";
import { renderMarkdownToSafeHtml } from "./markdown";

function MessageBubble({ role, text }: { role: string; text: string }) {
  const html = useMemo(() => (role === "user" ? "" : renderMarkdownToSafeHtml(text)), [role, text]);
  if (role === "user") {
    return <div className="bubble-user">{text}</div>;
  }
  return <div className="bubble-ai markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function formatTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function AskPage() {
  useAskPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useAskStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const displayedConversations = store.searchQuery
    ? store.searchResults.map((item) => ({
        id: item.conversationId,
        title: item.title,
        preview: item.snippet,
        updatedUtc: "",
        messageCount: 0,
        project: "",
        category: ""
      })).filter((item) => item.id)
    : store.conversations;

  useEffect(() => {
    if (canRequest) {
      store.loadConversations();
      store.loadMemoryNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <section className="grid">
      <CardBoundary title="대화 목록" card="navigation" onError={recordCardError}>
        {store.lastError ? <div className="section-error">{store.lastError}</div> : null}
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.createConversation} disabled={!canRequest}>
            새 대화
          </button>
          <button className="secondary-button" type="button" onClick={store.loadConversations} disabled={!canRequest}>
            새로고침
          </button>
        </div>
        <input
          className="otp-input"
          style={{ width: "100%", marginTop: 12 }}
          value={store.searchQuery}
          placeholder="대화 검색 후 Enter"
          onChange={(event) => useAskStore.setState({ searchQuery: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) {
                store.searchConversations(store.searchQuery);
              }
            }
          }}
        />
        <div className="log-toolbar" style={{ marginTop: 12 }}>
          <button className="secondary-button" type="button" onClick={() => store.searchConversations(store.searchQuery)} disabled={!canRequest}>
            검색
          </button>
          <button className="secondary-button" type="button" onClick={store.clearSearch}>
            검색 해제
          </button>
        </div>
        <div className="event-log" style={{ marginTop: 12 }}>
          {displayedConversations.map((item) => (
            <article key={item.id} className={item.id === store.activeConversationId ? "row active" : "row"}>
              <button className="row-main" type="button" onClick={() => store.openConversation(item)} disabled={!canRequest}>
                <span className="row-title">{item.title}</span>
                <span className="row-meta">{item.preview || `${item.messageCount}개 메시지`}</span>
                <span className="row-meta">{formatTime(item.updatedUtc) || item.category || "대화"}</span>
              </button>
              <div className="row-actions">
                <button className="inline-button" type="button" onClick={() => store.renameConversation(item)} disabled={!canRequest}>
                  이름
                </button>
                <button className="inline-button" type="button" onClick={() => store.saveConversationToMemory(item)} disabled={!canRequest}>
                  메모리
                </button>
                <button className="inline-danger-button" type="button" onClick={() => store.deleteConversation(item)} disabled={!canRequest}>
                  삭제
                </button>
              </div>
            </article>
          ))}
          {displayedConversations.length === 0 ? <div className="empty">대화 없음</div> : null}
        </div>
        <dl className="status-list compact-list">
          <div><dt>memory</dt><dd>{store.loadingMemoryNotes ? "조회 중" : `${store.memoryNotes.length}건`}</dd></div>
        </dl>
        <div className="event-log">
          {store.memoryNotes.slice(0, 4).map((note) => (
            <article key={note.name} className="desktop-tab">
              <span>{note.name}</span>
              <small>{note.excerpt || "메모리 노트"}</small>
            </article>
          ))}
        </div>
      </CardBoundary>
      <CardBoundary title="대화 본문" card="operations" onError={recordCardError}>
        <div className="status-list">
          <div>
            <dt>session</dt>
            <dd>{store.activeConversationId || "-"}</dd>
          </div>
          <div>
            <dt>pending</dt>
            <dd>{store.pending ? "yes" : "no"}</dd>
          </div>
        </div>
        <div className="event-log" style={{ maxHeight: 360, overflow: "auto" }}>
          {store.messages.map((message, index) => (
            <MessageBubble key={`${index}-${message.role}`} role={message.role} text={message.text} />
          ))}
        </div>
        <textarea
          className="field"
          style={{ width: "100%", minHeight: 110, marginTop: 12 }}
          value={store.input}
          placeholder="메시지를 입력하고 Enter"
          onChange={(event) => useAskStore.setState({ input: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canRequest) {
                store.sendMessage();
              }
            }
          }}
        />
        <div className="log-toolbar" style={{ marginTop: 12 }}>
          <button className="secondary-button" type="button" onClick={store.sendMessage} disabled={!store.input.trim() || !canRequest}>
            전송
          </button>
          <button className="secondary-button" type="button" onClick={() => store.setInput("")}>
            비우기
          </button>
        </div>
      </CardBoundary>
    </section>
  );
}

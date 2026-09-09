import { useAskStore } from "../ask/ask-store";
import { normalizeConversation } from "../ask/ask-normalization";

export function ChatHistory({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const items = state.searchQuery ? state.searchResults.map(item => normalizeConversation({ ...item, id: item.conversationId, preview: item.snippet })) : state.conversations;
  const disabled = !canRequest || state.pending;
  return <div className="chat-fields chat-history">
      <form className="chat-search" onSubmit={event => { event.preventDefault(); state.searchConversations(state.searchInput); }}>
        <label htmlFor="chat-search">대화 검색<input id="chat-search" type="search" value={state.searchInput} onChange={event => state.setSearchInput(event.target.value)} placeholder="제목이나 대화 내용" /></label>
        <button className="chat-button" disabled={!canRequest || state.searching || !state.searchInput.trim()}>검색</button>
        {state.searchQuery && <button type="button" className="chat-button" onClick={state.clearSearch}>전체 기록</button>}
      </form>
      {(state.loadingConversations || state.searching) && <p role="status" className="chat-muted">대화 기록을 읽고 있습니다.</p>}
      {!items.length && !state.loadingConversations && !state.searching && <p className="chat-muted">{state.searchQuery ? "검색 결과가 없습니다." : "아직 저장된 대화가 없습니다."}</p>}
      <div className="chat-history-list">
        {items.map(item => <div className="chat-row" key={item.id}>
          {state.conversationSelectionMode && <input type="checkbox" aria-label={`${item.title} 선택`} checked={state.selectedConversationIds.includes(item.id)} disabled={disabled || !!state.historyRequests[`delete-${item.id}`]} onChange={() => state.toggleConversationSelection(item.id)} />}
          <button className="chat-history-item" aria-current={state.activeConversationId === item.id ? "true" : undefined} disabled={disabled} onClick={() => state.openConversation(item)}><strong>{item.title}</strong><span>{item.preview || `${item.messageCount}개 메시지`}</span><small>{item.project}{item.updatedUtc ? ` · ${new Date(item.updatedUtc).toLocaleDateString("ko-KR")}` : ""}</small></button>
          <details className="chat-item-menu"><summary aria-label={`${item.title} 관리`}>관리</summary><div className="chat-actions">
            <button className="chat-button" disabled={disabled} onClick={() => state.renameConversation(item)}>이름 변경</button>
            <button className="chat-button" disabled={disabled} onClick={() => state.saveConversationToMemory(item)}>메모리 저장</button>
            <button className="chat-button chat-error" disabled={disabled || !!state.historyRequests[`delete-${item.id}`]} onClick={() => state.deleteConversation(item)}>삭제</button>
          </div></details>
        </div>)}
      </div>
      <div className="chat-actions"><button className="chat-button" disabled={!canRequest || state.loadingConversations} onClick={state.loadConversations}>목록 새로고침</button>
        {!!items.length && <button className="chat-button" disabled={disabled} onClick={() => state.setConversationSelectionMode(!state.conversationSelectionMode)}>{state.conversationSelectionMode ? "선택 끝내기" : "여러 대화 선택"}</button>}
        {state.conversationSelectionMode && <button className="chat-button chat-error" disabled={disabled || !state.selectedConversationIds.length || Object.keys(state.historyRequests).some(key => key.startsWith("delete-"))} onClick={state.deleteSelectedConversations}>선택한 대화 삭제</button>}
      </div>
      <details className="chat-fold"><summary>대화 이름과 분류</summary><form className="chat-fields" onSubmit={event => { event.preventDefault(); state.saveConversationMeta(); }}>
        <div className="chat-columns">{([['title', '대화 이름'], ['project', '프로젝트 이름'], ['category', '분류'], ['tags', '태그']] as const).map(([key, label]) => <label key={key}>{label}<input value={state.metaDraft[key]} onChange={event => state.patchMetaDraft({ [key]: event.target.value })} /></label>)}</div>
        <div><button className="chat-button" disabled={disabled || !state.activeConversationId || !!state.historyRequests.meta}>{state.historyRequests.meta ? "저장 중" : "대화 정보 저장"}</button></div>
      </form></details>
  </div>;
}

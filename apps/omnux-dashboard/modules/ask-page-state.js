/* omnux — ask page state */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const D = window.OMNUX_DATA;

  function normalizeConversationMessage(message) {
    return {
      role: message && message.role === "user" ? "user" : "ai",
      text: String(message && message.text ? message.text : ""),
    };
  }

  function useAskPageState(ctx, payload) {
    const compareMode = !!(payload && payload.mode === "compare");
    const [msgs, setMsgs] = useState([]);
    const [val, setVal] = useState("");
    const [model, setModel] = useState(D.providers[0]);
    const [showModels, setShowModels] = useState(false);
    const [pending, setPending] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const scrollRef = useRef(null);
    const sendMessage = ctx.send;
    const toast = typeof ctx.toast === "function" ? ctx.toast : () => {};
    const setActiveConversationId = ctx.setActiveConversationId;
    const activeConversationId = ctx.activeConversationId || null;
    const conversations = Array.isArray(ctx.conversations) ? ctx.conversations : [];
    const memoryNotes = Array.isArray(ctx.memoryNotes) ? ctx.memoryNotes : [];
    const authenticated = !!ctx.runtime?.authenticated;

    const openConversation = useCallback((item) => {
      if (!item || !item.id) return;
      setActiveConversationId(item.id);
      setMsgs([{ role: "ai", text: item.preview || `${item.title || "선택한 대화"}를 불러오는 중입니다.` }]);
      sendMessage({ type: "get_conversation", conversationId: item.id }, { queueIfClosed: true });
    }, [sendMessage, setActiveConversationId]);

    const newConversation = useCallback(() => {
      const sent = sendMessage({ type: "create_conversation", scope: "chat", mode: "single" }, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
        return;
      }
      setMsgs([]);
    }, [sendMessage, toast]);

    const deleteConversation = useCallback((item) => {
      const id = item && item.id ? String(item.id) : "";
      if (!id) return;
      if (typeof window.confirm === "function" && !window.confirm(`대화 "${item.title || id}"를 삭제할까요?`)) return;
      const sent = sendMessage({ type: "delete_conversation", conversationId: id, scope: "chat", mode: "single" }, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
        return;
      }
      if (id === activeConversationId) {
        setActiveConversationId(null);
        setMsgs([]);
      }
    }, [sendMessage, toast, activeConversationId, setActiveConversationId]);

    const renameConversation = useCallback((item) => {
      const id = item && item.id ? String(item.id) : "";
      if (!id) return;
      const input = typeof window.prompt === "function"
        ? window.prompt("새 대화 제목을 입력하세요.", item.title || "")
        : null;
      const title = String(input || "").trim();
      if (!title || title === (item.title || "")) return;
      const sent = sendMessage({ type: "update_conversation_meta", conversationId: id, conversationTitle: title }, { queueIfClosed: true });
      if (!sent) toast("미들웨어 연결이 필요합니다.");
    }, [sendMessage, toast]);

    const saveConversationToMemory = useCallback((item) => {
      const id = item && item.id ? String(item.id) : "";
      if (!id) return;
      const sent = sendMessage({ type: "create_memory_note", conversationId: id, compactConversation: false }, { queueIfClosed: true });
      if (!sent) toast("미들웨어 연결이 필요합니다.");
    }, [sendMessage, toast]);

    const searchConversations = useCallback((query) => {
      const trimmed = String(query || "").trim();
      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const sent = sendMessage({ type: "conversation_search", query: trimmed, maxResults: 20 }, { queueIfClosed: true });
      if (!sent) {
        setSearching(false);
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const clearSearch = useCallback(() => {
      setSearchQuery("");
      setSearchResults([]);
      setSearching(false);
    }, []);

    const send = useCallback((text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        type: "llm_chat_single",
        text: trimmed,
        scope: "chat",
        mode: "single",
        conversationId: ctx.activeConversationId || undefined,
        provider: model.id === "groq" ? "groq" : "auto",
        requestId,
      };
      setMsgs((prev) => [...prev, { role: "user", text: trimmed }]);
      setVal("");
      setPending(true);
      if (!sendMessage(payload, { queueIfClosed: true })) {
        setPending(false);
        setMsgs((prev) => [...prev, { role: "ai", text: "미들웨어 연결이 필요합니다. 서버 실행 후 다시 시도하세요." }]);
      }
    }, [ctx.activeConversationId, model, sendMessage]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === "conversation_detail" && msg.conversation && Array.isArray(msg.conversation.messages)) {
          setMsgs(msg.conversation.messages.map(normalizeConversationMessage));
          setActiveConversationId(msg.conversation.id);
          setPending(false);
        }
        if (msg.type === "llm_chat_result" && msg.conversation && Array.isArray(msg.conversation.messages)) {
          setMsgs(msg.conversation.messages.map(normalizeConversationMessage));
          setActiveConversationId(msg.conversationId || msg.conversation.id || null);
          setPending(false);
        }
        if (msg.type === "conversation_created" && msg.conversation && msg.conversation.id) {
          setActiveConversationId(msg.conversation.id);
          setMsgs(Array.isArray(msg.conversation.messages) ? msg.conversation.messages.map(normalizeConversationMessage) : []);
          setPending(false);
          toast("새 대화를 만들었습니다.");
        }
        if (msg.type === "conversation_deleted") {
          toast(msg.ok ? "대화를 삭제했습니다." : "대화 삭제에 실패했습니다.");
        }
        if (msg.type === "conversation_search_result") {
          setSearching(false);
          setSearchResults(Array.isArray(msg.results) ? msg.results : []);
          if (msg.disabled) toast("대화 검색 인덱스가 비활성화되어 있습니다.");
        }
        if (msg.type === "memory_note_created") {
          toast(msg.ok ? (msg.message || "대화를 메모리로 저장했습니다.") : (msg.message || "메모리 저장에 실패했습니다."));
        }
        if (msg.type === "error") {
          setPending(false);
          setSearching(false);
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [setActiveConversationId, toast]);

    useEffect(() => {
      if (!authenticated) return;
      sendMessage({ type: "list_conversations", scope: "chat", mode: "single" }, { queueIfClosed: true, silent: true });
      sendMessage({ type: "list_memory_notes" }, { queueIfClosed: true, silent: true });
    }, [authenticated, sendMessage]);

    const payloadInput = payload && payload.input ? payload.input : "";
    useEffect(() => {
      if (payloadInput) send(payloadInput);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payloadInput]);

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [msgs, pending]);

    return {
      compareMode,
      msgs,
      val,
      setVal,
      model,
      setModel,
      showModels,
      setShowModels,
      pending,
      scrollRef,
      conversations,
      memoryNotes,
      openConversation,
      newConversation,
      deleteConversation,
      renameConversation,
      saveConversationToMemory,
      searchConversations,
      clearSearch,
      searchQuery,
      setSearchQuery,
      searchResults,
      searching,
      send,
      empty: msgs.length === 0 && !compareMode
    };
  }

  Object.assign(window, {
    normalizeConversationMessage,
    useAskPageState
  });
})();

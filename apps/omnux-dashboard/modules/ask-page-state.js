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
    const scrollRef = useRef(null);
    const sendMessage = ctx.send;
    const setActiveConversationId = ctx.setActiveConversationId;
    const conversations = Array.isArray(ctx.conversations) ? ctx.conversations : [];
    const memoryNotes = Array.isArray(ctx.memoryNotes) ? ctx.memoryNotes : [];

    const openConversation = useCallback((item) => {
      if (!item || !item.id) return;
      setActiveConversationId(item.id);
      setMsgs([{ role: "ai", text: item.preview || `${item.title || "선택한 대화"}를 불러오는 중입니다.` }]);
      sendMessage({ type: "get_conversation", conversationId: item.id }, { queueIfClosed: true });
    }, [sendMessage, setActiveConversationId]);

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
        if (msg.type === "error") {
          setPending(false);
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [setActiveConversationId]);

    useEffect(() => {
      sendMessage({ type: "list_conversations", scope: "chat", mode: "single" }, { queueIfClosed: true, silent: true });
      sendMessage({ type: "list_memory_notes" }, { queueIfClosed: true, silent: true });
    }, [sendMessage]);

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
      send,
      empty: msgs.length === 0 && !compareMode
    };
  }

  Object.assign(window, {
    normalizeConversationMessage,
    useAskPageState
  });
})();

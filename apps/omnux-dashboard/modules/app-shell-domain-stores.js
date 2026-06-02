/* omnux - app shell domain stores */
(function () {
  const { useState, useEffect, useRef } = React;

  function useOmnuxRuntimeStore(adapter) {
    const runtimeAdapter = adapter || window.OMNUX_ADAPTER;
    const [runtime, setRuntime] = useState(() => runtimeAdapter ? runtimeAdapter.snapshot() : null);

    useEffect(() => {
      return window.wireOmnuxRuntimeSubscription(setRuntime, runtimeAdapter);
    }, [runtimeAdapter]);

    return runtime;
  }

  function useOmnuxRoutineStore() {
    const [routines, setRoutines] = useState([]);

    useEffect(() => window.wireOmnuxRoutineEvents(setRoutines), []);

    return routines;
  }

  function useOmnuxConversationStore() {
    const [conversations, setConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const activeConversationIdRef = useRef(activeConversationId);

    useEffect(() => {
      activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => window.wireOmnuxConversationEvents({
      onList: setConversations,
      onDetail: (conversation) => {
        setConversations((prev) => window.upsertConversationSummary(prev, conversation));
      },
      onDeleted: (detail) => {
        if (detail && detail.conversationId === activeConversationIdRef.current) {
          setActiveConversationId(null);
        }
      }
    }), []);

    return {
      conversations,
      activeConversationId,
      setActiveConversationId
    };
  }

  function useOmnuxMemoryStore() {
    const [memoryNotes, setMemoryNotes] = useState([]);

    useEffect(() => window.wireOmnuxMemoryEvents(setMemoryNotes), []);

    return memoryNotes;
  }

  Object.assign(window, {
    useOmnuxRuntimeStore,
    useOmnuxRoutineStore,
    useOmnuxConversationStore,
    useOmnuxMemoryStore
  });
})();

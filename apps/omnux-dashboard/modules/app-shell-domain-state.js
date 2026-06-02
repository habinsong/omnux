/* omnux — app shell domain data state */
(function () {
  function useOmnuxDomainState() {
    const runtime = window.useOmnuxRuntimeStore(window.OMNUX_ADAPTER);
    const routines = window.useOmnuxRoutineStore();
    const conversationState = window.useOmnuxConversationStore();
    const memoryNotes = window.useOmnuxMemoryStore();

    return {
      runtime,
      routines,
      conversations: conversationState.conversations,
      activeConversationId: conversationState.activeConversationId,
      setActiveConversationId: conversationState.setActiveConversationId,
      memoryNotes
    };
  }

  Object.assign(window, {
    useOmnuxDomainState
  });
})();

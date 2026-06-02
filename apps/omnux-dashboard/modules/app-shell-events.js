/* omnux — app shell event helpers */
(function () {
  function wireRuntimeSubscription(onRuntime, adapter) {
    if (!adapter || typeof adapter.subscribe !== "function") {
      return () => {};
    }

    return adapter.subscribe(onRuntime);
  }

  function wireRoutineEvents(onRoutines) {
    const handler = (event) => {
      if (Array.isArray(event.detail)) {
        onRoutines(event.detail);
      }
    };

    window.addEventListener("omnux:routines", handler);
    return () => window.removeEventListener("omnux:routines", handler);
  }

  function wireConversationEvents({ onList, onDetail, onDeleted }) {
    const handleList = (event) => {
      if (event.detail && Array.isArray(event.detail.items)) {
        onList(event.detail.items);
      }
    };
    const handleDetail = (event) => {
      const conversation = event.detail && event.detail.conversation;
      if (conversation && conversation.id) {
        onDetail(conversation);
      }
    };
    const handleDeleted = (event) => {
      onDeleted(event.detail || {});
    };

    window.addEventListener("omnux:conversations", handleList);
    window.addEventListener("omnux:conversation_detail", handleDetail);
    window.addEventListener("omnux:conversation_deleted", handleDeleted);

    return () => {
      window.removeEventListener("omnux:conversations", handleList);
      window.removeEventListener("omnux:conversation_detail", handleDetail);
      window.removeEventListener("omnux:conversation_deleted", handleDeleted);
    };
  }

  function wireMemoryEvents(onMemoryNotes) {
    const handler = (event) => {
      if (Array.isArray(event.detail)) {
        onMemoryNotes(event.detail);
      }
    };

    window.addEventListener("omnux:memory_notes", handler);
    return () => window.removeEventListener("omnux:memory_notes", handler);
  }

  function wireKeyboardShortcuts(onTogglePalette, onEscape) {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onTogglePalette();
      }
      if (event.key === "Escape") {
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }

  Object.assign(window, {
    wireOmnuxRuntimeSubscription: wireRuntimeSubscription,
    wireOmnuxRoutineEvents: wireRoutineEvents,
    wireOmnuxConversationEvents: wireConversationEvents,
    wireOmnuxMemoryEvents: wireMemoryEvents,
    wireOmnuxKeyboardShortcuts: wireKeyboardShortcuts
  });
})();

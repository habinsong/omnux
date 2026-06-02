/* omnux — app shell summary helpers */
(function () {
  function buildConversationSummary(conversation) {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    return {
      id: conversation.id,
      title: conversation.title || "제목 없음",
      project: conversation.project || "기본",
      category: conversation.category || "일반",
      createdUtc: conversation.createdUtc || conversation.CreatedUtc || "",
      updatedUtc: conversation.updatedUtc || conversation.UpdatedUtc || "",
      messageCount: messages.length,
      linkedMemoryNotes: Array.isArray(conversation.linkedMemoryNotes) ? conversation.linkedMemoryNotes : [],
      preview: lastMessage ? String(lastMessage.text || "").slice(0, 96) : "",
      tags: Array.isArray(conversation.tags) ? conversation.tags : []
    };
  }

  function upsertConversationSummary(items, conversation) {
    if (!conversation || !conversation.id) {
      return Array.isArray(items) ? items : [];
    }

    const next = Array.isArray(items) ? items.slice() : [];
    const index = next.findIndex((item) => item && item.id === conversation.id);
    const summary = buildConversationSummary(conversation);
    if (index >= 0) {
      next[index] = { ...next[index], ...summary };
      return next;
    }

    return [summary, ...next];
  }

  Object.assign(window, {
    buildConversationSummary,
    upsertConversationSummary
  });
})();

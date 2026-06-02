export function requestConversations(send, scope = "chat", mode = "single", options = {}) {
  return send({ type: "list_conversations", scope, mode }, options);
}

export function requestCreateConversation(send, params = {}, options = {}) {
  return send({
    type: "create_conversation",
    scope: params.scope || "chat",
    mode: params.mode || "single",
    conversationTitle: params.title || "",
    project: params.project || "",
    category: params.category || "",
    tags: params.tags || [],
  }, options);
}

export function requestConversation(send, conversationId, options = {}) {
  return send({ type: "get_conversation", conversationId }, options);
}

export function requestDeleteConversation(send, conversationId, params = {}, options = {}) {
  return send({
    type: "delete_conversation",
    conversationId,
    scope: params.scope || "chat",
    mode: params.mode || "single",
  }, options);
}

export function requestUpdateConversationMeta(send, conversationId, params = {}, options = {}) {
  return send({
    type: "update_conversation_meta",
    conversationId,
    conversationTitle: params.title,
    project: params.project,
    category: params.category,
    tags: params.tags,
  }, options);
}

export function requestConversationSearch(send, query, maxResults, options = {}) {
  return send({
    type: "conversation_search",
    query,
    maxResults: maxResults || 20,
  }, options);
}

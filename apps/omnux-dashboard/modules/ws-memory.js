export function requestMemoryNotes(send, options = {}) {
  return send({ type: "list_memory_notes" }, options);
}

export function requestReadMemoryNote(send, noteName, options = {}) {
  return send({ type: "read_memory_note", noteName }, options);
}

export function requestCreateMemoryNote(send, conversationId, compact = false, options = {}) {
  return send({
    type: "create_memory_note",
    conversationId,
    compactConversation: compact,
  }, options);
}

export function requestDeleteMemoryNotes(send, noteNames, options = {}) {
  return send({
    type: "delete_memory_notes",
    memoryNotes: noteNames,
  }, options);
}

export function requestRenameMemoryNote(send, noteName, newName, options = {}) {
  return send({ type: "rename_memory_note", noteName, newName }, options);
}

export function requestClearMemory(send, scope = "chat", options = {}) {
  return send({ type: "clear_memory", scope }, options);
}

export function requestMemorySearch(send, query, maxResults, minScore, options = {}) {
  return send({
    type: "memory_search",
    query,
    maxResults: maxResults || 10,
    minScore: minScore || 0,
  }, options);
}

export function requestMemoryGet(send, path, fromLine, lines, options = {}) {
  const payload = { type: "memory_get", memoryPath: path };
  if (fromLine != null) payload.fromLine = fromLine;
  if (lines != null) payload.lines = lines;
  return send(payload, options);
}

export function requestMemoryIndexRebuild(send, options = {}) {
  return send({ type: "memory_index_rebuild" }, options);
}

export function requestReadWorkspaceFile(send, filePath, conversationId, options = {}) {
  const payload = { type: "read_workspace_file", filePath };
  if (conversationId) payload.conversationId = conversationId;
  return send(payload, options);
}

// omnux — session tool WS request helpers (Phase 3). Read-only list/history only;
// sessions_send/sessions_spawn (multi-agent spawn) are intentionally not exposed here.
export function requestSessionsList(send, params = {}, options = {}) {
  const payload = { type: "sessions_list" };
  if (Array.isArray(params.kinds)) payload.kinds = params.kinds;
  if (params.limit != null) payload.limit = params.limit;
  if (params.activeMinutes != null) payload.activeMinutes = params.activeMinutes;
  if (params.messageLimit != null) payload.messageLimit = params.messageLimit;
  if (params.search) payload.search = params.search;
  if (params.scope) payload.scope = params.scope;
  if (params.mode) payload.mode = params.mode;
  return send(payload, options);
}

export function requestSessionHistory(send, sessionKey, limit, includeTools, options = {}) {
  const payload = { type: "sessions_history", sessionKey: String(sessionKey || "").trim() };
  if (limit != null) payload.limit = limit;
  if (includeTools != null) payload.includeTools = !!includeTools;
  return send(payload, options);
}

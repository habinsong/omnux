// omnux — web tool WS request helpers (Phase 3). Documented request contract;
// the Explore page hook sends these inline (matching the conversation/memory hooks).
export function requestWebSearch(send, query, count, freshness, options = {}) {
  const payload = { type: "web_search", query: String(query || "").trim() };
  if (count != null) payload.count = count;
  if (freshness) payload.freshness = freshness;
  return send(payload, options);
}

export function requestWebFetch(send, url, extractMode, maxChars, options = {}) {
  const payload = { type: "web_fetch", webFetchUrl: String(url || "").trim() };
  if (extractMode) payload.extractMode = extractMode;
  if (maxChars != null) payload.maxChars = maxChars;
  return send(payload, options);
}

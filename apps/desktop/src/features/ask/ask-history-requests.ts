import type { DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { useAskStore } from "./ask-store";
import type { AskConversationMetaDraft } from "./ask-types";
import { createRequestId } from "./ask-session-helpers";

export type AskHistoryRequest = { id: string; type: string; conversationId?: string; meta?: AskConversationMetaDraft };

export function requestAskHistory(key: string, type: string, send: (id: string) => boolean, context: Omit<AskHistoryRequest, "id" | "type"> = {}) {
  const id = `ask-history-${createRequestId().slice(4)}`;
  useAskStore.setState(state => ({ historyRequests: { ...state.historyRequests, [key]: { id, type, ...context } }, lastError: null }));
  if (send(id)) return true;
  finishAskHistory(id);
  return false;
}

export function finishAskHistory(id: string) {
  const requests = useAskStore.getState().historyRequests;
  const entry = Object.entries(requests).find(([, request]) => request.id === id);
  if (!entry) return null;
  const next = { ...requests };
  delete next[entry[0]];
  useAskStore.setState({ historyRequests: next });
  return { ...entry[1], key: entry[0] };
}

export function acceptAskHistory(message: DesktopServerMessage) {
  return finishAskHistory(String(message.requestId || message.RequestId || ""));
}

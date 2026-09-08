import { create } from "zustand";
import { requestDesktopNotebook } from "../middleware/notebook-gateway";
import type { DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { buildNotebookEntryFromMessage, createRequestId } from "./ask-session-helpers";

export const useAskNotebookSave = create<{ requestId: string; notice: string; failed: boolean }>(() => ({ requestId: "", notice: "", failed: false }));

export function saveAskNotebookReply(index: number, text: string, meta: string, conversationId: string | null) {
  if (useAskNotebookSave.getState().requestId || !text.trim()) return;
  const requestId = `ask-notebook-${createRequestId().slice(4)}`;
  useAskNotebookSave.setState({ requestId, notice: "노트를 저장하고 있습니다.", failed: false });
  if (!requestDesktopNotebook.append("learning", buildNotebookEntryFromMessage(index, text, meta), undefined, {
    source: "chat", conversationId, tags: ["chat", "assistant-response"], requestId
  })) useAskNotebookSave.setState({ requestId: "", notice: "노트 저장 요청을 보내지 못했습니다.", failed: true });
}

export function receiveAskNotebookSave(message: DesktopServerMessage) {
  const pending = useAskNotebookSave.getState().requestId;
  if (!pending || message.requestId !== pending || !["notebook_result", "error"].includes(message.type || "")) return false;
  const result = message.payload && typeof message.payload === "object" ? message.payload as Record<string, unknown> : {};
  const failed = message.type === "error" || result.ok !== true;
  useAskNotebookSave.setState({ requestId: "", failed, notice: failed ? String(result.message || message.message || "노트를 저장하지 못했습니다.") : "답변을 노트에 저장했습니다." });
  return true;
}

export function interruptAskNotebookSave() {
  if (useAskNotebookSave.getState().requestId) useAskNotebookSave.setState({ requestId: "", failed: true, notice: "연결이 끊겨 노트 저장 여부를 확인할 수 없습니다. 노트 화면에서 확인해 주세요." });
}

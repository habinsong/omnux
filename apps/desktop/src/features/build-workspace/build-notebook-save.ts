import { create } from "zustand";
import { requestDesktopNotebook } from "../middleware/notebook-gateway";
import type { DesktopServerMessage } from "../middleware/desktop-message-gateway";

export const useBuildNotebookSave = create<{ requestId: string; notice: string; failed: boolean }>(() => ({
  requestId: "",
  notice: "",
  failed: false
}));

export function saveBuildResultToNotebook(text: string, meta = "", conversationId: string | null, projectKey = "") {
  if (useBuildNotebookSave.getState().requestId || !text.trim()) return;
  const requestId = `build-notebook-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const body = ["빌드 결과에서 저장한 내용", meta.trim() ? `모델: ${meta.trim()}` : "", text.trim()].filter(Boolean).join("\n\n");
  useBuildNotebookSave.setState({ requestId, notice: "노트를 저장하고 있습니다.", failed: false });
  if (
    !requestDesktopNotebook.append("learning", body, projectKey || undefined, {
      source: "coding",
      conversationId,
      tags: ["coding", "build-result"],
      requestId
    })
  ) {
    useBuildNotebookSave.setState({ requestId: "", notice: "노트 저장 요청을 보내지 못했습니다.", failed: true });
  }
}

export function receiveBuildNotebookSave(message: DesktopServerMessage) {
  const pending = useBuildNotebookSave.getState().requestId;
  if (!pending || message.requestId !== pending || !["notebook_result", "error"].includes(message.type || "")) return false;
  const result = message.payload && typeof message.payload === "object" ? (message.payload as Record<string, unknown>) : {};
  const failed = message.type === "error" || result.ok !== true;
  useBuildNotebookSave.setState({
    requestId: "",
    failed,
    notice: failed ? String(result.message || message.message || "노트를 저장하지 못했습니다.") : "결과를 노트에 저장했습니다."
  });
  return true;
}

export function interruptBuildNotebookSave() {
  if (useBuildNotebookSave.getState().requestId) {
    useBuildNotebookSave.setState({
      requestId: "",
      failed: true,
      notice: "연결이 끊겨 노트 저장 여부를 확인할 수 없습니다. 노트 화면에서 확인해 주세요."
    });
  }
}

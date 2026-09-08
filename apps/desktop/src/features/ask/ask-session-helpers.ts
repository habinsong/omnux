import { type AskMessage } from "./ask-context";
import type { AskAutoSpeakCandidate } from "./ask-types";

/** 진행 중 스트리밍 상태를 초기화하는 공통 패치. messages를 비우는 모든 전환에서 함께 적용한다. */
export const STREAM_RESET = { streamingText: "", streamingActive: false, streamingRequestId: "" } as const;

export function createRequestId(): string {
  const globalCrypto = typeof crypto !== "undefined" ? crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `ask-${globalCrypto.randomUUID()}`;
  }
  return `ask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildNotebookEntryFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "대화 답변에서 저장한 내용",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    text.trim()
  ].filter(Boolean).join("\n");
}

export function buildPlanObjectiveFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "아래 답변을 실제 작업계획으로 정리",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    text.trim()
  ].filter(Boolean).join("\n");
}

export function buildAutoSpeakCandidate(conversationId: string | null, messages: AskMessage[]): AskAutoSpeakCandidate | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "ai" || !message.text.trim()) continue;
    return {
      key: `${conversationId || "new"}-${message.createdUtc || index}-${message.text.slice(0, 48)}`,
      text: message.text
    };
  }
  return null;
}

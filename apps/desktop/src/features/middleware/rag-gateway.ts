import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Self-RAG deterministic preflight. 자동 검색/프롬프트 주입 없이 후보와 명시 조회만 처리한다.
registerDesktopRequestTypes("rag_retrieval_preflight", "session_replay_get");

export const requestDesktopRag = {
  preflight(query: string) {
    return sendDesktopRequest({ type: "rag_retrieval_preflight", query: query.trim() });
  },
  sessionReplay(conversationId: string, limit = 80) {
    return sendDesktopRequest({
      type: "session_replay_get",
      conversationId: conversationId.trim(),
      limit,
      includeText: false,
      includeTelemetry: true,
      includeAgentEvents: true
    });
  }
};

import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Self-RAG deterministic preflight. 자동 검색/프롬프트 주입 없이 후보와 명시 조회만 처리한다.
registerDesktopRequestTypes("rag_retrieval_preflight", "session_replay_get");

export type SessionReplayRequest = {
  conversationId?: string;
  runId?: string;
  agentId?: string;
  groupId?: string;
  sinceUtc?: string;
  limit?: number;
  includeText?: boolean;
  includeTelemetry?: boolean;
  includeAgentEvents?: boolean;
};

export const requestDesktopRag = {
  preflight(query: string) {
    return sendDesktopRequest({ type: "rag_retrieval_preflight", query: query.trim() });
  },
  sessionReplay(request: string | SessionReplayRequest, limit = 80) {
    const payload: SessionReplayRequest =
      typeof request === "string"
        ? { conversationId: request.trim(), limit, includeText: false, includeTelemetry: true, includeAgentEvents: true }
        : request;
    return sendDesktopRequest({
      type: "session_replay_get",
      ...payload,
      conversationId: payload.conversationId?.trim(),
      runId: payload.runId?.trim(),
      agentId: payload.agentId?.trim(),
      groupId: payload.groupId?.trim()
    });
  }
};

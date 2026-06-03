import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Self-RAG deterministic preflight. 실행 검색/프롬프트 주입 없이 후보만 조회한다.
registerDesktopRequestTypes("rag_retrieval_preflight");

export const requestDesktopRag = {
  preflight(query: string) {
    return sendDesktopRequest({ type: "rag_retrieval_preflight", query: query.trim() });
  }
};

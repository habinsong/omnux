import { requestDesktopAsk } from "../middleware/desktop-message-gateway";
import { type AskMessage } from "./ask-context";
import { parseWebUrls } from "./ask-normalization";
import type { AskState } from "./ask-types";
import { createRequestId } from "./ask-session-helpers";
import type { AskSet } from "./ask-types";

export function createAskSessionActions(set: AskSet, get: () => AskState): Pick<AskState, "sendMessage"> {
  return {
  sendMessage: () => {
    if (get().pending || get().readingFiles) return;
    const text = String(get().input || "").trim();
    const attachments = get().attachments;
    const effectiveText = text || (attachments.length > 0 ? "첨부 파일을 분석해줘" : "");
    if (!effectiveText) {
      return;
    }
    const attachmentLabel = attachments.length > 0
      ? `\n\n[첨부 ${attachments.length}개] ${attachments.map((item) => item.name).join(", ")}`
      : "";
    const nextMessages: AskMessage[] = [
      ...get().messages,
      {
        role: "user",
        text: `${text || effectiveText}${attachmentLabel}`,
        meta: "",
        createdUtc: "",
        tokenUsage: null,
        provider: "",
        model: "",
        route: "",
        source: "dashboard",
        grounded: false,
        citationCount: 0
      }
    ];
    const mode = get().chatMode;
    const meta = get().metaDraft;
    const requestId = createRequestId();
    const ok = requestDesktopAsk.chat(mode, effectiveText, get().activeConversationId, {
      provider: get().provider,
      summaryProvider: get().summaryProvider,
      thinkPlus: get().thinkPlus,
      models: get().selectedModels,
      workerModels: get().workerModels,
      project: meta.project,
      category: meta.category,
      tags: meta.tags,
      memoryNotes: get().selectedMemoryNotes,
      attachments,
      webUrls: parseWebUrls(effectiveText),
      webSearchEnabled: get().webSearchEnabled,
      requestId
    });
    if (!ok) {
      set({lastError: "대화 요청을 전송하지 못했습니다. 입력과 이전 답변은 유지됩니다."});
      return;
    }
    set({
      failedSubmission: { text, attachments },
      messages: nextMessages,
      input: "",
      attachments: [],
      attachmentPanelOpen: false,
      pending: true,
      // 전송 성공 시 스트리밍 대기 상태로 전환한다. single 모드는 llm_chat_stream 델타가
      // 채워지고, orchestration/multi 는 델타 없이 최종 결과까지 타이핑 표시만 유지된다.
      streamingActive: true,
      streamingText: "",
      streamingRequestId: requestId,
      multiResult: mode === "multi" ? null : get().multiResult,
      autoSpeakCandidate: null,
      lastError: null
    });
  }
  };
}

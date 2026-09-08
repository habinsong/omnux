import { requestDesktopExplore, requestDesktopSettings } from "../middleware/desktop-message-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";
import { requestDesktopMemory } from "../middleware/memory-gateway";
import { requestDesktopRag } from "../middleware/rag-gateway";
import { requestDesktopVision } from "../middleware/vision-gateway";
import { getDefaultVisionModel } from "./ask-models";
import { buildRagExecution, memoryGetWindowFromRagItem } from "./ask-rag";
import type { AskState } from "./ask-types";
import type { AskSet } from "./ask-types";

export function createAskRetrievalActions(set: AskSet, get: () => AskState): Pick<AskState, "addAttachments" | "setAttachmentPanelOpen" | "runRagPreflight" | "runRagCandidate" | "openRagMemoryItem" | "clearRagMemoryPreview" | "clearRagPreflight" | "runVisionPreflight" | "clearVisionPreflight"> {
  return {
  addAttachments: (items) => {
    if (items.length === 0) return;
    const existing = get().attachments;
    const next = [...existing];
    for (const item of items) {
      if (next.length >= 6) break;
      next.push(item);
    }
    // 이미지는 전송 전에 형식과 용량을 점검한다.
    const addedImages = items.filter((item) => item.isImage);
    if (addedImages.length > 0) {
      const images = next.filter((item) => item.isImage);
      const text = String(get().input || "첨부 이미지 사전 점검").trim();
      set({ visionFiles: images, visionPending: true, visionPreflight: null });
      if (!requestDesktopVision.preflight({ ...getDefaultVisionModel(), text, attachments: images })) {
        set({ visionPending: false });
      }
    }
    set({
      attachments: next,
      attachmentPanelOpen: true,
      lastError: next.length >= 6 && items.length + existing.length > 6 ? "첨부는 최대 6개까지 가능합니다." : null
    });
  },
  setAttachmentPanelOpen: (open) => set({ attachmentPanelOpen: open }),
  runRagPreflight: () => {
    const query = String(get().input || "").trim();
    if (!query) return;
    set({ ragPending: true, ragPreflight: null, ragExecution: null, ragMemoryPreview: null, lastError: null });
    if (!requestDesktopRag.preflight(query)) {
      set({ ragPending: false, lastError: "RAG preflight 요청을 전송하지 못했다." });
    }
  },
  runRagCandidate: (candidate) => {
    const requestType = String(candidate.suggestedRequestType || "").trim();
    const query = String(get().ragPreflight?.queryPreview || get().input || "").trim();
    if (!requestType || candidate.kind === "none") return;
    set({ ragExecution: buildRagExecution(candidate.kind, requestType, true), ragMemoryPreview: null, lastError: null });
    let ok = false;
    if (requestType === "memory_search") ok = requestDesktopSettings.memorySearch(query, 8, 0);
    else if (requestType === "web_search") ok = requestDesktopExplore.webSearch(query, 8);
    else if (requestType === "code_repomap_snapshot_get") ok = requestDesktopInsights.codeRepomap(30);
    else if (requestType === "session_replay_get") {
      const conversationId = String(get().activeConversationId || "").trim();
      ok = conversationId ? requestDesktopRag.sessionReplay(conversationId, 80) : false;
    }
    if (!ok) {
      set({ ragExecution: { ...buildRagExecution(candidate.kind, requestType), status: "blocked", error: "후보 조회 요청을 전송하지 못했다." } });
    }
  },
  openRagMemoryItem: (item) => {
    const request = memoryGetWindowFromRagItem(item);
    if (!request.path) return;
    set({
      ragMemoryPreview: { path: request.path, text: "", error: "", loading: true },
      lastError: null
    });
    if (!requestDesktopMemory.get(request.path, request.fromLine, request.lines)) {
      set({
        ragMemoryPreview: {
          path: request.path,
          text: "",
          error: "메모리 상세 읽기 요청을 전송하지 못했다.",
          loading: false
        }
      });
    }
  },
  clearRagMemoryPreview: () => set({ ragMemoryPreview: null }),
  clearRagPreflight: () => set({ ragPreflight: null, ragExecution: null, ragMemoryPreview: null, ragPending: false }),
  runVisionPreflight: () => {
    const attachments = get().visionFiles;
    if (attachments.length === 0) return;
    const text = String(get().input || "첨부 이미지를 UI 구현자가 바로 사용할 수 있게 분석해줘").trim();
    set({ visionPending: true, visionPreflight: null, lastError: null });
    if (!requestDesktopVision.preflight({ ...getDefaultVisionModel(), text, attachments })) {
      set({ visionPending: false, lastError: "Vision preflight 요청을 전송하지 못했다." });
    }
  },
  clearVisionPreflight: () => set({ visionFiles: [], visionPreflight: null, visionPending: false })
  };
}

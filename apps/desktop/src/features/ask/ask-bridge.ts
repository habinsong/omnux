import { acceptAskHistory } from "./ask-history-requests";
import { interruptAskNotebookSave, receiveAskNotebookSave } from "./ask-notebook-save";
import { useEffect } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { emptyAskContext, normalizeAskMessage, normalizeConversationContext } from "./ask-context";
import { mergeModelOptions } from "./ask-models";
import { buildMetaDraft, EMPTY_META_DRAFT, enrichLatestAssistantMessage, normalizeChatMode, normalizeConversation, normalizeConversationMessages, normalizeMemoryNote, normalizeModelIds, normalizeMultiResult, normalizeStrings, readField } from "./ask-normalization";
import { normalizeMemoryRagExecution, normalizeRagPreflight, normalizeRepomapRagExecution, normalizeSessionReplayRagExecution, normalizeSessionReplayResultExecution, normalizeWebRagExecution } from "./ask-rag";
import { normalizeVisionPreflight } from "./ask-vision";
import { useAskStore } from "./ask-store";
import { STREAM_RESET, buildAutoSpeakCandidate } from "./ask-session-helpers";

export function useAskPageBridge() {
  useEffect(() => {
    const unsubscribeConnection = useDesktopShellStore.subscribe((state, previous) => {
      if (state.bridge.status !== "closed" && !(state.bridge.status === "connecting" && previous.bridge.status === "connected")) return;
      interruptAskNotebookSave();
      const store = useAskStore.getState();
      if (!store.pending && !Object.keys(store.historyRequests).length && !store.ragPending && !store.visionPending && !store.loadingMemoryNotes) return;
      const partial = store.streamingText ? normalizeAskMessage({role:"assistant", text:store.streamingText,
        meta:"연결이 끊겨 일부만 수신한 답변", source:"system"}) : null;
      useAskStore.setState({pending:false, historyRequests:{}, loadingConversations:false, searching:false, loadingMemoryNotes:false, ragPending:false, visionPending:false, ...STREAM_RESET,
        messages:partial ? [...store.messages,partial] : store.messages,
        lastError:"연결이 끊겨 답변 상태를 확인할 수 없습니다. 다시 연결한 뒤 대화 기록을 확인해 주세요."});
    });
    const unsubscribeMessages = subscribeDesktopMessages((message: DesktopServerMessage) => {
    if (!message.type) return;
    if (receiveAskNotebookSave(message)) return;
    const store = useAskStore.getState();
    const requestId = String(readField(message, "requestId", "RequestId") || "");
    if (String(readField(message, "scope", "Scope") || "") === "coding") return;
    const historyTypes = ["conversations", "conversation_detail", "conversation_created", "conversation_deleted", "conversation_search_result"];
    const historyRequest = historyTypes.includes(message.type) || message.type === "error" ? acceptAskHistory(message) : null;
    if (historyTypes.includes(message.type) && !historyRequest) return;
    if (message.type === "error" && historyRequest) {
      useAskStore.setState({
        ...(historyRequest.key === "detail" || historyRequest.key === "create" ? { pending: false } : {}),
        ...(historyRequest.key === "list" ? { loadingConversations: false } : {}),
        ...(historyRequest.key === "search" ? { searching: false } : {}),
        lastError: String(message.message || "대화 요청에 실패했습니다.")
      });
      return;
    }
    if (message.type === "llm_chat_stream") {
      // 전송을 기다리는 동안 도착한 델타만 누적한다. requestId 가 있으면 현재 턴과 일치할 때만 반영해
      // 이전 턴의 잔여 청크가 섞이지 않게 한다.
      if (!store.streamingActive) return;
      const streamRequestId = String(readField(message, "requestId", "RequestId") || "");
      if (streamRequestId !== store.streamingRequestId) {
        return;
      }
      const delta = String(readField(message, "delta", "Delta") || "");
      if (!delta) return;
      useAskStore.setState((prev) => (prev.streamingActive ? { streamingText: prev.streamingText + delta } : {}));
      return;
    }

    if (message.type === "conversations") {
      if (String(readField(message, "scope", "Scope") || "chat") !== "chat") return;
      const responseMode = normalizeChatMode(readField(message, "mode", "Mode"));
      if (responseMode !== store.chatMode) {
        return;
      }
      const conversations = Array.isArray(message.items)
        ? message.items.map(normalizeConversation).filter((item) => item.id)
        : [];
      useAskStore.setState({
        conversations,
        loadingConversations: false
      });
      return;
    }

    if (message.type === "conversation_detail" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      if (activeConversation.scope !== "chat") return;
      if (historyRequest?.type === "update_conversation_meta") {
        const meta = buildMetaDraft(activeConversation);
        useAskStore.setState(current => ({
          conversations: current.conversations.map(item => item.id === activeConversation.id ? activeConversation : item),
          ...(current.activeConversationId === activeConversation.id ? {
            activeConversation,
            ...(historyRequest.meta && JSON.stringify(current.metaDraft) === JSON.stringify(historyRequest.meta) ? { metaDraft: meta } : {})
          } : {})
        }));
        return;
      }
      const messages = normalizeConversationMessages(conversation);
      useAskStore.setState({
        chatMode: activeConversation.mode,
        activeConversationId: activeConversation.id || store.activeConversationId,
        activeConversation: activeConversation.id ? activeConversation : store.activeConversation,
        metaDraft: activeConversation.id ? buildMetaDraft(activeConversation) : store.metaDraft,
        selectedMemoryNotes: activeConversation.linkedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        autoSpeakCandidate: null,
        multiResult: null,
        pending: false,
        failedSubmission: null,
        ...STREAM_RESET,
        lastError: null
      });
      return;
    }

    if (message.type === "conversation_search_result") {
      if (message.query && message.query !== store.searchQuery) return;
      const error = readField(message, "error", "Error");
      useAskStore.setState({
        searching: false,
        searchResults: Array.isArray(message.results)
          ? message.results.filter(item => String(readField((item && typeof item === "object" ? item : {}) as Record<string, unknown>, "scope", "Scope") || "chat") === "chat").map((item) => {
              const payload = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return {
                conversationId: String(readField(payload, "conversationId", "ConversationId", "id", "Id") || ""),
                title: String(readField(payload, "title", "Title") || "제목 없음"),
                mode: normalizeChatMode(readField(payload, "mode", "Mode")),
                snippet: String(readField(payload, "snippet", "Snippet") || "")
              };
            })
            .filter((item) => item.conversationId)
          : [],
        lastError: error ? String(error) : null
      });
      return;
    }

    if (message.type === "rag_retrieval_preflight_snapshot") {
      useAskStore.setState({
        ragPending: false,
        ragPreflight: normalizeRagPreflight((message.payload || {}) as Record<string, unknown>),
        ragExecution: null,
        lastError: null
      });
      return;
    }

    if (message.type === "clipboard_vision_preflight_result") {
      useAskStore.setState({
        visionPending: false,
        visionPreflight: normalizeVisionPreflight((message.payload || {}) as Record<string, unknown>),
        lastError: null
      });
      return;
    }

    if (message.type === "memory_search_result" && store.ragExecution?.requestType === "memory_search") {
      useAskStore.setState({ ragExecution: normalizeMemoryRagExecution(store.ragExecution, message) });
      return;
    }

    if (message.type === "memory_get_result" && store.ragMemoryPreview?.loading) {
      const requestedPath = String(readField(message, "requestedPath", "path") || "");
      if (!requestedPath || requestedPath === store.ragMemoryPreview.path) {
        useAskStore.setState({
          ragMemoryPreview: {
            path: requestedPath || store.ragMemoryPreview.path,
            text: String(readField(message, "text", "Text") || ""),
            error: String(readField(message, "error", "Error") || ""),
            loading: false
          }
        });
        return;
      }
    }

    if (message.type === "web_search_result" && store.ragExecution?.requestType === "web_search") {
      useAskStore.setState({ ragExecution: normalizeWebRagExecution(store.ragExecution, message) });
      return;
    }

    if (message.type === "code_repomap_snapshot" && store.ragExecution?.requestType === "code_repomap_snapshot_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeRepomapRagExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "session_replay_snapshot" && store.ragExecution?.requestType === "session_replay_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeSessionReplayRagExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "session_replay_result" && store.ragExecution?.requestType === "session_replay_get") {
      const payload = (message.payload || {}) as Record<string, unknown>;
      useAskStore.setState({ ragExecution: normalizeSessionReplayResultExecution(store.ragExecution, payload) });
      return;
    }

    if (message.type === "conversation_created" && message.conversation && typeof message.conversation === "object") {
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      if (activeConversation.scope !== "chat") return;
      const messages = normalizeConversationMessages(conversation);
      useAskStore.setState({
        input: "",
        attachments: [],
        visionFiles: [],
        visionPreflight: null,
        chatMode: activeConversation.mode,
        activeConversationId: activeConversation.id || null,
        activeConversation: activeConversation.id ? activeConversation : null,
        metaDraft: buildMetaDraft(activeConversation.id ? activeConversation : null),
        selectedMemoryNotes: activeConversation.linkedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        autoSpeakCandidate: null,
        multiResult: null,
        pending: false,
        failedSubmission: null,
        ...STREAM_RESET,
        lastError: null
      });
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "conversation_deleted") {
      if (message.ok === false) {
        useAskStore.setState({ lastError: "대화를 삭제하지 못했습니다. 기록을 새로고침한 뒤 확인해 주세요." });
        return;
      }
      const deletedId = String(readField(message, "conversationId", "ConversationId") || "");
      if (deletedId) {
        const current = useAskStore.getState();
        useAskStore.setState({
          selectedConversationIds: current.selectedConversationIds.filter((id) => id !== deletedId),
          ...(current.activeConversationId === deletedId
            ? {
                activeConversationId: null,
                activeConversation: null,
                messages: [],
                conversationContext: emptyAskContext(),
                metaDraft: { ...EMPTY_META_DRAFT },
                multiResult: null,
                autoSpeakCandidate: null,
                ...STREAM_RESET
              }
            : {})
        });
      }
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "memory_notes") {
      useAskStore.setState({
        memoryNotes: Array.isArray(message.items) ? message.items.map(normalizeMemoryNote).filter((item) => item.name) : [],
        loadingMemoryNotes: false
      });
      return;
    }

    if (message.type === "memory_note_content") {
      useAskStore.setState({
        memoryPreview: {
          name: String(message.name || ""),
          content: String(message.content || "")
        },
        loadingMemoryNotes: false
      });
      return;
    }

    if (message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || message.type), { source: "auth" });
      if (message.type === "memory_note_deleted") {
        const deleted = normalizeStrings((message as { memoryNotes?: unknown }).memoryNotes);
        if (deleted.length > 0) {
          useAskStore.setState({
            selectedMemoryNotes: useAskStore.getState().selectedMemoryNotes.filter((name) => !deleted.includes(name))
          });
        }
      }
      useAskStore.getState().loadMemoryNotes();
      useAskStore.getState().loadConversations();
      return;
    }

    if (message.type === "memory_cleared") {
      useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || "대화 메모리를 초기화했습니다."), { source: "auth" });
      useAskStore.setState({
        activeConversationId: null,
        activeConversation: null,
        messages: [],
        conversationContext: emptyAskContext(),
        metaDraft: { ...EMPTY_META_DRAFT },
        selectedMemoryNotes: [],
        memoryPreview: null,
        multiResult: null,
        autoSpeakCandidate: null,
        loadingConversations: false,
        loadingMemoryNotes: false,
        ...STREAM_RESET,
        lastError: null
      });
      useAskStore.getState().loadConversations();
      useAskStore.getState().loadMemoryNotes();
      return;
    }

    const modelProvider = message.type.replace(/_models$/, "");
    if (message.type.endsWith("_models") && Object.hasOwnProperty.call(store.modelCatalogs, modelProvider)) {
      const provider = modelProvider as keyof typeof store.modelCatalogs;
      useAskStore.setState({ modelCatalogs: { ...store.modelCatalogs, [provider]: mergeModelOptions(provider, normalizeModelIds(message.items)) } });
      return;
    }

    if ((message.type === "llm_chat_result" || message.type === "llm_chat_multi_result") && message.conversation && typeof message.conversation === "object") {
      if (!store.streamingActive || requestId !== store.streamingRequestId) return;
      const conversation = message.conversation as Record<string, unknown>;
      const activeConversation = normalizeConversation(conversation);
      if (activeConversation.scope !== "chat") return;
      const messages = enrichLatestAssistantMessage(normalizeConversationMessages(conversation), message);
      const activeConversationId = activeConversation.id || store.activeConversationId;
      useAskStore.setState({
        activeConversationId,
        activeConversation: activeConversation.id ? activeConversation : store.activeConversation,
        metaDraft: activeConversation.id ? buildMetaDraft(activeConversation) : store.metaDraft,
        selectedMemoryNotes: activeConversation.linkedMemoryNotes,
        messages,
        conversationContext: normalizeConversationContext(conversation),
        multiResult: message.type === "llm_chat_multi_result" ? normalizeMultiResult(message) : store.multiResult,
        autoSpeakCandidate: buildAutoSpeakCandidate(activeConversationId, messages),
        pending: false,
        failedSubmission: null,
        ...STREAM_RESET,
        lastError: null
      });
      return;
    }

    if (message.type === "error") {
      const requestType = String(message.requestType || "");
      if ((requestType === "rag_retrieval_preflight" && store.ragPending) ||
          (requestType === "clipboard_vision_preflight" && store.visionPending) ||
          (["list_memory_notes", "read_memory_note"].includes(requestType) && store.loadingMemoryNotes)) {
        useAskStore.setState({ ragPending: false, visionPending: false, loadingMemoryNotes: false, lastError: String(message.message || "자료를 불러오지 못했습니다.") });
        return;
      }
      if (!store.streamingActive || requestId !== store.streamingRequestId) return;
      if (requestType && !requestType.startsWith("llm_chat_")) return;
      if (!requestId && !requestType && store.streamingRequestId && !/^chat_|^empty message/.test(String(message.message || ""))) return;
      if (!requestId && !requestType && useDesktopNavigationStore.getState().activePage !== "ask") return;
      const partial = store.streamingText ? normalizeAskMessage({ role: "assistant", text: store.streamingText, meta: "오류로 일부만 수신한 답변", source: "system" }) : null;
      useAskStore.setState({ pending: false, ...STREAM_RESET, messages: partial ? [...store.messages, partial] : store.messages, lastError: String(message.message || "오류") });
    }
    });
    return () => { unsubscribeConnection(); unsubscribeMessages(); };
  }, []);
}

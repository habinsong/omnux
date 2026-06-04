import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopLlm, type LlmCredentialInput } from "../middleware/llm-gateway";
import { requestDesktopTelegram } from "../middleware/telegram-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

export type ProviderKeyId = "groq" | "gemini" | "cerebras" | "nvidia" | "codex";

export type ProviderCredentialCard = {
  id: ProviderKeyId;
  label: string;
  helper: string;
  placeholder: string;
  input: string;
  masked: string;
  set: boolean;
};

type PendingProviderAction = "load" | "save" | "delete" | "";

type ProviderCredentialState = {
  inputs: Record<ProviderKeyId, string>;
  cards: ProviderCredentialCard[];
  persist: boolean;
  remoteDashboardClient: boolean;
  loading: boolean;
  pendingAction: PendingProviderAction;
  message: string;
  setInput: (id: ProviderKeyId, value: string) => void;
  setPersist: (value: boolean) => void;
  loadSettings: () => void;
  saveCredentials: () => void;
  deleteCredentials: () => void;
};

const EMPTY_INPUTS: Record<ProviderKeyId, string> = {
  groq: "",
  gemini: "",
  cerebras: "",
  nvidia: "",
  codex: ""
};

const CARD_META = [
  { id: "groq", label: "Groq", helper: "빠른 응답 모델", placeholder: "gsk_..." },
  { id: "gemini", label: "Gemini", helper: "grounding / 검색", placeholder: "AIza..." },
  { id: "cerebras", label: "Cerebras", helper: "대체 고속 모델", placeholder: "csk-..." },
  { id: "nvidia", label: "NVIDIA NIM", helper: "OpenAI 호환 NIM", placeholder: "nvapi-..." },
  { id: "codex", label: "Codex API", helper: "OAuth 대체 API 키", placeholder: "sk-..." }
] as const;

function buildCards(
  inputs: Record<ProviderKeyId, string>,
  message?: DesktopServerMessage
): ProviderCredentialCard[] {
  return CARD_META.map((meta) => {
    const setKey = `${meta.id}ApiKeySet`;
    const maskedKey = `${meta.id}ApiKeyMasked`;
    return {
      ...meta,
      input: inputs[meta.id],
      masked: typeof message?.[maskedKey] === "string" ? String(message[maskedKey]) : "",
      set: message ? !!message[setKey] : false
    };
  });
}

function buildPayload(inputs: Record<ProviderKeyId, string>): LlmCredentialInput {
  return {
    groqApiKey: inputs.groq,
    geminiApiKey: inputs.gemini,
    cerebrasApiKey: inputs.cerebras,
    nvidiaApiKey: inputs.nvidia,
    codexApiKey: inputs.codex
  };
}

export const useProviderCredentialsStore = create<ProviderCredentialState>((set, get) => ({
  inputs: EMPTY_INPUTS,
  cards: buildCards(EMPTY_INPUTS),
  persist: true,
  remoteDashboardClient: false,
  loading: false,
  pendingAction: "",
  message: "",
  setInput: (id, value) =>
    set((state) => {
      const inputs = { ...state.inputs, [id]: value };
      return { inputs, cards: state.cards.map((card) => card.id === id ? { ...card, input: value } : card) };
    }),
  setPersist: (value) => set({ persist: value }),
  loadSettings: () => {
    set({ loading: true, pendingAction: "load", message: "" });
    if (!requestDesktopTelegram.settings()) {
      set({ loading: false, pendingAction: "", message: "설정 상태 조회 요청을 전송하지 못했다." });
    }
  },
  saveCredentials: () => {
    const state = get();
    const hasInput = Object.values(state.inputs).some((value) => value.trim());
    if (!hasInput) {
      set({ message: "저장할 API 키를 하나 이상 입력해야 한다." });
      return;
    }
    set({ loading: true, pendingAction: "save", message: "" });
    if (!requestDesktopLlm.setCredentials(buildPayload(state.inputs), state.persist)) {
      set({ loading: false, pendingAction: "", message: "LLM API 키 저장 요청을 전송하지 못했다." });
    }
  },
  deleteCredentials: async () => {
    const state = get();
    const confirmed = await requestConfirmDialog({
      title: "LLM API 키 삭제",
      message: state.persist
        ? "Groq, Gemini, Cerebras, NVIDIA NIM, Codex API 키를 현재 세션과 보안 저장소에서 삭제할까요?"
        : "Groq, Gemini, Cerebras, NVIDIA NIM, Codex API 키를 현재 실행 중인 세션에서 삭제할까요?",
      confirmLabel: "키 삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ loading: true, pendingAction: "delete", message: "" });
    if (!requestDesktopLlm.deleteCredentials(state.persist)) {
      set({ loading: false, pendingAction: "", message: "LLM API 키 삭제 요청을 전송하지 못했다." });
    }
  }
}));

export function useProviderCredentialsBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "settings_state") {
        useProviderCredentialsStore.setState((state) => ({
          cards: buildCards(state.inputs, message),
          remoteDashboardClient: !!message.remoteDashboardClient,
          loading: false,
          pendingAction: state.pendingAction === "load" ? "" : state.pendingAction
        }));
        return;
      }

      if (message.type === "settings_result") {
        const pendingAction = useProviderCredentialsStore.getState().pendingAction;
        if (!pendingAction) return;
        const ok = message.ok !== false;
        useProviderCredentialsStore.setState((state) => {
          const inputs = ok && (pendingAction === "save" || pendingAction === "delete") ? EMPTY_INPUTS : state.inputs;
          return {
            inputs,
            cards: state.cards.map((card) => ({ ...card, input: inputs[card.id] })),
            loading: false,
            pendingAction: "",
            message: String(message.message || "LLM API 키 설정 응답을 수신했다.")
          };
        });
        return;
      }

      if (message.type === "error" && useProviderCredentialsStore.getState().pendingAction) {
        useProviderCredentialsStore.setState({ loading: false, pendingAction: "", message: String(message.message || "LLM API 키 설정 오류") });
      }
    });
  }, []);
}

import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// LLM provider/model 설정 + 자격증명 + CLI 상태. middleware 디렉터리이므로 sendDesktopRequest 허용.
registerDesktopRequestTypes(
  "get_groq_models",
  "get_copilot_models",
  "set_groq_model",
  "set_copilot_model",
  "get_copilot_status",
  "get_codex_status",
  "get_usage_stats",
  "set_llm_credentials",
  "delete_llm_credentials",
  "start_copilot_login"
);

export interface LlmCredentialInput {
  groqApiKey?: string;
  geminiApiKey?: string;
  cerebrasApiKey?: string;
}

export const requestDesktopLlm = {
  groqModels() {
    return sendDesktopRequest({ type: "get_groq_models" });
  },
  copilotModels() {
    return sendDesktopRequest({ type: "get_copilot_models" });
  },
  setGroqModel(model: string) {
    return sendDesktopRequest({ type: "set_groq_model", model: model.trim() });
  },
  setCopilotModel(model: string) {
    return sendDesktopRequest({ type: "set_copilot_model", model: model.trim() });
  },
  copilotStatus() {
    return sendDesktopRequest({ type: "get_copilot_status" });
  },
  codexStatus() {
    return sendDesktopRequest({ type: "get_codex_status" });
  },
  usageStats() {
    return sendDesktopRequest({ type: "get_usage_stats" });
  },
  startCopilotLogin() {
    return sendDesktopRequest({ type: "start_copilot_login" });
  },
  setCredentials(keys: LlmCredentialInput, persist = true) {
    return sendDesktopRequest({
      type: "set_llm_credentials",
      groqApiKey: keys.groqApiKey?.trim() || undefined,
      geminiApiKey: keys.geminiApiKey?.trim() || undefined,
      cerebrasApiKey: keys.cerebrasApiKey?.trim() || undefined,
      persist
    });
  },
  deleteCredentials(persist = false) {
    return sendDesktopRequest({ type: "delete_llm_credentials", persist });
  }
};

import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// LLM 라우팅 정책 (intent별 provider 체인). 정적 대시보드 ws-routing 흐름.
registerDesktopRequestTypes("routing_policy_get", "routing_policy_save", "routing_policy_reset", "routing_decision_get_last");

export const requestDesktopRouting = {
  get() {
    return sendDesktopRequest({ type: "routing_policy_get" });
  },
  save(policy: Record<string, string[]>) {
    return sendDesktopRequest({ type: "routing_policy_save", policy });
  },
  reset() {
    return sendDesktopRequest({ type: "routing_policy_reset" });
  },
  lastDecision() {
    return sendDesktopRequest({ type: "routing_decision_get_last" });
  }
};

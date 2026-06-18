import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, requestDesktopSettings, type DesktopServerMessage } from "../middleware/desktop-message-gateway";

type UserRulesState = {
  text: string;
  savedText: string;
  exists: boolean;
  updatedUtc: string;
  loading: boolean;
  pending: boolean;
  message: string;
  setText: (value: string) => void;
  load: () => void;
  save: () => void;
  remove: () => void;
};

export const useUserRulesStore = create<UserRulesState>((set, get) => ({
  text: "",
  savedText: "",
  exists: false,
  updatedUtc: "",
  loading: false,
  pending: false,
  message: "",
  setText: (value) => set({ text: value }),
  load: () => {
    set({ loading: true, message: "" });
    if (!requestDesktopSettings.userRulesGet()) {
      set({ loading: false, message: "규칙 조회 요청을 전송하지 못했다." });
    }
  },
  save: () => {
    const text = get().text;
    set({ pending: true, message: "" });
    if (!requestDesktopSettings.userRulesSave(text)) {
      set({ pending: false, message: "규칙 저장 요청을 전송하지 못했다." });
    }
  },
  remove: () => {
    set({ pending: true, message: "" });
    if (!requestDesktopSettings.userRulesDelete()) {
      set({ pending: false, message: "규칙 삭제 요청을 전송하지 못했다." });
    }
  }
}));

export function useUserRulesBridge(canRequest: boolean) {
  const load = useUserRulesStore((state) => state.load);

  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type !== "user_rules_state") return;
      const action = String(message.action || "");
      const text = String(message.text || "");
      useUserRulesStore.setState({
        text,
        savedText: text,
        exists: Boolean(message.exists),
        updatedUtc: String(message.updatedUtc || ""),
        loading: false,
        pending: false,
        message: action === "save" ? "저장됨" : action === "delete" ? "삭제됨" : ""
      });
    });
  }, []);

  useEffect(() => {
    if (canRequest) load();
  }, [canRequest, load]);
}

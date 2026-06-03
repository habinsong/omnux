import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRouting } from "../middleware/routing-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type Chains = Record<string, string[]>;
type RoutingSnapshot = {
  defaultChains: Chains;
  overrideChains: Chains;
  effectiveChains: Chains;
  lastDecision: Record<string, unknown> | null;
};

type RoutingState = {
  snapshot: RoutingSnapshot;
  draftChains: Record<string, string>;
  loaded: boolean;
  loading: boolean;
  pending: boolean;
  lastError: string;
  lastMessage: string;
  load: () => void;
  setDraft: (key: string, value: string) => void;
  save: () => void;
  reset: () => void;
  loadDecision: () => void;
};

const EMPTY: RoutingSnapshot = { defaultChains: {}, overrideChains: {}, effectiveChains: {}, lastDecision: null };

export const useRoutingStore = create<RoutingState>((set, get) => ({
  snapshot: EMPTY,
  draftChains: {},
  loaded: false,
  loading: false,
  pending: false,
  lastError: "",
  lastMessage: "",
  load: () => {
    set({ loading: true, lastError: "" });
    if (!requestDesktopRouting.get()) set({ loading: false, lastError: "라우팅 정책 조회 요청을 전송하지 못했다." });
  },
  setDraft: (key, value) => set((state) => ({ draftChains: { ...state.draftChains, [key]: value } })),
  save: () => {
    const draft = get().draftChains;
    const policy: Chains = {};
    for (const key of Object.keys(draft)) {
      policy[key] = String(draft[key] || "").split(",").map((item) => item.trim()).filter(Boolean);
    }
    set({ pending: true, lastError: "" });
    if (!requestDesktopRouting.save(policy)) set({ pending: false, lastError: "라우팅 정책 저장 요청을 전송하지 못했다." });
  },
  reset: async () => {
    const confirmed = await requestConfirmDialog({ title: "override 초기화", message: "사용자 override 라우팅 체인을 모두 기본값으로 되돌릴까요?", confirmLabel: "초기화", tone: "danger" });
    if (!confirmed) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopRouting.reset()) set({ pending: false, lastError: "라우팅 정책 초기화 요청을 전송하지 못했다." });
  },
  loadDecision: () => {
    requestDesktopRouting.lastDecision();
  }
}));

function chains(value: unknown): Chains {
  const out: Chains = {};
  const v = (value || {}) as Record<string, unknown>;
  for (const key of Object.keys(v)) out[key] = Array.isArray(v[key]) ? (v[key] as unknown[]).map((x) => String(x)) : [];
  return out;
}

export function useRoutingPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "routing_policy_result") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
        const ok = payload.ok !== false;
        const effective = chains(snapshot.effectiveChains);
        const draft = Object.keys(effective).reduce<Record<string, string>>((acc, key) => {
          acc[key] = effective[key].join(", ");
          return acc;
        }, {});
        useRoutingStore.setState((prev) => ({
          loaded: true,
          loading: false,
          pending: false,
          lastError: ok ? "" : String(payload.message || "라우팅 정책 요청이 실패했습니다."),
          lastMessage: ok ? String(payload.message || "") : "",
          snapshot: { defaultChains: chains(snapshot.defaultChains), overrideChains: chains(snapshot.overrideChains), effectiveChains: effective, lastDecision: prev.snapshot.lastDecision },
          draftChains: Object.keys(draft).length > 0 ? draft : prev.draftChains
        }));
        return;
      }
      if (message.type === "routing_decision_result") {
        useRoutingStore.setState((prev) => ({ snapshot: { ...prev.snapshot, lastDecision: (message.payload || null) as Record<string, unknown> | null } }));
      }
    });
  }, []);
}

import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";
import { requestDesktopRouting } from "../middleware/routing-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { buildPolicy, formatChain, mergeServerChains } from "./routing-model";

type Chains = Record<string, string[]>;
export type RoutingDecision = {
  decisionId: string;
  category: string;
  categoryKey: string;
  categoryLabel: string;
  decidedAtUtc: string;
  requestedProvider: string;
  resolvedProvider: string;
  providerChain: string[];
  availableProviders: string[];
  reason: string;
};
export type RoutingLocalLlm = {
  availableEndpointCount: number;
  totalModelCount: number;
  offlineReady: boolean;
  offlineStatus: string;
  requestedBy: string[];
  cloudProviderKeysPresent: string[];
  endpoints: Array<{ name: string; kind: string; status: string; modelCount: number; baseUrl: string; elapsedMs: number; error: string }>;
  checks: Array<{ name: string; status: string; message: string }>;
  scannedAtUtc: string;
};
type RoutingSnapshot = {
  defaultChains: Chains;
  overrideChains: Chains;
  effectiveChains: Chains;
  lastDecision: RoutingDecision | null;
};

type RoutingState = {
  snapshot: RoutingSnapshot;
  localLlm: RoutingLocalLlm | null;
  draftChains: Record<string, string>;
  loaded: boolean;
  loading: boolean;
  localLoading: boolean;
  pending: boolean;
  lastError: string;
  lastMessage: string;
  load: () => void;
  loadLocalLlm: () => void;
  setDraft: (key: string, value: string) => void;
  save: () => void;
  discardDraft: () => void;
  reset: () => void;
  loadDecision: () => void;
};

const EMPTY: RoutingSnapshot = { defaultChains: {}, overrideChains: {}, effectiveChains: {}, lastDecision: null };

export const useRoutingStore = create<RoutingState>((set, get) => ({
  snapshot: EMPTY,
  localLlm: null,
  draftChains: {},
  loaded: false,
  loading: false,
  localLoading: false,
  pending: false,
  lastError: "",
  lastMessage: "",
  load: () => {
    set({ loading: true, lastError: "" });
    if (!requestDesktopRouting.get()) set({ loading: false, lastError: "라우팅 정책 조회 요청을 전송하지 못했다." });
  },
  loadLocalLlm: () => {
    set({ localLoading: true, lastError: "" });
    if (!requestDesktopInsights.localLlm()) set({ localLoading: false, lastError: "로컬 모델 상태 요청을 전송하지 못했다." });
  },
  setDraft: (key, value) => set((state) => ({ draftChains: { ...state.draftChains, [key]: value } })),
  save: () => {
    set({ pending: true, lastError: "" });
    if (!requestDesktopRouting.save(buildPolicy(get().draftChains))) {
      set({ pending: false, lastError: "라우팅 정책 저장 요청을 전송하지 못했다." });
    }
  },
  discardDraft: () =>
    set((state) => {
      // 편집을 버리고 서버 값으로 되돌린다. 사용자가 명시적으로 누를 때만 한다.
      const next: Record<string, string> = {};
      for (const key of Object.keys(state.snapshot.effectiveChains)) {
        next[key] = formatChain(state.snapshot.effectiveChains[key]);
      }
      return { draftChains: next, lastMessage: "편집을 버리고 저장된 값으로 되돌렸습니다." };
    }),
  reset: async () => {
    const confirmed = await requestConfirmDialog({ title: "사용자 지정 초기화", message: "사용자 지정 실행 경로를 모두 기본값으로 되돌릴까요?", confirmLabel: "초기화", tone: "danger" });
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

function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function n(value: unknown): number {
  return Number(value || 0);
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function normalizeDecision(value: unknown): RoutingDecision | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  return {
    decisionId: s(d.decisionId),
    category: s(d.category),
    categoryKey: s(d.categoryKey),
    categoryLabel: s(d.categoryLabel),
    decidedAtUtc: s(d.decidedAtUtc),
    requestedProvider: s(d.requestedProvider),
    resolvedProvider: s(d.resolvedProvider),
    providerChain: Array.isArray(d.providerChain) ? d.providerChain.map(String) : [],
    availableProviders: Array.isArray(d.availableProviders) ? d.availableProviders.map(String) : [],
    reason: s(d.reason)
  };
}

export function useRoutingPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "routing_policy_result") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
        const ok = payload.ok !== false;
        const effective = chains(snapshot.effectiveChains);
        useRoutingStore.setState((prev) => ({
          loaded: true,
          loading: false,
          pending: false,
          lastError: ok ? "" : String(payload.message || "라우팅 정책 요청이 실패했습니다."),
          lastMessage: ok ? String(payload.message || "") : "",
          snapshot: {
            defaultChains: chains(snapshot.defaultChains),
            overrideChains: chains(snapshot.overrideChains),
            effectiveChains: effective,
            lastDecision: normalizeDecision(snapshot.lastDecision) || prev.snapshot.lastDecision
          },
          // 저장하지 않은 편집을 서버 응답이 덮어쓰지 않는다.
          // 손대지 않은 항목만 새 값으로 맞춘다.
          draftChains: mergeServerChains(prev.draftChains, prev.snapshot.effectiveChains, effective)
        }));
        return;
      }
      if (message.type === "routing_decision_result") {
        useRoutingStore.setState((prev) => ({ snapshot: { ...prev.snapshot, lastDecision: normalizeDecision(message.payload) } }));
        return;
      }
      if (message.type === "local_llm_snapshot") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        const offlineMode = (payload.offlineMode || {}) as Record<string, unknown>;
        useRoutingStore.setState({
          localLoading: false,
          localLlm: {
            availableEndpointCount: n(payload.availableEndpointCount),
            totalModelCount: n(payload.totalModelCount),
            offlineReady: !!payload.offlineReady,
            offlineStatus: s(offlineMode.status),
            requestedBy: Array.isArray(offlineMode.requestedBy) ? offlineMode.requestedBy.map(String) : [],
            cloudProviderKeysPresent: Array.isArray(offlineMode.cloudProviderKeysPresent) ? offlineMode.cloudProviderKeysPresent.map(String) : [],
            endpoints: arr(payload.endpoints).map((endpoint) => ({
              name: s(endpoint.name),
              kind: s(endpoint.kind),
              status: s(endpoint.status),
              modelCount: n(endpoint.modelCount),
              baseUrl: s(endpoint.baseUrl),
              elapsedMs: n(endpoint.elapsedMs),
              error: s(endpoint.error)
            })),
            checks: arr(offlineMode.checks).map((check) => ({ name: s(check.name), status: s(check.status), message: s(check.message) })),
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
      }
    });
  }, []);
}

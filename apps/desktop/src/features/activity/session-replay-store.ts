import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRag } from "../middleware/rag-gateway";

export type SessionReplayQuery = {
  conversationId: string;
  runId: string;
  agentId: string;
  groupId: string;
  limit: string;
  includeText: boolean;
  includeTelemetry: boolean;
  includeAgentEvents: boolean;
};

export type SessionReplayEvent = {
  id: string;
  source: string;
  kind: string;
  severity: string;
  correlation: string;
  title: string;
  summary: string;
  bodyPreview: string;
  meta: string;
  provider: string;
  model: string;
  status: string;
  totalTokens: number;
  durationMs: number;
  timestampUtc: string;
};

export type SessionReplaySnapshot = {
  conversationId: string;
  runId: string;
  agentId: string;
  groupId: string;
  events: SessionReplayEvent[];
  summary: {
    eventCount: number;
    conversationMessageCount: number;
    telemetryEventCount: number;
    agentEventCount: number;
    errorCount: number;
    warningCount: number;
    totalTokens: number;
    firstEventUtc: string;
    lastEventUtc: string;
  };
  returnedEvents: number;
  totalEvents: number;
  snapshotUtc: string;
};

type SessionReplayState = {
  query: SessionReplayQuery;
  snapshot: SessionReplaySnapshot | null;
  loading: boolean;
  lastError: string;
  setQuery: (patch: Partial<SessionReplayQuery>) => void;
  run: () => void;
  clear: () => void;
};

const DEFAULT_QUERY: SessionReplayQuery = {
  conversationId: "",
  runId: "",
  agentId: "",
  groupId: "",
  limit: "120",
  includeText: false,
  includeTelemetry: true,
  includeAgentEvents: true
};

function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function n(value: unknown): number {
  return Number(value || 0);
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function clampLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 120;
  return Math.min(300, Math.max(20, parsed));
}

function normalizeSnapshot(payload: Record<string, unknown>): SessionReplaySnapshot {
  const summary = (payload.summary || {}) as Record<string, unknown>;
  return {
    conversationId: s(payload.conversationId),
    runId: s(payload.runId),
    agentId: s(payload.agentId),
    groupId: s(payload.groupId),
    events: arr(payload.events).map((event) => ({
      id: s(event.id),
      source: s(event.source),
      kind: s(event.kind),
      severity: s(event.severity),
      correlation: s(event.correlation),
      title: s(event.title || event.kind || event.source),
      summary: s(event.summary || event.meta),
      bodyPreview: s(event.body).slice(0, 280),
      meta: s(event.meta),
      provider: s(event.provider),
      model: s(event.model),
      status: s(event.status),
      totalTokens: n(event.totalTokens),
      durationMs: n(event.durationMs),
      timestampUtc: s(event.timestampUtc || event.startedUtc || event.completedUtc)
    })),
    summary: {
      eventCount: n(summary.eventCount),
      conversationMessageCount: n(summary.conversationMessageCount),
      telemetryEventCount: n(summary.telemetryEventCount),
      agentEventCount: n(summary.agentEventCount),
      errorCount: n(summary.errorCount),
      warningCount: n(summary.warningCount),
      totalTokens: n(summary.totalTokens),
      firstEventUtc: s(summary.firstEventUtc),
      lastEventUtc: s(summary.lastEventUtc)
    },
    returnedEvents: n(payload.returnedEvents),
    totalEvents: n(payload.totalEvents),
    snapshotUtc: s(payload.snapshotUtc)
  };
}

export const useSessionReplayStore = create<SessionReplayState>((set, get) => ({
  query: DEFAULT_QUERY,
  snapshot: null,
  loading: false,
  lastError: "",
  setQuery: (patch) => set((state) => ({ query: { ...state.query, ...patch } })),
  run: () => {
    const query = get().query;
    const identifiers = [query.conversationId, query.runId, query.agentId, query.groupId].map((value) => value.trim());
    if (!identifiers.some(Boolean)) {
      set({ lastError: "conversation, run, agent, group 중 하나 이상을 입력하세요." });
      return;
    }
    set({ loading: true, lastError: "" });
    const ok = requestDesktopRag.sessionReplay({
      conversationId: query.conversationId,
      runId: query.runId,
      agentId: query.agentId,
      groupId: query.groupId,
      limit: clampLimit(query.limit),
      includeText: query.includeText,
      includeTelemetry: query.includeTelemetry,
      includeAgentEvents: query.includeAgentEvents
    });
    if (!ok) set({ loading: false, lastError: "세션 리플레이 요청을 전송하지 못했다." });
  },
  clear: () => set({ snapshot: null, lastError: "", loading: false })
}));

export function useSessionReplayBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "session_replay_snapshot") {
        useSessionReplayStore.setState({
          loading: false,
          snapshot: normalizeSnapshot((message.payload || {}) as Record<string, unknown>),
          lastError: ""
        });
        return;
      }
      if (message.type === "session_replay_result") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        useSessionReplayStore.setState({
          loading: false,
          lastError: payload.ok === false ? s(payload.message) || "세션 리플레이 조회 실패" : ""
        });
      }
    });
  }, []);
}

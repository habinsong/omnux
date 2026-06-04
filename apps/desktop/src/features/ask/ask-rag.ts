import type { DesktopServerMessage } from "../middleware/desktop-message-gateway";

export type AskRagPreflight = {
  status: string;
  queryPreview: string;
  retrievalRecommended: boolean;
  primaryStrategy: string;
  signals: string[];
  candidates: Array<{ kind: string; priority: string; recommended: boolean; reason: string; suggestedRequestType: string }>;
  skipped: string[];
};

export type AskRagCandidate = AskRagPreflight["candidates"][number];

export type AskRagItem = {
  title: string;
  detail: string;
  badge: string;
  badges?: string[];
  path?: string;
  startLine?: number;
  endLine?: number;
};

export type AskRagExecution = {
  kind: string;
  requestType: string;
  status: string;
  loading: boolean;
  error: string;
  items: AskRagItem[];
};

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeRagPreflight(payload: Record<string, unknown>): AskRagPreflight {
  return {
    status: str(payload.status),
    queryPreview: str(payload.queryPreview),
    retrievalRecommended: !!payload.retrievalRecommended,
    primaryStrategy: str(payload.primaryStrategy),
    signals: Array.isArray(payload.signals) ? payload.signals.map(str) : [],
    candidates: records(payload.candidates).map((candidate) => ({
      kind: str(candidate.kind),
      priority: str(candidate.priority),
      recommended: !!candidate.recommended,
      reason: str(candidate.reason),
      suggestedRequestType: str(candidate.suggestedRequestType)
    })),
    skipped: Array.isArray(payload.skipped) ? payload.skipped.map(str) : []
  };
}

export function buildRagExecution(kind: string, requestType: string, loading = false): AskRagExecution {
  return { kind, requestType, status: loading ? "running" : "idle", loading, error: "", items: [] };
}

export function normalizeMemoryRagExecution(current: AskRagExecution, message: DesktopServerMessage): AskRagExecution {
  return {
    ...current,
    loading: false,
    status: String(message.error || "") ? "error" : "done",
    error: String(message.error || ""),
    items: records(message.results).slice(0, 6).map((item) => {
      const path = str(item.path || item.fullPath || item.noteName || "memory");
      const startLine = positiveNumber(item.startLine);
      const endLine = positiveNumber(item.endLine) || startLine;
      return {
        title: path,
        detail: str(item.snippet || item.excerpt || ""),
        badge: Number(item.score || 0).toFixed(2),
        badges: [
          str(item.memoryTier),
          str(item.source),
          startLine ? `L${startLine}-${endLine || startLine}` : ""
        ].filter(Boolean),
        path,
        startLine,
        endLine
      };
    })
  };
}

export function memoryGetWindowFromRagItem(item: AskRagItem): { path: string; fromLine?: number; lines?: number } {
  const path = String(item.path || item.title || "").trim();
  const fromLine = positiveNumber(item.startLine);
  const endLine = positiveNumber(item.endLine);
  if (!fromLine) return { path };
  const lines = endLine && endLine >= fromLine ? Math.min(160, endLine - fromLine + 1) : 80;
  return { path, fromLine, lines };
}

export function normalizeWebRagExecution(current: AskRagExecution, message: DesktopServerMessage): AskRagExecution {
  return {
    ...current,
    loading: false,
    status: String(message.error || "") ? "error" : "done",
    error: String(message.error || ""),
    items: records(message.results).slice(0, 6).map((item) => ({
      title: str(item.title || item.url || "web result"),
      detail: str(item.description || item.snippet || item.url),
      badge: str(message.provider || "web")
    }))
  };
}

export function normalizeRepomapRagExecution(current: AskRagExecution, payload: Record<string, unknown>): AskRagExecution {
  return {
    ...current,
    loading: false,
    status: str(payload.status || "done"),
    error: "",
    items: records(payload.files).slice(0, 6).map((file) => {
      const symbols = records(file.symbols);
      const first = symbols[0] || {};
      return {
        title: str(file.path || "file"),
        detail: first.name ? `${str(first.kind)} ${str(first.name)} · line ${Number(first.line || 0)}` : str(file.language || ""),
        badge: String(file.symbolCount || symbols.length || 0)
      };
    })
  };
}

export function normalizeSessionReplayRagExecution(current: AskRagExecution, payload: Record<string, unknown>): AskRagExecution {
  return {
    ...current,
    loading: false,
    status: "done",
    error: "",
    items: records(payload.events).slice(0, 6).map((event) => ({
      title: str(event.title || event.kind || "event"),
      detail: str(event.summary || event.meta || event.source),
      badge: str(event.severity || event.source || "event")
    }))
  };
}

export function normalizeSessionReplayResultExecution(current: AskRagExecution, payload: Record<string, unknown>): AskRagExecution {
  return {
    ...current,
    loading: false,
    status: payload.ok === false ? "error" : "done",
    error: str(payload.message),
    items: []
  };
}

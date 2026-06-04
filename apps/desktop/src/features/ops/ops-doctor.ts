export type DoctorCheck = {
  id: string;
  status: string;
  summary: string;
  detail: string;
  suggestedActions: string[];
};

export type DoctorReport = {
  reportId: string;
  createdAtUtc: string;
  okCount: number;
  warnCount: number;
  failCount: number;
  skipCount: number;
  status: string;
  checks: DoctorCheck[];
};

export type DoctorResultPayload = {
  found?: boolean;
  report?: Record<string, unknown> | null;
};

export type DoctorFixAction = {
  actionId: string;
  kind: string;
  target: string;
  description: string;
  autoApply: boolean;
  status: string;
  error: string;
};

export type DoctorFixResult = {
  action: string;
  ok: boolean;
  message: string;
  previewId: string;
  error: string;
  actions: DoctorFixAction[];
};

export type DesktopDoctorSnapshot = {
  loading: boolean;
  running: boolean;
  fixPreviewing: boolean;
  fixApplying: boolean;
  found: boolean | null;
  report: DoctorReport | null;
  fixResult: DoctorFixResult | null;
  lastError: string | null;
  lastAction: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
}

function deriveStatus(report: Pick<DoctorReport, "failCount" | "warnCount">): string {
  if (report.failCount > 0) return "fail";
  if (report.warnCount > 0) return "warn";
  return "ok";
}

export function normalizeDoctorReport(value: unknown): DoctorReport | null {
  const report = asRecord(value);
  if (!Object.keys(report).length) return null;
  const normalized = {
    reportId: text(report.reportId),
    createdAtUtc: text(report.createdAtUtc),
    okCount: count(report.okCount),
    warnCount: count(report.warnCount),
    failCount: count(report.failCount),
    skipCount: count(report.skipCount),
    status: "",
    checks: records(report.checks).map((check) => ({
      id: text(check.id),
      status: text(check.status).toLowerCase(),
      summary: text(check.summary),
      detail: text(check.detail),
      suggestedActions: Array.isArray(check.suggestedActions) ? check.suggestedActions.map(String).filter(Boolean) : []
    }))
  };
  return { ...normalized, status: deriveStatus(normalized) };
}

export function normalizeDoctorFixResult(message: Record<string, unknown>): DoctorFixResult {
  return {
    action: text(message.action),
    ok: message.ok === true,
    message: text(message.message),
    previewId: text(message.previewId),
    error: text(message.error),
    actions: records(message.actions).map((action) => ({
      actionId: text(action.actionId),
      kind: text(action.kind),
      target: text(action.target),
      description: text(action.description),
      autoApply: action.autoApply === true,
      status: text(action.status) || "pending",
      error: text(action.error)
    }))
  };
}

export function formatDoctorTime(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function summarizeDoctorReport(report: DoctorReport | null, found: boolean | null): string {
  if (report) return `ok=${report.okCount} warn=${report.warnCount} fail=${report.failCount} skip=${report.skipCount}`;
  return found ? "Doctor 보고서를 읽었지만 표시할 체크가 없습니다." : "저장된 Doctor 보고서가 없습니다.";
}

export type AutomationForm = {
  title: string; request: string; kind: "daily" | "weekly" | "monthly"; time: string; weekdays: number[]; day: number; timezone: string;
  execution: string; telegram: boolean; notify: string; retries: number; retryDelay: number;
  agentModel: string; startUrl: string; timeout: number; toolProfile: string; playwright: boolean;
  /** 이 자동화의 LLM 작업을 맡을 제공자/모델. 비우면 자동 선택. */
  llmProvider: string; llmModel: string; reasoning: string; context: string;
};
export type RunEntry = { timestamp: number; time: string; status: string; summary: string; error: string; duration: string };
export type Automation = {
  id: string; title: string; request: string; enabled: boolean; running: boolean; next: string; last: string; status: string;
  schedule: string; form: AutomationForm; runs: RunEntry[]; output: string; qualityWarnings: string[]; script: string;
};
export type Preview = { schedule: string; timezone: string; route: string; warnings: string[] };
export type RunDetail = { id: string; timestamp: number; title: string; status: string; content: string; raw: string; error: string; time: string; artifact: string; url: string; downloads: string[] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export const string = (value: unknown) => typeof value === "string" ? value : "";
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown) => array(value).map(string).filter(Boolean);
export const statusLabel = (value: string) => ({ ok: "완료", success: "완료", completed: "완료", error: "오류", failed: "실패", running: "실행 중", skipped: "건너뜀", canceled: "중단됨", cancelled: "중단됨", blocked: "실행 제한", created: "준비됨", updated: "수정됨" } as Record<string, string>)[value.toLowerCase()] || value || "실행 전";
export function emptyAutomationForm(): AutomationForm {
  return { title: "", request: "", kind: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5], day: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul", execution: "", telegram: false, notify: "on_change", retries: 1, retryDelay: 15, agentModel: "", startUrl: "", timeout: 120, toolProfile: "", playwright: true, llmProvider: "", llmModel: "", reasoning: "auto", context: "standard" };
}
function dateTimeLabel(timestamp: unknown, timezone: unknown, fallback: unknown, fullDate = false): string {
  try {
    if (typeof timestamp === "number") return new Intl.DateTimeFormat("ko-KR", { timeZone: string(timezone) || undefined, ...(fullDate ? { year: "numeric" as const } : {}), month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
  } catch { /* 이전에 저장된 잘못된 시간대는 서버 표시값으로 읽는다. */ }
  return string(fallback);
}
export function parseAutomation(value: unknown): Automation {
  const row = object(value);
  const kind = string(row.scheduleKind);
  return {
    id: string(row.id), title: string(row.title), request: string(row.request), enabled: row.enabled === true, running: row.running === true,
    next: dateTimeLabel(row.nextRunAtMs, row.timezoneId, row.nextRunLocal), last: string(row.lastRunLocal), status: string(row.lastStatus), schedule: string(row.scheduleText), output: string(row.lastOutput), qualityWarnings: strings(row.qualityWarnings), script: string(row.scriptPath),
    form: { title: string(row.title), request: string(row.request), kind: kind === "weekly" || kind === "monthly" ? kind : "daily", time: string(row.timeOfDay) || "09:00", weekdays: array(row.weekdays).map(Number), day: Number(row.dayOfMonth) || 1, timezone: string(row.timezoneId) || emptyAutomationForm().timezone, execution: string(row.executionMode), telegram: row.notifyTelegram === true, notify: string(row.notifyPolicy) || "on_change", retries: Number(row.maxRetries) || 0, retryDelay: Number(row.retryDelaySeconds) || 0, agentModel: string(row.agentModel), startUrl: string(row.agentStartUrl), timeout: Number(row.agentTimeoutSeconds) || 120, toolProfile: string(row.agentToolProfile), playwright: row.agentUsePlaywright !== false, llmProvider: string(row.llmProvider), llmModel: string(row.llmModel), reasoning: string(row.reasoningEffort) || "auto", context: string(row.contextBudget) || "standard" },
    runs: array(row.runs).map(value => { const run = object(value); return { timestamp: Number(run.ts), time: dateTimeLabel(run.ts, row.timezoneId, run.runAtLocal, true), status: string(run.status), summary: string(run.summary), error: string(run.error), duration: string(run.durationText) }; }).filter(run => Number.isFinite(run.timestamp)).sort((a, b) => b.timestamp - a.timestamp)
  };
}
export function parsePreview(value: unknown): Preview {
  const row = object(value); return { schedule: string(row.scheduleText), timezone: string(row.timezoneId), route: string(row.resolvedExecutionMode), warnings: strings(row.warnings) };
}
export function parseRunDetail(value: unknown): RunDetail {
  const row = object(value); return { id: string(row.routineId), timestamp: Number(row.ts), title: string(row.title), status: string(row.status), content: typeof row.output === "string" ? row.output : string(row.content), raw: string(row.content), error: string(row.error), time: string(row.runAtLocal), artifact: string(row.artifactPath), url: string(row.finalUrl), downloads: strings(row.downloadPaths) };
}
export function formError(form: AutomationForm): string | null {
  if (form.request.trim().length < 5) return "자동으로 할 일을 5자 이상 적어 주세요.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) return "실행 시간을 확인해 주세요.";
  if (form.kind === "weekly" && !form.weekdays.length) return "실행할 요일을 한 개 이상 선택해 주세요.";
  if (form.kind === "monthly" && (!Number.isInteger(form.day) || form.day < 1 || form.day > 31)) return "날짜는 1일부터 31일 사이로 입력해 주세요.";
  try { new Intl.DateTimeFormat("ko-KR", { timeZone: form.timezone }); } catch { return "시간대 이름을 확인해 주세요."; }
  if (form.execution === "browser_agent" && !form.agentModel) return "브라우저 실행에 사용할 모델을 선택해 주세요.";
  return null;
}
export function automationPayload(form: AutomationForm) {
  return { title: form.title.trim() || undefined, text: form.request.trim(), scheduleSourceMode: "manual", scheduleKind: form.kind, scheduleTime: form.time, weekdays: form.kind === "weekly" ? form.weekdays : undefined, dayOfMonth: form.kind === "monthly" ? form.day : undefined, timezoneId: form.timezone, executionMode: form.execution, notifyTelegram: form.telegram, notifyPolicy: form.notify, maxRetries: form.retries, retryDelaySeconds: form.retryDelay, runImmediately: false,
    provider: form.llmProvider || undefined, model: form.llmModel || undefined,
    reasoningEffort: form.reasoning === "auto" ? undefined : form.reasoning, contextBudget: form.context,
    ...(form.execution === "browser_agent" ? { agentProvider: "codex", agentModel: form.agentModel, agentStartUrl: form.startUrl || undefined, agentTimeoutSeconds: form.timeout, agentToolProfile: form.toolProfile || undefined, agentUsePlaywright: form.playwright } : {}) };
}

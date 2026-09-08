import { PROVIDER_KEYS, PROVIDER_LABEL, STATIC_MODEL_OPTIONS } from "../ask/model-registry";

export type BuildMode = "single" | "orchestration" | "multi";
export type ModelProvider = typeof PROVIDER_KEYS[number];
export type BuildProvider = ModelProvider | "auto";
export const providers = [{ value: "auto" as BuildProvider, label: "자동 선택" }, ...PROVIDER_KEYS.map(value => ({ value, label: PROVIDER_LABEL[value] }))];
export const modeNames: Record<BuildMode, string> = { single: "한 모델로 만들기", orchestration: "여러 모델과 함께 만들기", multi: "결과 비교하기" };
export const modelOptions = (provider: BuildProvider, catalogs: Partial<Record<ModelProvider, string[]>>) => provider === "auto" ? [] : catalogs[provider]?.length ? catalogs[provider]! : STATIC_MODEL_OPTIONS[provider] || [];
export type Attachment = { name: string; mimeType: string; sizeBytes: number; dataBase64: string; isImage: boolean };
export type Settings = { mode: BuildMode; provider: BuildProvider; models: Record<ModelProvider, string>; workers: Record<ModelProvider, string>; language: string; webSearch: boolean; think: boolean; title: string; project: string; projectKey: string; projectPath: string; memory: string[]; skill: string };
export type Execution = { language: string; runDirectory: string; entryFile: string; command: string; exitCode: number | null; status: string; stdout: string; stderr: string; rawOut: string; rawError: string };
export type Worker = { provider: string; model: string; summary: string; execution: Execution; changedFiles: string[] };
export type CodingResult = {
  mode: BuildMode; conversationId: string; provider: string; model: string; language: string; summary: string; commonSummary: string;
  resumeInput: string; resumeModels: Partial<Record<ModelProvider, string>>; execution: Execution; workers: Worker[]; changedFiles: string[];
  retryRequired: boolean; retryAction: string; retryScope: string; retryReason: string; retryAttempt: number; retryMaxAttempts: number; retryStopReason: string;
  citationValidationPassed: boolean | null; citationValidationReason: string; raw: Record<string, unknown>;
};
export type Runtime = { target: string; conversationId: string; ok: boolean; message: string; previewUrl: string; targetProvider: string; targetModel: string; execution: Execution | null };
export type Conversation = { id: string; title: string; mode: BuildMode; updated: string; preview: string; project: string; projectKey: string; projectPath: string; messages: Array<{ role: string; text: string }>; result: CodingResult | null; memory: string[] };
export type FileView = { path: string; url: string; kind: "text" | "image" | "page"; content: string; loading: boolean; error: string; truncated: boolean };
export const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export const text = (value: unknown) => typeof value === "string" ? value : "";
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const strings = (value: unknown) => list(value).map(text).filter(Boolean);
export const mode = (value: unknown): BuildMode => value === "multi" || value === "orchestration" ? value : "single";
export const statusName = (status: string) => ({ ok: "실행 완료", saved: "파일 저장됨", skipped: "실행하지 않음", error: "실행 실패", failed: "실패", timeout: "시간 초과", blocked: "실행 제한", incomplete: "작업 미완료", cancelled: "중단됨", canceled: "중단됨", running: "실행 중" } as Record<string, string>)[status] || status || "실행 전";
export function initialSettings(): Settings {
  return { mode: "single", provider: "auto", models: Object.fromEntries(PROVIDER_KEYS.map(provider => [provider, STATIC_MODEL_OPTIONS[provider]?.[0] || ""])) as Record<ModelProvider, string>, workers: Object.fromEntries(PROVIDER_KEYS.map(provider => [provider, "none"])) as Record<ModelProvider, string>, language: "auto", webSearch: false, think: false, title: "", project: "", projectKey: "", projectPath: "", memory: [], skill: "" };
}
export function execution(value: unknown): Execution {
  const row = object(value);
  const status = text(row.status).toLowerCase();
  const rawOut = text(row.stdOut) || text(row.stdout), rawError = text(row.stdErr) || text(row.stderr);
  return { language: text(row.language), runDirectory: text(row.runDirectory), entryFile: text(row.entryFile), command: text(row.command), exitCode: ["incomplete", "cancelled", "canceled"].includes(status) || typeof row.exitCode !== "number" ? null : row.exitCode, status, stdout: typeof row.programStdOut === "string" ? row.programStdOut : rawOut, stderr: typeof row.programStdErr === "string" ? row.programStdErr : rawError, rawOut, rawError };
}
export function codingResult(value: unknown): CodingResult | null {
  const row = object(value);
  if (!row.execution && !row.conversationId) return null;
  return { mode: mode(row.mode), conversationId: text(row.conversationId), provider: text(row.provider), model: text(row.model), language: text(row.language), summary: text(row.summary), commonSummary: text(row.commonSummary), resumeInput: text(row.resumeInput), resumeModels: Object.fromEntries(Object.entries(object(row.resumeModels)).filter(([key, value]) => PROVIDER_KEYS.includes(key as ModelProvider) && typeof value === "string")), execution: execution(row.execution), changedFiles: strings(row.changedFiles), workers: list(row.workers).map(value => { const worker = object(value); return { provider: text(worker.provider), model: text(worker.model), summary: text(worker.summary), execution: execution(worker.execution), changedFiles: strings(worker.changedFiles) }; }), retryRequired: row.retryRequired === true, retryAction: text(row.retryAction), retryScope: text(row.retryScope), retryReason: text(row.retryReason), retryAttempt: Number(row.retryAttempt) || 0, retryMaxAttempts: Number(row.retryMaxAttempts) || 0, retryStopReason: text(row.retryStopReason), citationValidationPassed: typeof object(row.citationValidation).passed === "boolean" ? object(row.citationValidation).passed as boolean : null, citationValidationReason: text(object(row.citationValidation).reasonCode), raw: row };
}
export function conversation(value: unknown, fallbackMode?: BuildMode): Conversation {
  const row = object(value);
  return { id: text(row.id), title: text(row.title), mode: mode(row.mode || fallbackMode), updated: text(row.updatedUtc), preview: text(row.preview), project: text(row.project), projectKey: text(object(row.codingProject).key), projectPath: text(object(row.codingProject).path), memory: strings(row.linkedMemoryNotes), result: codingResult(row.latestCodingResult), messages: list(row.messages).map(value => { const item = object(value); return { role: text(item.role), text: text(item.text) }; }) };
}
export function selectedResult(result: CodingResult | null, target: string) {
  if (!result) return null;
  if (target === "main") return { provider: result.provider, model: result.model, summary: result.summary || result.commonSummary, execution: result.execution, changedFiles: result.changedFiles };
  return result.workers[Number(target.replace("worker-", ""))] || null;
}
export function relativeFile(path: string, directory: string): string {
  const value = path.replace(/\\/g, "/"), root = directory.replace(/\\/g, "/").replace(/\/+$/, "");
  const windows = /^[A-Za-z]:\//.test(value);
  const within = windows ? value.toLowerCase().startsWith(root.toLowerCase() + "/") : value.startsWith(root + "/");
  const relative = root && within ? value.slice(root.length + 1) : value;
  if (/^(?:\/|[A-Za-z]:\/)/.test(relative) || relative.split("/").some(part => part === ".." || part === ".") || relative === "-") return "";
  return relative;
}

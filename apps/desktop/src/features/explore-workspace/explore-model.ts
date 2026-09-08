export type Payload = Record<string, unknown>;
export const record = (value: unknown): Payload => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
export const text = (value: unknown) => typeof value === "string" ? value : "";
export const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : [];
export function number(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
export function externalUrl(value: unknown) {
  try { const url = new URL(text(value)); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
export type Frame = { url: string; width: number; height: number; capturedAt: number };
export function readFrame(value: unknown): Frame | null {
  const image = record(value), url = text(image.dataUrl);
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url) ? { url, width: number(image.width), height: number(image.height), capturedAt: number(image.updatedAtMs) } : null;
}
export function statusLabel(value: string) {
  return ({ accepted: "접수됨", queued: "실행 대기", running: "실행 중", completed: "완료", ok: "완료", error: "실패", blocked: "실행할 수 없음", ready: "준비됨", stopped: "중지됨" } as Record<string, string>)[value] || value;
}

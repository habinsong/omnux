export type ProjectItem = {
  projectKey: string; name: string; path: string; description: string; color: string; isMain: boolean;
  runs: number; automations: number; lastOpenedUtc: string; updatedAtUtc: string;
};
export type ProjectDraft = { name: string; path: string; description: string; color: string };
export const projectColors = [{ value: "#2563EB", name: "파랑" }, { value: "#16A34A", name: "초록" }, { value: "#7C3AED", name: "보라" }, { value: "#D97706", name: "주황" }, { value: "#0891B2", name: "청록" }, { value: "#DC2626", name: "빨강" }];
export const emptyProjectDraft = (): ProjectDraft => ({ name: "", path: "", description: "", color: "#2563EB" });
export const projectRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const projectText = (value: unknown) => typeof value === "string" ? value : "";
export function readProject(value: unknown): ProjectItem {
  const row = projectRecord(value);
  return { projectKey: projectText(row.projectKey), name: projectText(row.name) || "이름 없는 프로젝트", path: projectText(row.path), description: projectText(row.description), color: /^#[a-f0-9]{6}$/i.test(projectText(row.color)) ? projectText(row.color) : "#2563EB", isMain: row.isMain === true, runs: Number(row.runs) || 0, automations: Number(row.automations) || 0, lastOpenedUtc: projectText(row.lastOpenedUtc), updatedAtUtc: projectText(row.updatedAtUtc) };
}
export function projectDraft(item: ProjectItem): ProjectDraft { return { name: item.name, path: item.path, description: item.description, color: item.color }; }
export function projectDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }); }

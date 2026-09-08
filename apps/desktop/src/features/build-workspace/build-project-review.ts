import { list, object, text } from "./build-model";

export type ProjectChoice = { key: string; name: string; path: string };
export type ProjectReview = { id: string; conversationId: string; target: string; name: string; path: string; files: Array<{ path: string; kind: string; diff: string; conflict: string; truncated: boolean }> };
export function projectChoice(value: unknown): ProjectChoice {
  const row=object(value);return {key:text(row.projectKey),name:text(row.name),path:text(row.path)};
}
export function projectReview(value: unknown): ProjectReview {
  const row=object(value), project=object(row.project);
  return {id:text(row.id),conversationId:text(row.conversationId),target:text(row.target),name:text(project.name),path:text(project.path),files:list(row.files).map(value=>{const file=object(value);return {path:text(file.path),kind:text(file.kind),diff:text(file.diff),conflict:text(file.conflict),truncated:file.truncated===true};})};
}

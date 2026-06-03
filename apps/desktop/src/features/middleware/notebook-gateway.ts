import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// AI 컨텍스트 노트북 & 핸드오프 (backend_hidden_features #6, 옛 omninode-dashboard ws-notebooks).
registerDesktopRequestTypes("notebook_get", "notebook_append", "handoff_create");

export type NotebookKind = "learning" | "decision" | "verification";

export const requestDesktopNotebook = {
  get(projectKey?: string) {
    return sendDesktopRequest({ type: "notebook_get", projectKey: projectKey?.trim() || undefined });
  },
  append(kind: NotebookKind, content: string, projectKey?: string) {
    return sendDesktopRequest({
      type: "notebook_append",
      kind,
      content,
      projectKey: projectKey?.trim() || undefined,
      source: "desktop",
      tags: []
    });
  },
  createHandoff(projectKey?: string) {
    return sendDesktopRequest({ type: "handoff_create", projectKey: projectKey?.trim() || undefined });
  }
};

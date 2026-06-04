import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// AI 컨텍스트 노트북 & 핸드오프 (backend_hidden_features #6, 정적 대시보드 ws-notebooks 흐름).
registerDesktopRequestTypes("notebook_get", "notebook_append", "handoff_create");

export type NotebookKind = "learning" | "decision" | "verification";

export const requestDesktopNotebook = {
  get(projectKey?: string) {
    return sendDesktopRequest({ type: "notebook_get", projectKey: projectKey?.trim() || undefined });
  },
  append(
    kind: NotebookKind,
    content: string,
    projectKey?: string,
    meta: { source?: string; conversationId?: string | null; provider?: string; model?: string; tags?: string[] } = {}
  ) {
    return sendDesktopRequest({
      type: "notebook_append",
      kind,
      text: content,
      content,
      projectKey: projectKey?.trim() || undefined,
      source: meta.source?.trim() || "desktop",
      conversationId: meta.conversationId?.trim() || undefined,
      provider: meta.provider?.trim() || undefined,
      model: meta.model?.trim() || undefined,
      tags: Array.isArray(meta.tags) ? meta.tags : []
    });
  },
  createHandoff(projectKey?: string) {
    return sendDesktopRequest({ type: "handoff_create", projectKey: projectKey?.trim() || undefined });
  }
};

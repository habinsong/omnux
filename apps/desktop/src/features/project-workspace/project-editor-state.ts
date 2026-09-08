import { create } from "zustand";
import { projectRequestId, sendProjectCommand, type ProjectCommand } from "../middleware/project-workspace-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import { emptyProjectDraft, projectDraft, type ProjectDraft, type ProjectItem } from "./project-model";

export type ProjectMutation = { id: string; kind: "create" | "update" | "main" | "delete"; key: string; draft?: ProjectDraft };
type ProjectEditor = {
  editing: boolean; editingKey: string; draft: ProjectDraft; original: ProjectDraft; expandedKey: string;
  pending: ProjectMutation | null; error: string; notice: string;
  patch: (patch: Partial<ProjectDraft>) => void;
  open: (project?: ProjectItem) => Promise<void>;
  close: () => Promise<void>;
  save: () => void;
  makeMain: (project: ProjectItem) => void;
  remove: (project: ProjectItem) => Promise<void>;
};
export const useProjectEditor = create<ProjectEditor>((set, get) => {
  const discard = async () => !get().editing || JSON.stringify(get().draft) === JSON.stringify(get().original) || await requestConfirmDialog({ title: "작성 중인 내용 닫기", message: "저장하지 않은 내용을 비울까요?", confirmLabel: "내용 비우기" });
  const send = (kind: ProjectMutation["kind"], type: ProjectCommand, key: string, fields: Record<string, unknown>, draft?: ProjectDraft) => {
    if (get().pending) return;
    const id = projectRequestId();
    set({ pending: { id, kind, key, draft }, error: "", notice: "" });
    if (!sendProjectCommand(type, id, fields)) set({ pending: null, error: "요청을 보내지 못했습니다. 작성한 내용은 유지됩니다." });
  };
  return {
    editing: false, editingKey: "", draft: emptyProjectDraft(), original: emptyProjectDraft(), expandedKey: "", pending: null, error: "", notice: "",
    patch: patch => set(state => ({ draft: { ...state.draft, ...patch } })),
    open: async project => {
      if (get().pending || !await discard()) return;
      const draft = project ? projectDraft(project) : emptyProjectDraft();
      set({ editing: true, editingKey: project?.projectKey || "", draft, original: { ...draft }, error: "", notice: "" });
    },
    close: async () => { if (!get().pending && await discard()) set({ editing: false, error: "" }); },
    save: () => {
      const state = get(), draft = state.draft;
      if (!draft.path.trim()) { set({ error: "작업할 폴더를 선택하거나 경로를 입력해 주세요." }); return; }
      send(state.editingKey ? "update" : "create", state.editingKey ? "project_update" : "project_create", state.editingKey, {
        projectKey: state.editingKey || undefined, title: draft.name.trim(), filePath: draft.path.trim(), message: draft.description.trim(), category: draft.color
      }, { ...draft });
    },
    makeMain: project => send("main", "project_update", project.projectKey, { projectKey: project.projectKey, enabled: true }),
    remove: async project => {
      if (get().pending) return;
      const confirmed = await requestConfirmDialog({ title: "프로젝트 등록 해제", message: `‘${project.name}’ 등록을 해제할까요? 폴더와 파일은 그대로 남습니다.`, confirmLabel: "등록 해제", tone: "danger" });
      if (confirmed) send("delete", "project_delete", project.projectKey, { projectKey: project.projectKey });
    }
  };
});

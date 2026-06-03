import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopProjects,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

export type ProjectItem = {
  projectKey: string;
  name: string;
  path: string;
  description: string;
  color: string;
  isMain: boolean;
  runs: number;
  automations: number;
  lastOpenedUtc: string;
  updatedAtUtc: string;
};

type ProjectForm = {
  name: string;
  path: string;
  description: string;
  color: string;
};

type ProjectsState = {
  projects: ProjectItem[];
  selectedProjectKey: string;
  form: ProjectForm;
  loading: boolean;
  pending: boolean;
  lastMessage: string;
  lastError: string;
  setFormValue: (key: keyof ProjectForm, value: string) => void;
  selectProject: (project: ProjectItem) => void;
  resetForm: () => void;
  loadProjects: () => void;
  createProject: () => void;
  updateSelectedProject: (makeMain?: boolean) => void;
  deleteSelectedProject: () => void;
  touchProject: (project: ProjectItem) => void;
};

const EMPTY_FORM: ProjectForm = {
  name: "",
  path: "",
  description: "",
  color: "#2563EB"
};

function normalizeProject(item: unknown): ProjectItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    projectKey: String(payload.projectKey || ""),
    name: String(payload.name || "Project"),
    path: String(payload.path || ""),
    description: String(payload.description || "등록된 로컬 프로젝트"),
    color: String(payload.color || "#2563EB"),
    isMain: !!payload.isMain,
    runs: Number(payload.runs || 0),
    automations: Number(payload.automations || 0),
    lastOpenedUtc: String(payload.lastOpenedUtc || ""),
    updatedAtUtc: String(payload.updatedAtUtc || "")
  };
}

function formFromProject(project: ProjectItem): ProjectForm {
  return {
    name: project.name,
    path: project.path,
    description: project.description,
    color: project.color || EMPTY_FORM.color
  };
}

export const PROJECT_COLORS = ["#2563EB", "#16A34A", "#7C3AED", "#D97706", "#0891B2", "#DC2626"];

export function projectToneClass(color: string) {
  const index = PROJECT_COLORS.findIndex((item) => item.toLowerCase() === color.toLowerCase());
  return `project-tone-${index >= 0 ? index : 0}`;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  selectedProjectKey: "",
  form: { ...EMPTY_FORM },
  loading: false,
  pending: false,
  lastMessage: "",
  lastError: "",
  setFormValue: (key, value) =>
    set((state) => ({
      form: {
        ...state.form,
        [key]: value
      }
    })),
  selectProject: (project) => set({ selectedProjectKey: project.projectKey, form: formFromProject(project), lastError: "" }),
  resetForm: () => set({ selectedProjectKey: "", form: { ...EMPTY_FORM }, lastError: "" }),
  loadProjects: () => {
    set({ loading: true, lastError: "" });
    if (!requestDesktopProjects.listProjects()) {
      set({ loading: false, lastError: "프로젝트 목록 요청을 전송하지 못했다." });
    }
  },
  createProject: () => {
    const form = get().form;
    if (!form.path.trim()) {
      set({ lastError: "등록할 로컬 폴더 경로가 필요하다." });
      return;
    }
    set({ pending: true, lastError: "" });
    if (!requestDesktopProjects.createProject(form.name, form.path, form.description, form.color)) {
      set({ pending: false, lastError: "프로젝트 등록 요청을 전송하지 못했다." });
    }
  },
  updateSelectedProject: (makeMain = false) => {
    const projectKey = get().selectedProjectKey.trim();
    if (!projectKey) {
      set({ lastError: "수정할 프로젝트를 선택해야 한다." });
      return;
    }
    const form = get().form;
    set({ pending: true, lastError: "" });
    if (!requestDesktopProjects.updateProject(projectKey, form.name, form.path, form.description, form.color, makeMain)) {
      set({ pending: false, lastError: "프로젝트 수정 요청을 전송하지 못했다." });
    }
  },
  deleteSelectedProject: async () => {
    const projectKey = get().selectedProjectKey.trim();
    if (!projectKey) {
      set({ lastError: "삭제할 프로젝트를 선택해야 한다." });
      return;
    }
    const selected = get().projects.find((item) => item.projectKey === projectKey);
    const confirmed = await requestConfirmDialog({
      title: "프로젝트 삭제",
      message: `"${selected?.name || projectKey}" 프로젝트 등록을 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }
    set({ pending: true, lastError: "" });
    if (!requestDesktopProjects.deleteProject(projectKey)) {
      set({ pending: false, lastError: "프로젝트 삭제 요청을 전송하지 못했다." });
    }
  },
  touchProject: (project) => {
    if (!project.projectKey) {
      return;
    }
    set({ selectedProjectKey: project.projectKey, form: formFromProject(project), lastError: "" });
    if (!requestDesktopProjects.touchProject(project.projectKey)) {
      set({ lastError: "프로젝트 사용 시간 갱신 요청을 전송하지 못했다." });
    }
  }
}));

export function useProjectsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "projects_state") {
        const items = Array.isArray(message.items) ? message.items.map(normalizeProject).filter((item) => item.projectKey) : [];
        const selectedProjectKey = useProjectsStore.getState().selectedProjectKey;
        const selected = items.find((item) => item.projectKey === selectedProjectKey);
        useProjectsStore.setState({
          projects: items,
          form: selected ? formFromProject(selected) : useProjectsStore.getState().form,
          loading: false
        });
        return;
      }

      if (message.type === "project_result") {
        const ok = message.ok !== false;
        const item = message.item ? normalizeProject(message.item) : null;
        useProjectsStore.setState({
          selectedProjectKey: item?.projectKey || (ok ? useProjectsStore.getState().selectedProjectKey : useProjectsStore.getState().selectedProjectKey),
          form: item ? formFromProject(item) : useProjectsStore.getState().form,
          pending: false,
          lastMessage: String(message.message || message.action || ""),
          lastError: ok ? "" : String(message.message || "프로젝트 작업이 실패했다.")
        });
        return;
      }

      if (message.type === "error") {
        useProjectsStore.setState({ loading: false, pending: false, lastError: String(message.message || "오류") });
      }
    });
  }, []);
}

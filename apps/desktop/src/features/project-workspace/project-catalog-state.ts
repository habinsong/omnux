import { create } from "zustand";
import { projectRequestId, sendProjectCommand } from "../middleware/project-workspace-gateway";
import { readProject, type ProjectItem } from "./project-model";

type ProjectCatalog = {
  projects: ProjectItem[]; loading: boolean; loaded: boolean; error: string; listRequest: string; touchRequests: string[];
  loadProjects: () => void; touchProject: (project: ProjectItem) => void;
};
export const useProjectCatalog = create<ProjectCatalog>((set, get) => ({
  projects: [], loading: false, loaded: false, error: "", listRequest: "", touchRequests: [],
  loadProjects: () => {
    if (get().loading) return;
    const id = projectRequestId();
    set({ loading: true, listRequest: id, error: "" });
    if (!sendProjectCommand("projects_list", id)) set({ loading: false, listRequest: "", error: "프로젝트 목록을 요청하지 못했습니다." });
  },
  touchProject: project => {
    const id = projectRequestId();
    set(state => ({ touchRequests: [...state.touchRequests, id] }));
    if (!sendProjectCommand("project_touch", id, { projectKey: project.projectKey })) set(state => ({ touchRequests: state.touchRequests.filter(value => value !== id), error: "최근 사용 시간을 갱신하지 못했습니다." }));
  }
}));

export function setProjectCatalog(items: unknown) {
  const projects = Array.isArray(items) ? items.map(readProject).filter(item => item.projectKey) : [];
  useProjectCatalog.setState({ projects, loaded: true });
}
export function updateProjectCatalog(item: ProjectItem, removed = false) {
  useProjectCatalog.setState(state => {
    const existing = state.projects.filter(project => project.projectKey !== item.projectKey);
    const projects = removed ? existing : [...existing.map(project => item.isMain ? { ...project, isMain: false } : project), item];
    return { projects, loaded: true };
  });
}

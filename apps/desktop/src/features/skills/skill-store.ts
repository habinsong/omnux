import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopSkill, type SkillScope } from "../middleware/skill-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

type SkillItem = { name: string; scope: SkillScope; description: string };
type SkillEditor = { name: string; scope: SkillScope; description: string; body: string; isNew: boolean };
type SkillStatus = { kind: "ok" | "error"; message: string } | null;

type SkillState = {
  skills: SkillItem[];
  loading: boolean;
  editor: SkillEditor | null;
  selectedKey: string;
  status: SkillStatus;
  load: () => void;
  newSkill: () => void;
  openSkill: (item: SkillItem) => void;
  patchEditor: (patch: Partial<SkillEditor>) => void;
  saveEditor: () => void;
  deleteSkill: (item: SkillItem) => void;
};

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  editor: null,
  selectedKey: "",
  status: null,
  load: () => {
    set({ loading: true });
    if (!requestDesktopSkill.list()) set({ loading: false, status: { kind: "error", message: "스킬 목록 요청을 전송하지 못했다." } });
  },
  newSkill: () => set({ editor: { name: "", scope: "project", description: "", body: "", isNew: true }, selectedKey: "", status: null }),
  openSkill: (item) => {
    set({ selectedKey: `${item.scope}:${item.name}` });
    if (!requestDesktopSkill.get(item.name, item.scope)) set({ status: { kind: "error", message: "스킬 조회 요청을 전송하지 못했다." } });
  },
  patchEditor: (patch) => set((state) => (state.editor ? { editor: { ...state.editor, ...patch } } : {})),
  saveEditor: () => {
    const editor = get().editor;
    if (!editor || !editor.name.trim()) {
      set({ status: { kind: "error", message: "스킬 이름을 입력하세요." } });
      return;
    }
    if (!requestDesktopSkill.save({ name: editor.name, scope: editor.scope, description: editor.description, body: editor.body, allowOverwrite: !editor.isNew })) {
      set({ status: { kind: "error", message: "스킬 저장 요청을 전송하지 못했다." } });
    }
  },
  deleteSkill: async (item) => {
    const confirmed = await requestConfirmDialog({
      title: "스킬 삭제",
      message: `'${item.name}' (${item.scope}) 스킬을 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSkill.remove(item.name, item.scope)) set({ status: { kind: "error", message: "스킬 삭제 요청을 전송하지 못했다." } });
  }
}));

function p(message: DesktopServerMessage): Record<string, unknown> {
  return (message.payload || message) as Record<string, unknown>;
}
function bool(value: unknown): boolean {
  return value !== false;
}

export function useSkillPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "skills_list_result") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        const items = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [];
        useSkillStore.setState({
          loading: false,
          skills: items.map((i) => ({ name: String(i.name || i.Name || ""), scope: (String(i.scope || i.Scope || "project") as SkillScope), description: String(i.description || i.Description || "") }))
        });
        return;
      }
      if (message.type === "skill_get_result") {
        const payload = p(message);
        const ok = bool(payload.Ok) && bool(payload.ok);
        if (ok) {
          useSkillStore.setState({
            editor: { name: String(payload.Name || payload.name || ""), scope: (String(payload.Scope || payload.scope || "project") as SkillScope), description: String(payload.Description || payload.description || ""), body: String(payload.Body || payload.body || ""), isNew: false },
            status: { kind: "ok", message: `'${String(payload.Name || payload.name)}' 스킬을 불러왔습니다.` }
          });
        } else {
          useSkillStore.setState({ status: { kind: "error", message: String(payload.Error || payload.error || "스킬을 불러오지 못했습니다.") } });
        }
        return;
      }
      if (message.type === "skill_save_result" || message.type === "skill_delete_result") {
        const payload = p(message);
        const ok = bool(payload.Ok) && bool(payload.ok);
        const name = String(payload.Name || payload.name || "");
        const verb = message.type === "skill_save_result" ? "저장" : "삭제";
        useSkillStore.setState({ status: { kind: ok ? "ok" : "error", message: ok ? `'${name}' 스킬을 ${verb}했습니다.` : String(payload.Error || payload.error || `${verb} 실패`) } });
        if (ok) {
          requestDesktopSkill.list();
          if (message.type === "skill_delete_result") useSkillStore.setState({ editor: null, selectedKey: "" });
        }
        return;
      }
    });
  }, []);
}

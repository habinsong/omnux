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
  searchQuery: string;
  status: SkillStatus;
  load: () => void;
  newSkill: () => void;
  openSkill: (item: SkillItem) => void;
  patchEditor: (patch: Partial<SkillEditor>) => void;
  setSearchQuery: (query: string) => void;
  insertDefaultBody: () => void;
  saveEditor: () => void;
  deleteSkill: (item: SkillItem) => void;
};

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function defaultSkillBody(name: string) {
  const title = String(name || "new-skill")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "New Tool";

  return [
    `# ${title}`,
    "",
    "## 목표",
    "- 이 도구가 해결할 일을 한두 문장으로 명확히 적는다.",
    "- 사용자가 반복해서 요청하는 방식이나 기준을 일관되게 적용한다.",
    "",
    "## 사용 흐름",
    "- 입력에서 확인할 핵심 정보와 제약을 먼저 파악한다.",
    "- 필요한 경우 한 가지 질문만 짧게 되묻는다.",
    "- 답변 또는 작업은 사용자가 요청한 범위 안에서 끝까지 처리한다.",
    "",
    "## 응답 원칙",
    "- 근거가 부족한 내용은 추측하지 않고 정보 부족으로 표시한다.",
    "- 불필요한 배경 설명보다 사용자가 바로 쓸 수 있는 결과를 우선한다.",
    "- 말투, 깊이, 길이는 사용자의 상황에 맞춘다.",
    "",
    "## 출력 형식",
    "- 핵심 결과를 먼저 말한다.",
    "- 필요한 경우 짧은 예시나 체크리스트를 붙인다.",
    "- 코드, 표, 목록이 더 명확한 경우 해당 형식을 사용한다.",
    "",
    "## 확인 기준",
    "- 사용자의 원래 요청을 모두 반영했는지 확인한다.",
    "- 금지된 추측이나 과장된 표현이 없는지 확인한다.",
    "- 다음 대화에서 그대로 재사용해도 어색하지 않은지 확인한다.",
    "",
    "## 피해야 할 것",
    "- 사용자가 요청하지 않은 기능이나 역할을 덧붙이지 않는다.",
    "- 너무 짧은 메모형 지침으로 끝내지 않는다.",
    "- 일반론만 반복하지 않는다."
  ].join("\n");
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  editor: null,
  selectedKey: "",
  searchQuery: "",
  status: null,
  load: () => {
    set({ loading: true });
    if (!requestDesktopSkill.list()) set({ loading: false, status: { kind: "error", message: "도구 목록 요청을 전송하지 못했다." } });
  },
  newSkill: () => set({ editor: { name: "", scope: "project", description: "", body: "", isNew: true }, selectedKey: "", status: null }),
  openSkill: (item) => {
    set({ selectedKey: `${item.scope}:${item.name}` });
    if (!requestDesktopSkill.get(item.name, item.scope)) set({ status: { kind: "error", message: "도구 조회 요청을 전송하지 못했다." } });
  },
  patchEditor: (patch) => set((state) => (state.editor ? { editor: { ...state.editor, ...patch } } : {})),
  setSearchQuery: (query) => set({ searchQuery: query }),
  insertDefaultBody: async () => {
    const editor = get().editor;
    if (!editor) return;
    if (String(editor.body || "").trim()) {
      const confirmed = await requestConfirmDialog({
        title: "기본 양식 넣기",
        message: "작성 중인 본문을 기본 양식으로 바꿀까요?",
        confirmLabel: "바꾸기",
        tone: "default"
      });
      if (!confirmed) return;
    }
    const name = String(editor.name || "new-skill").trim() || "new-skill";
    set({ editor: { ...editor, body: defaultSkillBody(name) } });
  },
  saveEditor: () => {
    const editor = get().editor;
    const name = String(editor?.name || "").trim();
    if (!editor || !name) {
      set({ status: { kind: "error", message: "도구 이름을 입력하세요." } });
      return;
    }
    if (editor.isNew && !SKILL_NAME_PATTERN.test(name)) {
      set({ status: { kind: "error", message: "도구 이름은 소문자, 숫자, 하이픈만 사용할 수 있습니다." } });
      return;
    }
    if (!requestDesktopSkill.save({ name, scope: editor.scope, description: editor.description, body: editor.body, allowOverwrite: !editor.isNew })) {
      set({ status: { kind: "error", message: "도구 저장 요청을 전송하지 못했다." } });
    }
  },
  deleteSkill: async (item) => {
    const confirmed = await requestConfirmDialog({
      title: "도구 삭제",
      message: `'${item.name}' (${item.scope === "global" ? "전역" : "프로젝트"}) 도구를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSkill.remove(item.name, item.scope)) set({ status: { kind: "error", message: "도구 삭제 요청을 전송하지 못했다." } });
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
            status: { kind: "ok", message: `'${String(payload.Name || payload.name)}' 도구를 불러왔습니다.` }
          });
        } else {
          useSkillStore.setState({ status: { kind: "error", message: String(payload.Error || payload.error || "도구를 불러오지 못했습니다.") } });
        }
        return;
      }
      if (message.type === "skill_save_result" || message.type === "skill_delete_result") {
        const payload = p(message);
        const ok = bool(payload.Ok) && bool(payload.ok);
        const name = String(payload.Name || payload.name || "");
        const verb = message.type === "skill_save_result" ? "저장" : "삭제";
        useSkillStore.setState({ status: { kind: ok ? "ok" : "error", message: ok ? `'${name}' 도구를 ${verb}했습니다.` : String(payload.Error || payload.error || `${verb} 실패`) } });
        if (ok) {
          requestDesktopSkill.list();
          if (message.type === "skill_delete_result") useSkillStore.setState({ editor: null, selectedKey: "" });
        }
        return;
      }
    });
  }, []);
}

import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopSkill } from "../middleware/skill-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import {
  defaultSkillBody,
  describeSaveBlock,
  parseScope,
  shouldReplaceList,
  skillKey,
  skillRequestId,
  type SkillEditorState,
  type SkillListItem
} from "./skills-model";

export type { SkillListItem, SkillEditorState, SkillScope } from "./skills-model";

type SkillStatus = { kind: "ok" | "error"; message: string } | null;

type SkillState = {
  skills: SkillListItem[];
  /** 목록을 한 번이라도 받았는지. 실패와 "아직 안 받음"을 구분한다. */
  listLoaded: boolean;
  loading: boolean;
  /** 저장·삭제 진행 중. 같은 요청을 두 번 보내지 않게 한다. */
  saving: boolean;
  editor: SkillEditorState | null;
  selectedKey: string;
  /** 지금 기다리는 조회 요청. 늦게 온 이전 응답이 편집기를 덮어쓰지 않게 한다. */
  pendingGetId: string;
  searchQuery: string;
  status: SkillStatus;
  load: () => void;
  newSkill: () => void;
  openSkill: (item: SkillListItem) => void;
  closeEditor: () => void;
  patchEditor: (patch: Partial<SkillEditorState>) => void;
  setSearchQuery: (query: string) => void;
  insertDefaultBody: () => Promise<void>;
  saveEditor: () => void;
  deleteSkill: (item: SkillListItem) => Promise<void>;
};

let sequence = 0;

function nextId(kind: "list" | "get" | "save" | "delete"): string {
  sequence += 1;
  return skillRequestId(kind, sequence);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** 서버는 대문자·소문자 키를 섞어 보낸다. 둘 다 본다. */
function pick(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") return str(value);
  }
  return "";
}

function isOk(payload: Record<string, unknown>): boolean {
  if (payload.ok === false || payload.Ok === false) return false;
  return true;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  listLoaded: false,
  loading: false,
  saving: false,
  editor: null,
  selectedKey: "",
  pendingGetId: "",
  searchQuery: "",
  status: null,
  load: () => {
    set({ loading: true });
    if (!requestDesktopSkill.list(nextId("list"))) {
      set({ loading: false, status: { kind: "error", message: "목록 조회 요청을 보내지 못했습니다. 연결을 확인하세요." } });
    }
  },
  newSkill: () =>
    set({
      editor: { name: "", scope: "project", description: "", body: "", isNew: true },
      selectedKey: "",
      status: null
    }),
  openSkill: (item) => {
    const requestId = nextId("get");
    set({ selectedKey: skillKey(item), pendingGetId: requestId, status: null });
    if (!requestDesktopSkill.get(item.name, item.scope, requestId)) {
      set({ pendingGetId: "", status: { kind: "error", message: "도구 조회 요청을 보내지 못했습니다." } });
    }
  },
  closeEditor: () => set({ editor: null, selectedKey: "", pendingGetId: "" }),
  patchEditor: (patch) => set((state) => (state.editor ? { editor: { ...state.editor, ...patch } } : {})),
  setSearchQuery: (query) => set({ searchQuery: query }),
  insertDefaultBody: async () => {
    const editor = get().editor;
    if (editor === null) return;
    if (editor.body.trim().length > 0) {
      const confirmed = await requestConfirmDialog({
        title: "기본 양식 넣기",
        message: "쓰고 있던 본문을 기본 양식으로 바꿉니다. 되돌릴 수 없습니다.",
        confirmLabel: "바꾸기",
        tone: "default"
      });
      if (!confirmed) return;
    }
    set({ editor: { ...editor, body: defaultSkillBody(editor.name.trim() || "새 도구") } });
  },
  saveEditor: () => {
    const editor = get().editor;
    const blocked = describeSaveBlock(editor);
    if (editor === null || blocked.length > 0) {
      set({ status: { kind: "error", message: blocked || "저장할 내용이 없습니다." } });
      return;
    }
    set({ saving: true, status: null });
    const sent = requestDesktopSkill.save(
      {
        name: editor.name.trim(),
        scope: editor.scope,
        description: editor.description,
        body: editor.body,
        // 이미 저장한 도구를 다시 저장할 때만 덮어쓰기를 허용한다.
        allowOverwrite: !editor.isNew
      },
      nextId("save")
    );
    if (!sent) {
      set({ saving: false, status: { kind: "error", message: "저장 요청을 보내지 못했습니다. 연결을 확인하세요." } });
    }
  },
  deleteSkill: async (item) => {
    const confirmed = await requestConfirmDialog({
      title: "도구 삭제",
      message: `'${item.name}' (${item.scope === "global" ? "전역" : "프로젝트"}) 를 지웁니다. 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ saving: true, status: null });
    if (!requestDesktopSkill.remove(item.name, item.scope, nextId("delete"))) {
      set({ saving: false, status: { kind: "error", message: "삭제 요청을 보내지 못했습니다." } });
    }
  }
}));

export function useSkillPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || message) as Record<string, unknown>;

      if (message.type === "skills_list_result") {
        const ok = isOk(payload);
        const rawItems = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [];
        const items: SkillListItem[] = rawItems.map((item) => ({
          name: pick(item, "name", "Name"),
          scope: parseScope(pick(item, "scope", "Scope") || "project"),
          description: pick(item, "description", "Description")
        }));

        useSkillStore.setState((prev) => ({
          loading: false,
          listLoaded: ok ? true : prev.listLoaded,
          // 실패 응답으로 이미 받아 둔 목록을 지우지 않는다.
          skills: shouldReplaceList(ok, items.length, prev.skills.length) ? items : prev.skills,
          status: ok
            ? prev.status
            : { kind: "error", message: pick(payload, "message", "Message", "error", "Error") || "목록을 불러오지 못했습니다." }
        }));
        return;
      }

      if (message.type === "skill_get_result") {
        // 지금 기다리는 조회의 응답만 편집기에 넣는다.
        const state = useSkillStore.getState();
        const requestId = typeof message.requestId === "string" ? message.requestId : "";
        if (state.pendingGetId.length > 0 && requestId.length > 0 && requestId !== state.pendingGetId) return;

        const ok = isOk(payload);
        if (!ok) {
          useSkillStore.setState({
            pendingGetId: "",
            status: { kind: "error", message: pick(payload, "error", "Error", "message", "Message") || "도구를 불러오지 못했습니다." }
          });
          return;
        }

        const name = pick(payload, "name", "Name");
        useSkillStore.setState({
          pendingGetId: "",
          editor: {
            name,
            scope: parseScope(pick(payload, "scope", "Scope") || "project"),
            description: pick(payload, "description", "Description"),
            body: pick(payload, "body", "Body"),
            isNew: false
          },
          status: null
        });
        return;
      }

      if (message.type === "skill_save_result") {
        const ok = isOk(payload);
        const name = pick(payload, "name", "Name");
        useSkillStore.setState((prev) => ({
          saving: false,
          // 저장에 성공하면 더 이상 새 도구가 아니다.
          // 이전 구현은 isNew 를 그대로 둬서, 방금 저장한 도구를 다시 저장하면
          // "같은 이름의 스킬이 이미 있습니다" 로 실패했다.
          editor: ok && prev.editor ? { ...prev.editor, isNew: false } : prev.editor,
          selectedKey: ok && prev.editor ? skillKey({ name: prev.editor.name.trim(), scope: prev.editor.scope }) : prev.selectedKey,
          status: {
            kind: ok ? "ok" : "error",
            message: ok
              ? `'${name || prev.editor?.name || ""}' 를 저장했습니다.`
              : pick(payload, "error", "Error", "message", "Message") || "저장하지 못했습니다."
          }
        }));
        if (ok) requestDesktopSkill.list(nextId("list"));
        return;
      }

      if (message.type === "skill_delete_result") {
        const ok = isOk(payload);
        const name = pick(payload, "name", "Name");
        useSkillStore.setState((prev) => ({
          saving: false,
          editor: ok ? null : prev.editor,
          selectedKey: ok ? "" : prev.selectedKey,
          status: {
            kind: ok ? "ok" : "error",
            message: ok
              ? `'${name}' 를 지웠습니다.`
              : pick(payload, "error", "Error", "message", "Message") || "삭제하지 못했습니다."
          }
        }));
        if (ok) requestDesktopSkill.list(nextId("list"));
      }
    });
  }, []);
}

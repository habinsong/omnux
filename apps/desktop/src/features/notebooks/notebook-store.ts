import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopNotebook, type NotebookKind } from "../middleware/notebook-gateway";

type NotebookDocument = { exists: boolean; content: string; path: string };
type NotebookSnapshot = {
  learnings: NotebookDocument;
  decisions: NotebookDocument;
  verification: NotebookDocument;
  handoff: NotebookDocument;
};

const EMPTY_DOC: NotebookDocument = { exists: false, content: "", path: "" };
const EMPTY_SNAPSHOT: NotebookSnapshot = { learnings: EMPTY_DOC, decisions: EMPTY_DOC, verification: EMPTY_DOC, handoff: EMPTY_DOC };

type NotebookState = {
  snapshot: NotebookSnapshot;
  loaded: boolean;
  loading: boolean;
  pending: boolean;
  projectKeyDraft: string;
  filterText: string;
  expandedDocument: keyof NotebookSnapshot | "";
  appendKind: NotebookKind;
  appendText: string;
  lastMessage: string;
  lastError: string;
  setProjectKeyDraft: (projectKey: string) => void;
  setFilterText: (text: string) => void;
  setExpandedDocument: (field: keyof NotebookSnapshot | "") => void;
  setAppendKind: (kind: NotebookKind) => void;
  setAppendText: (text: string) => void;
  insertTemplate: (kind: NotebookKind) => void;
  applyDraft: (kind: NotebookKind, text: string) => void;
  load: () => void;
  append: () => void;
  createHandoff: () => void;
};

export const NOTEBOOK_TEMPLATES: Record<NotebookKind, string> = {
  learning: [
    "오늘 남길 것:",
    "- ",
    "",
    "다음에 써먹을 것:",
    "- ",
    "",
    "주의할 점:",
    "- "
  ].join("\n"),
  decision: [
    "뭐 하기로 했나:",
    "- ",
    "",
    "왜 그렇게 갔나:",
    "- ",
    "",
    "일단 안 한 것:",
    "- "
  ].join("\n"),
  verification: [
    "확인한 것:",
    "- ",
    "",
    "어떻게 확인했나:",
    "- ",
    "",
    "결과:",
    "- ",
    "",
    "아직 찝찝한 것:",
    "- "
  ].join("\n")
};

function mergeNotebookDraft(base: string, next: string) {
  const current = String(base || "").trim();
  const addition = String(next || "").trim();
  if (!current) return addition;
  if (!addition || current.includes(addition)) return current;
  return `${current}\n\n${addition}`.trim();
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  snapshot: EMPTY_SNAPSHOT,
  loaded: false,
  loading: false,
  pending: false,
  projectKeyDraft: "",
  filterText: "",
  expandedDocument: "",
  appendKind: "learning",
  appendText: "",
  lastMessage: "",
  lastError: "",
  setProjectKeyDraft: (projectKey) => set({ projectKeyDraft: projectKey }),
  setFilterText: (text) => set({ filterText: text }),
  setExpandedDocument: (field) => set({ expandedDocument: field }),
  setAppendKind: (kind) => set({ appendKind: kind }),
  setAppendText: (text) => set({ appendText: text }),
  insertTemplate: (kind) => set({ appendKind: kind, appendText: NOTEBOOK_TEMPLATES[kind] }),
  applyDraft: (kind, text) => set((state) => ({ appendKind: kind, appendText: mergeNotebookDraft(state.appendText, text || NOTEBOOK_TEMPLATES[kind]) })),
  load: () => {
    set({ loading: true, lastError: "" });
    if (!requestDesktopNotebook.get(get().projectKeyDraft)) set({ loading: false, lastError: "노트북 조회 요청을 전송하지 못했다." });
  },
  append: () => {
    const text = get().appendText.trim();
    if (!text) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopNotebook.append(get().appendKind, text, get().projectKeyDraft)) set({ pending: false, lastError: "노트북 기록 요청을 전송하지 못했다." });
  },
  createHandoff: () => {
    set({ pending: true, lastError: "" });
    if (!requestDesktopNotebook.createHandoff(get().projectKeyDraft)) set({ pending: false, lastError: "이어보기 문서 생성 요청을 전송하지 못했다." });
  }
}));

function doc(value: unknown): NotebookDocument {
  const v = (value || {}) as Record<string, unknown>;
  return { exists: !!v.exists, content: String(v.content || v.preview || ""), path: String(v.path || "") };
}

export function useNotebookPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type !== "notebook_result") return;
      const payload = (message.payload || {}) as Record<string, unknown>;
      const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
      const ok = payload.ok !== false;
      useNotebookStore.setState((prev) => ({
        loaded: true,
        loading: false,
        pending: false,
        lastError: ok ? "" : String(payload.message || "노트북 요청이 실패했습니다."),
        lastMessage: ok ? String(payload.message || "") : "",
        appendText: ok && message.action === "append" ? "" : prev.appendText,
        snapshot: snapshot.learnings || snapshot.decisions || snapshot.verification || snapshot.handoff
          ? {
              learnings: doc(snapshot.learnings),
              decisions: doc(snapshot.decisions),
              verification: doc(snapshot.verification),
              handoff: doc(snapshot.handoff)
            }
          : prev.snapshot
      }));
    });
  }, []);
}

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
  appendKind: NotebookKind;
  appendText: string;
  lastMessage: string;
  lastError: string;
  setAppendKind: (kind: NotebookKind) => void;
  setAppendText: (text: string) => void;
  load: () => void;
  append: () => void;
  createHandoff: () => void;
};

export const useNotebookStore = create<NotebookState>((set, get) => ({
  snapshot: EMPTY_SNAPSHOT,
  loaded: false,
  loading: false,
  pending: false,
  appendKind: "learning",
  appendText: "",
  lastMessage: "",
  lastError: "",
  setAppendKind: (kind) => set({ appendKind: kind }),
  setAppendText: (text) => set({ appendText: text }),
  load: () => {
    set({ loading: true, lastError: "" });
    if (!requestDesktopNotebook.get()) set({ loading: false, lastError: "노트북 조회 요청을 전송하지 못했다." });
  },
  append: () => {
    const text = get().appendText.trim();
    if (!text) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopNotebook.append(get().appendKind, text)) set({ pending: false, lastError: "노트북 기록 요청을 전송하지 못했다." });
  },
  createHandoff: () => {
    set({ pending: true, lastError: "" });
    if (!requestDesktopNotebook.createHandoff()) set({ pending: false, lastError: "핸드오프 생성 요청을 전송하지 못했다." });
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

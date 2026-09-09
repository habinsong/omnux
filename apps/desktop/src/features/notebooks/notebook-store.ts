import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopNotebook } from "../middleware/notebook-gateway";
import {
  EMPTY_SNAPSHOT,
  NOTEBOOK_TEMPLATES,
  draftAfterAppend,
  mergeDraft,
  notebookRequestId,
  type NotebookDocument,
  type NotebookKind,
  type NotebookSnapshot
} from "./notebook-model";

export type { NotebookKind, NotebookSnapshot, NotebookDocument } from "./notebook-model";
export { NOTEBOOK_TEMPLATES } from "./notebook-model";

type NotebookState = {
  snapshot: NotebookSnapshot;
  /** 어느 프로젝트 기준의 결과인지. 늦게 온 다른 프로젝트 응답을 걸러 낸다. */
  snapshotProject: string;
  loaded: boolean;
  loading: boolean;
  pending: boolean;
  projectKeyDraft: string;
  appendKind: NotebookKind;
  appendText: string;
  lastMessage: string;
  lastError: string;
  setProjectKeyDraft: (projectKey: string) => void;
  setAppendKind: (kind: NotebookKind) => void;
  setAppendText: (text: string) => void;
  insertTemplate: (kind: NotebookKind) => void;
  applyDraft: (kind: NotebookKind, text: string) => void;
  load: () => void;
  append: () => void;
  createHandoff: () => void;
};

let sequence = 0;
/** 보낸 요청의 ID → 그 요청이 쓴 프로젝트 기준과 본문. 응답을 되짚는 데 쓴다. */
const inflight = new Map<string, { projectKey: string; sentText: string }>();

function nextId(action: "get" | "append" | "handoff", projectKey: string, sentText = ""): string {
  sequence += 1;
  const requestId = notebookRequestId(action, sequence);
  inflight.set(requestId, { projectKey, sentText });
  if (inflight.size > 32) {
    const oldest = inflight.keys().next().value;
    if (oldest !== undefined) inflight.delete(oldest);
  }
  return requestId;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 서버 문서 한 건. `contentTruncated` 를 반드시 함께 가져온다. */
function readDocument(value: unknown): NotebookDocument {
  const record = (value || {}) as Record<string, unknown>;
  return {
    exists: record.exists === true,
    content: str(record.content ?? record.preview ?? ""),
    path: str(record.path),
    truncated: record.contentTruncated === true,
    sizeBytes: num(record.sizeBytes),
    updatedAtUtc: str(record.updatedAtUtc)
  };
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  snapshot: EMPTY_SNAPSHOT,
  snapshotProject: "",
  loaded: false,
  loading: false,
  pending: false,
  projectKeyDraft: "",
  appendKind: "decision",
  appendText: "",
  lastMessage: "",
  lastError: "",
  setProjectKeyDraft: (projectKey) => set({ projectKeyDraft: projectKey }),
  setAppendKind: (kind) => set({ appendKind: kind }),
  setAppendText: (text) => set({ appendText: text }),
  insertTemplate: (kind) =>
    set((state) => ({ appendKind: kind, appendText: mergeDraft(state.appendText, NOTEBOOK_TEMPLATES[kind]) })),
  applyDraft: (kind, text) =>
    set((state) => ({ appendKind: kind, appendText: mergeDraft(state.appendText, text || NOTEBOOK_TEMPLATES[kind]) })),
  load: () => {
    const projectKey = get().projectKeyDraft.trim();
    set({ loading: true, lastError: "" });
    if (!requestDesktopNotebook.get(projectKey, nextId("get", projectKey))) {
      set({ loading: false, lastError: "조회 요청을 보내지 못했습니다. 연결을 확인하세요." });
    }
  },
  append: () => {
    const state = get();
    const text = state.appendText.trim();
    if (text.length === 0) return;
    const projectKey = state.projectKeyDraft.trim();
    set({ pending: true, lastError: "" });
    const sent = requestDesktopNotebook.append(state.appendKind, text, projectKey, {
      requestId: nextId("append", projectKey, text)
    });
    if (!sent) set({ pending: false, lastError: "기록 요청을 보내지 못했습니다. 연결을 확인하세요." });
  },
  createHandoff: () => {
    const projectKey = get().projectKeyDraft.trim();
    set({ pending: true, lastError: "" });
    if (!requestDesktopNotebook.createHandoff(projectKey, nextId("handoff", projectKey))) {
      set({ pending: false, lastError: "이어보기 문서 생성 요청을 보내지 못했습니다." });
    }
  }
}));

export function useNotebookPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type !== "notebook_result") return;

      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      const sent = requestId.length > 0 ? inflight.get(requestId) : undefined;
      if (requestId.length > 0) inflight.delete(requestId);

      const state = useNotebookStore.getState();
      // 프로젝트 기준을 바꾼 뒤 늦게 온 이전 응답은 버린다.
      if (sent !== undefined && sent.projectKey !== state.projectKeyDraft.trim()) return;

      const payload = (message.payload || {}) as Record<string, unknown>;
      const snapshot = (payload.snapshot || {}) as Record<string, unknown>;
      const ok = payload.ok !== false;
      const action = str(message.action);
      const hasSnapshot = Boolean(
        snapshot.learnings || snapshot.decisions || snapshot.verification || snapshot.handoff
      );

      useNotebookStore.setState((prev) => ({
        loaded: ok ? true : prev.loaded,
        loading: false,
        pending: false,
        lastError: ok ? "" : str(payload.message) || "요청이 실패했습니다.",
        lastMessage: ok ? str(payload.message) : "",
        // 보낸 내용만 지운다. 보내는 동안 더 쓴 부분은 남긴다.
        appendText:
          ok && action === "append" && sent !== undefined
            ? draftAfterAppend(prev.appendText, sent.sentText)
            : prev.appendText,
        snapshot: hasSnapshot
          ? {
              learnings: readDocument(snapshot.learnings),
              decisions: readDocument(snapshot.decisions),
              verification: readDocument(snapshot.verification),
              handoff: readDocument(snapshot.handoff)
            }
          : prev.snapshot,
        snapshotProject: hasSnapshot ? (sent?.projectKey ?? prev.projectKeyDraft.trim()) : prev.snapshotProject
      }));
    });
  }, []);
}

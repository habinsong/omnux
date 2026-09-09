import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRefactorTool } from "../middleware/refactor-gateway";
import { requestPermissionDialog } from "../dialog/dialog-store";
import {
  REQUEST_LABELS,
  REQUEST_TIMEOUT_MS,
  buildRequestId,
  defaultAnchorRange,
  formatAnchorContent,
  replacementForRequest,
  selectAnchorRange,
  type RefactorRequestKind
} from "./refactor-model";

type RefactorAnchorLine = {
  lineNumber: number;
  hash: string;
  content: string;
};

type RefactorState = {
  path: string;
  content: string;
  loadedPath: string;
  anchorLines: RefactorAnchorLine[];
  anchorStartLine: string;
  anchorEndLine: string;
  anchorReplacement: string;
  pattern: string;
  replacement: string;
  symbol: string;
  newName: string;
  previewId: string;
  previewPath: string;
  previewDiff: string;
  issues: string[];
  applied: boolean;
  /** 줄을 지우려는 의도. 빈 교체 코드를 실수로 보내지 않기 위한 명시 표시다. */
  anchorDelete: boolean;
  pending: boolean;
  /** 지금 기다리는 요청. 다른 요청의 응답을 받아들이지 않기 위해 쓴다. */
  pendingRequestId: string;
  pendingKind: RefactorRequestKind | null;
  lastError: string;
  lastMessage: string;
  setField: (key: "path" | "anchorStartLine" | "anchorEndLine" | "anchorReplacement" | "pattern" | "replacement" | "symbol" | "newName", value: string) => void;
  setAnchorDelete: (value: boolean) => void;
  read: () => void;
  anchorPreview: () => void;
  astReplace: () => void;
  lspRename: () => void;
  apply: () => Promise<void>;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function n(v: unknown): number {
  const parsed = Number(v || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function normalizeAnchorLines(value: unknown): RefactorAnchorLine[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const payload = record(item);
        return {
          lineNumber: n(payload.lineNumber),
          hash: s(payload.hash),
          content: s(payload.content)
        };
      }).filter((item) => item.lineNumber > 0 && item.hash)
    : [];
}

function normalizeIssue(value: unknown): string {
  if (typeof value === "string") return value;
  const payload = record(value);
  const reason = s(payload.reason) || "anchor issue";
  const startLine = n(payload.startLine);
  const endLine = n(payload.endLine);
  const lineLabel = startLine > 0 ? `L${startLine}${endLine >= startLine ? `-${endLine}` : ""}: ` : "";
  const snippet = s(payload.currentSnippet).trim();
  return `${lineLabel}${reason}${snippet ? `\n${snippet}` : ""}`;
}


let requestSequence = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimer() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/**
 * 요청을 보내고 기한을 건다.
 * 기한은 모듈 수준이라 **화면을 떠나도 계속 돈다.**
 * 이전 화면은 요청을 보낸 뒤 화면을 떠나면 응답을 받을 구독이 사라져
 * pending 이 영원히 참으로 남고 모든 버튼이 잠겼다.
 */
function sendRefactorRequest(kind: RefactorRequestKind, send: (requestId: string) => boolean): void {
  requestSequence += 1;
  const requestId = buildRequestId(kind, requestSequence);
  clearPendingTimer();
  useRefactorStore.setState({ pending: true, pendingRequestId: requestId, pendingKind: kind, lastError: "" });

  if (!send(requestId)) {
    clearPendingTimer();
    useRefactorStore.setState({
      pending: false,
      pendingRequestId: "",
      pendingKind: null,
      lastError: `${REQUEST_LABELS[kind]} 요청을 보내지 못했습니다. 연결을 확인하세요.`
    });
    return;
  }

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const state = useRefactorStore.getState();
    if (state.pendingRequestId !== requestId) return;
    useRefactorStore.setState({
      pending: false,
      pendingRequestId: "",
      pendingKind: null,
      lastError: `${REQUEST_LABELS[kind]} 응답이 오지 않았습니다. 다시 시도하세요.`
    });
  }, REQUEST_TIMEOUT_MS);
}

export const useRefactorStore = create<RefactorState>((set, get) => ({
  path: "",
  content: "",
  loadedPath: "",
  anchorLines: [],
  anchorStartLine: "",
  anchorEndLine: "",
  anchorReplacement: "",
  pattern: "",
  replacement: "",
  symbol: "",
  newName: "",
  previewId: "",
  previewPath: "",
  previewDiff: "",
  issues: [],
  applied: false,
  anchorDelete: false,
  pending: false,
  pendingRequestId: "",
  pendingKind: null,
  lastError: "",
  lastMessage: "",
  setField: (key, value) => set({ [key]: value } as Partial<RefactorState>),
  setAnchorDelete: (value) => set({ anchorDelete: value }),
  read: () => {
    const path = get().path.trim();
    if (path.length === 0) return;
    // 새로 읽으면 이전 미리보기는 더 이상 쓸 수 없다. 적용 버튼이 남지 않게 먼저 지운다.
    set({ applied: false, anchorLines: [], previewId: "", previewPath: "", previewDiff: "", issues: [] });
    sendRefactorRequest("read", (requestId) => requestDesktopRefactorTool.read(path, requestId));
  },
  anchorPreview: () => {
    const state = get();
    const targetPath = state.path.trim() || state.loadedPath.trim();
    const startLine = Number(state.anchorStartLine || 0);
    const endLine = Number(state.anchorEndLine || 0);
    if (targetPath.length === 0) {
      set({ lastError: "파일 경로를 입력하세요." });
      return;
    }
    const selection = selectAnchorRange(state.anchorLines, startLine, endLine);
    if (!selection.ok) {
      set({ lastError: selection.reason });
      return;
    }
    if (!state.anchorDelete && state.anchorReplacement.length === 0) {
      set({ lastError: "교체할 코드를 입력하거나 「이 줄을 지웁니다」를 고르세요." });
      return;
    }

    // 새 미리보기를 만들기 전에 이전 것을 지운다.
    // 이전 화면은 새 미리보기가 실패해도 이전 previewId 가 남아 적용 버튼이 켜져 있었다.
    set({ applied: false, previewId: "", previewPath: "", previewDiff: "", issues: [] });
    sendRefactorRequest("preview", (requestId) =>
      requestDesktopRefactorTool.preview(
        targetPath,
        [
          {
            startLine,
            endLine,
            expectedHashes: selection.lines.map((line) => line.hash),
            replacement: replacementForRequest(state)
          }
        ],
        requestId
      )
    );
  },
  astReplace: () => {
    const { path, pattern, replacement } = get();
    if (!path.trim() || !pattern.trim()) return;
    set({ applied: false, previewId: "", previewPath: "", previewDiff: "", issues: [] });
    sendRefactorRequest("ast", (requestId) =>
      requestDesktopRefactorTool.astReplace(path, pattern, replacement, requestId)
    );
  },
  lspRename: () => {
    const { path, symbol, newName } = get();
    if (!path.trim() || !symbol.trim() || !newName.trim()) return;
    set({ applied: false, previewId: "", previewPath: "", previewDiff: "", issues: [] });
    sendRefactorRequest("rename", (requestId) =>
      requestDesktopRefactorTool.lspRename(path, symbol, newName, requestId)
    );
  },
  apply: async () => {
    const state = get();
    const previewId = state.previewId.trim();
    if (!previewId) return;
    const permission = await requestPermissionDialog({
      title: "Safe Refactor 적용",
      message: "미리보기 diff와 대상 파일을 확인한 뒤 적용하세요.",
      permissionAction: "write",
      actionLabel: "refactor_apply",
      files: [state.loadedPath || state.path].filter(Boolean),
      diff: state.previewDiff,
      approvalToken: previewId,
      confirmLabel: "한 번 허용",
      tone: "danger"
    });
    if (!permission) return;
    sendRefactorRequest("apply", (requestId) => requestDesktopRefactorTool.apply(previewId, requestId));
  }
}));

export function useRefactorPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type !== "refactor_result") return;

      // 지금 기다리는 요청의 응답만 받아들인다.
      // 이전 화면은 어떤 refactor_result 든 그대로 반영해, 늦게 도착한 이전 요청의 결과가
      // 화면을 덮어썼다.
      const state = useRefactorStore.getState();
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      if (state.pendingRequestId.length > 0 && requestId.length > 0 && requestId !== state.pendingRequestId) {
        return;
      }

      clearPendingTimer();

      const payload = (message.payload || {}) as Record<string, unknown>;
      const ok = payload.ok !== false;
      const action = s(message.action) || (state.pendingKind ?? "");
      const readResult = (payload.readResult || null) as Record<string, unknown> | null;
      const preview = (payload.preview || null) as Record<string, unknown> | null;
      const applyResult = (payload.applyResult || null) as Record<string, unknown> | null;
      const issues = Array.isArray(payload.issues)
        ? payload.issues.map(normalizeIssue)
        : Array.isArray(preview?.issues)
          ? (preview!.issues as unknown[]).map(normalizeIssue)
          : [];
      const anchorLines = readResult ? normalizeAnchorLines(readResult.lines) : [];
      const range = defaultAnchorRange(anchorLines);
      const isRead = action === "read" && readResult !== null;

      useRefactorStore.setState((prev) => ({
        pending: false,
        pendingRequestId: "",
        pendingKind: null,
        lastError: ok ? "" : s(payload.message) || "요청이 실패했습니다.",
        lastMessage: ok ? s(payload.message) || "완료" : "",
        issues,
        content: isRead ? formatAnchorContent(anchorLines) : prev.content,
        anchorLines: isRead ? anchorLines : prev.anchorLines,
        anchorStartLine: isRead && range.start ? range.start : prev.anchorStartLine,
        anchorEndLine: isRead && range.end ? range.end : prev.anchorEndLine,
        loadedPath: readResult
          ? s(readResult.path)
          : preview
            ? s(preview.path)
            : applyResult
              ? s(applyResult.path)
              : prev.loadedPath,
        // 미리보기는 성공했을 때만 남긴다. 실패하면 적용 버튼이 켜지지 않는다.
        previewId: preview && ok ? s(preview.previewId) : "",
        previewPath: preview && ok ? s(preview.path) || prev.path : "",
        previewDiff: preview && ok ? s(preview.diff || preview.unifiedDiff || preview.preview) : "",
        applied: action === "apply" ? Boolean(applyResult?.applied) : prev.applied
      }));
    });
  }, []);
}

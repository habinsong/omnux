import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRefactorTool } from "../middleware/refactor-gateway";
import { requestPermissionDialog } from "../dialog/dialog-store";

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
  previewDiff: string;
  issues: string[];
  applied: boolean;
  pending: boolean;
  lastError: string;
  lastMessage: string;
  setField: (key: "path" | "anchorStartLine" | "anchorEndLine" | "anchorReplacement" | "pattern" | "replacement" | "symbol" | "newName", value: string) => void;
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

function buildAnchorContent(lines: RefactorAnchorLine[]): string {
  return lines.map((line) => `L${line.lineNumber} ${line.content}`).join("\n");
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
  previewDiff: "",
  issues: [],
  applied: false,
  pending: false,
  lastError: "",
  lastMessage: "",
  setField: (key, value) => set({ [key]: value } as Partial<RefactorState>),
  read: () => {
    if (!get().path.trim()) return;
    set({ pending: true, lastError: "", applied: false, anchorLines: [], previewId: "", previewDiff: "" });
    if (!requestDesktopRefactorTool.read(get().path)) set({ pending: false, lastError: "파일 읽기 요청을 전송하지 못했다." });
  },
  anchorPreview: () => {
    const { path, loadedPath, anchorStartLine, anchorEndLine, anchorReplacement, anchorLines } = get();
    const targetPath = path.trim() || loadedPath.trim();
    const startLine = Number(anchorStartLine || 0);
    const endLine = Number(anchorEndLine || 0);
    if (!targetPath || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || !anchorReplacement.trim()) {
      set({ lastError: "파일, 시작/끝 줄, 교체 코드를 확인하세요." });
      return;
    }
    const selectedLines = anchorLines
      .filter((line) => line.lineNumber >= startLine && line.lineNumber <= endLine)
      .sort((a, b) => a.lineNumber - b.lineNumber);
    if (selectedLines.length !== endLine - startLine + 1) {
      set({ lastError: "선택한 줄 범위의 anchor를 찾지 못했습니다. 먼저 파일을 다시 읽어주세요." });
      return;
    }
    set({ pending: true, lastError: "", applied: false });
    if (!requestDesktopRefactorTool.preview(targetPath, [{
      startLine,
      endLine,
      expectedHashes: selectedLines.map((line) => line.hash),
      replacement: anchorReplacement
    }])) {
      set({ pending: false, lastError: "refactor_preview 요청을 전송하지 못했다." });
    }
  },
  astReplace: () => {
    const { path, pattern, replacement } = get();
    if (!path.trim() || !pattern.trim()) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopRefactorTool.astReplace(path, pattern, replacement)) set({ pending: false, lastError: "ast_replace 요청을 전송하지 못했다." });
  },
  lspRename: () => {
    const { path, symbol, newName } = get();
    if (!path.trim() || !symbol.trim() || !newName.trim()) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopRefactorTool.lspRename(path, symbol, newName)) set({ pending: false, lastError: "lsp_rename 요청을 전송하지 못했다." });
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
    set({ pending: true, lastError: "" });
    if (!requestDesktopRefactorTool.apply(previewId)) set({ pending: false, lastError: "refactor_apply 요청을 전송하지 못했다." });
  }
}));

export function useRefactorPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type !== "refactor_result") return;
      const payload = (message.payload || {}) as Record<string, unknown>;
      const ok = payload.ok !== false;
      const action = s(message.action);
      const readResult = (payload.readResult || null) as Record<string, unknown> | null;
      const preview = (payload.preview || null) as Record<string, unknown> | null;
      const applyResult = (payload.applyResult || null) as Record<string, unknown> | null;
      const issues = Array.isArray(payload.issues) ? payload.issues.map(normalizeIssue) : Array.isArray(preview?.issues) ? (preview!.issues as unknown[]).map(normalizeIssue) : [];
      const anchorLines = readResult ? normalizeAnchorLines(readResult.lines) : [];

      useRefactorStore.setState((prev) => ({
        pending: false,
        lastError: ok ? "" : s(payload.message) || "Safe Refactor 요청이 실패했습니다.",
        lastMessage: s(payload.message) || (ok ? "완료" : ""),
        issues,
        content: action === "read" && readResult ? buildAnchorContent(anchorLines) : prev.content,
        anchorLines: action === "read" && readResult ? anchorLines : prev.anchorLines,
        anchorStartLine: action === "read" && readResult && anchorLines[0] ? String(anchorLines[0].lineNumber) : prev.anchorStartLine,
        anchorEndLine: action === "read" && readResult && anchorLines[0] ? String(anchorLines[Math.min(anchorLines.length - 1, 4)].lineNumber) : prev.anchorEndLine,
        loadedPath: readResult ? s(readResult.path) : preview ? s(preview.path) : applyResult ? s(applyResult.path) : prev.loadedPath,
        previewId: preview ? s(preview.previewId) : action === "apply" && ok ? "" : prev.previewId,
        previewDiff: preview ? s(preview.diff || preview.unifiedDiff || preview.preview) : action === "apply" && ok ? "" : prev.previewDiff,
        applied: action === "apply" ? !!(applyResult?.applied) : prev.applied
      }));
    });
  }, []);
}

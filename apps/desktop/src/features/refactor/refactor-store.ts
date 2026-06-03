import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopRefactorTool } from "../middleware/refactor-gateway";

type RefactorState = {
  path: string;
  content: string;
  loadedPath: string;
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
  setField: (key: "path" | "pattern" | "replacement" | "symbol" | "newName", value: string) => void;
  read: () => void;
  astReplace: () => void;
  lspRename: () => void;
  apply: () => void;
};

function s(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }

export const useRefactorStore = create<RefactorState>((set, get) => ({
  path: "",
  content: "",
  loadedPath: "",
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
    set({ pending: true, lastError: "", applied: false });
    if (!requestDesktopRefactorTool.read(get().path)) set({ pending: false, lastError: "파일 읽기 요청을 전송하지 못했다." });
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
  apply: () => {
    if (!get().previewId.trim()) return;
    set({ pending: true, lastError: "" });
    if (!requestDesktopRefactorTool.apply(get().previewId)) set({ pending: false, lastError: "refactor_apply 요청을 전송하지 못했다." });
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
      const issues = Array.isArray(payload.issues) ? payload.issues.map(s) : Array.isArray(preview?.issues) ? (preview!.issues as unknown[]).map(s) : [];

      useRefactorStore.setState((prev) => ({
        pending: false,
        lastError: ok ? "" : s(payload.message) || "Safe Refactor 요청이 실패했습니다.",
        lastMessage: s(payload.message) || (ok ? "완료" : ""),
        issues,
        content: action === "read" && readResult ? s(readResult.content || readResult.text) : prev.content,
        loadedPath: readResult ? s(readResult.path) : preview ? s(preview.path) : applyResult ? s(applyResult.path) : prev.loadedPath,
        previewId: preview ? s(preview.previewId) : action === "apply" && ok ? "" : prev.previewId,
        previewDiff: preview ? s(preview.diff || preview.unifiedDiff || preview.preview) : action === "apply" && ok ? "" : prev.previewDiff,
        applied: action === "apply" ? !!(applyResult?.applied) : prev.applied
      }));
    });
  }, []);
}

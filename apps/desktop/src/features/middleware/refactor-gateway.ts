import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Safe Refactor: read → preview(ast_replace/lsp_rename) → apply (정적 대시보드 ws-refactor 흐름).
registerDesktopRequestTypes("refactor_read", "refactor_preview", "refactor_apply", "ast_replace", "lsp_rename");

export type RefactorAnchorEdit = {
  startLine: number;
  endLine: number;
  expectedHashes: string[];
  replacement: string;
};

export const requestDesktopRefactorTool = {
  read(path: string, requestId?: string) {
    return sendDesktopRequest({ type: "refactor_read", path: path.trim(), requestId });
  },
  preview(path: string, edits: RefactorAnchorEdit[], requestId?: string) {
    return sendDesktopRequest({ type: "refactor_preview", path: path.trim(), edits, requestId });
  },
  apply(previewId: string, requestId?: string) {
    return sendDesktopRequest({ type: "refactor_apply", previewId: previewId.trim(), requestId });
  },
  astReplace(path: string, pattern: string, replacement: string, requestId?: string) {
    return sendDesktopRequest({ type: "ast_replace", path: path.trim(), pattern, replacement, requestId });
  },
  lspRename(path: string, symbol: string, newName: string, requestId?: string) {
    return sendDesktopRequest({ type: "lsp_rename", path: path.trim(), symbol: symbol.trim(), newName: newName.trim(), requestId });
  }
};

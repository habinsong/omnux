import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Safe Refactor: read → preview(ast_replace/lsp_rename) → apply (옛 omninode-dashboard ws-refactor).
registerDesktopRequestTypes("refactor_read", "refactor_preview", "refactor_apply", "ast_replace", "lsp_rename");

export const requestDesktopRefactorTool = {
  read(path: string) {
    return sendDesktopRequest({ type: "refactor_read", path: path.trim() });
  },
  apply(previewId: string) {
    return sendDesktopRequest({ type: "refactor_apply", previewId: previewId.trim() });
  },
  astReplace(path: string, pattern: string, replacement: string) {
    return sendDesktopRequest({ type: "ast_replace", path: path.trim(), pattern, replacement });
  },
  lspRename(path: string, symbol: string, newName: string) {
    return sendDesktopRequest({ type: "lsp_rename", path: path.trim(), symbol: symbol.trim(), newName: newName.trim() });
  }
};

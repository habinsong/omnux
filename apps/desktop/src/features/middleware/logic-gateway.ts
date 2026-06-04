import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Durable workflow recovery 후보 조회. 실제 resume/retry는 정책 확정 전까지 연결하지 않는다.
registerDesktopRequestTypes("logic_graph_recovery_list", "logic_path_list");

export const requestDesktopLogicRecovery = {
  list(limit = 50) {
    return sendDesktopRequest({ type: "logic_graph_recovery_list", limit });
  }
};

export const requestDesktopLogicPath = {
  list(scope: string, rootKey?: string, browsePath?: string) {
    return sendDesktopRequest({
      type: "logic_path_list",
      scope: scope || "workspace",
      target: rootKey?.trim() || undefined,
      filePath: browsePath?.trim() || undefined
    });
  }
};

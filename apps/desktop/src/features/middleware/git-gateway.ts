import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

export type GitOperationName =
  | "create_branch"
  | "stage_and_commit"
  | "snapshot_commit"
  | "push_current_branch"
  | "open_pull_request";

export type GitOperationPreviewInput = {
  operation: GitOperationName;
  branchName?: string;
  commitMessage?: string;
  paths?: string[];
  remoteName?: string;
  remoteBranchName?: string;
  setUpstream?: boolean;
  pullRequestTitle?: string;
  pullRequestBody?: string;
  baseBranchName?: string;
  draft?: boolean;
};

registerDesktopRequestTypes("git_automation_snapshot_get", "git_operation_preview", "git_operation_apply");

export const requestDesktopGit = {
  automationSnapshot(limit = 100) {
    return sendDesktopRequest({ type: "git_automation_snapshot_get", limit });
  },
  preview(input: GitOperationPreviewInput) {
    return sendDesktopRequest({ type: "git_operation_preview", ...input });
  },
  apply(previewId: string, confirmationToken: string, approval?: Record<string, unknown>) {
    return sendDesktopRequest({
      type: "git_operation_apply",
      previewId: previewId.trim(),
      confirmationToken: confirmationToken.trim(),
      approval
    });
  }
};

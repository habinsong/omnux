namespace Omnux.Middleware;

internal static class GitOperationNames
{
    public const string CreateBranch = "create_branch";
    public const string StageAndCommit = "stage_and_commit";
    public const string SnapshotCommit = "snapshot_commit";

    public static bool IsLocalAllowed(string operation)
    {
        return operation is CreateBranch or StageAndCommit or SnapshotCommit;
    }
}

internal sealed record GitOperationPreviewRequest(
    string Operation,
    string BranchName,
    string CommitMessage,
    IReadOnlyList<string> Paths
);

internal sealed record GitOperationApplyRequest(
    string PreviewId,
    string ConfirmationToken,
    string ApprovalPayloadJson
);

internal sealed record GitOperationPreviewResult(
    bool Ok,
    string Status,
    string PreviewId,
    string Operation,
    bool RequiresApproval,
    DateTimeOffset? ExpiresAtUtc,
    IReadOnlyList<GitOperationCheck> Checks,
    IReadOnlyList<GitOperationPlannedCommand> PlannedCommands,
    IReadOnlyList<GitOperationAffectedFile> AffectedFiles,
    IReadOnlyList<string> Blockers,
    IReadOnlyList<string> Warnings,
    GitOperationApprovalPayload? Approval
);

internal sealed record GitOperationApplyResult(
    bool Ok,
    string Status,
    string PreviewId,
    string Operation,
    string Message,
    IReadOnlyList<GitOperationCheck> Checks,
    IReadOnlyList<GitOperationExecutedCommand> ExecutedCommands,
    IReadOnlyList<string> Blockers,
    GitOperationApplySnapshot? Snapshot
);

internal sealed record GitOperationCheck(
    string Code,
    string Status,
    string Message
);

internal sealed record GitOperationPlannedCommand(
    string Executable,
    IReadOnlyList<string> Arguments,
    string Display
);

internal sealed record GitOperationExecutedCommand(
    string Executable,
    IReadOnlyList<string> Arguments,
    int ExitCode,
    string StdOut,
    string StdErr
);

internal sealed record GitOperationAffectedFile(
    string Path,
    string IndexStatus,
    string WorktreeStatus,
    string Category,
    bool Staged,
    bool Unstaged,
    bool Untracked
);

internal sealed record GitOperationApprovalPayload(
    string PreviewId,
    string Operation,
    string ConfirmationToken,
    string RepositoryRoot,
    string HeadHash,
    string BranchName,
    string TargetBranchName,
    string CommitMessage,
    IReadOnlyList<string> Paths
);

internal sealed record GitOperationPreviewRecord(
    string PreviewId,
    string Operation,
    string RepositoryRoot,
    string HeadHash,
    string BranchName,
    string ConfirmationTokenHash,
    string ApprovalPayloadHash,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    GitOperationPreviewRequest Request,
    IReadOnlyList<GitOperationAffectedFile> AffectedFiles,
    IReadOnlyList<GitOperationPlannedCommand> PlannedCommands
);

internal sealed record GitOperationPreviewState(
    IReadOnlyList<GitOperationPreviewRecord> Records
);

internal sealed record GitOperationApplySnapshot(
    string HeadHash,
    string BranchName
);

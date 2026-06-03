namespace Omnux.Middleware;

internal sealed record GitTimeMachineSnapshot(
    string RepositoryRoot,
    string BranchName,
    string HeadHash,
    string HeadShortHash,
    bool IsRepository,
    bool ReadOnly,
    bool HasChanges,
    bool IsClean,
    int ChangedFileCount,
    int ConflictedFileCount,
    string DiffShortStat,
    int Limit,
    bool CheckpointsTruncated,
    string SnapshotNamespace,
    string SuggestedSnapshotBranch,
    IReadOnlyList<GitTimeMachineCheckpoint> Checkpoints,
    GitTimeMachineReadiness Readiness,
    IReadOnlyList<GitTimeMachineCheck> Checks,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record GitTimeMachineCheckpoint(
    string Hash,
    string ShortHash,
    string Subject,
    string AuthorName,
    DateTimeOffset? AuthorDateUtc,
    IReadOnlyList<string> ParentShortHashes,
    bool IsHead,
    bool RollbackCandidate,
    IReadOnlyList<string> RiskFlags
);

internal sealed record GitTimeMachineReadiness(
    string Status,
    bool SnapshotCreationRecommended,
    bool RollbackAvailable,
    bool RequiresApproval,
    IReadOnlyList<string> Blockers
);

internal sealed record GitTimeMachineCheck(
    string Name,
    string Status,
    string Detail
);

internal readonly record struct GitTimeMachineWorktreeStatus(
    int ChangedFileCount,
    int ConflictedFileCount
);

internal sealed record GitTimeMachineGitResult(
    int ExitCode,
    string StdOut,
    string StdErr
);

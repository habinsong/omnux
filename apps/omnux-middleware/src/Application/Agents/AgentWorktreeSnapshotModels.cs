namespace Omnux.Middleware;

internal sealed record AgentWorktreeSnapshot(
    string Status,
    string RepositoryRoot,
    string WorktreeRoot,
    bool EnabledFromEnvironment,
    bool ReadOnly,
    int TotalWorktreeCount,
    int CleanupCandidateCount,
    IReadOnlyList<AgentWorktreeItem> Worktrees,
    IReadOnlyList<AgentWorktreeCheck> Checks,
    IReadOnlyList<string> Skipped,
    IReadOnlyList<string> Warnings,
    DateTimeOffset SnapshotUtc
);

internal sealed record AgentWorktreeItem(
    string Name,
    string Path,
    string Status,
    bool PathExists,
    bool IsGitWorktree,
    bool HasChanges,
    bool HasConflicts,
    string Branch,
    string HeadShortHash,
    string WorktreeStatus,
    long AgeSeconds,
    long LastWriteAgeSeconds,
    bool CleanupCandidate,
    string CleanupReason,
    AgentWorktreeReadiness MergeReadiness
);

internal sealed record AgentWorktreeReadiness(
    string Status,
    IReadOnlyList<string> Blockers
);

internal sealed record AgentWorktreeCheck(
    string Name,
    string Status,
    string Detail
);

internal readonly record struct AgentWorktreeGitResult(
    int ExitCode,
    string StdOut,
    string StdErr
);

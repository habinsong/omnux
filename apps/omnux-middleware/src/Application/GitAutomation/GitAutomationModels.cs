namespace Omnux.Middleware;

internal sealed record GitAutomationSnapshot(
    string RepositoryRoot,
    string BranchName,
    string HeadShortHash,
    bool ReadOnly,
    bool HasChanges,
    bool IsClean,
    int ChangedFileCount,
    int StagedFileCount,
    int UnstagedFileCount,
    int UntrackedFileCount,
    int ConflictedFileCount,
    int Limit,
    bool FilesTruncated,
    IReadOnlyList<GitAutomationChangedFile> Files,
    string DiffShortStat,
    string SuggestedCommitMessage,
    string SuggestedBranchName,
    GitAutomationReadiness Readiness,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record GitAutomationChangedFile(
    string Path,
    string IndexStatus,
    string WorktreeStatus,
    string Category,
    bool Staged,
    bool Unstaged,
    bool Untracked,
    int? AddedLines,
    int? DeletedLines
);

internal sealed record GitAutomationReadiness(
    string Status,
    bool CommitRecommended,
    bool PullRequestRecommended,
    bool RequiresApproval,
    IReadOnlyList<string> Blockers
);

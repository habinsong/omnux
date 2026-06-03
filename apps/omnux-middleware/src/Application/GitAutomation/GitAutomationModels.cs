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
    GitAutomationRemoteSnapshot Remote,
    GitAutomationToolchainSnapshot Toolchain,
    GitAutomationPublishReadiness PublishReadiness,
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

internal sealed record GitAutomationRemoteSnapshot(
    bool HasRemote,
    IReadOnlyList<string> RemoteNames,
    string PrimaryRemote,
    string PrimaryRemoteUrl,
    string PushRemoteUrl,
    bool HasUpstream,
    string UpstreamName,
    int? AheadCount,
    int? BehindCount,
    string SuggestedPushTarget,
    IReadOnlyList<string> Warnings
);

internal sealed record GitAutomationToolchainSnapshot(
    GitAutomationToolSnapshot GitHubCli
);

internal sealed record GitAutomationToolSnapshot(
    string Name,
    string Command,
    string Status,
    string Version,
    string Message
);

internal sealed record GitAutomationPublishReadiness(
    string Status,
    bool PushReady,
    bool PullRequestReady,
    bool RequiresApproval,
    IReadOnlyList<string> Blockers,
    IReadOnlyList<string> Skipped
);

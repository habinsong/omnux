namespace Omnux.Middleware;

internal sealed record GitCommitLearningSnapshot(
    string RepositoryRoot,
    int Limit,
    IReadOnlyList<GitCommitLearningEntry> Commits,
    IReadOnlyList<GitCommitIntentRollup> Intents,
    IReadOnlyList<GitCommitFileHotspot> Hotspots,
    IReadOnlyList<string> Warnings,
    int TotalCommits,
    DateTimeOffset ScannedAtUtc
);

internal sealed record GitCommitLearningEntry(
    string Hash,
    string ShortHash,
    string Subject,
    string AuthorName,
    DateTimeOffset? AuthorDateUtc,
    string Intent,
    int FilesChanged,
    int AddedLines,
    int DeletedLines,
    IReadOnlyList<string> TopPaths
);

internal sealed record GitCommitIntentRollup(
    string Intent,
    int CommitCount,
    int AddedLines,
    int DeletedLines
);

internal sealed record GitCommitFileHotspot(
    string Path,
    int ChangeCount,
    string LastCommitShortHash,
    string LastSubject
);

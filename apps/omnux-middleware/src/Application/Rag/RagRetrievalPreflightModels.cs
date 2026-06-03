namespace Omnux.Middleware;

internal sealed record RagRetrievalPreflightSnapshot(
    string Status,
    string QueryPreview,
    bool ReadOnly,
    bool RetrievalRecommended,
    string PrimaryStrategy,
    IReadOnlyList<RagRetrievalCandidate> Candidates,
    IReadOnlyList<string> Signals,
    IReadOnlyList<string> Skipped,
    DateTimeOffset SnapshotUtc
);

internal sealed record RagRetrievalCandidate(
    string Kind,
    string Priority,
    bool Recommended,
    string Reason,
    string SuggestedRequestType
);

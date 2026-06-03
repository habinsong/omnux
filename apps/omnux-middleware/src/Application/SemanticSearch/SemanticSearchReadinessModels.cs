namespace Omnux.Middleware;

internal sealed record SemanticSearchReadinessSnapshot(
    string Status,
    string Mode,
    bool ReadOnly,
    bool VectorSearchEnabled,
    bool EmbeddingGenerationEnabled,
    bool CodeSearchRecommended,
    string RepositoryRoot,
    string DbPath,
    SemanticSearchIndexSnapshot Index,
    SemanticSearchEmbeddingSnapshot Embedding,
    IReadOnlyList<SemanticSearchReadinessCheck> Checks,
    IReadOnlyList<SemanticSearchRecommendation> Recommendations,
    IReadOnlyList<string> Skipped,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record SemanticSearchIndexSnapshot(
    bool DbExists,
    bool SqliteCliAvailable,
    bool FtsAvailable,
    bool SqliteVecAvailable,
    int FileCount,
    int ChunkCount,
    int EmbeddingCacheEntryCount,
    IReadOnlyList<SemanticSearchSourceCount> ChunkSources
);

internal sealed record SemanticSearchSourceCount(
    string Source,
    int Count
);

internal sealed record SemanticSearchEmbeddingSnapshot(
    bool LocalEndpointAvailable,
    bool CandidateModelAvailable,
    int AvailableEndpointCount,
    int TotalModelCount,
    IReadOnlyList<SemanticSearchEmbeddingCandidate> CandidateModels
);

internal sealed record SemanticSearchEmbeddingCandidate(
    string EndpointName,
    string EndpointKind,
    string ModelId
);

internal sealed record SemanticSearchReadinessCheck(
    string Name,
    string Status,
    string Detail
);

internal sealed record SemanticSearchRecommendation(
    string Kind,
    string Priority,
    string Message
);

internal readonly record struct SemanticSearchSqliteResult(
    int ExitCode,
    string StdOut,
    string StdErr
);

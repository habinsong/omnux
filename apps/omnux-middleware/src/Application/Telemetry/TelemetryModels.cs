namespace Omnux.Middleware;

public sealed record TelemetryTraceEvent(
    string Id,
    string Operation,
    string Provider,
    string Model,
    string Status,
    string Source,
    string TraceId,
    string SpanId,
    long PromptTokens,
    long CompletionTokens,
    long TotalTokens,
    string TokenUsageSource,
    int PromptChars,
    int CompletionChars,
    int MaxOutputTokens,
    bool Streaming,
    long DurationMs,
    string Error,
    DateTimeOffset StartedUtc,
    DateTimeOffset CompletedUtc
)
{
    public bool PromptCacheEligible { get; init; }
    public string PromptCacheKey { get; init; } = string.Empty;
    public string PromptCacheAffinityKey { get; init; } = string.Empty;
    public int PromptCacheStaticChars { get; init; }
    public long PromptCacheStaticTokens { get; init; }
    public string PromptCacheStrategy { get; init; } = string.Empty;
    public string PromptCacheReason { get; init; } = string.Empty;
    public string ModelRoutingComplexity { get; init; } = string.Empty;
    public string ModelRoutingRecommendedTier { get; init; } = string.Empty;
    public bool ModelRoutingCascadeEligible { get; init; }
    public long ModelRoutingEstimatedInputTokens { get; init; }
    public string ModelRoutingSignals { get; init; } = string.Empty;
    public string ModelRoutingReason { get; init; } = string.Empty;
}

public sealed record TelemetryTraceQuery(
    string? Provider = null,
    string? Model = null,
    string? Status = null,
    string? Source = null,
    DateTimeOffset? SinceUtc = null,
    int? Limit = null
);

public sealed record TelemetryTokenRollup(
    int EventCount,
    long PromptTokens,
    long CompletionTokens,
    long TotalTokens,
    long AverageDurationMs,
    long MaxDurationMs
);

public sealed record TelemetryProviderRollup(
    string Provider,
    int EventCount,
    long PromptTokens,
    long CompletionTokens,
    long TotalTokens,
    long AverageDurationMs,
    long MaxDurationMs
);

public sealed record TelemetrySnapshot(
    IReadOnlyList<TelemetryTraceEvent> Events,
    IReadOnlyList<TelemetryProviderRollup> Providers,
    TelemetryTokenRollup Total,
    int TotalEvents,
    int FilteredEvents,
    DateTimeOffset SnapshotUtc
);

public sealed record TelemetryActionResult(
    bool Ok,
    string Message,
    TelemetrySnapshot Snapshot
);

internal sealed record TelemetryLlmCallRequest(
    string Provider,
    string Model,
    int PromptChars,
    int MaxOutputTokens,
    bool Streaming,
    string Source,
    PromptCachePlan? PromptCache = null,
    ModelRoutingPlan? ModelRouting = null
);

public sealed class TelemetryTraceState
{
    public int Version { get; set; } = 1;
    public List<TelemetryTraceEvent> Events { get; set; } = new();
}

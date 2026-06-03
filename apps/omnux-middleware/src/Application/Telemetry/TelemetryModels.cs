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
);

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
    string Source
);

public sealed class TelemetryTraceState
{
    public int Version { get; set; } = 1;
    public List<TelemetryTraceEvent> Events { get; set; } = new();
}

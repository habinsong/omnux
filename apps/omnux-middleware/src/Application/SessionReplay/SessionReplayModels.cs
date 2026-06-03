namespace Omnux.Middleware;

public sealed record SessionReplayQuery(
    string? ConversationId = null,
    string? RunId = null,
    string? AgentId = null,
    string? GroupId = null,
    DateTimeOffset? SinceUtc = null,
    int? Limit = null,
    bool IncludeText = false,
    bool IncludeTelemetry = true,
    bool IncludeAgentEvents = true
);

public sealed record SessionReplayEvent(
    string Id,
    string Source,
    string Kind,
    string Severity,
    string Correlation,
    string ConversationId,
    string RunId,
    string AgentId,
    string GroupId,
    string Title,
    string Summary,
    string? Body,
    string? Meta,
    string? Provider,
    string? Model,
    string? Status,
    string? TraceId,
    string? SpanId,
    long PromptTokens,
    long CompletionTokens,
    long TotalTokens,
    long DurationMs,
    DateTimeOffset TimestampUtc,
    DateTimeOffset? StartedUtc = null,
    DateTimeOffset? CompletedUtc = null
);

public sealed record SessionReplaySummary(
    int EventCount,
    int ConversationMessageCount,
    int TelemetryEventCount,
    int AgentEventCount,
    int ErrorCount,
    int WarningCount,
    long PromptTokens,
    long CompletionTokens,
    long TotalTokens,
    DateTimeOffset? FirstEventUtc,
    DateTimeOffset? LastEventUtc
);

public sealed record SessionReplaySnapshot(
    string ConversationId,
    string RunId,
    string AgentId,
    string GroupId,
    IReadOnlyList<SessionReplayEvent> Events,
    SessionReplaySummary Summary,
    int TotalEvents,
    int ReturnedEvents,
    DateTimeOffset SnapshotUtc
);

public sealed record SessionReplayActionResult(
    bool Ok,
    string Message,
    SessionReplaySnapshot Snapshot
);
